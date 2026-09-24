# -*- coding: utf-8 -*-
"""Die Datenhaltung von PaperTree: nur der Baum (A5).

Hier liegen Ordner, ihre Filter und ihre Anzeigeeinstellungen – nichts von den
Dokumenten selbst (A3). Der Baum gehört je einem Benutzer (A7); jede Abfrage
nennt darum die Benutzerkennung, und kein Zugriff kommt ohne sie aus.

SQLite genügt: Der Baum ist klein, wird selten geschrieben und soll ohne
zusätzlichen Dienst auskommen.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
from datetime import datetime, timezone

from .config import einstellungen
from .tree import (
    STANDARD_SEITENGROESSE,
    STANDARD_SORTIERUNG,
    STANDARD_SPALTEN,
    Knoten,
)

SCHEMA_STAND = 4

# Erweiterungen am Schema, der Reihenfolge nach. Stand 1 ist die Tabelle unten.
_WANDLUNGEN = {
    2: [
        # Dynamische Unterknoten (F4): nach welcher Dimension ein Ordner seine
        # Unterordner aufspannt. Leer heisst: von Hand angelegte Unterordner.
        "ALTER TABLE ordner ADD COLUMN gruppieren_nach TEXT NOT NULL DEFAULT ''",
    ],
    3: [
        # Symbol je Ordner (F1.7). Leer heisst: das Standardsymbol.
        "ALTER TABLE ordner ADD COLUMN symbol TEXT NOT NULL DEFAULT ''",
    ],
    4: [
        # Darstellung von Tags und Korrespondenten (F7). Anders als der Baum
        # gilt sie für alle: gepflegt wird sie von einem Administrator,
        # gesehen von jedem. Darum kein Benutzerfeld.
        """CREATE TABLE IF NOT EXISTS tag_symbol (
            tag_id    INTEGER PRIMARY KEY,
            symbol    TEXT NOT NULL DEFAULT '',
            geaendert TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS korrespondent_logo (
            korrespondent_id INTEGER PRIMARY KEY,
            datei            TEXT NOT NULL,
            mime             TEXT NOT NULL,
            geaendert        TEXT NOT NULL
        )""",
    ],
}

_SCHEMA = """
CREATE TABLE IF NOT EXISTS ordner (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    benutzer           INTEGER NOT NULL,
    eltern_id          INTEGER REFERENCES ordner(id) ON DELETE CASCADE,
    name               TEXT    NOT NULL,
    reihenfolge        INTEGER NOT NULL DEFAULT 0,
    eigener_filter     INTEGER NOT NULL DEFAULT 0,
    filter             TEXT    NOT NULL DEFAULT '{}',
    kinder_einbeziehen INTEGER NOT NULL DEFAULT 0,
    kinder_tief        INTEGER NOT NULL DEFAULT 1,
    eigenstaendig      INTEGER NOT NULL DEFAULT 0,
    sortierung         TEXT    NOT NULL DEFAULT '-created',
    darstellung        TEXT    NOT NULL DEFAULT 'liste',
    spalten            TEXT    NOT NULL DEFAULT '[]',
    seitengroesse      INTEGER NOT NULL DEFAULT 50,
    auf_dashboard      INTEGER NOT NULL DEFAULT 0,
    gruppieren_nach    TEXT    NOT NULL DEFAULT '',
    symbol             TEXT    NOT NULL DEFAULT '',
    erstellt           TEXT    NOT NULL,
    geaendert          TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ordner_benutzer ON ordner (benutzer, eltern_id, reihenfolge);
CREATE TABLE IF NOT EXISTS tag_symbol (
    tag_id    INTEGER PRIMARY KEY,
    symbol    TEXT NOT NULL DEFAULT '',
    geaendert TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS korrespondent_logo (
    korrespondent_id INTEGER PRIMARY KEY,
    datei            TEXT NOT NULL,
    mime             TEXT NOT NULL,
    geaendert        TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schema_stand (stand INTEGER NOT NULL);
"""

# Felder, die von aussen gesetzt werden dürfen, mit ihrer Umwandlung.
_SCHREIBBAR = {
    "name": lambda w: str(w).strip()[:200],
    "eltern_id": lambda w: int(w) if w not in (None, "", 0) else None,
    "reihenfolge": lambda w: int(w or 0),
    "eigener_filter": lambda w: 1 if w else 0,
    "filter": lambda w: json.dumps(w or {}, ensure_ascii=False),
    "kinder_einbeziehen": lambda w: 1 if w else 0,
    "kinder_tief": lambda w: 1 if w else 0,
    "eigenstaendig": lambda w: 1 if w else 0,
    "sortierung": lambda w: str(w or STANDARD_SORTIERUNG)[:120],
    "darstellung": lambda w: "kacheln" if str(w) == "kacheln" else "liste",
    "spalten": lambda w: json.dumps(list(w or STANDARD_SPALTEN), ensure_ascii=False),
    "seitengroesse": lambda w: max(5, min(200, int(w or STANDARD_SEITENGROESSE))),
    "auf_dashboard": lambda w: 1 if w else 0,
    "gruppieren_nach": lambda w: str(w or "")[:40],
    "symbol": lambda w: _symbolname(w),
}


# Ein Symbolname zeigt auf einen Eintrag im mitgelieferten Satz. Nur
# Kleinbuchstaben, Ziffern und Bindestriche – was nicht passt, wird zu leer
# und damit zum Standardsymbol. So kann über dieses Feld nichts anderes in
# die Oberflaeche gelangen als ein Name aus dem Satz.
_SYMBOL_ERLAUBT = re.compile(r"^[a-z0-9-]{1,60}$")


def _symbolname(wert) -> str:
    name = str(wert or "").strip().lower()
    return name if _SYMBOL_ERLAUBT.match(name) else ""


def _jetzt() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def verbinde() -> sqlite3.Connection:
    ordner = os.path.dirname(einstellungen.DATENBANK)
    if ordner:
        os.makedirs(ordner, exist_ok=True)
    verbindung = sqlite3.connect(einstellungen.DATENBANK, timeout=10)
    verbindung.row_factory = sqlite3.Row
    verbindung.execute("PRAGMA foreign_keys = ON")
    verbindung.execute("PRAGMA journal_mode = WAL")
    return verbindung


def einrichten() -> None:
    """Legt das Schema an und zieht eine bestehende Datenbank nach."""
    with verbinde() as v:
        neu = v.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='ordner'"
        ).fetchone() is None
        v.executescript(_SCHEMA)

        zeile = v.execute("SELECT stand FROM schema_stand").fetchone()
        if zeile is None:
            # Eine frische Datenbank hat das Schema schon vollständig.
            v.execute(
                "INSERT INTO schema_stand (stand) VALUES (?)",
                (SCHEMA_STAND if neu else 1,),
            )
            zeile = v.execute("SELECT stand FROM schema_stand").fetchone()

        stand = int(zeile["stand"])
        vorhanden = {s["name"] for s in v.execute("PRAGMA table_info(ordner)")}
        for ziel in sorted(_WANDLUNGEN):
            if ziel <= stand:
                continue
            for befehl in _WANDLUNGEN[ziel]:
                spalte = befehl.split("ADD COLUMN ")[-1].split()[0] if "ADD COLUMN" in befehl else None
                if spalte and spalte in vorhanden:
                    continue
                v.execute(befehl)
        if stand < SCHEMA_STAND:
            v.execute("UPDATE schema_stand SET stand = ?", (SCHEMA_STAND,))


# --- Lesen -------------------------------------------------------------------
def _als_knoten(zeile: sqlite3.Row) -> Knoten:
    try:
        filter_satz = json.loads(zeile["filter"] or "{}")
    except ValueError:
        filter_satz = {}
    try:
        spalten = json.loads(zeile["spalten"] or "[]") or list(STANDARD_SPALTEN)
    except ValueError:
        spalten = list(STANDARD_SPALTEN)
    return Knoten(
        id=zeile["id"],
        name=zeile["name"],
        eltern_id=zeile["eltern_id"],
        reihenfolge=zeile["reihenfolge"],
        eigener_filter=bool(zeile["eigener_filter"]),
        filter=filter_satz if isinstance(filter_satz, dict) else {},
        kinder_einbeziehen=bool(zeile["kinder_einbeziehen"]),
        kinder_tief=bool(zeile["kinder_tief"]),
        eigenstaendig=bool(zeile["eigenstaendig"]),
        sortierung=zeile["sortierung"],
        darstellung=zeile["darstellung"],
        spalten=spalten,
        seitengroesse=zeile["seitengroesse"],
        auf_dashboard=bool(zeile["auf_dashboard"]),
        gruppieren_nach=(
            zeile["gruppieren_nach"] if "gruppieren_nach" in zeile.keys() else ""
        ) or "",
        symbol=(zeile["symbol"] if "symbol" in zeile.keys() else "") or "",
    )


def knoten_laden(benutzer: int) -> list:
    with verbinde() as v:
        zeilen = v.execute(
            "SELECT * FROM ordner WHERE benutzer = ? ORDER BY reihenfolge, name",
            (benutzer,),
        ).fetchall()
    return [_als_knoten(z) for z in zeilen]


def knoten_einzeln(benutzer: int, knoten_id: int) -> Knoten | None:
    with verbinde() as v:
        zeile = v.execute(
            "SELECT * FROM ordner WHERE benutzer = ? AND id = ?", (benutzer, knoten_id)
        ).fetchone()
    return _als_knoten(zeile) if zeile else None


# --- Schreiben ---------------------------------------------------------------
def _werte(daten: dict) -> dict:
    """Nimmt nur bekannte Felder und wandelt sie um."""
    fertig = {}
    for feld, wandeln in _SCHREIBBAR.items():
        if feld in daten:
            fertig[feld] = wandeln(daten[feld])
    return fertig


def _eltern_gehoert(v: sqlite3.Connection, benutzer: int, eltern_id) -> bool:
    if eltern_id is None:
        return True
    zeile = v.execute(
        "SELECT 1 FROM ordner WHERE id = ? AND benutzer = ?", (eltern_id, benutzer)
    ).fetchone()
    return zeile is not None


def anlegen(benutzer: int, daten: dict) -> int:
    werte = _werte(daten)
    werte.setdefault("name", "Neuer Ordner")
    werte.setdefault("spalten", json.dumps(list(STANDARD_SPALTEN), ensure_ascii=False))
    werte.setdefault("sortierung", STANDARD_SORTIERUNG)
    with verbinde() as v:
        if not _eltern_gehoert(v, benutzer, werte.get("eltern_id")):
            raise ValueError("Der übergeordnete Ordner gehört nicht diesem Benutzer")
        if "reihenfolge" not in werte:
            hoechste = v.execute(
                "SELECT COALESCE(MAX(reihenfolge), 0) FROM ordner "
                "WHERE benutzer = ? AND eltern_id IS ?",
                (benutzer, werte.get("eltern_id")),
            ).fetchone()[0]
            werte["reihenfolge"] = hoechste + 1
        werte["benutzer"] = benutzer
        werte["erstellt"] = werte["geaendert"] = _jetzt()
        spalten = ", ".join(werte)
        platzhalter = ", ".join("?" for _ in werte)
        zeiger = v.execute(
            f"INSERT INTO ordner ({spalten}) VALUES ({platzhalter})",
            tuple(werte.values()),
        )
        return int(zeiger.lastrowid)


def _ist_nachfahre(v: sqlite3.Connection, benutzer: int, knoten_id: int, moeglicher: int) -> bool:
    """Verhindert, dass ein Ordner unter sich selbst geschoben wird."""
    aktuell = moeglicher
    gesehen = set()
    while aktuell is not None and aktuell not in gesehen:
        if aktuell == knoten_id:
            return True
        gesehen.add(aktuell)
        zeile = v.execute(
            "SELECT eltern_id FROM ordner WHERE id = ? AND benutzer = ?",
            (aktuell, benutzer),
        ).fetchone()
        aktuell = zeile["eltern_id"] if zeile else None
    return False


def aendern(benutzer: int, knoten_id: int, daten: dict) -> bool:
    werte = _werte(daten)
    if not werte:
        return False
    with verbinde() as v:
        eigen = v.execute(
            "SELECT 1 FROM ordner WHERE id = ? AND benutzer = ?", (knoten_id, benutzer)
        ).fetchone()
        if not eigen:
            return False
        if "eltern_id" in werte:
            ziel = werte["eltern_id"]
            if not _eltern_gehoert(v, benutzer, ziel):
                raise ValueError("Der übergeordnete Ordner gehört nicht diesem Benutzer")
            if ziel is not None and _ist_nachfahre(v, benutzer, knoten_id, ziel):
                raise ValueError("Ein Ordner kann nicht unter sich selbst liegen")
        werte["geaendert"] = _jetzt()
        satz = ", ".join(f"{feld} = ?" for feld in werte)
        v.execute(
            f"UPDATE ordner SET {satz} WHERE id = ? AND benutzer = ?",
            (*werte.values(), knoten_id, benutzer),
        )
    return True


def loeschen(benutzer: int, knoten_id: int) -> bool:
    with verbinde() as v:
        zeiger = v.execute(
            "DELETE FROM ordner WHERE id = ? AND benutzer = ?", (knoten_id, benutzer)
        )
        return zeiger.rowcount > 0


def reihenfolge_setzen(benutzer: int, eltern_id, ids: list) -> None:
    """Sortiert die Geschwister in der übergebenen Reihenfolge (F1.1)."""
    with verbinde() as v:
        for stelle, knoten_id in enumerate(ids, start=1):
            v.execute(
                "UPDATE ordner SET reihenfolge = ?, eltern_id = ?, geaendert = ? "
                "WHERE id = ? AND benutzer = ?",
                (stelle, eltern_id, _jetzt(), int(knoten_id), benutzer),
            )


# --- Darstellung von Tags und Korrespondenten (F7) ---------------------------
# Diese Zuordnungen gelten für alle Benutzer: gepflegt von einem
# Administrator, gesehen von jedem. Sie sind reine Anzeige und ändern in
# Paperless nichts (A1).

def tag_symbole() -> dict:
    """Tag-ID -> Symbolname, nur die gesetzten."""
    with verbinde() as v:
        zeilen = v.execute(
            "SELECT tag_id, symbol FROM tag_symbol WHERE symbol != ''"
        ).fetchall()
    return {int(z["tag_id"]): z["symbol"] for z in zeilen}


def tag_symbol_setzen(tag_id: int, symbol) -> str:
    """Setzt oder entfernt das Symbol eines Tags. Gibt den gültigen Wert zurück."""
    name = _symbolname(symbol)
    with verbinde() as v:
        if not name:
            v.execute("DELETE FROM tag_symbol WHERE tag_id = ?", (int(tag_id),))
        else:
            v.execute(
                "INSERT INTO tag_symbol (tag_id, symbol, geaendert) VALUES (?, ?, ?) "
                "ON CONFLICT(tag_id) DO UPDATE SET symbol = excluded.symbol, "
                "geaendert = excluded.geaendert",
                (int(tag_id), name, _jetzt()),
            )
    return name


def korrespondent_logos() -> dict:
    """Korrespondent-ID -> {datei, mime}."""
    with verbinde() as v:
        zeilen = v.execute(
            "SELECT korrespondent_id, datei, mime FROM korrespondent_logo"
        ).fetchall()
    return {
        int(z["korrespondent_id"]): {"datei": z["datei"], "mime": z["mime"]}
        for z in zeilen
    }


def korrespondent_logo(korrespondent_id: int) -> dict | None:
    with verbinde() as v:
        zeile = v.execute(
            "SELECT datei, mime FROM korrespondent_logo WHERE korrespondent_id = ?",
            (int(korrespondent_id),),
        ).fetchone()
    return {"datei": zeile["datei"], "mime": zeile["mime"]} if zeile else None


def korrespondent_logo_setzen(korrespondent_id: int, datei: str, mime: str) -> None:
    with verbinde() as v:
        v.execute(
            "INSERT INTO korrespondent_logo (korrespondent_id, datei, mime, geaendert) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT(korrespondent_id) DO UPDATE SET datei = excluded.datei, "
            "mime = excluded.mime, geaendert = excluded.geaendert",
            (int(korrespondent_id), datei, mime, _jetzt()),
        )


def korrespondent_logo_loeschen(korrespondent_id: int) -> dict | None:
    """Entfernt den Eintrag und nennt die Datei, die dazu gehörte."""
    vorher = korrespondent_logo(korrespondent_id)
    with verbinde() as v:
        v.execute(
            "DELETE FROM korrespondent_logo WHERE korrespondent_id = ?",
            (int(korrespondent_id),),
        )
    return vorher
