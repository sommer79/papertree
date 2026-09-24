# -*- coding: utf-8 -*-
"""Prüft die Sprachdateien gegen den Code.

Eine fehlende Zeile in einer Übersetzung fällt im Betrieb erst auf, wenn
jemand mit dieser Sprache genau diese Ansicht öffnet – und dann steht dort
ein Schlüsselname. Diese Prüfungen holen das nach vorn: jeder Schlüssel, den
das Frontend anfragt, muss in jeder Sprache stehen, mit denselben
Platzhaltern.
"""
from __future__ import annotations

import json
import os
import re
import unittest

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(WURZEL, "web")
SPRACHORDNER = os.path.join(WEB, "sprachen")
SPRACHEN = ("de", "en", "fr", "it", "es")

# Gesucht wird nicht nach t(…), sondern nach allem, was wie ein Schlüssel
# aussieht: die Hälfte davon steht in Tabellen und geht über eine Variable in
# t() – ein Muster um den Aufruf herum fände sie nicht. Ein Schlüssel ist ein
# Literal aus Punkten und Buchstaben, dessen erster Teil ein Namensraum aus
# de.json ist. Pfade und Ereignisnamen fallen über Schrägstrich und
# Doppelpunkt heraus.
LITERAL = re.compile(r"['\"]([a-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+)['\"]")
IN_HTML = re.compile(r"data-i18n(?:-titel|-marke|-platzhalter)?=\"([\w.]+)\"")
PLATZHALTER = re.compile(r"\{(\w+)\}")


def kataloge() -> dict:
    geladen = {}
    for sprache in SPRACHEN:
        with open(os.path.join(SPRACHORDNER, sprache + ".json"), encoding="utf-8") as datei:
            geladen[sprache] = json.load(datei)
    return geladen


def quelldateien():
    for ordner, unter, dateien in os.walk(WEB):
        if "vendor" in ordner or "sprachen" in ordner:
            continue
        for name in sorted(dateien):
            if name.endswith((".js", ".html")):
                yield os.path.join(ordner, name)


def verwendete_schluessel(namensraeume: set) -> set:
    gefunden = set()
    for pfad in quelldateien():
        with open(pfad, encoding="utf-8") as datei:
            text = datei.read()
        for fund in LITERAL.finditer(text):
            if fund.group(1).split(".")[0] in namensraeume:
                gefunden.add(fund.group(1))
        gefunden.update(fund.group(1) for fund in IN_HTML.finditer(text))
    # Die Stichwörter eines Themas werden zusammengesetzt, nicht literal
    # geschrieben – sie gehören trotzdem in jede Sprache.
    for schluessel in list(gefunden):
        if schluessel.startswith("thema.") and not schluessel.endswith(".woerter"):
            gefunden.add(schluessel + ".woerter")
    return gefunden


# Was mit tn() geholt wird, steht nicht unter seinem Namen, sondern in den
# Formen, die Intl.PluralRules für die Sprache kennt.
def plural_schluessel() -> set:
    gefunden = set()
    for pfad in quelldateien():
        with open(pfad, encoding="utf-8") as datei:
            text = datei.read()
        for fund in re.finditer(r"\btn\(\s*'([\w.]+)'", text):
            gefunden.add(fund.group(1))
    return gefunden


class SprachdateienTest(unittest.TestCase):
    def setUp(self):
        self.kataloge = kataloge()
        namensraeume = {s.split(".")[0] for s in self.kataloge["de"]}
        self.verwendet = verwendete_schluessel(namensraeume)
        self.plural = plural_schluessel()

    def test_alle_sprachen_vorhanden(self):
        for sprache in SPRACHEN:
            self.assertTrue(self.kataloge[sprache], f"{sprache}.json ist leer")

    def test_jeder_verwendete_schluessel_ist_uebersetzt(self):
        for sprache, katalog in self.kataloge.items():
            fehlt = []
            for schluessel in sorted(self.verwendet):
                if schluessel in self.plural:
                    for form in ("one", "other"):
                        if f"{schluessel}.{form}" not in katalog:
                            fehlt.append(f"{schluessel}.{form}")
                elif schluessel not in katalog:
                    fehlt.append(schluessel)
            self.assertEqual([], fehlt, f"{sprache}.json fehlt: {fehlt}")

    def test_deutsch_und_die_uebrigen_haben_dieselben_schluessel(self):
        deutsch = set(self.kataloge["de"])
        for sprache in SPRACHEN:
            if sprache == "de":
                continue
            andere = set(self.kataloge[sprache])
            self.assertEqual(set(), deutsch - andere,
                             f"{sprache}.json fehlt gegenüber de.json")
            self.assertEqual(set(), andere - deutsch,
                             f"{sprache}.json hat Schlüssel, die de.json nicht kennt")

    def test_platzhalter_stimmen_ueberein(self):
        # Ein {name}, das in einer Übersetzung fehlt, macht den Satz
        # unbrauchbar: dort stünde dann kein Name.
        for schluessel, deutsch in self.kataloge["de"].items():
            erwartet = set(PLATZHALTER.findall(deutsch))
            for sprache in SPRACHEN:
                if sprache == "de":
                    continue
                text = self.kataloge[sprache].get(schluessel, "")
                self.assertEqual(erwartet, set(PLATZHALTER.findall(text)),
                                 f"{sprache}.json, {schluessel}: andere Platzhalter")

    def test_kein_schluessel_bleibt_ungenutzt(self):
        # Umgekehrte Richtung: ein Katalogeintrag, den niemand anfragt, ist
        # meist ein Rest aus einem Umbau.
        genutzt = set()
        for schluessel in self.verwendet:
            if schluessel in self.plural:
                genutzt.update({schluessel + ".one", schluessel + ".other"})
            else:
                genutzt.add(schluessel)
        uebrig = sorted(set(self.kataloge["de"]) - genutzt)
        self.assertEqual([], uebrig, f"in de.json ungenutzt: {uebrig}")

    def test_themen_nennen_stichwoerter(self):
        # Ohne Stichwörter findet die Suche im Symbolwähler das Thema nur
        # über seinen Namen – der Sinn der Liste wäre weg.
        for sprache, katalog in self.kataloge.items():
            for schluessel in katalog:
                if not schluessel.startswith("thema.") or schluessel.endswith(".woerter"):
                    continue
                woerter = katalog.get(schluessel + ".woerter", "")
                teile = [w.strip() for w in woerter.split(",") if w.strip()]
                self.assertGreaterEqual(
                    len(teile), 4,
                    f"{sprache}.json, {schluessel}: zu wenige Stichwörter")


