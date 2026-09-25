# -*- coding: utf-8 -*-
"""PaperTree – HTTP-Schnittstelle.

Alles, was hier nach Paperless geht, läuft durch app.paperless.Zugang und ist
darum lesend (A1). Geschrieben wird ausschliesslich in die eigene Datenbank,
und dort nur der Baum (A5, A7).
"""
from __future__ import annotations

import hashlib
import html
import os
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import Body, FastAPI, File, Request, UploadFile
from fastapi.responses import (FileResponse, HTMLResponse, JSONResponse,
                               StreamingResponse)
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask

from . import VERSION, db, documents, filters, groups, logos, paperless, sprache
from .config import einstellungen
from .tree import Baum, Plan, ausfuehrungsart, referenzen

WEB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web")
_klient: httpx.AsyncClient | None = None
# Cookie-Fingerabdruck -> (zeitpunkt, benutzer)
_BENUTZER_CACHE: dict = {}
BENUTZER_GUELTIG_S = 60


@asynccontextmanager
async def lebenszyklus(app: FastAPI):
    global _klient
    db.einrichten()
    _klient = httpx.AsyncClient(timeout=einstellungen.ZEITGRENZE_S, follow_redirects=False)
    try:
        yield
    finally:
        await _klient.aclose()
        _klient = None


app = FastAPI(
    title="PaperTree",
    version=VERSION,
    docs_url=None,
    redoc_url=None,
    lifespan=lebenszyklus,
)


def _zugang(anfrage: Request) -> paperless.Zugang:
    return paperless.Zugang(
        _klient,
        anfrage.headers.get("cookie", ""),
        referer=str(anfrage.base_url).rstrip("/"),
    )


async def _benutzer(anfrage: Request) -> dict:
    """Wer fragt – aus der Paperless-Sitzung, kurz zwischengespeichert."""
    cookie = anfrage.headers.get("cookie", "")
    if not cookie:
        raise paperless.NichtAngemeldet(401, "Kein Cookie")
    fingerabdruck = hashlib.sha256(cookie.encode("utf-8", "ignore")).hexdigest()
    eintrag = _BENUTZER_CACHE.get(fingerabdruck)
    if eintrag and time.time() - eintrag[0] < BENUTZER_GUELTIG_S:
        return eintrag[1]
    person = await _zugang(anfrage).benutzer()
    _BENUTZER_CACHE[fingerabdruck] = (time.time(), person)
    return person


@app.exception_handler(paperless.NichtAngemeldet)
async def nicht_angemeldet(anfrage: Request, fehler: paperless.NichtAngemeldet):
    return JSONResponse(
        status_code=401,
        content={
            "fehler": "nicht_angemeldet",
            "hinweis": "Bitte in Paperless anmelden, PaperTree nutzt dieselbe Sitzung.",
            "paperless": paperless.oeffentlicher_link(),
            "anmeldung": paperless.anmelde_link(),
        },
    )


@app.exception_handler(paperless.NichtErreichbar)
async def nicht_erreichbar(anfrage: Request, fehler: paperless.NichtErreichbar):
    return JSONResponse(
        status_code=503,
        content={
            "fehler": "paperless_nicht_erreichbar",
            "hinweis": "Paperless antwortet nicht. Läuft der Dienst?",
            "text": fehler.text[:300],
        },
    )


@app.exception_handler(paperless.PaperlessFehler)
async def paperless_fehler(anfrage: Request, fehler: paperless.PaperlessFehler):
    return JSONResponse(
        status_code=502 if fehler.status >= 500 else fehler.status,
        content={"fehler": "paperless", "status": fehler.status, "text": fehler.text[:500]},
    )


@app.exception_handler(ValueError)
async def wert_fehler(anfrage: Request, fehler: ValueError):
    return JSONResponse(status_code=400, content={"fehler": str(fehler)})


# --- Auskunft ----------------------------------------------------------------
@app.get("/api/ich")
async def ich(anfrage: Request):
    person = await _benutzer(anfrage)
    return {
        "benutzer": person,
        "version": VERSION,
        "paperless": einstellungen.PAPERLESS_OEFFENTLICH,
        "basis": einstellungen.BASIS_PFAD,
    }


