# -*- coding: utf-8 -*-
"""Baut die Themenliste für den Symbolwähler.

Der Symbolsatz ist englisch benannt: wer "Versicherung" sucht, findet nichts.
Diese Datei ordnet den Themen ihre Symbole zu.

Die Namen und die Suchwörter stehen hier nicht, sondern in web/sprachen/: sie
sind in jeder Sprache andere. Hier steht nur der Schlüssel, unter dem sie dort
zu finden sind – deshalb prüft das Skript am Ende auch, ob jedes Thema in
jeder Sprache einen Namen und Stichwörter hat.

Jeder Symbolname wird gegen den mitgelieferten Satz geprüft; was es dort nicht
gibt, fliegt raus und wird gemeldet, statt still ins Leere zu zeigen.

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
SPRACHEN = os.path.join(WURZEL, "web", "sprachen")

# (Schlüssel, Symbole) – der Name und die Stichwörter stehen in den
# Sprachdateien unter diesem Schlüssel und unter <schlüssel>.woerter.
THEMEN = [
    ("thema.geld",
     ["landmark", "banknote", "piggy-bank", "wallet", "wallet-cards",
      "credit-card", "coins", "hand-coins", "circle-dollar-sign", "euro",
      "vault", "receipt-euro", "arrow-left-right", "trending-up",
      "chart-no-axes-combined", "calculator"]),

    ("thema.rechnung",
     ["receipt", "receipt-euro", "receipt-text", "file-text",
      "scroll-text", "clipboard-list", "badge-euro", "banknote-arrow-up",
      "banknote-arrow-down", "circle-alert", "hourglass"]),

    ("thema.steuern",
     ["landmark", "scale", "gavel", "stamp", "file-badge", "file-check",
      "building-2", "shield-check", "book-marked", "percent"]),

    ("thema.versicherung",
     ["shield", "shield-check", "shield-half", "umbrella",
      "file-signature", "handshake", "scale", "gavel", "file-lock",
      "life-buoy"]),

    ("thema.gesundheit",
     ["stethoscope", "heart-pulse", "cross", "pill", "syringe", "activity",
      "hospital", "bandage", "thermometer", "brain", "toothbrush",
      "microscope", "smile"]),

    ("thema.arbeit",
     ["briefcase", "briefcase-business", "building", "building-2",
      "id-card", "user-round-check", "file-user", "award", "handshake",
      "clock", "calendar-clock", "piggy-bank", "hard-hat", "presentation"]),

    ("thema.wohnen",
     ["house", "home", "building", "key", "key-round", "door-open", "sofa",
      "lamp", "bed", "flame", "droplets", "wrench", "hammer", "paintbrush"]),

    ("thema.energie",
     ["zap", "plug", "plug-zap", "lightbulb", "flame", "droplets", "sun",
      "battery-charging", "gauge", "power"]),

    ("thema.telefon",
     ["smartphone", "phone", "phone-call", "wifi", "globe", "router",
      "server", "cloud", "signal", "antenna", "tv", "cable", "at-sign"]),

    ("thema.technik",
     ["laptop", "monitor", "cpu", "hard-drive", "printer", "camera",
      "keyboard", "mouse", "usb", "database", "code", "settings", "bug"]),

    ("thema.auto",
     ["car", "car-front", "caravan", "truck", "bike", "bus", "train-front",
      "fuel", "parking-meter", "traffic-cone", "wrench", "circle-parking",
      "plane", "ship"]),

    ("thema.ferien",
     ["palmtree", "plane", "luggage", "map", "map-pin", "tent", "mountain",
      "sun", "ticket", "camera", "compass", "backpack", "waves"]),

    ("thema.sport",
     ["dumbbell", "bike", "footprints", "trophy", "medal", "volleyball",
      "target", "timer", "waves", "mountain-snow"]),

    ("thema.schule",
     ["graduation-cap", "book", "book-open", "library", "pencil",
      "notebook-pen", "award", "school", "backpack", "ruler"]),

    ("thema.familie",
     ["users", "user-round", "baby", "heart", "heart-handshake", "house",
      "cake", "gift", "contact-round", "footprints"]),

    ("thema.tiere",
     ["dog", "cat", "bird", "fish", "rabbit", "bone", "paw-print",
      "turtle", "squirrel", "snail"]),

    ("thema.einkauf",
     ["shopping-bag", "shopping-cart", "shirt", "footprints", "gift",
      "package", "package-check", "truck", "store", "tag", "megaphone",
      "glasses", "watch"]),

    ("thema.essen",
     ["utensils", "coffee", "wine", "beer", "apple", "carrot", "pizza",
      "cake-slice", "cooking-pot", "soup"]),

    ("thema.post",
     ["mail", "mail-open", "send", "inbox", "archive", "paperclip",
      "message-square", "megaphone", "newspaper", "stamp",
      "heart-handshake"]),

    ("thema.ordnung",
     ["folder", "folder-open", "folders", "file", "files", "archive",
      "archive-restore", "inbox", "bookmark", "star", "flag",
      "circle-check", "circle-alert", "clock", "pin", "tags",
      "list-checks"]),
]


with io.open(SATZ, encoding="utf-8") as datei:
    roh = datei.read()
vorhanden = set(json.loads(roh[roh.index("{"):roh.rindex("}") + 1]).keys())

ergebnis = []
fehlend = []
for schluessel, symbole in THEMEN:
    gute = [s for s in symbole if s in vorhanden]
    fehlend.extend(s for s in symbole if s not in vorhanden)
    if not gute:
        raise SystemExit("Thema ohne einziges gültiges Symbol: " + schluessel)
    ergebnis.append({"schluessel": schluessel, "symbole": gute})

with io.open(ZIEL, "w", encoding="utf-8", newline="\n") as datei:
    datei.write("// Themen für den Symbolwähler – erzeugt von werkzeuge/themen_bauen.py.\n")
    datei.write("//\n")
    datei.write("// Der Symbolsatz ist englisch benannt. Diese Liste ordnet ihn nach dem, wofür\n")
    datei.write("// Ordner tatsächlich stehen, und macht ihn über Stichwörter auffindbar.\n")
    datei.write("//\n")
    datei.write("// Name und Stichwörter stehen hier nicht: sie gehören in web/sprachen/, weil\n")
    datei.write("// sie in jeder Sprache andere sind. Wer auf Französisch \"assurance\" sucht,\n")
    datei.write("// findet dasselbe Thema wie auf Deutsch mit \"Versicherung\" – die Symbole sind\n")
    datei.write("// dieselben, die Wörter nicht.\n")
    datei.write("export const THEMEN = [\n")
    for thema in ergebnis:
        symbole = ", ".join("'%s'" % s for s in thema["symbole"])
        datei.write("  { schluessel: '%s', symbole: [%s] },\n"
                    % (thema["schluessel"], symbole))
    datei.write("];\n")

# Ohne Namen in der Sprachdatei stünde im Wähler der blosse Schlüssel.
ohne = []
for name in sorted(os.listdir(SPRACHEN)):
    if not name.endswith(".json"):
        continue
    with io.open(os.path.join(SPRACHEN, name), encoding="utf-8") as datei:
        katalog = json.load(datei)
    for thema in ergebnis:
        for schluessel in (thema["schluessel"], thema["schluessel"] + ".woerter"):
            if not katalog.get(schluessel):
                ohne.append("%s: %s" % (name, schluessel))

zugeordnet = {s for t in ergebnis for s in t["symbole"]}
print("Themen            : %d" % len(ergebnis))
print("Symbole zugeordnet: %d (von %d im Satz)" % (len(zugeordnet), len(vorhanden)))
print("Nicht im Satz     : %s" % (sorted(set(fehlend)) or "keine"))
print("Ohne Übersetzung  : %s" % (ohne or "keine"))
print("\ngeschrieben: %s" % ZIEL)
