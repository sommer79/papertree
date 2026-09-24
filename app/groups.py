# -*- coding: utf-8 -*-
"""Dynamische Unterknoten (F4).

Ein Ordner kann seine Unterordner aufspannen lassen, statt sie von Hand
anzulegen: gruppiert nach Jahr, Korrespondent, Dokumenttyp, Tag, Speicherpfad
oder einem Zusatzfeld. Kommt in Paperless ein neuer Wert dazu, erscheint der
Unterordner von selbst.

Das ist ausdrücklich eine Zugabe – manuell zusammengestellte Ordner bleiben der
Regelfall, und beides steht im selben Baum nebeneinander (F4.3).

Jede Gruppe ist am Ende ein gewöhnlicher Filtersatz. Damit funktionieren
Vererbung, Aggregation, Sortierung und die Suche im Ordner unverändert weiter.
"""
from __future__ import annotations

import json
import time

from .config import einstellungen

# Kennung -> (Anzeigename, Serializer-Feld, Stammdatenart, mehrere je Dokument)
DIMENSIONEN = {
    "created_year": ("Jahr (erstellt)", "created", None, False),
    "added_year": ("Jahr (hinzugefügt)", "added", None, False),
    "correspondent": ("Korrespondent", "correspondent", "correspondents", False),
    "document_type": ("Dokumenttyp", "document_type", "document_types", False),
    "storage_path": ("Speicherpfad", "storage_path", "storage_paths", False),
    "tag": ("Tag", "tags", "tags", True),
}

ZUSATZFELD_PRAEFIX = "cf:"

# (benutzer, dimension) -> (zeitpunkt, {id: werte})
_WERTE_CACHE: dict = {}


def cache_leeren() -> None:
    _WERTE_CACHE.clear()


def gueltig(dimension: str | None) -> bool:
    if not dimension:
        return False
    if dimension in DIMENSIONEN:
        return True
    if dimension.startswith(ZUSATZFELD_PRAEFIX):
        return dimension[len(ZUSATZFELD_PRAEFIX):].isdigit()
    return False


def _feld_fuer(dimension: str) -> str:
    if dimension in DIMENSIONEN:
        return DIMENSIONEN[dimension][1]
    return "custom_fields"


def _zusatzfeld_id(dimension: str) -> int | None:
    if dimension.startswith(ZUSATZFELD_PRAEFIX):
        rest = dimension[len(ZUSATZFELD_PRAEFIX):]
        return int(rest) if rest.isdigit() else None
    return None


# --- Werte aus den Dokumenten lesen ------------------------------------------
def _werte_aus(dokument: dict, dimension: str) -> list:
    """Die Gruppenwerte eines Dokuments. Leere Liste heisst: ohne Wert."""
    if dimension in ("created_year", "added_year"):
        roh = dokument.get(_feld_fuer(dimension))
        return [str(roh)[:4]] if roh else []

    if dimension == "tag":
        return [str(t) for t in (dokument.get("tags") or [])]

    if dimension in DIMENSIONEN:
        roh = dokument.get(_feld_fuer(dimension))
        return [str(roh)] if roh is not None else []

    feld_id = _zusatzfeld_id(dimension)
    for eintrag in dokument.get("custom_fields") or []:
        if str(eintrag.get("field")) == str(feld_id):
            wert = eintrag.get("value")
            if wert is None or wert == "":
                return []
            return [str(wert)]
    return []


async def _alle_seiten(zugang, parameter: dict) -> list:
    gesammelt: list = []
    seite = 1
    while True:
        daten = await zugang.json(
            "/api/documents/", {**parameter, "page": seite, "page_size": 5000}
        )
        gesammelt.extend(daten.get("results") or [])
        if not daten.get("next") or len(gesammelt) >= einstellungen.MAX_IDS:
            break
        seite += 1
    return gesammelt


async def _werte_global(zugang, benutzer: int, dimension: str) -> dict:
    """id -> Gruppenwerte, für alle Dokumente dieses Benutzers.

    Enthält keine Inhalte, nur Kennungen und den Gruppierungswert, und gilt
    genauso kurz wie die Reihenfolge-Liste (A3).
    """
    schluessel = (benutzer, dimension)
    eintrag = _WERTE_CACHE.get(schluessel)
    if eintrag and time.time() - eintrag[0] < einstellungen.INDEX_GUELTIG_S:
        return eintrag[1]

    felder = "id," + _feld_fuer(dimension)
    dokumente = await _alle_seiten(zugang, {"fields": felder, "ordering": "id"})
    tabelle = {int(d["id"]): _werte_aus(d, dimension) for d in dokumente if d.get("id")}
    _WERTE_CACHE[schluessel] = (time.time(), tabelle)
    return tabelle


