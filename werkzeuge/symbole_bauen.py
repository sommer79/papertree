# -*- coding: utf-8 -*-
"""Macht aus dem Lucide-Paket eine einzige Datei für den Symbolwähler.

Lucide liefert je Symbol eine SVG-Datei. Sie unterscheiden sich nur im
Inhalt – Grösse, Strichstärke und Farbe sind bei allen gleich und werden
beim Zeichnen gesetzt. Gespeichert wird deshalb nur das Innere.

Aufruf:
    python symbole_bauen.py <entpacktes-lucide-paket>

Quelle: https://www.npmjs.com/package/lucide-static (ISC-Lizenz)
"""
import io
import json
import os
import re
import sys

# Liegt in werkzeuge/, arbeitet aber auf der Projektwurzel darüber.
WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIEL = os.path.join(WURZEL, "web", "vendor", "lucide", "symbole.js")
LIZENZ_ZIEL = os.path.join(WURZEL, "web", "vendor", "lucide", "LICENSE")

quelle = sys.argv[1] if len(sys.argv) > 1 else None
if not quelle or not os.path.isdir(quelle):
    raise SystemExit("Pfad zum entpackten Paket angeben (Ordner mit icons/)")

icons = os.path.join(quelle, "icons")
if not os.path.isdir(icons):
    raise SystemExit("Kein Unterordner icons/ in %s" % quelle)

INHALT = re.compile(r"<svg[^>]*>(.*)</svg>", re.S)
LEERRAUM = re.compile(r">\s+<")

symbole = {}
uebersprungen = []
for name in sorted(os.listdir(icons)):
    if not name.endswith(".svg"):
        continue
    with io.open(os.path.join(icons, name), encoding="utf-8") as datei:
        roh = datei.read()
    treffer = INHALT.search(roh)
    if not treffer:
        uebersprungen.append(name)
        continue
    inneres = LEERRAUM.sub("><", treffer.group(1).strip())
    # Nichts als Formen erlauben: kein Skript, kein Verweis nach aussen.
    if "<script" in inneres.lower() or "href" in inneres.lower():
        uebersprungen.append(name)
        continue
    symbole[name[:-4]] = inneres

os.makedirs(os.path.dirname(ZIEL), exist_ok=True)
with io.open(ZIEL, "w", encoding="utf-8", newline="\n") as datei:
    datei.write("// Lucide-Symbole, ISC-Lizenz – siehe LICENSE in diesem Ordner.\n")
    datei.write("// Erzeugt von symbole_bauen.py, nicht von Hand ändern.\n")
    datei.write("// Gespeichert ist nur das Innere des <svg>; Grösse, Strichstärke\n")
    datei.write("// und Farbe setzt web/js/symbole.js beim Zeichnen.\n")
    datei.write("export const SYMBOLE = ")
    datei.write(json.dumps(symbole, ensure_ascii=False, sort_keys=True,
                           separators=(",", ":")))
    datei.write(";\n")

lizenz = os.path.join(quelle, "LICENSE")
if os.path.exists(lizenz):
    with io.open(lizenz, encoding="utf-8") as q, \
         io.open(LIZENZ_ZIEL, "w", encoding="utf-8", newline="\n") as z:
        z.write(q.read())

groesse = os.path.getsize(ZIEL)
print("Symbole        : %d" % len(symbole))
print("Übersprungen   : %s" % (uebersprungen or "keine"))
print("Dateigrösse    : %.0f KB" % (groesse / 1024))
print("Längstes Symbol: %d Zeichen" % max(len(w) for w in symbole.values()))
print("\ngeschrieben: %s" % ZIEL)
