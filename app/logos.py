# -*- coding: utf-8 -*-
"""Ablage der Korrespondenten-Logos (F7.2).

Das sind die einzigen Dateien, die PaperTree je speichert. Sie stammen nicht
aus Paperless, sondern werden von einem Administrator hochgeladen – A3 bleibt
unberührt, es landet weiterhin kein Dokumentinhalt auf der Platte.

Geprüft wird nicht die Endung und nicht der vom Browser gemeldete Typ,
sondern der Dateianfang: nur was wirklich ein Bild der erlaubten Art ist,
wird abgelegt.
"""
from __future__ import annotations

import os
import re

from .config import einstellungen

# Kennung am Dateianfang -> (Endung, Medientyp)
_MAGIE = (
    (b"\x89PNG\r\n\x1a\n", ".png", "image/png"),
    (b"\xff\xd8\xff", ".jpg", "image/jpeg"),
    (b"GIF87a", ".gif", "image/gif"),
    (b"GIF89a", ".gif", "image/gif"),
)

# SVG ist Text; erkannt wird es am Wurzelelement innerhalb der ersten Zeilen.
_SVG = re.compile(rb"<svg[\s>]", re.I)
# In SVG hat nichts Ausführbares zu suchen. Ein <img> führt zwar ohnehin
# kein Skript aus, aber abgelehnt wird es trotzdem – was nicht in der Ablage
# liegt, kann auch nie versehentlich anders eingebunden werden.
_SVG_VERBOTEN = re.compile(rb"<script|javascript:|<foreignObject|\son\w+\s*=", re.I)


class LogoFehler(ValueError):
    """Die hochgeladene Datei taugt nicht als Logo."""


def _webp(daten: bytes) -> bool:
    return daten[:4] == b"RIFF" and daten[8:12] == b"WEBP"


def pruefen(daten: bytes) -> tuple[str, str]:
    """Gibt (Endung, Medientyp) zurück oder wirft LogoFehler."""
    if not daten:
        raise LogoFehler("Die Datei ist leer.")
    if len(daten) > einstellungen.LOGO_MAX_BYTES:
        raise LogoFehler(
            "Die Datei ist grösser als %d KB."
            % (einstellungen.LOGO_MAX_BYTES // 1024)
        )
    for kennung, endung, mime in _MAGIE:
        if daten.startswith(kennung):
            return endung, mime
    if _webp(daten):
        return ".webp", "image/webp"
    anfang = daten[:4096]
    if _SVG.search(anfang):
        if _SVG_VERBOTEN.search(daten):
            raise LogoFehler(
                "Diese SVG-Datei enthält Skript oder Ereignisse und wird nicht "
                "angenommen. Bitte ohne Skript exportieren."
            )
        return ".svg", "image/svg+xml"
    raise LogoFehler("Nur PNG, JPEG, GIF, WEBP oder SVG.")


def ordner() -> str:
    os.makedirs(einstellungen.LOGO_ORDNER, exist_ok=True)
    return einstellungen.LOGO_ORDNER


def pfad(dateiname: str) -> str:
    """Der Pfad zu einer abgelegten Datei – nur innerhalb des Ordners.

    Der Name stammt zwar aus der eigenen Datenbank, wird aber trotzdem
    geprüft: ein Pfad, der nach oben zeigt, käme hier nicht durch.
    """
    sauber = os.path.basename(dateiname)
    if not sauber or sauber != dateiname:
        raise LogoFehler("Ungültiger Dateiname.")
    return os.path.join(ordner(), sauber)


def ablegen(korrespondent_id: int, daten: bytes) -> tuple[str, str]:
    """Legt das Bild ab und gibt (Dateiname, Medientyp) zurück."""
    endung, mime = pruefen(daten)
    name = "%d%s" % (int(korrespondent_id), endung)
    ziel = pfad(name)
    # Frühere Fassungen in anderen Formaten wegräumen, sonst bleiben
    # verwaiste Dateien liegen.
    entfernen_alle(korrespondent_id, ausser=name)
    with open(ziel, "wb") as datei:
        datei.write(daten)
    return name, mime


def entfernen(dateiname: str) -> None:
    try:
        os.remove(pfad(dateiname))
    except (FileNotFoundError, LogoFehler):
        pass


def entfernen_alle(korrespondent_id: int, ausser: str = "") -> None:
    for _, endung, _mime in _MAGIE:
        name = "%d%s" % (int(korrespondent_id), endung)
        if name != ausser:
            entfernen(name)
    for endung in (".webp", ".svg"):
        name = "%d%s" % (int(korrespondent_id), endung)
        if name != ausser:
            entfernen(name)
