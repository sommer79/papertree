# -*- coding: utf-8 -*-
"""Prüfungen für Filtermodell und Baumlogik. Ohne Paperless, ohne Netz."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import filters  # noqa: E402
from app.tree import Baum, Knoten, ausfuehrungsart, referenzen  # noqa: E402


class Pruefen(unittest.TestCase):
    def test_behaelt_erlaubte_und_meldet_fremde(self):
        behalten, verworfen = filters.pruefen(
            {"tags__id__all": "5,7", "loesche_alles": "1", "title__icontains": "Miete"}
        )
        self.assertEqual(behalten, {"tags__id__all": "5,7", "title__icontains": "Miete"})
        self.assertEqual(verworfen, ["loesche_alles"])

    def test_leerer_wert_gilt_nicht(self):
        behalten, verworfen = filters.pruefen({"title__icontains": "  "})
        self.assertEqual(behalten, {})
        self.assertEqual(verworfen, ["title__icontains"])

    def test_tagliste_nimmt_nur_zahlen(self):
        """Was aus der Adresszeile kommt, geht nur geprüft an Paperless."""
        self.assertEqual(filters.tagliste("5,7,9"), "5,7,9")
        self.assertEqual(filters.tagliste(" 5 , 7 "), "5,7")
        self.assertEqual(filters.tagliste("5,unfug,7"), "5,7")
        self.assertEqual(filters.tagliste("1 OR 1=1"), "")
        self.assertEqual(filters.tagliste("-5"), "")
        self.assertEqual(filters.tagliste(""), "")
        self.assertEqual(filters.tagliste(None), "")

    def test_sortierung(self):
        self.assertTrue(filters.sortierung_gueltig("-created"))
        self.assertTrue(filters.sortierung_gueltig("custom_field_12"))
        self.assertFalse(filters.sortierung_gueltig("hackme"))


class Verschmelzen(unittest.TestCase):
    def test_disjunkte_schluessel_werden_eine_schicht(self):
        ergebnis = filters.verschmelzen(
            [{"tags__id__all": "5"}, {"document_type__id__in": "3"}]
        )
        self.assertEqual(ergebnis, [{"tags__id__all": "5", "document_type__id__in": "3"}])

    def test_alle_tags_vereinigen_sich(self):
        ergebnis = filters.verschmelzen(
            [{"tags__id__all": "5,7"}, {"tags__id__all": "7,9"}]
        )
        self.assertEqual(ergebnis, [{"tags__id__all": "5,7,9"}])

    def test_ausschluss_vereinigt_sich(self):
        ergebnis = filters.verschmelzen(
            [{"tags__id__none": "1"}, {"tags__id__none": "2"}]
        )
        self.assertEqual(ergebnis, [{"tags__id__none": "1,2"}])

    def test_tags_in_bleibt_eigene_schicht(self):
        """Ein Dokument hat mehrere Tags: zwei ODER-Listen sind kein ODER."""
        ergebnis = filters.verschmelzen(
            [{"tags__id__in": "5,7"}, {"tags__id__in": "8,9"}]
        )
        self.assertEqual(len(ergebnis), 2)

    def test_korrespondent_schneidet_sich(self):
        ergebnis = filters.verschmelzen(
            [{"correspondent__id__in": "1,2,3"}, {"correspondent__id__in": "2,3,4"}]
        )
        self.assertEqual(ergebnis, [{"correspondent__id__in": "2,3"}])

    def test_leere_schnittmenge_trifft_nichts(self):
        ergebnis = filters.verschmelzen(
            [{"correspondent__id__in": "1"}, {"correspondent__id__in": "2"}]
        )
        self.assertEqual(ergebnis, [{"correspondent__id__in": "0"}])

    def test_datumsgrenzen(self):
        ergebnis = filters.verschmelzen(
            [
                {"created__date__gte": "2025-01-01", "created__date__lte": "2025-12-31"},
                {"created__date__gte": "2025-06-01", "created__date__lte": "2025-09-30"},
            ]
        )
        self.assertEqual(
            ergebnis,
            [{"created__date__gte": "2025-06-01", "created__date__lte": "2025-09-30"}],
        )

    def test_relative_datumsangabe_bleibt_eigene_schicht(self):
        ergebnis = filters.verschmelzen(
            [{"created__date__gte": "this year"}, {"created__date__gte": "2025-06-01"}]
        )
        self.assertEqual(len(ergebnis), 2)

    def test_zusatzfeld_abfragen_werden_mit_und_verbunden(self):
        a = json.dumps([12, "exact", "ASIG"])
        b = json.dumps([6, "gte", 2020])
        ergebnis = filters.verschmelzen(
            [{"custom_field_query": a}, {"custom_field_query": b}]
        )
        self.assertEqual(len(ergebnis), 1)
        ausdruck = json.loads(ergebnis[0]["custom_field_query"])
        self.assertEqual(ausdruck[0], "AND")
        self.assertEqual(len(ausdruck[1]), 2)

    def test_gleicher_wert_bleibt_einmal(self):
        ergebnis = filters.verschmelzen(
            [{"title__icontains": "Miete"}, {"title__icontains": "Miete"}]
        )
        self.assertEqual(ergebnis, [{"title__icontains": "Miete"}])

    def test_zwei_suchparameter_bleiben_getrennt(self):
        """Paperless lässt nur einen der vier Suchparameter je Abfrage zu."""
        ergebnis = filters.verschmelzen(
            [{"query": "Miete", "tags__id__all": "5"}, {"text": "Strom"}]
        )
        self.assertEqual(len(ergebnis), 2)
        for satz in ergebnis:
            self.assertLessEqual(len(filters.SUCH_PARAMETER & set(satz)), 1)

    def test_suche_verschmilzt_mit_gewoehnlichen_filtern(self):
        """Paperless wendet die übrigen Filter vor der Suche an."""
        ergebnis = filters.verschmelzen([{"query": "Miete"}, {"tags__id__all": "5"}])
        self.assertEqual(ergebnis, [{"query": "Miete", "tags__id__all": "5"}])

    def test_gleicher_suchparameter_verschiedener_wert(self):
        ergebnis = filters.verschmelzen([{"query": "Miete"}, {"query": "Strom"}])
        self.assertEqual(len(ergebnis), 2)

    def test_verschiedene_texte_bleiben_zwei_schichten(self):
        ergebnis = filters.verschmelzen(
            [{"title__icontains": "Miete"}, {"title__icontains": "Strom"}]
        )
        self.assertEqual(len(ergebnis), 2)


class AusLink(unittest.TestCase):
    def test_frontend_link(self):
        link = (
            "https://paperless.example.org/documents?tags__id__all=5,7"
            "&document_type__id__in=3&sort=created&reverse=1&page=2"
        )
        satz, sortierung, verworfen = filters.aus_link(link)
        self.assertEqual(satz, {"tags__id__all": "5,7", "document_type__id__in": "3"})
        self.assertEqual(sortierung, "-created")
        self.assertEqual(verworfen, [])

    def test_api_link(self):
        link = "https://paperless.example.org/api/documents/?correspondent__id=12&ordering=title"
        satz, sortierung, _ = filters.aus_link(link)
        self.assertEqual(satz, {"correspondent__id": "12"})
        self.assertEqual(sortierung, "title")

    def test_zusatzfeld_abfrage_uebersteht_die_kodierung(self):
        link = (
            "https://paperless.example.org/documents?custom_field_query="
            "%5B%22OR%22%2C%5B%5B1%2C%22isnull%22%2C%22true%22%5D%5D%5D"
        )
        satz, _, verworfen = filters.aus_link(link)
        self.assertEqual(verworfen, [])
        self.assertEqual(json.loads(satz["custom_field_query"])[0], "OR")

    def test_fremde_parameter_werden_gemeldet(self):
        satz, _, verworfen = filters.aus_link("https://x/documents?unfug=1&tags__id=4")
        self.assertEqual(satz, {"tags__id": "4"})
        self.assertEqual(verworfen, ["unfug"])

    def test_leerer_link(self):
        satz, sortierung, verworfen = filters.aus_link("")
        self.assertEqual((satz, sortierung, verworfen), ({}, None, []))


def _steuerbaum():
    """Steuern (Tag 5) mit zwei Jahresordnern, wie im Anforderungsdokument."""
    return Baum(
        [
            Knoten(
                id=1,
                name="Steuern",
                eigener_filter=True,
                filter={"tags__id__all": "5"},
                kinder_einbeziehen=True,
            ),
            Knoten(
                id=2,
                name="Steuerbelege 2025",
                eltern_id=1,
                reihenfolge=1,
                eigener_filter=True,
                filter={"custom_field_query": json.dumps([12, "exact", "2025"])},
            ),
            Knoten(
                id=3,
                name="Steuerbelege 2026",
                eltern_id=1,
                reihenfolge=2,
                eigener_filter=True,
                filter={"custom_field_query": json.dumps([12, "exact", "2026"])},
            ),
        ]
    )


class Vererbung(unittest.TestCase):
    def test_kind_erbt_den_elternfilter(self):
        baum = _steuerbaum()
        schichten = baum.effektive_schichten(2)
        self.assertEqual(len(schichten), 1)
        self.assertEqual(schichten[0]["tags__id__all"], "5")
        self.assertIn("custom_field_query", schichten[0])

    def test_eigenstaendig_erbt_nicht(self):
        baum = _steuerbaum()
        baum.nach_id[2].eigenstaendig = True
        schichten = baum.effektive_schichten(2)
        self.assertEqual(len(schichten), 1)
        self.assertNotIn("tags__id__all", schichten[0])

    def test_navigationsordner_traegt_nichts_bei(self):
        baum = Baum([Knoten(id=1, name="Nur Navigation")])
        self.assertEqual(baum.effektive_schichten(1), [])

    def test_pfad_von_der_wurzel(self):
        baum = _steuerbaum()
        self.assertEqual([k.id for k in baum.pfad(2)], [1, 2])


class Plaene(unittest.TestCase):
    def test_beide_schalter_aus_ist_navigation(self):
        baum = Baum([Knoten(id=1, name="Ablage")])
        plan = baum.plan(1)
        self.assertTrue(plan.leer)
        self.assertEqual(ausfuehrungsart(plan), "keine")

    def test_nur_eigener_filter_ist_eine_abfrage(self):
        baum = Baum(
            [Knoten(id=1, name="Rechnungen", eigener_filter=True, filter={"tags__id__all": "2"})]
        )
        plan = baum.plan(1)
        self.assertEqual(ausfuehrungsart(plan), "direkt")
        self.assertEqual(plan.schnitt, [{"tags__id__all": "2"}])

    def test_eigene_plus_kinder(self):
        plan = _steuerbaum().plan(1)
        # eigener Satz + zwei Kinder = drei Teile
        self.assertEqual(len(plan.vereinigung), 3)
        self.assertEqual(ausfuehrungsart(plan), "ids")

    def test_nur_kinder_ohne_eigenen_filter(self):
        baum = _steuerbaum()
        baum.nach_id[1].eigener_filter = False
        plan = baum.plan(1)
        self.assertEqual(len(plan.vereinigung), 2)
        # Ohne Elternfilter erben die Kinder nichts mehr
        for teil in plan.vereinigung:
            self.assertNotIn("tags__id__all", teil.schnitt[0])

    def test_nur_direkte_ebene(self):
        baum = _steuerbaum()
        baum.nach_id[1].kinder_tief = False
        baum.nach_id[2].kinder_einbeziehen = True
        enkel = Knoten(
            id=4,
            name="Belege Januar",
            eltern_id=2,
            eigener_filter=True,
            filter={"created__month": "1"},
        )
        baum = Baum(list(baum.nach_id.values()) + [enkel])
        baum.nach_id[1].kinder_tief = False
        plan = baum.plan(1)
        # eigener Satz + zwei direkte Kinder, der Enkel bleibt aussen vor
        self.assertEqual(len(plan.vereinigung), 3)

    def test_navigationsordner_wird_durchstiegen(self):
        """Ein Zwischenordner ohne Filter blockiert die Aggregation nicht."""
        baum = Baum(
            [
                Knoten(id=1, name="Alles", kinder_einbeziehen=True),
                Knoten(id=2, name="Zwischenebene", eltern_id=1),
                Knoten(
                    id=3,
                    name="Auto",
                    eltern_id=2,
                    eigener_filter=True,
                    filter={"tags__id__all": "9"},
                ),
            ]
        )
        plan = baum.plan(1)
        self.assertEqual(len(plan.vereinigung), 0)
        self.assertEqual(plan.schnitt, [{"tags__id__all": "9"}])
        self.assertEqual(ausfuehrungsart(plan), "direkt")

    def test_oder_ueber_dimensionen_hinweg(self):
        """Was die API nicht kann, macht der Baum: Tag ODER Korrespondent."""
        baum = Baum(
            [
                Knoten(id=1, name="Fahrzeug", kinder_einbeziehen=True),
                Knoten(
                    id=2,
                    name="Nach Tag",
                    eltern_id=1,
                    eigener_filter=True,
                    filter={"tags__id__all": "9"},
                ),
                Knoten(
                    id=3,
                    name="Nach Korrespondent",
                    eltern_id=1,
                    eigener_filter=True,
                    filter={"correspondent__id__in": "31"},
                ),
            ]
        )
        plan = baum.plan(1)
        self.assertEqual(len(plan.vereinigung), 2)
        self.assertEqual(ausfuehrungsart(plan), "ids")


class Referenzen(unittest.TestCase):
    def test_findet_genannte_objekte(self):
        gefunden = referenzen(
            {"tags__id__all": "5,7", "document_type__id__in": "3", "title__icontains": "x"}
        )
        self.assertEqual(gefunden["tags"], [5, 7])
        self.assertEqual(gefunden["document_types"], [3])
        self.assertNotIn("correspondents", gefunden)

    def test_findet_zusatzfelder_in_der_abfrage(self):
        abfrage = json.dumps(["AND", [[12, "exact", "ASIG"], ["NOT", [6, "exists", True]]]])
        gefunden = referenzen({"custom_field_query": abfrage})
        self.assertEqual(sorted(gefunden["custom_fields"]), [6, 12])

    def test_kaputte_abfrage_stuerzt_nicht(self):
        self.assertEqual(referenzen({"custom_field_query": "{kein json"}), {})


if __name__ == "__main__":
    unittest.main(verbosity=2)
