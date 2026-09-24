# -*- coding: utf-8 -*-
"""Filter von PaperTree.

Grundsatz A4: Ein Filter ist nichts als ein Satz Query-Parameter der
Paperless-API. PaperTree baut die Regeltypen von Paperless nicht nach, sondern
speichert, was ohnehin an /api/documents/ geschickt wird. Damit funktioniert
jede Filtermöglichkeit, die Paperless kennt, ohne dass hier etwas nachgezogen
werden muss.

Die Vererbung im Baum (F1.4) verknüpft mehrere solcher Sätze mit UND. Das
lässt sich nicht immer in einem Satz ausdrücken: "hat einen der Tags A oder B"
UND "hat einen der Tags C oder D" ist kein einzelnes tags__id__in. Darum
arbeitet PaperTree mit SCHICHTEN. Was verschmelzen kann, wird verschmolzen –
das ist der häufige Fall und kostet eine Abfrage. Der Rest bleibt eine eigene
Schicht, und das Backend bildet die Schnittmenge über die Dokument-IDs.
"""
from __future__ import annotations

import json
from urllib.parse import parse_qsl, unquote, urlsplit

# --- Was erlaubt ist ---------------------------------------------------------
# Ausgelesen aus DocumentFilterSet der Installation (Paperless-ngx 3.1.3).
# Ein Parameter, der hier nicht steht, wird verworfen und gemeldet: so kann eine
# gespeicherte Ansicht keine Eigenschaft von Paperless erfinden.
FILTER_PARAMETER = frozenset(
    """
    added__date__gt added__date__gte added__date__lt added__date__lte
    added__day added__gt added__gte added__lt added__lte added__month added__year
    archive_serial_number archive_serial_number__gt archive_serial_number__gte
    archive_serial_number__isnull archive_serial_number__lt archive_serial_number__lte
    checksum__icontains checksum__iendswith checksum__iexact checksum__istartswith
    content__icontains content__iendswith content__iexact content__istartswith
    correspondent__id correspondent__id__in correspondent__id__none
    correspondent__isnull correspondent__name__icontains correspondent__name__iendswith
    correspondent__name__iexact correspondent__name__istartswith
    created__date__gt created__date__gte created__date__lt created__date__lte
    created__day created__gt created__gte created__lt created__lte
    created__month created__year
    custom_field_query custom_fields__icontains custom_fields__id__all
    custom_fields__id__in custom_fields__id__none
    document_type__id document_type__id__in document_type__id__none
    document_type__isnull document_type__name__icontains document_type__name__iendswith
    document_type__name__iexact document_type__name__istartswith
    has_custom_fields id id__in is_in_inbox is_tagged mime_type
    modified__date__gt modified__date__gte modified__date__lt modified__date__lte
    modified__day modified__gt modified__gte modified__lt modified__lte
    modified__month modified__year
    original_filename__icontains original_filename__iendswith
    original_filename__iexact original_filename__istartswith
    owner__id owner__id__in owner__id__none owner__isnull shared_by__id
    storage_path__id storage_path__id__in storage_path__id__none
    storage_path__isnull storage_path__name__icontains storage_path__name__iendswith
    storage_path__name__iexact storage_path__name__istartswith
    tags__id tags__id__all tags__id__in tags__id__none
    tags__name__icontains tags__name__iendswith tags__name__iexact tags__name__istartswith
    title__icontains title__iendswith title__iexact title__istartswith
    title_content
    query text title_search more_like_id
    """.split(),
)

# Die Volltextsuche dieser Installation läuft über Tantivy. Sie kennt vier
# Parameter, von denen Paperless genau einen zulässt ("Specify only one of
# text, title_search, query, or more_like_id"). Zwei verschiedene dürfen darum
# nie in derselben Abfrage stehen; die übrigen Filter werden davor angewendet
# und gelten zusätzlich.
SUCH_PARAMETER = frozenset({"query", "text", "title_search", "more_like_id"})