@app.get("/api/stammdaten/{art}")
async def stammdaten(anfrage: Request, art: str):
    """Tags, Korrespondenten, Typen, Speicherpfade, Zusatzfelder (F2.1)."""
    await _benutzer(anfrage)
    return {"ergebnisse": await _zugang(anfrage).stammdaten(art)}


# --- Baum --------------------------------------------------------------------
def _knoten_als_dict(k) -> dict:
    return {
        "id": k.id,
        "name": k.name,
        "eltern_id": k.eltern_id,
        "reihenfolge": k.reihenfolge,
        "eigener_filter": k.eigener_filter,
        "filter": k.filter,
        "kinder_einbeziehen": k.kinder_einbeziehen,
        "kinder_tief": k.kinder_tief,
        "eigenstaendig": k.eigenstaendig,
        "sortierung": k.sortierung,
        "darstellung": k.darstellung,
        "spalten": k.spalten,
        "seitengroesse": k.seitengroesse,
        "auf_dashboard": k.auf_dashboard,
        "gruppieren_nach": k.gruppieren_nach,
        "symbol": k.symbol,
        "als_reiter": k.als_reiter,
        "dashboard_reihenfolge": k.dashboard_reihenfolge,
    }


def _bereinigen(daten: dict) -> list:
    """Prüft die Felder, die der Client mitschickt. Gibt Verworfenes zurück."""
    verworfen: list = []
    if "filter" in daten:
        daten["filter"], verworfen = filters.pruefen(daten.get("filter") or {})
    if "sortierung" in daten and not filters.sortierung_gueltig(daten["sortierung"]):
        daten.pop("sortierung")
    if "gruppieren_nach" in daten:
        wert = daten["gruppieren_nach"] or ""
        if wert and not groups.gueltig(wert):
            daten["gruppieren_nach"] = ""
            verworfen.append("gruppieren_nach=" + str(wert))
    return verworfen


@app.get("/api/baum")
async def baum_lesen(anfrage: Request):
    person = await _benutzer(anfrage)
    knoten = db.knoten_laden(person["id"])
    return {"ordner": [_knoten_als_dict(k) for k in knoten]}


@app.post("/api/baum")
async def baum_anlegen(anfrage: Request, daten: dict = Body(...)):
    person = await _benutzer(anfrage)
    verworfen = _bereinigen(daten)
    neu = db.anlegen(person["id"], daten)
    return {"id": neu, "verworfen": verworfen}


@app.patch("/api/baum/{knoten_id}")
async def baum_aendern(anfrage: Request, knoten_id: int, daten: dict = Body(...)):
    person = await _benutzer(anfrage)
    verworfen = _bereinigen(daten)
    if not db.aendern(person["id"], knoten_id, daten):
        return JSONResponse(status_code=404, content={"fehler": "Ordner nicht gefunden"})
    return {"geaendert": True, "verworfen": verworfen}


@app.delete("/api/baum/{knoten_id}")
async def baum_loeschen(anfrage: Request, knoten_id: int):
    person = await _benutzer(anfrage)
    if not db.loeschen(person["id"], knoten_id):
        return JSONResponse(status_code=404, content={"fehler": "Ordner nicht gefunden"})
    return {"geloescht": True}


@app.post("/api/baum/reihenfolge")
async def baum_reihenfolge(anfrage: Request, daten: dict = Body(...)):
    person = await _benutzer(anfrage)
    eltern = daten.get("eltern_id")
    db.reihenfolge_setzen(person["id"], int(eltern) if eltern else None, daten.get("ids") or [])
    return {"gesetzt": True}


@app.post("/api/dashboard/reihenfolge")
async def dashboard_reihenfolge(anfrage: Request, daten: dict = Body(...)):
    """Die Reihenfolge der Kacheln auf der Startseite."""
    person = await _benutzer(anfrage)
    db.dashboard_reihenfolge_setzen(person["id"], daten.get("ids") or [])
    return {"gesetzt": True}


# --- Sicherung des Baums (F8.1) ----------------------------------------------
_EXPORT_FELDER = (
    "name", "eigener_filter", "filter", "kinder_einbeziehen", "kinder_tief",
    "eigenstaendig", "sortierung", "darstellung", "spalten", "seitengroesse",
    "auf_dashboard", "gruppieren_nach", "symbol", "als_reiter",
    "dashboard_reihenfolge",
)


