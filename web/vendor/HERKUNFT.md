# Mitgelieferte Fremdbibliotheken

PaperTree lädt nichts aus dem Netz nach (Grundsatz A6). Alles, was der
Browser braucht, liegt hier – unverändert, in der jeweils genannten Fassung.

| Datei | Projekt | Fassung | Lizenz |
| --- | --- | --- | --- |
| `pdf.min.mjs`, `pdf.worker.min.mjs` | [pdf.js](https://mozilla.github.io/pdf.js/) | 6.3.289 | Apache-2.0 |
| `popper.min.js` | [Popper](https://popper.js.org/) | 2.11.8 | MIT |
| `lucide/symbole.js` | [Lucide](https://lucide.dev/) | lucide-static 1.47.0 | ISC |

Der Lizenztext von Lucide liegt unter `lucide/LICENSE` bei. Die Lizenzen von
pdf.js und Popper stehen in den jeweiligen Projekten; die Dateien selbst
tragen ihren Lizenzhinweis im Kopf.

`lucide/symbole.js` ist kein Original, sondern aus dem Paket `lucide-static`
erzeugt: gespeichert ist nur das Innere jedes `<svg>`, weil Grösse,
Strichstärke und Farbe beim Zeichnen gesetzt werden. Neu erzeugen mit:

```bash
python werkzeuge/symbole_bauen.py <entpacktes-lucide-static-paket>
```
