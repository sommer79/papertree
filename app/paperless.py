# -*- coding: utf-8 -*-
"""Der lesende Zugang zu Paperless (A1, A2).

Hier ist die Schreibsperre verankert, und zwar nicht als Absicht, sondern als
einzige Möglichkeit: Es gibt genau eine Funktion, die Paperless erreicht, sie
schickt ausschliesslich GET, und sie prüft jeden Pfad gegen eine Whitelist.
Ein Fehler in der Oberfläche kann darum in Paperless nichts verändern.

Die Anmeldung stammt vom Benutzer (A2): PaperTree leitet dessen Cookie weiter
und besitzt selbst kein Token. Wer in Paperless nicht angemeldet ist, sieht in
PaperTree nichts, und die Berechtigungen von Paperless gelten unverändert.
"""
from __future__ import annotations

import re

import httpx

from .config import einstellungen
from .sprache import aus_einstellungen

# --- Whitelist ---------------------------------------------------------------
# Jeder Pfad, den PaperTree überhaupt anfragen darf. Alles andere wird
# abgewiesen, bevor eine Verbindung aufgebaut wird.
ERLAUBTE_PFADE = tuple(
    re.compile(muster)
    for muster in (
        r"^/api/documents/$",
        r"^/api/documents/\d+/$",
        r"^/api/documents/\d+/preview/$",
        r"^/api/documents/\d+/thumb/$",
        r"^/api/documents/\d+/download/$",
        r"^/api/documents/\d+/metadata/$",
        r"^/api/documents/\d+/notes/$",
        r"^/api/tags/$",
        r"^/api/correspondents/$",
        r"^/api/document_types/$",
        r"^/api/storage_paths/$",
        r"^/api/custom_fields/$",
        r"^/api/ui_settings/$",
    )
)

# Diese Antworten werden durchgeleitet, statt als JSON gelesen zu werden.
BINAER_PFADE = re.compile(r"^/api/documents/\d+/(preview|thumb|download)/$")


class PaperlessFehler(Exception):
    """Paperless hat nicht wie erwartet geantwortet."""

    def __init__(self, status: int, text: str = "") -> None:
        super().__init__(f"Paperless antwortete mit {status}: {text[:200]}")
        self.status = status
        self.text = text


class NichtAngemeldet(PaperlessFehler):
    """Der Benutzer hat keine gültige Paperless-Sitzung."""


class NichtErreichbar(PaperlessFehler):
    """Paperless antwortet gar nicht – etwa während eines Neustarts."""

    def __init__(self, grund: str = "") -> None:
        PaperlessFehler.__init__(self, 503, grund)


def pfad_erlaubt(pfad: str) -> bool:
    return any(muster.match(pfad) for muster in ERLAUBTE_PFADE)


