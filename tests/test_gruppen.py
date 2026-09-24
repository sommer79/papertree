# -*- coding: utf-8 -*-
"""Prüfungen für die dynamischen Unterknoten (F4) und die Schema-Wandlung."""
import json
import os
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import groups  # noqa: E402
from app.tree import Plan  # noqa: E402

# id -> (created, correspondent, document_type, tags, zusatzfeld 12)
BESTAND = {
    1: ("2024-03-01", 10, 1, [5], "ASIG"),
    2: ("2025-07-15", 10, 1, [5, 7], "ASIG"),
    3: ("2025-11-02", 11, None, [7], "Spital"),
    4: ("2026-01-20", None, 2, [], None),
    5: ("2026-05-05", 11, 1, [9], "Spital"),
}

STAMM = {
    "correspondents": [{"id": 10, "name": "ASIG Wohngenossenschaft"},
                       {"id": 11, "name": "Helsana"}],
    "document_types": [{"id": 1, "name": "Rechnung"}, {"id": 2, "name": "Vertrag"}],
    "storage_paths": [],
    "tags": [{"id": 5, "name": "Steuern"}, {"id": 7, "name": "Belege"},
             {"id": 9, "name": "Auto"}],
    "custom_fields": [{
        "id": 12, "name": "Ordner", "data_type": "select",
        "extra_data": {"select_options": [
            {"id": "ASIG", "label": "ASIG"},
            {"id": "Spital", "label": "Spital"},
        ]},
    }],
}


class Attrappe:
    def __init__(self):
        self.abfragen = 0

    async def json(self, pfad, parameter=None):
        self.abfragen += 1
        parameter = parameter or {}
        ids = sorted(BESTAND)
        if "tags__id__all" in parameter:
            noetig = {int(t) for t in str(parameter["tags__id__all"]).split(",")}
            ids = [i for i in ids if noetig <= set(BESTAND[i][3])]
        felder = str(parameter.get("fields") or "").split(",")
        treffer = []
        for i in ids:
            created, korr, typ, tags, zf = BESTAND[i]
            eintrag = {"id": i}
            if "created" in felder:
                eintrag["created"] = created
            if "correspondent" in felder:
                eintrag["correspondent"] = korr
            if "document_type" in felder:
                eintrag["document_type"] = typ
            if "tags" in felder:
                eintrag["tags"] = tags
            if "custom_fields" in felder:
                eintrag["custom_fields"] = (
                    [{"field": 12, "value": zf}] if zf is not None else []
                )
            treffer.append(eintrag)
        return {"count": len(treffer), "next": None, "results": treffer}

    async def alle_ids(self, satz):
        daten = await self.json("/api/documents/", {**satz, "fields": "id"})
        return [t["id"] for t in daten["results"]]

    async def stammdaten(self, art):
        return STAMM.get(art, [])


class Gueltigkeit(unittest.TestCase):
    def test_bekannte_dimensionen(self):
        for dimension in ("created_year", "added_year", "correspondent",
                          "document_type", "storage_path", "tag", "cf:12"):
            self.assertTrue(groups.gueltig(dimension), dimension)

    def test_unfug(self):
        for dimension in ("", None, "drop table", "cf:", "cf:abc", "tags"):
            self.assertFalse(groups.gueltig(dimension), repr(dimension))


class Filtersaetze(unittest.TestCase):
    def test_jahr(self):
        self.assertEqual(groups.gruppen_filter("created_year", "2025"),
                         {"created__year": "2025"})

    def test_korrespondent_und_leer(self):
        self.assertEqual(groups.gruppen_filter("correspondent", "10"),
                         {"correspondent__id": "10"})
        self.assertEqual(groups.gruppen_filter("correspondent", ""),
                         {"correspondent__isnull": "true"})

    def test_tag_und_ohne_tags(self):
        self.assertEqual(groups.gruppen_filter("tag", "7"), {"tags__id__all": "7"})
        self.assertEqual(groups.gruppen_filter("tag", ""), {"is_tagged": "false"})

    def test_zusatzfeld(self):
        satz = groups.gruppen_filter("cf:12", "ASIG")
        self.assertEqual(json.loads(satz["custom_field_query"]), [12, "exact", "ASIG"])
        leer = groups.gruppen_filter("cf:12", "")
        self.assertEqual(json.loads(leer["custom_field_query"]), [12, "exists", False])

    def test_jeder_satz_nennt_nur_erlaubte_parameter(self):
        from app.filters import FILTER_PARAMETER
        for dimension in ("created_year", "added_year", "correspondent",
                          "document_type", "storage_path", "tag", "cf:12"):
            for wert in ("7", ""):
                satz = groups.gruppen_filter(dimension, wert)
                for schluessel in satz:
                    self.assertIn(schluessel, FILTER_PARAMETER,
                                  "%s/%r -> %s" % (dimension, wert, schluessel))


