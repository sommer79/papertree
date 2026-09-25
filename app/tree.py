# -*- coding: utf-8 -*-
"""Der Baum von PaperTree: Ordner, Vererbung, Aggregation.

Jeder Ordner trägt zwei unabhängige Schalter (F1):

    eigener_filter        zeigt er eigene Dokumente?
    kinder_einbeziehen    zeigt er zusätzlich die seiner Unterordner?

Aus beiden Schaltern ergeben sich alle vier Anzeigearten, auch die reine
Navigation (beide aus) und "eigene plus die der Unterordner" (beide an).

Vererbung (F1.4): Ein Ordner erbt die Filter seiner Vorfahren, verknüpft mit
UND, und nennt selbst nur noch, was ihn von den Geschwistern unterscheidet.
Ein Ordner mit eigenstaendig=True erbt nichts.

Aggregation (F1.3): Beim Einbeziehen der Unterordner zählt nur, welche Filter
im Teilbaum stehen – nicht, was die Unterordner ihrerseits anzeigen. Ihr
eigener kinder_einbeziehen-Schalter steuert nur ihre eigene Ansicht.

Die Vereinigung ist zugleich das ODER, das die Paperless-API nicht kennt:
"Tag Auto ODER Korrespondent LeaseTeq" sind zwei Unterordner und ein
Elternordner, der sie zusammenführt.

Dieses Modul kennt weder Datenbank noch HTTP und ist darum für sich prüfbar.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from . import filters

# Vorgaben für einen neuen Ordner
STANDARD_SORTIERUNG = "-created"
STANDARD_SPALTEN = ["title", "correspondent", "document_type", "tags", "created"]
STANDARD_SEITENGROESSE = 50


@dataclass
class Knoten:
    """Ein Ordner im Baum."""

    id: int
    name: str
    eltern_id: int | None = None
    reihenfolge: int = 0
    # Schalter 1
    eigener_filter: bool = False
    filter: dict = field(default_factory=dict)
    # Schalter 2
    kinder_einbeziehen: bool = False
    kinder_tief: bool = True  # ganzer Teilbaum, sonst nur die direkte Ebene
    # Vererbung
    eigenstaendig: bool = False
    # Anzeige (F1.6)
    sortierung: str = STANDARD_SORTIERUNG
    darstellung: str = "liste"
    spalten: list = field(default_factory=lambda: list(STANDARD_SPALTEN))
    seitengroesse: int = STANDARD_SEITENGROESSE
    auf_dashboard: bool = False
    # Erscheint dieser Ordner als Reiter seines übergeordneten Ordners statt
    # als Eintrag im Baum? Reine Darstellung - für Filter, Vererbung und
    # Aggregation bleibt er ein Unterordner wie jeder andere.
    als_reiter: bool = False
    # Stellung auf der Startseite. Die Reihenfolge im Baum taugt dafür nicht:
    # dort zählt die Stellung unter dem eigenen Elternordner.
    dashboard_reihenfolge: int = 0
    # Dynamische Unterknoten (F4): Dimension, nach der sie aufgespannt werden.
    # Leer heisst: nur die von Hand angelegten Unterordner.
    gruppieren_nach: str = ""
    # Name eines Symbols aus dem mitgelieferten Satz. Leer heisst: das
    # Standardsymbol, also ein Ordner.
    symbol: str = ""


@dataclass
class Plan:
    """Was für einen Ordner abgefragt werden muss.

    Ergebnis = Schnittmenge aller Sätze in `schnitt`, vereinigt mit den
    Ergebnissen aller Teilpläne in `vereinigung`.
    """

    schnitt: list = field(default_factory=list)
    vereinigung: list = field(default_factory=list)

    @property
    def leer(self) -> bool:
        return not self.schnitt and not self.vereinigung

    def als_dict(self) -> dict:
        return {
            "schnitt": self.schnitt,
            "vereinigung": [p.als_dict() for p in self.vereinigung],
        }


class Baum:
    """Ein Baum aus Knoten, mit den Auskünften, die die Ansicht braucht."""

    def __init__(self, knoten: list) -> None:
        self.nach_id: dict[int, Knoten] = {k.id: k for k in knoten}
        self._kinder: dict[int | None, list] = {}
        for k in knoten:
            self._kinder.setdefault(k.eltern_id, []).append(k)
        for liste in self._kinder.values():
            liste.sort(key=lambda k: (k.reihenfolge, k.name.casefold()))

    # --- Struktur ---------------------------------------------------------
    def kinder(self, eltern_id: int | None) -> list:
        return list(self._kinder.get(eltern_id, []))

    def wurzeln(self) -> list:
        return self.kinder(None)

    def pfad(self, knoten_id: int) -> list:
        """Von der Wurzel bis zum Knoten, für die Brotkrumen-Leiste."""
        kette: list = []
        aktuell = self.nach_id.get(knoten_id)
        gesehen: set[int] = set()
        while aktuell is not None and aktuell.id not in gesehen:
            gesehen.add(aktuell.id)
            kette.append(aktuell)
            aktuell = self.nach_id.get(aktuell.eltern_id) if aktuell.eltern_id else None
        kette.reverse()
        return kette

    # --- Vererbung --------------------------------------------------------
    def geerbte_saetze(self, knoten_id: int) -> list:
        """Die Filtersätze der Vorfahren, von oben nach unten.

        Bricht ab, sobald ein Vorfahre eigenstaendig ist: dessen eigener Filter
        gilt noch, was darüber steht nicht mehr.
        """
        knoten = self.nach_id.get(knoten_id)
        if knoten is None or knoten.eigenstaendig:
            return []
        saetze: list = []
        aktuell = self.nach_id.get(knoten.eltern_id) if knoten.eltern_id else None
        gesehen: set[int] = set()
        while aktuell is not None and aktuell.id not in gesehen:
            gesehen.add(aktuell.id)
            if aktuell.eigener_filter and aktuell.filter:
                saetze.append(dict(aktuell.filter))
            if aktuell.eigenstaendig or not aktuell.eltern_id:
                break
            aktuell = self.nach_id.get(aktuell.eltern_id)
        saetze.reverse()
        return saetze

    def effektive_schichten(self, knoten_id: int) -> list:
        """Geerbter Teil plus eigener Filter, verschmolzen (F1.5).

        Leere Liste heisst: dieser Ordner trägt selbst keine Dokumente bei.
        """
        knoten = self.nach_id.get(knoten_id)
        if knoten is None:
            return []
        saetze = self.geerbte_saetze(knoten_id)
        if knoten.eigener_filter and knoten.filter:
            saetze.append(dict(knoten.filter))
        elif not knoten.eigener_filter:
            # Ein Navigationsordner trägt nichts bei, auch wenn er erbt.
            return []
        return filters.verschmelzen(saetze)

    def saetze_fuer_kind(self, knoten_id: int) -> list:
        """Was ein neuer Unterordner dieses Ordners erben würde.

        Der Editor zeigt das an, bevor der Unterordner existiert.
        """
        knoten = self.nach_id.get(knoten_id)
        if knoten is None:
            return []
        saetze = self.geerbte_saetze(knoten_id)
        if knoten.eigener_filter and knoten.filter:
            saetze.append(dict(knoten.filter))
        return saetze

    # --- Abfrageplan ------------------------------------------------------
    def _teilbaum_teile(self, knoten_id: int) -> list:
        """Alle Filter im Teilbaum als Teilpläne – für die Aggregation."""
        teile: list = []
        eigen = self.effektive_schichten(knoten_id)
        if eigen:
            teile.append(Plan(schnitt=eigen))
        for kind in self.kinder(knoten_id):
            teile.extend(self._teilbaum_teile(kind.id))
        return teile

    def plan(self, knoten_id: int) -> Plan:
        """Was dieser Ordner anzeigt, gemäss seinen beiden Schaltern."""
        knoten = self.nach_id.get(knoten_id)
        if knoten is None:
            return Plan()

        teile: list = []
        eigen = self.effektive_schichten(knoten_id)
        if eigen:
            teile.append(Plan(schnitt=eigen))

        if knoten.kinder_einbeziehen:
            for kind in self.kinder(knoten_id):
                if knoten.kinder_tief:
                    teile.extend(self._teilbaum_teile(kind.id))
                else:
                    nur_kind = self.effektive_schichten(kind.id)
                    if nur_kind:
                        teile.append(Plan(schnitt=nur_kind))

        if not teile:
            return Plan()
        if len(teile) == 1:
            return teile[0]
        return Plan(vereinigung=teile)


def ausfuehrungsart(plan: Plan) -> str:
    """Wie das Backend den Plan ausführt.

    keine   reine Navigation, es wird nicht abgefragt
    direkt  eine Abfrage, Paperless sortiert und blättert selbst
    ids     mehrere Abfragen, PaperTree führt über die Dokument-IDs zusammen
    """
    if plan.leer:
        return "keine"
    if not plan.vereinigung and len(plan.schnitt) <= 1:
        return "direkt"
    return "ids"


def referenzen(filter_satz: dict) -> dict:
    """Welche Paperless-Objekte ein Filter nennt – für die Prüfung nach F1.8.

    Rückgabe: Art -> Liste von IDs, etwa {"tags": [5, 7], "document_types": [3]}.
    """
    felder = {
        "tags": ("tags__id", "tags__id__all", "tags__id__in", "tags__id__none"),
        "correspondents": (
            "correspondent__id",
            "correspondent__id__in",
            "correspondent__id__none",
        ),
        "document_types": (
            "document_type__id",
            "document_type__id__in",
            "document_type__id__none",
        ),
        "storage_paths": (
            "storage_path__id",
            "storage_path__id__in",
            "storage_path__id__none",
        ),
        "custom_fields": (
            "custom_fields__id__all",
            "custom_fields__id__in",
            "custom_fields__id__none",
        ),
    }
    gefunden: dict[str, list] = {}
    for art, schluessel in felder.items():
        ids: list[int] = []
        for s in schluessel:
            for teil in str(filter_satz.get(s, "")).split(","):
                teil = teil.strip()
                if teil.isdigit() and int(teil) not in ids:
                    ids.append(int(teil))
        if ids:
            gefunden[art] = ids
    # Zusatzfelder werden in custom_field_query über ihre ID genannt
    roh = filter_satz.get("custom_field_query")
    aus_abfrage = _zahlen_in_json(roh) if roh else []
    if aus_abfrage:
        ids = gefunden.setdefault("custom_fields", [])
        for wert in aus_abfrage:
            if wert not in ids:
                ids.append(wert)
    return gefunden


def _zahlen_in_json(roh: str) -> list:
    """Die Feld-IDs aus einem custom_field_query.

    Ein Atom ist [feld, operator, wert]; das erste Element nennt das Feld.
    """
    import json

    try:
        ausdruck = json.loads(roh)
    except (TypeError, ValueError):
        return []

    gefunden: list[int] = []

    def gehe(teil) -> None:
        if not isinstance(teil, list) or not teil:
            return
        kopf = teil[0]
        if isinstance(kopf, str) and kopf.upper() in ("AND", "OR"):
            for unter in teil[1] if len(teil) > 1 and isinstance(teil[1], list) else []:
                gehe(unter)
            return
        if isinstance(kopf, str) and kopf.upper() == "NOT":
            if len(teil) > 1:
                gehe(teil[1])
            return
        if isinstance(kopf, int):
            gefunden.append(kopf)
        elif isinstance(kopf, str) and kopf.isdigit():
            gefunden.append(int(kopf))

    gehe(ausdruck)
    return gefunden