@app.get("/api/baum/export")
async def baum_export(anfrage: Request):
    """Der ganze Baum als JSON – damit die Struktur nicht an PaperTree hängt."""
    person = await _benutzer(anfrage)
    baum = Baum(db.knoten_laden(person["id"]))

    def zweig(eltern_id):
        aeste = []
        for knoten in baum.kinder(eltern_id):
            eintrag = {feld: getattr(knoten, feld) for feld in _EXPORT_FELDER}
            kinder = zweig(knoten.id)
            if kinder:
                eintrag["kinder"] = kinder
            aeste.append(eintrag)
        return aeste

    return {
        "papertree": VERSION,
        "erstellt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "ordner": zweig(None),
    }


@app.post("/api/baum/import")
async def baum_import(anfrage: Request, daten: dict = Body(...)):
    """Liest einen Export wieder ein – als Ergänzung, nie als Ersatz.

    Die Ordner werden unter `eltern_id` eingefügt (oder auf oberster Ebene).
    Ein vorhandener Baum bleibt unangetastet.
    """
    person = await _benutzer(anfrage)
    eltern = daten.get("eltern_id")
    eltern = int(eltern) if eltern else None
    if eltern is not None and db.knoten_einzeln(person["id"], eltern) is None:
        return JSONResponse(status_code=404, content={"fehler": "Zielordner nicht gefunden"})

    gezaehlt = {"angelegt": 0, "verworfen": []}

    def einlesen(eintraege, unter, tiefe=0):
        if tiefe > 20:
            raise ValueError("Der Baum in der Datei ist zu tief verschachtelt.")
        for eintrag in eintraege or []:
            if not isinstance(eintrag, dict) or not str(eintrag.get("name") or "").strip():
                gezaehlt["verworfen"].append("Eintrag ohne Namen")
                continue
            neu = {feld: eintrag.get(feld) for feld in _EXPORT_FELDER if feld in eintrag}
            gezaehlt["verworfen"].extend(_bereinigen(neu))
            neu["eltern_id"] = unter
            kennung = db.anlegen(person["id"], neu)
            gezaehlt["angelegt"] += 1
            einlesen(eintrag.get("kinder"), kennung, tiefe + 1)

    einlesen(daten.get("ordner"), eltern)
    return gezaehlt


@app.get("/api/baum/{knoten_id}/effektiv")
async def baum_effektiv(anfrage: Request, knoten_id: int):
    """Der effektive Filter: geerbter Teil plus eigener (F1.5), samt Prüfung
    der genannten Paperless-Objekte (F1.8)."""
    person = await _benutzer(anfrage)
    baum = Baum(db.knoten_laden(person["id"]))
    knoten = baum.nach_id.get(knoten_id)
    if knoten is None:
        return JSONResponse(status_code=404, content={"fehler": "Ordner nicht gefunden"})

    plan = baum.plan(knoten_id)
    fehlend = await _fehlende_referenzen(anfrage, knoten.filter) if knoten.filter else {}
    return {
        "geerbt": baum.geerbte_saetze(knoten_id),
        "fuer_kind": baum.saetze_fuer_kind(knoten_id),
        "eigen": knoten.filter,
        "effektiv": baum.effektive_schichten(knoten_id),
        "plan": plan.als_dict(),
        "art": ausfuehrungsart(plan),
        "nennt": referenzen(knoten.filter or {}),
        "fehlend": fehlend,
    }


async def _fehlende_referenzen(anfrage: Request, filter_satz: dict) -> dict:
    """Prüft, ob die im Filter genannten Objekte in Paperless noch existieren."""
    genannt = referenzen(filter_satz or {})
    if not genannt:
        return {}
    zugang = _zugang(anfrage)
    fehlend: dict = {}
    for art, ids in genannt.items():
        try:
            vorhanden = {e.get("id") for e in await zugang.stammdaten(art)}
        except paperless.PaperlessFehler:
            continue
        weg = [i for i in ids if i not in vorhanden]
        if weg:
            fehlend[art] = weg
    return fehlend


@app.get("/api/baum/{knoten_id}/anzahl")
async def baum_anzahl(anfrage: Request, knoten_id: int):
    person = await _benutzer(anfrage)
    baum = Baum(db.knoten_laden(person["id"]))
    if knoten_id not in baum.nach_id:
        return JSONResponse(status_code=404, content={"fehler": "Ordner nicht gefunden"})
    return {"anzahl": await documents.anzahl(_zugang(anfrage), baum.plan(knoten_id))}