# Sortierfelder aus DocumentViewSet.ordering_fields. custom_field_ trägt den
# Namen des Feldes als Suffix, darum nur als Präfix geprüft.
SORTIERFELDER = frozenset(
    """
    id title correspondent__name document_type__name storage_path__name
    created modified added archive_serial_number num_notes owner page_count
    """.split(),
)
SORTIER_PRAEFIX = "custom_field_"


def sortierung_gueltig(feld: str) -> bool:
    """Prüft ein Sortierfeld, mit oder ohne führendes Minus."""
    if not feld:
        return False
    kern = feld.lstrip("-")
    return kern in SORTIERFELDER or kern.startswith(SORTIER_PRAEFIX)


# --- Prüfen ------------------------------------------------------------------
def pruefen(rohdaten: dict) -> tuple[dict, list[str]]:
    """Behält die erlaubten Parameter, meldet die verworfenen zurück."""
    behalten: dict[str, str] = {}
    verworfen: list[str] = []
    for schluessel, wert in (rohdaten or {}).items():
        if schluessel in FILTER_PARAMETER and str(wert).strip() != "":
            behalten[schluessel] = str(wert)
        else:
            verworfen.append(schluessel)
    return behalten, verworfen


def ist_leer(filter_satz: dict | None) -> bool:
    return not filter_satz


def tagliste(roh: str | None) -> str:
    """Prüft eine Tag-Auswahl aus der Adresszeile: nur Zahlen, nur Kommas.

    Der Schnellfilter in der Liste schreibt die Tag-Kennungen in die URL. Was
    von dort kommt, geht nur geprüft weiter an Paperless.
    """
    if not roh:
        return ""
    return ",".join(t for t in (s.strip() for s in str(roh).split(",")) if t.isdigit())


# --- Verschmelzen ------------------------------------------------------------
# Listen, die sich bei UND vereinigen lassen: "hat alle von A" UND "hat alle von
# B" ist "hat alle von A+B"; "hat keinen von A" UND "hat keinen von B" ist "hat
# keinen von A+B".
_VEREINIGEN = frozenset(
    """
    tags__id__all tags__id__none custom_fields__id__all custom_fields__id__none
    correspondent__id__none document_type__id__none storage_path__id__none owner__id__none
    """.split(),
)

# Felder mit genau einem Wert je Dokument: dort ist UND zweier Auswahllisten die
# Schnittmenge. Bei tags__id__in gilt das NICHT (ein Dokument hat mehrere Tags),
# darum steht es hier nicht.
_SCHNITT = frozenset(
    """
    correspondent__id__in document_type__id__in storage_path__id__in owner__id__in id__in
    """.split(),
)

# Untergrenzen: die grössere gewinnt. Obergrenzen: die kleinere.
_UNTERGRENZE_ENDE = ("__gt", "__gte")
_OBERGRENZE_ENDE = ("__lt", "__lte")

# Ein unmöglicher Wert für id__in, wenn zwei Auswahllisten sich nicht schneiden.
UNERFUELLBAR = {"id__in": "0"}


def _liste(wert: str) -> list[str]:
    return [t.strip() for t in str(wert).split(",") if t.strip()]


def _als_zahl(wert: str):
    try:
        return float(wert)
    except (TypeError, ValueError):
        return None


def _vergleichbar(wert: str) -> bool:
    """Relative Ausdrücke wie "this year" lassen sich nicht vergleichen."""
    return all(c.isdigit() or c in "-.:T +" for c in wert)


def _grenze(a: str, b: str, hoeher: bool) -> str | None:
    """Führt zwei Grenzwerte zusammen. ISO-Datumstexte sortieren als Text richtig."""
    za, zb = _als_zahl(a), _als_zahl(b)
    if za is not None and zb is not None:
        return a if (za > zb) == hoeher else b
    if not (_vergleichbar(a) and _vergleichbar(b)):
        return None
    return a if (a > b) == hoeher else b


