# -*- coding: utf-8 -*-
"""Baut die Themenliste für den Symbolwähler.

Der Symbolsatz ist englisch benannt: wer "Versicherung" sucht, findet
nichts. Diese Datei ordnet deutschen Themen passende Symbole zu und liefert
zusätzliche Suchwörter. Die Zuordnung ist von Hand gepflegt – sie richtet
sich nach den Tags, die in diesem Bestand tatsächlich vorkommen.

Jeder Symbolname wird gegen den mitgelieferten Satz geprüft; was es dort
nicht gibt, fliegt raus und wird gemeldet, statt still ins Leere zu zeigen.

Aufruf:
    python themen_bauen.py
"""
import io
import json
import os

# Liegt in werkzeuge/, arbeitet aber auf der Projektwurzel darüber.
WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SATZ = os.path.join(WURZEL, "web", "vendor", "lucide", "symbole.js")
ZIEL = os.path.join(WURZEL, "web", "js", "themen.js")

# (Thema, weitere Suchwörter, Symbole)
THEMEN = [
    ("Geld und Bank",
     ["bank", "konto", "kontoauszug", "zahlung", "überweisung", "sparen",
      "kredit", "kreditkarte", "bargeld", "münzen", "budget", "finanzen"],
     ["landmark", "banknote", "piggy-bank", "wallet", "wallet-cards",
      "credit-card", "coins", "hand-coins", "circle-dollar-sign", "euro",
      "vault", "receipt-euro", "arrow-left-right", "trending-up",
      "chart-no-axes-combined", "calculator"]),

    ("Rechnung und Beleg",
     ["rechnung", "beleg", "quittung", "mahnung", "inkasso", "offen",
      "bezahlt", "abrechnung", "kassenbon"],
     ["receipt", "receipt-euro", "receipt-text", "file-text", "scroll-text",
      "clipboard-list", "badge-euro", "banknote-arrow-up",
      "banknote-arrow-down", "circle-alert", "hourglass"]),

    ("Steuern und Behörden",
     ["steuer", "steuern", "behörde", "amt", "gemeinde", "kanton", "staat",
      "formular", "bescheid", "amtlich"],
     ["landmark", "scale", "gavel", "stamp", "file-badge", "file-check",
      "building-2", "shield-check", "book-marked", "percent"]),

    ("Versicherung und Recht",
     ["versicherung", "police", "schaden", "haftpflicht", "rechtsschutz",
      "vertrag", "verträge", "anwalt", "recht", "unterschrift"],
     ["shield", "shield-check", "shield-half", "umbrella", "file-signature",
      "handshake", "scale", "gavel", "file-lock", "life-buoy"]),

    ("Gesundheit",
     ["gesundheit", "arzt", "ärztin", "krankenkasse", "spital", "apotheke",
      "medikament", "zahnarzt", "rezept", "praxis", "therapie"],
     ["stethoscope", "heart-pulse", "cross", "pill", "syringe", "activity",
      "hospital", "bandage", "thermometer", "brain", "toothbrush", "microscope", "smile"]),

    ("Arbeit und Lohn",
     ["arbeit", "lohn", "gehalt", "lohnausweis", "arbeitgeber", "büro",
      "bewerbung", "zeugnis", "stelle", "pensionskasse", "vorsorge",
      "selbstständig", "firma"],
     ["briefcase", "briefcase-business", "building", "building-2", "id-card",
      "user-round-check", "file-user", "award", "handshake", "clock",
      "calendar-clock", "piggy-bank", "hard-hat", "presentation"]),

    ("Wohnen",
     ["wohnung", "haus", "miete", "mietzins", "nebenkosten", "heizung",
      "umzug", "wohnen", "liegenschaft", "genossenschaft", "möbel"],
     ["house", "home", "building", "key", "key-round", "door-open", "sofa",
      "lamp", "bed", "flame", "droplets", "wrench", "hammer", "paintbrush"]),

    ("Strom und Energie",
     ["strom", "energie", "elektrizität", "gas", "wasser", "heizöl",
      "solar", "verbrauch", "zähler"],
     ["zap", "plug", "plug-zap", "lightbulb", "flame", "droplets", "sun",
      "battery-charging", "gauge", "power"]),

    ("Telefon und Internet",
     ["telefon", "handy", "mobile", "internet", "abo", "hosting", "domain",
      "provider", "wlan", "tv", "fernsehen"],
     ["smartphone", "phone", "phone-call", "wifi", "globe", "router",
      "server", "cloud", "signal", "antenna", "tv", "cable", "at-sign"]),

    ("Computer und Technik",
     ["computer", "technik", "software", "hardware", "gerät", "drucker",
      "kamera", "lizenz", "daten"],
     ["laptop", "monitor", "cpu", "hard-drive", "printer", "camera",
      "keyboard", "mouse", "usb", "database", "code", "settings", "bug"]),

    ("Auto und Verkehr",
     ["auto", "fahrzeug", "verkehr", "garage", "reifen", "tanken", "benzin",
      "busse", "bussgeld", "parkplatz", "zug", "öv", "velo", "fahrrad"],
     ["car", "car-front", "caravan", "truck", "bike", "bus", "train-front",
      "fuel", "parking-meter", "traffic-cone", "wrench", "circle-parking",
      "plane", "ship"]),

    ("Ferien und Freizeit",
     ["ferien", "reise", "urlaub", "ausflug", "ausflüge", "freizeit",
      "hobby", "hotel", "flug", "camping", "tickets", "veranstaltung"],
     ["palmtree", "plane", "luggage", "map", "map-pin", "tent", "mountain",
      "sun", "ticket", "camera", "compass", "backpack", "waves"]),

    ("Sport",
     ["sport", "fitness", "training", "verein", "wettkampf"],
     ["dumbbell", "bike", "footprints", "trophy", "medal", "volleyball",
      "target", "timer", "waves", "mountain-snow"]),

    ("Schule und Bildung",
     ["schule", "bildung", "kurs", "diplom", "ausbildung", "studium",
      "zeugnis", "weiterbildung", "prüfung"],
     ["graduation-cap", "book", "book-open", "library", "pencil",
      "notebook-pen", "award", "school", "backpack", "ruler"]),

    ("Familie und Privat",
     ["familie", "privat", "kind", "kinder", "geburt", "heirat", "ehe",
      "scheidung", "eltern", "person"],
     ["users", "user-round", "baby", "heart", "heart-handshake", "house",
      "cake", "gift", "contact-round", "footprints"]),

    ("Tiere",
     ["tier", "tiere", "hund", "katze", "tierarzt", "haustier"],
     ["dog", "cat", "bird", "fish", "rabbit", "bone", "paw-print", "turtle",
      "squirrel", "snail"]),

    ("Einkauf und Kleider",
     ["einkauf", "kleider", "kleidung", "mode", "schuhe", "geschenk",
      "geschenke", "bestellung", "lieferung", "versand", "werbung"],
     ["shopping-bag", "shopping-cart", "shirt", "footprints", "gift",
      "package", "package-check", "truck", "store", "tag", "megaphone",
      "glasses", "watch"]),

    ("Essen und Trinken",
     ["essen", "trinken", "restaurant", "lebensmittel", "wein", "kaffee"],
     ["utensils", "coffee", "wine", "beer", "apple", "carrot", "pizza",
      "cake-slice", "cooking-pot", "soup"]),

    ("Post und Korrespondenz",
     ["post", "brief", "korrespondenz", "schreiben", "mail", "eingang",
      "ausgang", "mitteilung", "spenden"],
     ["mail", "mail-open", "send", "inbox", "archive", "paperclip",
      "message-square", "megaphone", "newspaper", "stamp", "heart-handshake"]),

    ("Ordnung und Ablage",
     ["ordner", "ablage", "archiv", "dokument", "akte", "erledigt", "neu",
      "wichtig", "prüfen", "check"],
     ["folder", "folder-open", "folders", "file", "files", "archive",
      "archive-restore", "inbox", "bookmark", "star", "flag", "circle-check",
      "circle-alert", "clock", "pin", "tags", "list-checks"]),
]