@app.get("/api/baum/{knoten_id}/gruppen")
async def baum_gruppen(anfrage: Request, knoten_id: int):
    """Die dynamischen Unterordner eines Ordners (F4)."""
    person = await _benutzer(anfrage)
    baum = Baum(db.knoten_laden(person["id"]))
    knoten = baum.nach_id.get(knoten_id)
    if knoten is None:
        return JSONResponse(status_code=404, content={"fehler": "Ordner nicht gefunden"})
    if not groups.gueltig(knoten.gruppieren_nach):
        return {"dimension": "", "gruppen": []}

    zugang = _zugang(anfrage)
    plan = baum.plan(knoten_id)
    ids = None
    if ausfuehrungsart(plan) == "ids":
        ids = await documents.ids_fuer_plan(zugang, plan)
    gefunden = await groups.gruppen(
        zugang, person["id"], plan, knoten.gruppieren_nach, ids
    )
    return {
        "dimension": knoten.gruppieren_nach,
        "dimension_name": groups.dimension_name(
            knoten.gruppieren_nach, await zugang.stammdaten("custom_fields")
        ),
        "gruppen": gefunden,
    }


@app.get("/api/baum/{knoten_id}/dokumente")
async def baum_dokumente(
    anfrage: Request,
    knoten_id: int,
    page: int = 1,
    page_size: int | None = None,
    ordering: str | None = None,
    q: str | None = None,
    gruppe: str | None = None,
    tag: str | None = None,
):
    person = await _benutzer(anfrage)
    baum = Baum(db.knoten_laden(person["id"]))
    knoten = baum.nach_id.get(knoten_id)
    if knoten is None:
        return JSONResponse(status_code=404, content={"fehler": "Ordner nicht gefunden"})

    sortierung = ordering if ordering and filters.sortierung_gueltig(ordering) else knoten.sortierung
    zusaetze: list = []
    # Eine dynamische Gruppe ist nur ein weiterer Filtersatz (F4).
    if gruppe is not None and groups.gueltig(knoten.gruppieren_nach):
        zusaetze.append(groups.gruppen_filter(knoten.gruppieren_nach, gruppe))
    # Schnellfilter aus der Liste: Klick auf einen Tag verengt die Ansicht.
    # Mehrere Tags gelten mit UND, damit jeder weitere Klick verfeinert.
    gewaehlte_tags = filters.tagliste(tag)
    if gewaehlte_tags:
        zusaetze.append({"tags__id__all": gewaehlte_tags})
    if q and q.strip():
        zusaetze.append({"query": q.strip()})

    groesse = max(5, min(200, int(page_size))) if page_size else knoten.seitengroesse
    plan = baum.plan(knoten_id)
    # Ein Ordner, der selbst nichts zeigt, zeigt in einer Gruppe trotzdem:
    # die Gruppe ist dann die Bedingung.
    if plan.leer and zusaetze:
        plan = Plan(schnitt=baum.geerbte_saetze(knoten_id) or [])

    ergebnis = await documents.seite(
        _zugang(anfrage),
        person["id"],
        plan,
        sortierung,
        nummer=page,
        groesse=groesse,
        zusatz=zusaetze,
    )
    ergebnis["ordner"] = _knoten_als_dict(knoten)
    ergebnis["pfad"] = [{"id": k.id, "name": k.name} for k in baum.pfad(knoten_id)]
    ergebnis["ordering"] = sortierung
    ergebnis["gruppe"] = gruppe
    ergebnis["tag"] = gewaehlte_tags
    return ergebnis


# --- Editor-Hilfen -----------------------------------------------------------
@app.post("/api/vorschau")
async def vorschau(anfrage: Request, daten: dict = Body(...)):
    """Live-Trefferzahl im Editor (F2.3).

    Nimmt den Filter, den der Editor gerade zeigt, samt den geerbten Sätzen,
    und liefert, wie viele Dokumente er trifft.
    """
    await _benutzer(anfrage)
    eigen, verworfen = filters.pruefen(daten.get("filter") or {})
    geerbt = [g for g in (daten.get("geerbt") or []) if isinstance(g, dict)]
    schichten = filters.verschmelzen([*geerbt, eigen]) if eigen or geerbt else []
    if not schichten:
        return {"anzahl": 0, "schichten": 0, "verworfen": verworfen}

    anzahl = await documents.anzahl(_zugang(anfrage), Plan(schnitt=schichten))
    return {"anzahl": anzahl, "schichten": len(schichten), "verworfen": verworfen}


