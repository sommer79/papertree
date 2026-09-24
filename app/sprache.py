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

import re

# Die Oberfläche gibt es in diesen Sprachen; alles andere bekommt Englisch.
SPRACHEN = ("de", "en", "fr", "it", "es")

# Wo Paperless die beiden Werte ablegt. Die Sprache steht zuoberst, weil
# Paperless sie serverseitig selbst braucht; die Datumssprache liegt im
# Schlüsselraum der Oberfläche.
SCHLUESSEL_SPRACHE = "language"
SCHLUESSEL_DATUM = "general-settings:date-display:date-locale"

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
    """
    kurz = (wert or "").strip().replace("_", "-")
    return kurz if _LOCALE.match(kurz) else ""


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
        "datumssprache": (datumssprache_waehlen(werte.get(SCHLUESSEL_DATUM) or "")
                          or datumssprache_waehlen(roh_sprache)),
    }