# --- Gruppen bilden ----------------------------------------------------------
async def _namen_fuer(zugang, dimension: str) -> dict:
    """Werte in lesbare Namen übersetzen."""
    if dimension in ("created_year", "added_year"):
        return {}
    if dimension in DIMENSIONEN:
        art = DIMENSIONEN[dimension][2]
        eintraege = await zugang.stammdaten(art)
        return {str(e.get("id")): e.get("name") or str(e.get("id")) for e in eintraege}

    feld_id = _zusatzfeld_id(dimension)
    for feld in await zugang.stammdaten("custom_fields"):
        if str(feld.get("id")) != str(feld_id):
            continue
        optionen = (feld.get("extra_data") or {}).get("select_options") or []
        return {str(o.get("id")): o.get("label") or str(o.get("id")) for o in optionen if o.get("id")}
    return {}


def _ohne_wert_name(dimension: str) -> str:
    if dimension in DIMENSIONEN:
        return "(ohne %s)" % DIMENSIONEN[dimension][0]
    return "(ohne Wert)"


async def gruppen(zugang, benutzer: int, plan, dimension: str, ids_des_plans) -> list:
    """Die dynamischen Unterordner eines Ordners, mit Trefferzahl.

    `ids_des_plans` ist die Dokumentmenge des Ordners; None heisst "alle".
    """
    from .tree import ausfuehrungsart

    art = ausfuehrungsart(plan)
    if art == "keine":
        return []

    felder = "id," + _feld_fuer(dimension)
    if art == "direkt" and ids_des_plans is None:
        satz = plan.schnitt[0] if plan.schnitt else {}
        dokumente = await _alle_seiten(zugang, {**satz, "fields": felder, "ordering": "id"})
        tabelle = {int(d["id"]): _werte_aus(d, dimension) for d in dokumente if d.get("id")}
    else:
        alle = await _werte_global(zugang, benutzer, dimension)
        tabelle = {i: alle.get(i, []) for i in (ids_des_plans or alle.keys())}

    zaehlung: dict = {}
    ohne_wert = 0
    for werte in tabelle.values():
        if not werte:
            ohne_wert += 1
            continue
        for wert in werte:
            zaehlung[wert] = zaehlung.get(wert, 0) + 1

    namen = await _namen_fuer(zugang, dimension)
    liste = [
        {"wert": wert, "name": namen.get(wert, wert), "anzahl": anzahl}
        for wert, anzahl in zaehlung.items()
    ]

    if dimension in ("created_year", "added_year"):
        liste.sort(key=lambda g: g["wert"], reverse=True)
    else:
        liste.sort(key=lambda g: str(g["name"]).casefold())

    if ohne_wert:
        liste.append(
            {"wert": "", "name": _ohne_wert_name(dimension), "anzahl": ohne_wert}
        )
    return liste


# --- Eine Gruppe als Filtersatz ----------------------------------------------
def gruppen_filter(dimension: str, wert: str) -> dict:
    """Der Filtersatz, der genau diese Gruppe beschreibt."""
    leer = wert is None or str(wert) == ""

    # created und added sind in Paperless immer gesetzt; eine Gruppe "ohne
    # Jahr" entsteht darum nicht. Käme sie doch, trifft sie nichts, statt
    # einen Parameter zu schicken, den die API nicht kennt.
    if dimension == "created_year":
        return {"id__in": "0"} if leer else {"created__year": str(wert)}
    if dimension == "added_year":
        return {"id__in": "0"} if leer else {"added__year": str(wert)}
    if dimension == "correspondent":
        return {"correspondent__isnull": "true"} if leer else {"correspondent__id": str(wert)}
    if dimension == "document_type":
        return {"document_type__isnull": "true"} if leer else {"document_type__id": str(wert)}
    if dimension == "storage_path":
        return {"storage_path__isnull": "true"} if leer else {"storage_path__id": str(wert)}
    if dimension == "tag":
        return {"is_tagged": "false"} if leer else {"tags__id__all": str(wert)}

    feld_id = _zusatzfeld_id(dimension)
    if feld_id is None:
        return {}
    if leer:
        return {"custom_field_query": json.dumps([feld_id, "exists", False])}
    return {"custom_field_query": json.dumps([feld_id, "exact", str(wert)])}


def dimension_name(dimension: str, zusatzfelder: list | None = None) -> str:
    if dimension in DIMENSIONEN:
        return DIMENSIONEN[dimension][0]
    feld_id = _zusatzfeld_id(dimension)
    for feld in zusatzfelder or []:
        if str(feld.get("id")) == str(feld_id):
            return feld.get("name") or dimension
    return dimension