@app.post("/api/link")
async def link_uebernehmen(anfrage: Request, daten: dict = Body(...)):
    """Filter aus einem Paperless-Link übernehmen (F3)."""
    await _benutzer(anfrage)
    satz, sortierung, verworfen = filters.aus_link(daten.get("link") or "")
    return {"filter": satz, "sortierung": sortierung, "verworfen": verworfen}


@app.get("/api/suche")
async def suche(
    anfrage: Request,
    q: str = "",
    page: int = 1,
    page_size: int = 50,
    tag: str | None = None,
):
    """Volltextsuche über den ganzen Bestand (F6.1), mit Tag-Schnellfilter."""
    await _benutzer(anfrage)
    if not q.strip():
        return {"count": 0, "results": [], "page": 1, "pages": 0, "tag": ""}
    gewaehlte_tags = filters.tagliste(tag)
    parameter = {
        "query": q.strip(),
        "page": max(1, page),
        "page_size": max(5, min(200, page_size)),
    }
    if gewaehlte_tags:
        parameter["tags__id__all"] = gewaehlte_tags
    daten = await _zugang(anfrage).dokumente(parameter)
    anzahl = int(daten.get("count") or 0)
    return {
        "count": anzahl,
        "results": daten.get("results") or [],
        "page": page,
        "pages": max(1, -(-anzahl // page_size)) if anzahl else 0,
        "tag": gewaehlte_tags,
    }


# Wie weit die Startseite zurückreicht. Mehr ist kein Überblick mehr.
NEUESTE_HOECHSTENS = 150


@app.get("/api/neueste")
async def neueste(
    anfrage: Request,
    page: int = 1,
    page_size: int = 50,
    ordering: str = "-created",
    q: str = "",
    tag: str | None = None,
):
    """Der ganze Bestand für die Startseite, neueste zuerst.

    Wie ein Ordner ohne Filter: blättern, sortieren, suchen und Tags
    anklicken funktionieren hier genauso. Sortiert wird nach dem Datum des
    Dokuments, nicht nach dem der Einlieferung - interessant ist, was zuletzt
    geschehen ist, nicht wann gescannt wurde. Die Berechtigungen prüft
    weiterhin Paperless, es sieht also jeder nur seine eigenen.
    """
    await _benutzer(anfrage)
    grenze = max(5, min(200, page_size))
    sortierung = ordering if filters.sortierung_gueltig(ordering) else "-created"
    seite = max(1, min(page, -(-NEUESTE_HOECHSTENS // grenze)))
    parameter = {
        "ordering": sortierung,
        "page": seite,
        "page_size": grenze,
    }
    if q.strip():
        parameter["title_content"] = q.strip()
    gewaehlte_tags = filters.tagliste(tag)
    if gewaehlte_tags:
        parameter["tags__id__all"] = gewaehlte_tags
    daten = await _zugang(anfrage).dokumente(parameter)
    # Die Startseite ist ein Blick auf das Neueste, kein Archivzugang: bei
    # tausenden Dokumenten wären es hunderte Seiten, durch die niemand
    # blättert. Wer weiter zurück will, nimmt einen Ordner oder die Suche.
    anzahl = min(int(daten.get("count") or 0), NEUESTE_HOECHSTENS)
    treffer = daten.get("results") or []
    # Die letzte Seite kann über die Grenze hinausragen.
    zuviel = seite * grenze - anzahl
    if zuviel > 0:
        treffer = treffer[:max(0, len(treffer) - zuviel)]
    return {
        "count": anzahl,
        "results": treffer,
        "page": seite,
        "pages": max(1, -(-anzahl // grenze)) if anzahl else 0,
        "ordering": sortierung,
        "tag": gewaehlte_tags,
    }


# --- Dokumente ---------------------------------------------------------------
@app.get("/api/dokumente/{dokument_id}")
async def dokument(anfrage: Request, dokument_id: int):
    await _benutzer(anfrage)
    daten = await _zugang(anfrage).json(f"/api/documents/{dokument_id}/")
    daten["paperless_link"] = paperless.oeffentlicher_link(dokument_id)
    return daten


@app.get("/api/dokumente/{dokument_id}/notizen")
async def notizen(anfrage: Request, dokument_id: int):
    await _benutzer(anfrage)
    return {"ergebnisse": await _zugang(anfrage).json(f"/api/documents/{dokument_id}/notes/")}


@app.get("/api/dokumente/{dokument_id}/metadaten")
async def metadaten(anfrage: Request, dokument_id: int):
    await _benutzer(anfrage)
    return await _zugang(anfrage).json(f"/api/documents/{dokument_id}/metadata/")


_DURCHLEITEN = ("content-type", "content-length", "content-disposition", "last-modified")


# Eine schlichte Seite statt einer JSON-Zeile: Vorschau und Download landen
# direkt im Browser – im Rahmen der Dokumentansicht oder als eigener Aufruf.
# Dort sah der Benutzer bisher {"fehler":"paperless","status":500} und musste
# raten, was das bedeutet.
_FEHLERSEITE = """<!DOCTYPE html>
<html lang="{sprache}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{titel}</title><style>
 :root {{ color-scheme: light dark; }}
 body {{ margin: 0; display: flex; align-items: center; justify-content: center;
        min-height: 100vh; padding: 24px; box-sizing: border-box;
        font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
        background: #f6f7f9; color: #1c2430; }}
 .kasten {{ max-width: 34em; text-align: center; }}
 h1 {{ font-size: 17px; margin: 0 0 8px; }}
 p {{ margin: 0; color: #5a6675; }}
 @media (prefers-color-scheme: dark) {{
   body {{ background: #171a1f; color: #e6e9ee; }}
   p {{ color: #a3adba; }}
 }}
</style></head><body><div class="kasten">
<h1>{titel}</h1><p>{text}</p></div></body></html>"""


def _fehlerseite(person: dict, status: int) -> HTMLResponse:
    holen = lambda schluessel: sprache.text(person.get("sprache") or "", schluessel)
    seite = _FEHLERSEITE.format(
        sprache=person.get("sprache") or "en",
        titel=html.escape(holen("fehler.dateiNichtLesbarTitel")),
        text=html.escape(holen("fehler.dateiNichtLesbar")),
    )
    # 502: der Fehler liegt hinter PaperTree, nicht in der Anfrage.
    return HTMLResponse(seite, status_code=502 if status >= 500 else status)


async def _weiterreichen(anfrage: Request, pfad: str, inline: bool):
    await _benutzer(anfrage)
    antwort = await _zugang(anfrage).strom(pfad)
    kopf = {k: v for k, v in antwort.headers.items() if k.lower() in _DURCHLEITEN}
    if inline and "content-disposition" in {k.lower() for k in kopf}:
        kopf = {k: v for k, v in kopf.items() if k.lower() != "content-disposition"}
    kopf.setdefault("Cache-Control", "private, max-age=300")
    return StreamingResponse(
        antwort.aiter_bytes(),
        status_code=antwort.status_code,
        headers=kopf,
        background=BackgroundTask(antwort.aclose),
    )


@app.get("/api/dokumente/{dokument_id}/vorschau")
async def vorschau_pdf(anfrage: Request, dokument_id: int):
    """Für den eingebauten PDF-Betrachter (F5.3)."""
    try:
        return await _weiterreichen(anfrage, f"/api/documents/{dokument_id}/preview/",
                                    inline=True)
    except paperless.PaperlessFehler as fehler:
        if fehler.status < 500:
            raise
        # Paperless hat das Dokument, kommt aber nicht an die Datei – meist
        # weil der Speicher dahinter gerade nicht mitspielt.
        return _fehlerseite(await _benutzer(anfrage), fehler.status)


@app.get("/api/dokumente/{dokument_id}/bild")
async def vorschaubild(anfrage: Request, dokument_id: int):
    return await _weiterreichen(anfrage, f"/api/documents/{dokument_id}/thumb/", inline=True)


@app.get("/api/dokumente/{dokument_id}/datei")
async def datei(anfrage: Request, dokument_id: int):
    """Download des Originals (F5.4)."""
    try:
        return await _weiterreichen(anfrage, f"/api/documents/{dokument_id}/download/",
                                    inline=False)
    except paperless.PaperlessFehler as fehler:
        if fehler.status < 500:
            raise
        return _fehlerseite(await _benutzer(anfrage), fehler.status)


# --- Darstellung von Tags und Korrespondenten (F7) ---------------------------
async def _admin(anfrage: Request) -> dict:
    """Wie _benutzer, lässt aber nur Administratoren durch.

    Die Prüfung steht hier und nicht nur in der Oberfläche: ein verstecktes
    Menü ist keine Zugangsbeschränkung.
    """
    person = await _benutzer(anfrage)
    if not person.get("admin"):
        raise paperless.PaperlessFehler(403, "Nur für Administratoren")
    return person


def _logo_url(korrespondent_id: int) -> str:
    return f"{einstellungen.BASIS_PFAD}/api/logos/{int(korrespondent_id)}"


@app.get("/api/darstellung")
async def darstellung(anfrage: Request):
    """Symbole und Logos für die Anzeige – für jeden lesbar, gepflegt vom Admin."""
    await _benutzer(anfrage)
    return {
        "tags": db.tag_symbole(),
        "korrespondenten": {
            str(kid): {"logo": _logo_url(kid)}
            for kid in db.korrespondent_logos()
        },
    }


@app.get("/api/logos/{korrespondent_id}")
async def logo_holen(anfrage: Request, korrespondent_id: int):
    await _benutzer(anfrage)
    eintrag = db.korrespondent_logo(korrespondent_id)
    if not eintrag:
        return JSONResponse(status_code=404, content={"fehler": "Kein Logo"})
    try:
        pfad = logos.pfad(eintrag["datei"])
    except logos.LogoFehler:
        return JSONResponse(status_code=404, content={"fehler": "Kein Logo"})
    if not os.path.exists(pfad):
        return JSONResponse(status_code=404, content={"fehler": "Kein Logo"})
    return FileResponse(
        pfad,
        media_type=eintrag["mime"],
        headers={
            "Cache-Control": "no-cache",
            # Auch wenn Logos nur über <img> eingebunden werden: ein SVG soll
            # beim direkten Aufruf nichts ausführen dürfen.
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.put("/api/einstellungen/tags/{tag_id}")
async def tag_symbol_setzen(anfrage: Request, tag_id: int, daten: dict = Body(...)):
    await _admin(anfrage)
    gesetzt = db.tag_symbol_setzen(tag_id, daten.get("symbol"))
    return {"tag_id": tag_id, "symbol": gesetzt}


@app.post("/api/einstellungen/korrespondenten/{korrespondent_id}/logo")
async def logo_setzen(
    anfrage: Request, korrespondent_id: int, datei: UploadFile = File(...)
):
    await _admin(anfrage)
    inhalt = await datei.read(einstellungen.LOGO_MAX_BYTES + 1)
    try:
        name, mime = logos.ablegen(korrespondent_id, inhalt)
    except logos.LogoFehler as fehler:
        return JSONResponse(status_code=400, content={"fehler": str(fehler)})
    db.korrespondent_logo_setzen(korrespondent_id, name, mime)
    return {"korrespondent_id": korrespondent_id, "logo": _logo_url(korrespondent_id)}


@app.delete("/api/einstellungen/korrespondenten/{korrespondent_id}/logo")
async def logo_loeschen(anfrage: Request, korrespondent_id: int):
    await _admin(anfrage)
    vorher = db.korrespondent_logo_loeschen(korrespondent_id)
    if vorher:
        logos.entfernen(vorher["datei"])
    return {"geloescht": bool(vorher)}


# --- Oberfläche --------------------------------------------------------------
@app.get("/gesund")
async def gesund():
    return {"stand": "gut", "version": VERSION}


class Oberflaeche(StaticFiles):
    """Liefert die Oberfläche aus und lässt den Browser immer nachfragen.

    Die Dateien tragen keinen Versionsstempel im Namen. Ohne no-cache hielte
    der Browser eine alte app.js fest, und eine Änderung käme erst nach einem
    harten Neuladen an. Mit ETag kostet das Nachfragen nur ein 304.
    """

    async def get_response(self, path, scope):
        antwort = await super().get_response(path, scope)
        antwort.headers["Cache-Control"] = "no-cache"
        return antwort


app.mount("/", Oberflaeche(directory=WEB, html=True), name="web")
