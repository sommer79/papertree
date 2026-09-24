# -*- coding: utf-8 -*-
"""Prüfungen für das Zusammenführen über Dokument-IDs. Ohne Paperless, ohne Netz.

Die Attrappe unten versteht genau so viel von der Paperless-API, wie diese
Prüfungen brauchen: tags__id__all, tags__id__in, id__in, query und ordering.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import documents  # noqa: E402
from app.tree import Plan  # noqa: E402

# id -> (tags, titel, jahr)
BESTAND = {
    1: ([5], "Steuern 2024", 2024),
    2: ([5, 7], "Steuern 2025 Beleg", 2025),
    3: ([7], "Beleg ohne Steuern", 2025),
    4: ([9], "Auto Leasing", 2023),
    5: ([9, 5], "Auto und Steuern", 2026),
    6: ([], "Ohne alles", 2022),
}


class Attrappe:
    """Ein sehr kleiner Paperless-Ersatz, der mitzählt, wie oft er gefragt wird."""

    def __init__(self):
        self.abfragen = 0

    # --- Auswertung -------------------------------------------------------
    def _treffer(self, satz):
        ids = sorted(BESTAND)
        if "id__in" in satz:
            erlaubt = {int(t) for t in str(satz["id__in"]).split(",") if t.strip()}
            ids = [i for i in ids if i in erlaubt]
        if "tags__id__all" in satz:
            noetig = {int(t) for t in str(satz["tags__id__all"]).split(",") if t.strip()}
            ids = [i for i in ids if noetig <= set(BESTAND[i][0])]
        if "tags__id__in" in satz:
            eines = {int(t) for t in str(satz["tags__id__in"]).split(",") if t.strip()}
            ids = [i for i in ids if eines & set(BESTAND[i][0])]
        if "query" in satz:
            wort = str(satz["query"]).casefold()
            ids = [i for i in ids if wort in BESTAND[i][1].casefold()]
        return ids

    def _sortiert(self, ids, ordering):
        if ordering in ("title", "-title"):
            ids = sorted(ids, key=lambda i: BESTAND[i][1])
        elif ordering in ("created", "-created"):
            ids = sorted(ids, key=lambda i: BESTAND[i][2])
        else:
            ids = sorted(ids)
        if str(ordering).startswith("-"):
            ids = list(reversed(ids))
        return ids

    # --- Die Schnittstelle, die documents.py nutzt ------------------------
    async def json(self, pfad, parameter=None):
        self.abfragen += 1
        parameter = parameter or {}
        ids = self._sortiert(self._treffer(parameter), parameter.get("ordering", "id"))
        groesse = int(parameter.get("page_size") or 50)
        seite = int(parameter.get("page") or 1)
        ausschnitt = ids[(seite - 1) * groesse : seite * groesse]
        return {
            "count": len(ids),
            "next": "weiter" if seite * groesse < len(ids) else None,
            "results": [{"id": i, "title": BESTAND[i][1]} for i in ausschnitt],
        }

    async def alle_ids(self, satz):
        daten = await self.json("/api/documents/", {**satz, "page_size": 5000, "ordering": "id"})
        return [t["id"] for t in daten["results"]]

    async def anzahl(self, satz):
        daten = await self.json("/api/documents/", {**satz, "page": 1, "page_size": 1})
        return daten["count"]

    async def dokumente(self, parameter):
        return await self.json("/api/documents/", parameter)


class Ausfuehrung(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        documents.cache_leeren()
        self.zugang = Attrappe()

    async def test_navigation_fragt_nicht(self):
        ergebnis = await documents.seite(self.zugang, 1, Plan(), "-created")
        self.assertEqual(ergebnis["count"], 0)
        self.assertEqual(self.zugang.abfragen, 0)

    async def test_eine_schicht_laeuft_direkt(self):
        plan = Plan(schnitt=[{"tags__id__all": "5"}])
        ergebnis = await documents.seite(self.zugang, 1, plan, "title")
        self.assertEqual(ergebnis["count"], 3)
        self.assertEqual([d["id"] for d in ergebnis["results"]], [5, 1, 2])
        # Genau eine Abfrage: Paperless filtert, sortiert und blättert selbst.
        self.assertEqual(self.zugang.abfragen, 1)

    async def test_schnitt_zweier_oder_listen(self):
        """Was in einem Satz nicht ausdrückbar ist, schneidet PaperTree."""
        plan = Plan(schnitt=[{"tags__id__in": "5,7"}, {"tags__id__in": "7,9"}])
        ergebnis = await documents.seite(self.zugang, 1, plan, "id")
        # 2 hat 5+7, 3 hat 7, 5 hat 9+5 -> alle drei erfüllen beide Listen
        self.assertEqual(sorted(d["id"] for d in ergebnis["results"]), [2, 3, 5])
        self.assertEqual(ergebnis["count"], 3)

    async def test_vereinigung_ohne_dubletten(self):
        """Das ODER über Dimensionen hinweg (F1.3)."""
        plan = Plan(vereinigung=[
            Plan(schnitt=[{"tags__id__all": "5"}]),
            Plan(schnitt=[{"tags__id__all": "9"}]),
        ])
        ergebnis = await documents.seite(self.zugang, 1, plan, "id")
        # 1, 2, 5 über Tag 5 und 4, 5 über Tag 9 – die 5 nur einmal
        self.assertEqual([d["id"] for d in ergebnis["results"]], [1, 2, 4, 5])
        self.assertEqual(ergebnis["count"], 4)

    async def test_vereinigung_haelt_die_sortierung(self):
        plan = Plan(vereinigung=[
            Plan(schnitt=[{"tags__id__all": "5"}]),
            Plan(schnitt=[{"tags__id__all": "9"}]),
        ])
        ergebnis = await documents.seite(self.zugang, 1, plan, "-created")
        # Jahre: 5->2026, 2->2025, 1->2024, 4->2023
        self.assertEqual([d["id"] for d in ergebnis["results"]], [5, 2, 1, 4])

    async def test_vereinigung_blaettert(self):
        plan = Plan(vereinigung=[
            Plan(schnitt=[{"tags__id__all": "5"}]),
            Plan(schnitt=[{"tags__id__all": "9"}]),
        ])
        erste = await documents.seite(self.zugang, 1, plan, "id", nummer=1, groesse=5)
        self.assertEqual(erste["pages"], 1)
        zweite = await documents.seite(self.zugang, 1, plan, "id", nummer=2, groesse=2)
        self.assertEqual(zweite["page"], 2)
        self.assertEqual(zweite["pages"], 2)
        self.assertEqual([d["id"] for d in zweite["results"]], [4, 5])

    async def test_seite_hinter_dem_ende_wird_zurueckgeholt(self):
        plan = Plan(vereinigung=[
            Plan(schnitt=[{"tags__id__all": "5"}]),
            Plan(schnitt=[{"tags__id__all": "9"}]),
        ])
        ergebnis = await documents.seite(self.zugang, 1, plan, "id", nummer=99, groesse=2)
        self.assertEqual(ergebnis["page"], 2)
        self.assertTrue(ergebnis["results"])

    async def test_suche_schraenkt_die_vereinigung_ein(self):
        """Suche im Ordner (F6.2) gilt für das Gesamtergebnis."""
        plan = Plan(vereinigung=[
            Plan(schnitt=[{"tags__id__all": "5"}]),
            Plan(schnitt=[{"tags__id__all": "9"}]),
        ])
        ergebnis = await documents.seite(
            self.zugang, 1, plan, "id", zusatz={"query": "Auto"}
        )
        self.assertEqual([d["id"] for d in ergebnis["results"]], [4, 5])

    async def test_suche_verschmilzt_bei_einer_schicht(self):
        plan = Plan(schnitt=[{"tags__id__all": "5"}])
        self.zugang.abfragen = 0
        ergebnis = await documents.seite(
            self.zugang, 1, plan, "id", zusatz={"query": "Steuern"}
        )
        self.assertEqual([d["id"] for d in ergebnis["results"]], [1, 2, 5])
        # Verschmolzen heisst: nach wie vor eine einzige Abfrage.
        self.assertEqual(self.zugang.abfragen, 1)

    async def test_leere_menge(self):
        plan = Plan(schnitt=[{"tags__id__all": "5"}, {"tags__id__all": "9,7"}])
        ergebnis = await documents.seite(self.zugang, 1, plan, "id")
        self.assertEqual(ergebnis["count"], 0)
        self.assertEqual(ergebnis["results"], [])

    async def test_anzahl_direkt_und_vereinigt(self):
        direkt = await documents.anzahl(self.zugang, Plan(schnitt=[{"tags__id__all": "5"}]))
        self.assertEqual(direkt, 3)
        vereint = await documents.anzahl(self.zugang, Plan(vereinigung=[
            Plan(schnitt=[{"tags__id__all": "5"}]),
            Plan(schnitt=[{"tags__id__all": "9"}]),
        ]))
        self.assertEqual(vereint, 4)

    async def test_reihenfolge_wird_zwischengespeichert(self):
        plan = Plan(vereinigung=[
            Plan(schnitt=[{"tags__id__all": "5"}]),
            Plan(schnitt=[{"tags__id__all": "9"}]),
        ])
        await documents.seite(self.zugang, 1, plan, "title")
        erste_runde = self.zugang.abfragen
        await documents.seite(self.zugang, 1, plan, "title")
        zweite_runde = self.zugang.abfragen - erste_runde
        # Die Reihenfolge-Liste wird nicht erneut geholt.
        self.assertLess(zweite_runde, erste_runde)

    async def test_reihenfolge_ist_je_benutzer_getrennt(self):
        plan = Plan(vereinigung=[
            Plan(schnitt=[{"tags__id__all": "5"}]),
            Plan(schnitt=[{"tags__id__all": "9"}]),
        ])
        await documents.seite(self.zugang, 1, plan, "title")
        vorher = self.zugang.abfragen
        await documents.seite(self.zugang, 2, plan, "title")
        self.assertGreater(self.zugang.abfragen, vorher)


if __name__ == "__main__":
    unittest.main(verbosity=2)
