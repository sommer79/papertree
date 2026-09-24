# -*- coding: utf-8 -*-
"""Einen Abfrageplan ausführen und eine Seite Dokumente liefern.

Der häufige Fall ist eine einzige Abfrage: Paperless filtert, sortiert und
blättert selbst. Nur wenn der Baum etwas verlangt, was die API nicht in einem
Zug kann – eine Vereinigung über Unterordner oder zwei ODER-Listen im
UND – führt PaperTree über die Dokument-IDs zusammen (F1.3).

Zwischengespeichert wird dabei ausschliesslich die Reihenfolge der IDs, je
Benutzer und Sortierung, für kurze Zeit. Inhalte werden nie gespeichert (A3),
und weil die Liste mit dem Cookie des Benutzers geholt wird, enthält sie nur,
was dieser Benutzer sehen darf.
"""
from __future__ import annotations

import time

from .config import einstellungen
from .filters import verschmelzen
from .tree import Plan, ausfuehrungsart

# (benutzer, sortierung) -> (zeitpunkt, [ids])
_REIHENFOLGE: dict = {}


def cache_leeren() -> None:
    _REIHENFOLGE.clear()


async def _reihenfolge(zugang, benutzer: int, sortierung: str) -> list:
    """Alle Dokument-IDs dieses Benutzers in der gewünschten Sortierung."""
    schluessel = (benutzer, sortierung)
    eintrag = _REIHENFOLGE.get(schluessel)
    if eintrag and time.time() - eintrag[0] < einstellungen.INDEX_GUELTIG_S:
        return eintrag[1]

    gesammelt: list[int] = []
    seite = 1
    while True:
        daten = await zugang.json(
            "/api/documents/",
            {
                "page": seite,
                "page_size": 5000,
                "fields": "id",
                "ordering": sortierung,
            },
        )
        gesammelt.extend(
            int(t["id"]) for t in (daten.get("results") or []) if t.get("id") is not None
        )
        if not daten.get("next") or len(gesammelt) >= einstellungen.MAX_IDS:
            break
        seite += 1

    _REIHENFOLGE[schluessel] = (time.time(), gesammelt)
    return gesammelt


async def ids_fuer_plan(zugang, plan: Plan, zusatz=None) -> set:
    """Die Dokumentmenge eines Plans – wird für die Gruppenbildung gebraucht."""
    plan, reste = _mit_zusatz(plan, zusatz)
    if ausfuehrungsart(plan) == "keine":
        return set()
    return await _schneiden(zugang, await _ids_fuer(zugang, plan), reste)


async def _ids_fuer(zugang, plan: Plan) -> set:
    """Die IDs eines Plans: Schnitt der Schichten, vereinigt mit den Teilplänen."""
    aus_schnitt: set | None = None
    for satz in plan.schnitt:
        menge = set(await zugang.alle_ids(satz))
        aus_schnitt = menge if aus_schnitt is None else (aus_schnitt & menge)
        if not aus_schnitt:
            break

    vereint: set = set()
    for teil in plan.vereinigung:
        vereint |= await _ids_fuer(zugang, teil)

    if aus_schnitt is None:
        return vereint
    return aus_schnitt | vereint


def _als_liste(zusatz) -> list:
    if not zusatz:
        return []
    if isinstance(zusatz, dict):
        return [zusatz]
    return [s for s in zusatz if s]


def _mit_zusatz(plan: Plan, zusatz) -> tuple:
    """Verknüpft Zusatzfilter (Gruppe, Suche im Ordner) mit UND.

    Rückgabe: Plan und die Sätze, die nicht in den Plan hineinpassten und darum
    über die IDs geschnitten werden müssen.
    """
    saetze = _als_liste(zusatz)
    if not saetze:
        return plan, []
    if not plan.vereinigung:
        return Plan(schnitt=verschmelzen(list(plan.schnitt) + saetze)), []
    # Bei einer Vereinigung gelten die Zusätze für das Gesamtergebnis.
    return plan, verschmelzen(saetze)


async def _schneiden(zugang, menge: set, reste: list) -> set:
    for satz in reste:
        menge &= set(await zugang.alle_ids(satz))
        if not menge:
            break
    return menge


async def anzahl(zugang, plan: Plan, zusatz=None) -> int:
    """Trefferzahl – für Ordnerzähler (F1.7) und die Vorschau im Editor (F2.3)."""
    plan, reste = _mit_zusatz(plan, zusatz)
    art = ausfuehrungsart(plan)
    if art == "keine":
        return 0
    if art == "direkt" and not reste:
        return await zugang.anzahl(plan.schnitt[0] if plan.schnitt else {})
    menge = await _schneiden(zugang, await _ids_fuer(zugang, plan), reste)
    return len(menge)


async def seite(
    zugang,
    benutzer: int,
    plan: Plan,
    sortierung: str,
    nummer: int = 1,
    groesse: int = 50,
    zusatz=None,
) -> dict:
    """Eine Seite Dokumente zu einem Ordner."""
    nummer = max(1, int(nummer or 1))
    # Die Grenzen für die Oberfläche setzt die API-Schicht; hier zählt nur,
    # dass die Seitengrösse brauchbar ist.
    groesse = max(1, min(500, int(groesse or 50)))
    plan, reste = _mit_zusatz(plan, zusatz)
    art = ausfuehrungsart(plan)

    if art == "keine":
        return {"count": 0, "results": [], "page": 1, "pages": 0, "abfragen": 0}

    if art == "direkt" and not reste:
        satz = plan.schnitt[0] if plan.schnitt else {}
        daten = await zugang.dokumente(
            {**satz, "ordering": sortierung, "page": nummer, "page_size": groesse}
        )
        anzahl_gesamt = int(daten.get("count") or 0)
        return {
            "count": anzahl_gesamt,
            "results": daten.get("results") or [],
            "page": nummer,
            "pages": max(1, -(-anzahl_gesamt // groesse)) if anzahl_gesamt else 0,
            "abfragen": 1,
        }

    # Zusammenführen über die IDs
    menge = await _schneiden(zugang, await _ids_fuer(zugang, plan), reste)
    if not menge:
        return {"count": 0, "results": [], "page": 1, "pages": 0, "abfragen": 1}

    reihenfolge = await _reihenfolge(zugang, benutzer, sortierung)
    geordnet = [i for i in reihenfolge if i in menge]
    # Was der Index nicht kennt (er ist womöglich gekappt), kommt hinten dran.
    fehlend = menge - set(geordnet)
    if fehlend:
        geordnet.extend(sorted(fehlend))

    anzahl_gesamt = len(geordnet)
    seiten = max(1, -(-anzahl_gesamt // groesse))
    nummer = min(nummer, seiten)
    ausschnitt = geordnet[(nummer - 1) * groesse : nummer * groesse]

    if not ausschnitt:
        return {"count": anzahl_gesamt, "results": [], "page": nummer, "pages": seiten, "abfragen": 2}

    daten = await zugang.dokumente(
        {
            "id__in": ",".join(str(i) for i in ausschnitt),
            "ordering": sortierung,
            "page": 1,
            "page_size": len(ausschnitt),
        }
    )
    treffer = daten.get("results") or []
    # Die Reihenfolge aus dem Index gilt, falls Paperless anders sortiert.
    stelle = {doc_id: n for n, doc_id in enumerate(ausschnitt)}
    treffer.sort(key=lambda d: stelle.get(d.get("id"), 0))

    return {
        "count": anzahl_gesamt,
        "results": treffer,
        "page": nummer,
        "pages": seiten,
        "abfragen": 3,
    }
