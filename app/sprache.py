# -*- coding: utf-8 -*-
"""Welche Sprache PaperTree spricht.

PaperTree hat keine eigene Spracheinstellung: es nimmt die, die der Benutzer
in Paperless gewählt hat. Zwei Einstellungen für dieselbe Sache laufen sonst
auseinander, und niemand sucht sie an zwei Orten.

Hier stehen nur die beiden Umrechnungen von einem Wert aus `ui_settings` auf
das, was die Oberfläche braucht. Sie hängen an keiner Bibliothek – deshalb
lassen sie sich ohne laufendes Paperless prüfen.
"""
from __future__ import annotations

import json
import os
import re

# Die Oberfläche gibt es in diesen Sprachen; alles andere bekommt Englisch.
SPRACHEN = ("de", "en", "fr", "it", "es")

# Wo Paperless die beiden Werte ablegt. Die Sprache steht zuoberst, weil
# Paperless sie serverseitig selbst braucht.
SCHLUESSEL_SPRACHE = "language"

# Die Datumssprache liegt verschachtelt: settings.date_display.date_locale.
# Im Browser heisst dieselbe Einstellung "general-settings:date-display:
# date-locale" – das ist der Name im Frontend, beim Speichern baut Paperless
# daraus die verschachtelte Form. Nachgeschaut wird an beiden Orten, damit es
# auch mit einer Fassung stimmt, die flach ablegt.
SCHLUESSEL_DATUM = ("date_display", "date_locale")
SCHLUESSEL_DATUM_FLACH = "general-settings:date-display:date-locale"

# Neben den Sprachen kennt Paperless einen Sonderwert: ISO 8601. Das ist
# keine Sprache, sondern eine Schreibweise – 2026-09-24, überall gleich.
# Intl nimmt "iso-8601" als wohlgeformtes Sprachkürzel an und übergeht es
# dann stillschweigend, darum muss es hier von Hand durchgereicht werden.
ISO = "iso-8601"

# Ein Sprachkürzel, wie Intl es versteht: "de", "de-CH", "pt-BR".
_LOCALE = re.compile(r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")


def sprache_waehlen(wert: str | None) -> str:
    """Aus "de-de" wird "de"; was PaperTree nicht kann, wird zu "".

    Leer heisst nicht Englisch, sondern "keine Angabe" – dann entscheidet der
    Browser, genau wie Paperless es ohne gesetzte Sprache tut.
    """
    kurz = (wert or "").strip().lower().replace("_", "-").split("-")[0]
    return kurz if kurz in SPRACHEN else ""


def datumssprache_waehlen(wert: str | None) -> str:
    """Das Sprachkürzel fürs Datum, unverkürzt – "de-CH" schreibt anders als "de-DE".

    Anders als bei der Oberfläche gibt es hier keine Liste: das Datum
    formatiert der Browser, und der kennt jede Sprache. Geprüft wird nur die
    Form, damit aus den Einstellungen nichts Unbrauchbares weitergereicht wird.
    "iso-8601" kommt durch, obwohl es keine Sprache ist.
    """
    kurz = (wert or "").strip().replace("_", "-")
    if kurz.lower() == ISO:
        return ISO
    return kurz if _LOCALE.match(kurz) else ""


def _datumswert(werte: dict) -> str:
    """Die Datumseinstellung, verschachtelt oder flach."""
    aussen, innen = SCHLUESSEL_DATUM
    verschachtelt = werte.get(aussen)
    if isinstance(verschachtelt, dict) and verschachtelt.get(innen):
        return str(verschachtelt[innen])
    return str(werte.get(SCHLUESSEL_DATUM_FLACH) or "")


def aus_einstellungen(gewaehlt: dict | None) -> dict:
    """Sprache und Datumssprache aus dem settings-Teil von ui_settings.

    Fürs Datum nennt Paperless eine eigene Sprache und fällt sonst auf die
    Anzeigesprache zurück. PaperTree macht es genauso, damit dasselbe
    Dokument in beiden Oberflächen dasselbe Datum zeigt.
    """
    werte = gewaehlt or {}
    roh_sprache = werte.get(SCHLUESSEL_SPRACHE) or ""
    return {
        "sprache": sprache_waehlen(roh_sprache),
        "datumssprache": (datumssprache_waehlen(_datumswert(werte))
                          or datumssprache_waehlen(roh_sprache)),
    }


# --- Texte für die wenigen Seiten, die der Server selbst schreibt -----------
# Sonst kommt jeder Text aus dem Browser. Zwei Fälle gehen aber direkt an den
# Benutzer, ohne dass die Oberfläche dazwischenliegt: die Vorschau im Rahmen
# und der Download. Beide holen ihre Texte hier – aus denselben Dateien wie
# der Rest, damit es nicht zwei Quellen für dieselbe Formulierung gibt.
_SPRACHORDNER = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web", "sprachen")
_KATALOGE: dict = {}


def _katalog(sprache: str) -> dict:
    if sprache not in _KATALOGE:
        pfad = os.path.join(_SPRACHORDNER, sprache + ".json")
        try:
            with open(pfad, encoding="utf-8") as datei:
                _KATALOGE[sprache] = json.load(datei)
        except (OSError, ValueError):
            _KATALOGE[sprache] = {}
    return _KATALOGE[sprache]


def text(sprache: str, schluessel: str) -> str:
    """Ein Text in der Sprache des Benutzers, sonst auf Englisch.

    Fehlt er in beiden, kommt der Schlüssel zurück – das fällt auf, statt
    stillschweigend eine leere Stelle zu hinterlassen.
    """
    gewaehlt = _katalog(sprache_waehlen(sprache) or "en")
    if schluessel in gewaehlt:
        return gewaehlt[schluessel]
    return _katalog("en").get(schluessel, schluessel)