with io.open(SATZ, encoding="utf-8") as datei:
    roh = datei.read()
vorhanden = set(json.loads(roh[roh.index("{"):roh.rindex("}") + 1]).keys())

ergebnis = []
fehlend = []
for name, woerter, symbole in THEMEN:
    gute = [s for s in symbole if s in vorhanden]
    fehlend.extend(s for s in symbole if s not in vorhanden)
    if not gute:
        raise SystemExit("Thema ohne einziges gültiges Symbol: " + name)
    ergebnis.append({"name": name, "woerter": woerter, "symbole": gute})

with io.open(ZIEL, "w", encoding="utf-8", newline="\n") as datei:
    datei.write("// Themen für den Symbolwähler – erzeugt von themen_bauen.py.\n")
    datei.write("// Der Symbolsatz ist englisch benannt; diese Liste macht ihn\n")
    datei.write("// über deutsche Begriffe auffindbar und gruppiert ihn nach\n")
    datei.write("// dem, wofür die Ordner hier tatsächlich stehen.\n")
    datei.write("export const THEMEN = ")
    datei.write(json.dumps(ergebnis, ensure_ascii=False, indent=1))
    datei.write(";\n")

zugeordnet = {s for t in ergebnis for s in t["symbole"]}
print("Themen            : %d" % len(ergebnis))
print("Symbole zugeordnet: %d (von %d im Satz)" % (len(zugeordnet), len(vorhanden)))
print("Suchwörter        : %d" % sum(len(t["woerter"]) for t in ergebnis))
print("Nicht im Satz     : %s" % (sorted(set(fehlend)) or "keine"))
print("\ngeschrieben: %s" % ZIEL)