class Zugang:
    """Ein lesender Zugang zu Paperless im Namen eines Benutzers."""

    def __init__(self, klient: httpx.AsyncClient, cookie: str, referer: str = "") -> None:
        self._klient = klient
        self._cookie = cookie or ""
        self._referer = referer

    def _kopfzeilen(self) -> dict:
        kopf = {"Accept": "application/json"}
        if self._cookie:
            kopf["Cookie"] = self._cookie
        if self._referer:
            kopf["Referer"] = self._referer
        return kopf

    async def hole(self, pfad: str, parameter: dict | None = None) -> httpx.Response:
        """Die einzige Stelle, an der PaperTree Paperless erreicht."""
        if not pfad_erlaubt(pfad):
            raise PaperlessFehler(403, f"Pfad nicht erlaubt: {pfad}")
        try:
            antwort = await self._klient.get(
                einstellungen.PAPERLESS_URL + pfad,
                params={k: v for k, v in (parameter or {}).items() if v not in (None, "")},
                headers=self._kopfzeilen(),
            )
        except httpx.RequestError as fehler:
            raise NichtErreichbar(str(fehler)) from fehler
        if antwort.status_code in (401, 403):
            raise NichtAngemeldet(antwort.status_code, antwort.text)
        if antwort.status_code >= 400:
            raise PaperlessFehler(antwort.status_code, antwort.text)
        return antwort

    async def json(self, pfad: str, parameter: dict | None = None) -> dict:
        antwort = await self.hole(pfad, parameter)
        return antwort.json()

    async def strom(self, pfad: str, parameter: dict | None = None):
        """Für Vorschau, Vorschaubild und Download – ohne Zwischenspeicher (A3)."""
        if not pfad_erlaubt(pfad):
            raise PaperlessFehler(403, f"Pfad nicht erlaubt: {pfad}")
        anfrage = self._klient.build_request(
            "GET",
            einstellungen.PAPERLESS_URL + pfad,
            params=parameter or {},
            headers={
                k: v for k, v in self._kopfzeilen().items() if k.lower() != "accept"
            },
        )
        try:
            antwort = await self._klient.send(anfrage, stream=True)
        except httpx.RequestError as fehler:
            raise NichtErreichbar(str(fehler)) from fehler
        if antwort.status_code in (401, 403):
            await antwort.aclose()
            raise NichtAngemeldet(antwort.status_code)
        if antwort.status_code >= 400:
            await antwort.aclose()
            raise PaperlessFehler(antwort.status_code)
        return antwort

    # --- Auskünfte, die PaperTree oft braucht -----------------------------
    async def benutzer(self) -> dict:
        """Wer ist angemeldet (A2, A7). Wirft NichtAngemeldet, wenn niemand."""
        daten = await self.json("/api/ui_settings/")
        person = (daten or {}).get("user") or {}
        if not person.get("id"):
            raise NichtAngemeldet(401, "Keine Benutzerkennung in ui_settings")
        # Wie Paperless mit diesem Benutzer spricht - PaperTree spricht
        # dieselbe Sprache, statt eine eigene Einstellung zu verlangen.
        gewaehlt = aus_einstellungen((daten or {}).get("settings"))
        return {
            "id": person["id"],
            "name": person.get("username") or "",
            # Leer heisst: keine Angabe, dann entscheidet der Browser.
            "sprache": gewaehlt["sprache"],
            "datumssprache": gewaehlt["datumssprache"],
            # Paperless nennt in ui_settings, wer Vollzugriff hat. PaperTree
            # braucht das nur, um den Einstellungsbereich freizugeben; die
            # Rechte an den Dokumenten prüft weiterhin Paperless selbst.
            "admin": bool(person.get("is_superuser")),
            "anzeige": (
                " ".join(
                    t for t in (person.get("first_name"), person.get("last_name")) if t
                )
                or person.get("username")
                or ""
            ),
        }

    async def dokumente(self, parameter: dict) -> dict:
        return await self.json("/api/documents/", parameter)

    async def anzahl(self, parameter: dict) -> int:
        """Nur die Trefferzahl – für Zähler und die Vorschau im Editor (F2.3)."""
        daten = await self.json(
            "/api/documents/", {**parameter, "page": 1, "page_size": 1, "fields": "id"}
        )
        return int(daten.get("count") or 0)

    async def alle_ids(self, parameter: dict) -> list:
        """Die Dokument-IDs zu einem Filter, für Schnitt und Vereinigung (F1.3).

        Holt nur IDs, keine Inhalte, und blättert bis zur Obergrenze.
        """
        gesammelt: list[int] = []
        seite = 1
        while True:
            daten = await self.json(
                "/api/documents/",
                {
                    **parameter,
                    "page": seite,
                    "page_size": 5000,
                    "fields": "id",
                    "ordering": "id",
                },
            )
            treffer = daten.get("results") or []
            gesammelt.extend(int(t["id"]) for t in treffer if t.get("id") is not None)
            if not daten.get("next") or len(gesammelt) >= einstellungen.MAX_IDS:
                break
            seite += 1
        return gesammelt

    async def stammdaten(self, art: str) -> list:
        """Tags, Korrespondenten, Dokumenttypen, Speicherpfade, Zusatzfelder.

        Der Editor baut sich daraus selbst auf (F2.1), damit ein neues Feld in
        Paperless ohne Änderung an PaperTree erscheint.
        """
        pfade = {
            "tags": "/api/tags/",
            "correspondents": "/api/correspondents/",
            "document_types": "/api/document_types/",
            "storage_paths": "/api/storage_paths/",
            "custom_fields": "/api/custom_fields/",
        }
        if art not in pfade:
            raise PaperlessFehler(404, f"Unbekannte Stammdaten: {art}")
        gesammelt: list = []
        seite = 1
        while True:
            daten = await self.json(pfade[art], {"page": seite, "page_size": 250})
            gesammelt.extend(daten.get("results") or [])
            if not daten.get("next"):
                break
            seite += 1
        return gesammelt


def oeffentlicher_link(dokument_id: int | None = None) -> str:
    """Der Link nach Paperless für den Knopf an jedem Dokument (F5.5)."""
    basis = einstellungen.PAPERLESS_OEFFENTLICH
    if dokument_id:
        return f"{basis}/documents/{dokument_id}/details"
    return f"{basis}/dashboard" if basis else "/"


def anmelde_link() -> str:
    """Die Anmeldeseite von Paperless.

    Das Rücksprungziel hängt die Oberfläche selbst an: welche Ansicht offen
    ist, steht im Fragment der Adresse, und das bekommt der Server nie zu
    sehen.
    """
    basis = einstellungen.PAPERLESS_OEFFENTLICH or ""
    return f"{basis}/accounts/login/"