class Gruppenbildung(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        groups.cache_leeren()
        self.zugang = Attrappe()

    async def test_jahre_absteigend(self):
        gefunden = await groups.gruppen(
            self.zugang, 1, Plan(schnitt=[{}]), "created_year", None
        )
        self.assertEqual([g["wert"] for g in gefunden], ["2026", "2025", "2024"])
        self.assertEqual([g["anzahl"] for g in gefunden], [2, 2, 1])

    async def test_korrespondenten_mit_namen_und_leergruppe(self):
        gefunden = await groups.gruppen(
            self.zugang, 1, Plan(schnitt=[{}]), "correspondent", None
        )
        self.assertEqual(gefunden[0]["name"], "ASIG Wohngenossenschaft")
        self.assertEqual(gefunden[0]["anzahl"], 2)
        # Die Gruppe ohne Wert steht am Ende und trägt einen sprechenden Namen.
        self.assertEqual(gefunden[-1]["wert"], "")
        self.assertIn("ohne", gefunden[-1]["name"])
        self.assertEqual(gefunden[-1]["anzahl"], 1)

    async def test_tags_zaehlen_mehrfach(self):
        gefunden = await groups.gruppen(self.zugang, 1, Plan(schnitt=[{}]), "tag", None)
        nach_name = {g["name"]: g["anzahl"] for g in gefunden}
        # Dokument 2 trägt Steuern und Belege, zählt also in beiden Gruppen.
        self.assertEqual(nach_name["Steuern"], 2)
        self.assertEqual(nach_name["Belege"], 2)
        self.assertEqual(nach_name["Auto"], 1)
        self.assertEqual(gefunden[-1]["anzahl"], 1)  # Dokument 4 ohne Tags

    async def test_zusatzfeld_mit_optionsnamen(self):
        gefunden = await groups.gruppen(self.zugang, 1, Plan(schnitt=[{}]), "cf:12", None)
        nach_name = {g["name"]: g["anzahl"] for g in gefunden}
        self.assertEqual(nach_name["ASIG"], 2)
        self.assertEqual(nach_name["Spital"], 2)

    async def test_gruppen_gelten_nur_im_ordner(self):
        """Der Basisfilter des Ordners schränkt die Gruppen ein."""
        plan = Plan(schnitt=[{"tags__id__all": "5"}])
        gefunden = await groups.gruppen(self.zugang, 1, plan, "created_year", None)
        self.assertEqual([g["wert"] for g in gefunden], ["2025", "2024"])

    async def test_navigationsordner_hat_keine_gruppen(self):
        self.assertEqual(await groups.gruppen(self.zugang, 1, Plan(), "tag", None), [])

    async def test_mit_vorgegebener_id_menge(self):
        gefunden = await groups.gruppen(
            self.zugang, 1, Plan(vereinigung=[Plan(schnitt=[{}])]), "created_year", {4, 5}
        )
        self.assertEqual([g["wert"] for g in gefunden], ["2026"])
        self.assertEqual(gefunden[0]["anzahl"], 2)


class SchemaWandlung(unittest.TestCase):
    def test_alte_datenbank_wird_nachgezogen(self):
        """Eine Datenbank vom Stand 1 bekommt die neue Spalte."""
        from app import db
        from app.config import einstellungen

        ordner = tempfile.mkdtemp()
        pfad = os.path.join(ordner, "alt.sqlite3")
        vorher = einstellungen.DATENBANK
        einstellungen.DATENBANK = pfad
        try:
            # Schema von Stand 1 nachbilden: ohne gruppieren_nach
            with sqlite3.connect(pfad) as v:
                v.executescript("""
                CREATE TABLE ordner (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    benutzer INTEGER NOT NULL,
                    eltern_id INTEGER REFERENCES ordner(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    reihenfolge INTEGER NOT NULL DEFAULT 0,
                    eigener_filter INTEGER NOT NULL DEFAULT 0,
                    filter TEXT NOT NULL DEFAULT '{}',
                    kinder_einbeziehen INTEGER NOT NULL DEFAULT 0,
                    kinder_tief INTEGER NOT NULL DEFAULT 1,
                    eigenstaendig INTEGER NOT NULL DEFAULT 0,
                    sortierung TEXT NOT NULL DEFAULT '-created',
                    darstellung TEXT NOT NULL DEFAULT 'liste',
                    spalten TEXT NOT NULL DEFAULT '[]',
                    seitengroesse INTEGER NOT NULL DEFAULT 50,
                    auf_dashboard INTEGER NOT NULL DEFAULT 0,
                    erstellt TEXT NOT NULL,
                    geaendert TEXT NOT NULL
                );
                CREATE TABLE schema_stand (stand INTEGER NOT NULL);
                INSERT INTO schema_stand (stand) VALUES (1);
                INSERT INTO ordner (benutzer, name, erstellt, geaendert)
                     VALUES (1, 'Alter Ordner', '2026-01-01', '2026-01-01');
                """)

            db.einrichten()

            with sqlite3.connect(pfad) as v:
                spalten = {z[1] for z in v.execute("PRAGMA table_info(ordner)")}
                stand = v.execute("SELECT stand FROM schema_stand").fetchone()[0]
            self.assertIn("gruppieren_nach", spalten)
            self.assertEqual(stand, db.SCHEMA_STAND)

            # Der alte Ordner ist noch da und lesbar.
            knoten = db.knoten_laden(1)
            self.assertEqual(len(knoten), 1)
            self.assertEqual(knoten[0].name, "Alter Ordner")
            self.assertEqual(knoten[0].gruppieren_nach, "")

            # Ein zweiter Aufruf darf nichts kaputt machen.
            db.einrichten()
            self.assertEqual(len(db.knoten_laden(1)), 1)
        finally:
            einstellungen.DATENBANK = vorher


if __name__ == "__main__":
    unittest.main(verbosity=2)