class PaperlessSpracheTest(unittest.TestCase):
    """Die Sprache kommt aus den Einstellungen von Paperless."""

    def test_kuerzel_wird_verkuerzt(self):
        from app import sprache as sprachmodul
        self.assertEqual("de", sprachmodul.sprache_waehlen("de-de"))
        self.assertEqual("de", sprachmodul.sprache_waehlen("de-CH"))
        self.assertEqual("en", sprachmodul.sprache_waehlen("en-US"))
        self.assertEqual("fr", sprachmodul.sprache_waehlen("fr"))

    def test_unbekannte_sprache_bleibt_leer(self):
        # Leer heisst "keine Angabe" – dann entscheidet der Browser, und die
        # Oberfläche landet über ihren eigenen Rückfall bei Englisch.
        from app import sprache as sprachmodul
        self.assertEqual("", sprachmodul.sprache_waehlen("pt-br"))
        self.assertEqual("", sprachmodul.sprache_waehlen(""))
        self.assertEqual("", sprachmodul.sprache_waehlen(None))

    def test_datumssprache_bleibt_vollstaendig(self):
        # de-CH schreibt Datum anders als de-DE: hier wird nicht verkürzt.
        from app import sprache as sprachmodul
        self.assertEqual("de-CH", sprachmodul.datumssprache_waehlen("de-CH"))
        self.assertEqual("pt-BR", sprachmodul.datumssprache_waehlen("pt-BR"))

    def test_iso_kommt_durch(self):
        # ISO 8601 ist keine Sprache, sondern eine Schreibweise. Intl nimmt
        # "iso-8601" als wohlgeformtes Kürzel an und übergeht es dann – ohne
        # diesen Weg sähe man weiter das Datum der Anzeigesprache.
        from app import sprache as sprachmodul
        self.assertEqual("iso-8601", sprachmodul.datumssprache_waehlen("iso-8601"))
        self.assertEqual("iso-8601", sprachmodul.datumssprache_waehlen("ISO-8601"))

    def test_datumssprache_liegt_verschachtelt(self):
        # So antwortet Paperless 3.1.3 wirklich: date_locale steckt in
        # date_display, nicht unter dem flachen Namen aus dem Frontend.
        from app import sprache as sprachmodul
        gelesen = sprachmodul.aus_einstellungen({
            "language": "de-de",
            "date_display": {"date_format": "mediumDate", "date_locale": "iso-8601"},
        })
        self.assertEqual({"sprache": "de", "datumssprache": "iso-8601"}, gelesen)

    def test_datumssprache_auch_flach(self):
        from app import sprache as sprachmodul
        gelesen = sprachmodul.aus_einstellungen({
            "language": "de-de",
            "general-settings:date-display:date-locale": "de-CH",
        })
        self.assertEqual({"sprache": "de", "datumssprache": "de-CH"}, gelesen)

    def test_ohne_datumsangabe_gilt_die_anzeigesprache(self):
        from app import sprache as sprachmodul
        self.assertEqual({"sprache": "fr", "datumssprache": "fr-ch"},
                         sprachmodul.aus_einstellungen({"language": "fr-ch"}))
        self.assertEqual({"sprache": "", "datumssprache": ""},
                         sprachmodul.aus_einstellungen({}))
        self.assertEqual("", sprachmodul.datumssprache_waehlen("kein sprachkürzel"))
        self.assertEqual("", sprachmodul.datumssprache_waehlen("../../etc/passwd"))


if __name__ == "__main__":
    unittest.main()
