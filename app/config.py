# -*- coding: utf-8 -*-
"""Einstellungen von PaperTree, alle aus Umgebungsvariablen."""
from __future__ import annotations

import os


def _text(name: str, vorgabe: str) -> str:
    return (os.environ.get(name) or vorgabe).strip()


def _zahl(name: str, vorgabe: int) -> int:
    try:
        return int(os.environ.get(name) or vorgabe)
    except ValueError:
        return vorgabe


class Einstellungen:
    # Wohin PaperTree intern greift. Im Compose-Stack der Containername.
    PAPERLESS_URL = _text("PAPERTREE_PAPERLESS_URL", "http://localhost:8000").rstrip("/")

    # Wie Paperless für den Benutzer erreichbar ist – für den Knopf
    # "In Paperless öffnen" (F5.5). Leer heisst: dieselbe Herkunft.
    PAPERLESS_OEFFENTLICH = _text("PAPERTREE_PAPERLESS_PUBLIC_URL", "").rstrip("/")

    # Unter welchem Pfad PaperTree ausgeliefert wird (nginx-Location).
    BASIS_PFAD = "/" + _text("PAPERTREE_BASE_PATH", "papertree").strip("/")

    # Die Datenbank mit dem Baum. Nur der Baum – Dokumente werden nie
    # gespeichert (A3).
    DATENBANK = _text("PAPERTREE_DB", "/data/papertree.sqlite3")

    # Wohin die Logos der Korrespondenten gelegt werden (F7.2). Standard ist
    # ein Unterordner neben der Datenbank, damit eine Sicherung beides
    # zusammen erfasst.
    LOGO_ORDNER = _text(
        "PAPERTREE_LOGO_DIR",
        os.path.join(os.path.dirname(_text("PAPERTREE_DB", "/data/papertree.sqlite3"))
                     or ".", "logos"),
    )

    # Obergrenze je Logo. Firmenlogos sind klein; alles Grössere ist ein
    # Versehen und hat in der Ablage nichts zu suchen.
    LOGO_MAX_BYTES = _zahl("PAPERTREE_LOGO_MAX_BYTES", 1024 * 1024)

    # Wie lange die Reihenfolge-Liste je Benutzer und Sortierung gilt.
    # Enthält nur Dokument-IDs, keine Inhalte.
    INDEX_GUELTIG_S = _zahl("PAPERTREE_INDEX_TTL", 60)

    # Obergrenze für eine ID-Liste aus Paperless.
    MAX_IDS = _zahl("PAPERTREE_MAX_IDS", 100000)

    # Zeitgrenze für eine Abfrage an Paperless.
    ZEITGRENZE_S = _zahl("PAPERTREE_TIMEOUT", 30)


einstellungen = Einstellungen()