def _verschmelzen_paar(schluessel: str, a: str, b: str) -> str | None:
    """Ein Wert für beide Bedingungen, oder None wenn es keinen gibt."""
    if a == b:
        return a
    if schluessel == "custom_field_query":
        try:
            return json.dumps(
                ["AND", [json.loads(a), json.loads(b)]], separators=(",", ":")
            )
        except (TypeError, ValueError):
            return None
    if schluessel in _VEREINIGEN:
        zusammen = _liste(a)
        for t in _liste(b):
            if t not in zusammen:
                zusammen.append(t)
        return ",".join(zusammen)
    if schluessel in _SCHNITT:
        zweite = set(_liste(b))
        gemeinsam = [t for t in _liste(a) if t in zweite]
        # Keine gemeinsame Auswahl heisst: nicht erfüllbar. Das ist ausdrückbar,
        # nämlich als eine Auswahl, die kein Dokument trifft.
        return ",".join(gemeinsam) if gemeinsam else "0"
    if schluessel.endswith(_UNTERGRENZE_ENDE):
        return _grenze(a, b, hoeher=True)
    if schluessel.endswith(_OBERGRENZE_ENDE):
        return _grenze(a, b, hoeher=False)
    return None


def verschmelzen(schichten: list[dict]) -> list[dict]:
    """Fasst Filtersätze zusammen, die mit UND gelten sollen.

    Rückgabe ist die kürzeste Liste von Sätzen, die dieselbe Bedingung
    ausdrücken. Eine Schicht heisst: eine Abfrage an Paperless. Mehr als eine
    heisst: das Backend bildet die Schnittmenge über die Dokument-IDs.
    """
    ergebnis: list[dict] = []
    for satz in schichten:
        if not satz:
            continue
        rest = dict(satz)
        for vorhanden in ergebnis:
            # Zwei verschiedene Suchparameter weist Paperless zurück.
            suche_hier = SUCH_PARAMETER & set(rest)
            suche_dort = SUCH_PARAMETER & set(vorhanden)
            if suche_hier and suche_dort and suche_hier != suche_dort:
                continue
            passt: dict | None = {}
            for schluessel, wert in rest.items():
                if schluessel not in vorhanden:
                    passt[schluessel] = wert
                    continue
                zusammen = _verschmelzen_paar(schluessel, vorhanden[schluessel], wert)
                if zusammen is None:
                    passt = None
                    break
                passt[schluessel] = zusammen
            if passt is not None:
                vorhanden.update(passt)
                rest = {}
                break
        if rest:
            ergebnis.append(rest)
    return ergebnis


# --- Übernahme aus einem Paperless-Link (F3) ---------------------------------
# Das Frontend von Paperless nennt die Sortierung anders als die API.
_LINK_IGNORIEREN = frozenset(
    {"page", "page_size", "view", "reverse", "sort", "truncate_content", "ordering"}
)


def aus_link(link: str) -> tuple[dict, str | None, list[str]]:
    """Liest Filter und Sortierung aus einem Paperless-Link.

    Versteht den Link aus der Adresszeile des Paperless-Frontends
    (/documents?tags__id__all=5,7&sort=created&reverse=1) und ebenso einen
    API-Link (/api/documents/?...). Rückgabe: Filter, Sortierung, Verworfenes.
    """
    text = (link or "").strip()
    zerlegt = urlsplit(text)
    anfrage = zerlegt.query
    # Das Frontend kann die Parameter auch hinter der Raute tragen
    if not anfrage and zerlegt.fragment and "=" in zerlegt.fragment:
        anfrage = zerlegt.fragment.split("?", 1)[-1]
    if not anfrage and "=" in text:
        anfrage = text.split("?", 1)[-1]

    roh = dict(parse_qsl(unquote(anfrage), keep_blank_values=False))

    sortierung = None
    feld = roh.get("sort")
    if feld and sortierung_gueltig(feld):
        umgekehrt = str(roh.get("reverse", "")).lower() in ("1", "true")
        sortierung = ("-" if umgekehrt else "") + feld
    elif roh.get("ordering") and sortierung_gueltig(roh["ordering"]):
        sortierung = roh["ordering"]

    zu_pruefen = {k: v for k, v in roh.items() if k not in _LINK_IGNORIEREN}
    filter_satz, verworfen = pruefen(zu_pruefen)
    return filter_satz, sortierung, verworfen
