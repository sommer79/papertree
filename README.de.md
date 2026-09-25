# PaperTree

Eine nur lesende Navigations- und Leseoberfläche über Paperless-ngx. Ansichten
liegen als Baum in PaperTree selbst; Paperless bleibt die Quelle der Wahrheit
für die Dokumente.

Stand: **Stufe 1 und 2 umgesetzt** (Version 0.3.0). Die Anforderungen stehen im
Dokument „PaperTree – Anforderungen"; die Kürzel A1–A7, F1–F9 und N1–N6 in den
Quelldateien verweisen darauf.

*English version: [README.md](README.md).*

![Ein Ordner mit seiner Dokumentliste](docs/bilder/01-ordner.png)

*Mehr davon: [Screenshots im Wiki](https://github.com/sommer79/papertree/wiki/Screenshots).
Namen, Korrespondenten und Dokumente auf den Bildern sind erfunden.*

## Was PaperTree kann

- Ordnerbaum, beliebig tief, mit den zwei Schaltern **eigener Filter** und
  **Unterordner einbeziehen** – daraus ergeben sich alle vier Anzeigearten
  einschliesslich reiner Navigation
- Ordner verschieben und sortieren: per Ziehen und Ablegen am Rechner (Linie
  oben oder unten = Geschwister, Rahmen = Unterordner, freie Fläche = oberste
  Ebene), und über das Ordnermenü sowie das Feld „Übergeordneter Ordner" auch
  am Handy
- **Dynamische Unterordner**: ein Ordner kann seine Unterordner aus den
  vorhandenen Werten aufspannen – nach Jahr, Korrespondent, Dokumenttyp, Tag,
  Speicherpfad oder einem Zusatzfeld. Kommt ein Wert dazu, erscheint der
  Unterordner von selbst. Von Hand angelegte Unterordner bleiben daneben
  bestehen
- **Export und Import des Baums** als JSON
- Filtervererbung entlang des Baums, je Ordner abschaltbar; der effektive
  Filter ist im Editor sichtbar
- Aggregation über Unterordner. Damit kann PaperTree das ODER über
  verschiedene Kriterien, das die Paperless-API in einer Abfrage nicht kennt
- Ansichten-Editor, der sich aus den Metadaten von Paperless selbst aufbaut:
  Tags, Korrespondenten, Dokumenttypen, Speicherpfade, Datumsfelder und
  Zusatzfelder mit den Operatoren ihres Datentyps. Live-Trefferzahl inklusive
- Übernahme eines Filters aus einem kopierten Paperless-Link
- Dokumentliste mit wählbaren Spalten, Sortierung und Blättern;
  Kachelansicht. Ein Klick auf einen Tag verengt die Liste darauf – der
  Filter steht in der Adresse, lässt sich also weitergeben und verändert
  den gespeicherten Ordner nicht
- **Ein Symbol je Ordner**, aus gut zweitausend, nach Themen durchsuchbar
  in der Sprache der Oberfläche
- Detailansicht mit eingebautem PDF-Betrachter, Download und dem Knopf
  „In Paperless öffnen"
- Volltextsuche global und innerhalb eines Ordners
- Dashboard mit den Ordnern, die man dort haben will
- **Einstellungen für Administratoren**: je Tag ein Symbol, das in den
  Listen an die Stelle der Kurzform tritt, und je Korrespondent ein Logo,
  klein vor dem Namen und gross in der Ecke der Dokumentansicht. Beides
  gilt nur in PaperTree; in Paperless ändert sich nichts
- Fünf Sprachen – Deutsch, Englisch, Französisch, Italienisch und Spanisch –
  aus den Einstellungen des Benutzers in Paperless; alles andere bekommt
  Englisch. Das Datum folgt der dort eingestellten Datumsanzeige, immer in
  der mittleren Form
- Bedienbar auf dem Handy

Bewusst nicht enthalten: jede Änderung an Paperless-Daten, die Anzeige, in
welchen anderen Ordnern ein Dokument ebenfalls liegt (N5), und das
Veröffentlichen eines Ordners als Paperless-Ansicht (O1, noch nicht
entschieden).

## Grundsätze, die im Code verankert sind

**Nur lesend (A1).** `app/paperless.py` ist die einzige Stelle, die Paperless
erreicht. Sie schickt ausschliesslich GET und prüft jeden Pfad gegen eine
Whitelist. Ein Fehler in der Oberfläche kann in Paperless nichts verändern.

**Die Anmeldung gehört dem Benutzer (A2).** PaperTree besitzt kein Token,
sondern leitet den Session-Cookie weiter. Wer in Paperless nicht angemeldet
ist, sieht nichts; die Berechtigungen von Paperless gelten unverändert. Darum
muss PaperTree unter derselben Domain laufen.

**Keine Kopie der Dokumente (A3).** Vorschau und Download laufen als Strom
durch. Zwischengespeichert wird nur die Reihenfolge der Dokument-IDs, je
Benutzer und Sortierung, für 60 Sekunden.

**Filter sind Query-Parameter (A4).** PaperTree baut die Regeltypen von
Paperless nicht nach. Ein neuer Filter in Paperless funktioniert damit sofort.

**Ein Baum je Benutzer (A7).** Jede Abfrage der Datenbank nennt die
Benutzerkennung.

**Die Sprache steht an einer Stelle.** PaperTree hat keine eigene
Spracheinstellung: es spricht die Sprache, die in Paperless gewählt ist, und
schreibt das Datum mit der dort eingestellten Datumssprache. Zwei
Einstellungen für dieselbe Sache laufen auseinander, und niemand sucht sie an
zwei Orten. Eine Sprache, die PaperTree nicht hat, bekommt Englisch.

**Das Aussehen gilt für alle, der Baum nicht.** Tag-Symbole und
Korrespondenten-Logos sehen für jeden gleich aus und werden von einem
Administrator gepflegt; geprüft wird das im Server, die Oberfläche blendet
nur aus, was ohnehin abgewiesen würde. Ein hochgeladenes Logo wird an seinen
Magic Bytes erkannt, nicht am Dateinamen, und ein SVG mit Skript wird
abgewiesen – es liefe sonst im Browser jedes Kollegen.

## Aufbau

```
app/filters.py      Erlaubte Parameter, Verschmelzen von Filtersätzen, Link-Import
app/tree.py         Knoten, Vererbung, Abfragepläne, Referenzprüfung
app/groups.py       Dynamische Unterordner: Werte ermitteln, Gruppe als Filtersatz
app/documents.py    Pläne ausführen: direkt oder über Dokument-IDs
app/paperless.py    Der lesende Zugang – Whitelist und Cookie-Durchleitung
app/sprache.py      Welche Sprache und Datumsform Paperless nennt
app/logos.py        Logos der Korrespondenten: Typprüfung, Ablage, SVG-Abwehr
app/db.py           SQLite: der Baum, Tag-Symbole, Logo-Zuordnungen
app/main.py         HTTP-Schnittstelle und Auslieferung
web/                Oberfläche, ES-Module ohne Build-Kette
web/sprachen/       Je Sprache ein Katalog, schlichtes JSON
tests/              78 Prüfungen, ohne Paperless und ohne Netz
```

Eine dynamische Gruppe ist am Ende nur ein weiterer Filtersatz. Darum
funktionieren Vererbung, Aggregation, Sortierung und die Suche im Ordner
darin unverändert – und eine Prüfung stellt sicher, dass jeder erzeugte
Gruppenfilter ausschliesslich Parameter nennt, die Paperless kennt.

### Warum Schichten

Die Vererbung verknüpft Filtersätze mit UND. Das ist nicht immer in einem Satz
ausdrückbar: „hat einen der Tags A oder B" UND „hat einen der Tags C oder D"
ist kein einzelnes `tags__id__in`. `filters.verschmelzen` legt darum zusammen,
was zusammengeht – der häufige Fall, eine Abfrage – und lässt den Rest als
eigene Schicht stehen. Mehrere Schichten bedeuten: PaperTree holt die
Dokument-IDs je Schicht und bildet die Schnittmenge. Die Vereinigung über
Unterordner läuft genauso.

## Betrieb

Voraussetzung ist ein laufendes Paperless-ngx in Docker.

```bash
git clone https://github.com/sommer79/papertree.git
cd papertree
./deploy/install.sh
```

Das ist alles – der Installer führt durch beide Teile der Einrichtung:

**1. Container.** Er sucht sich zusammen, was er braucht: den
Paperless-Container (erkannt am Image, nicht am Namen), dessen Docker-Netz,
die interne und die öffentliche Adresse und einen freien Port. Das Gefundene
steht als Vorgabe in jeder Abfrage, Enter übernimmt, jeder Wert lässt sich
überschreiben. Geschrieben wird erst nach einer Bestätigung, und zwar nach
`deploy/.env`; die Compose-Datei selbst bleibt unangetastet. Danach baut und
startet er den Container und prüft nicht nur, ob PaperTree antwortet,
sondern auch, ob es Paperless erreicht.

**2. Reverse Proxy.** PaperTree hört absichtlich nur auf `127.0.0.1` und
muss unter **derselben Adresse wie Paperless** ausgeliefert werden – nur
dann gilt dessen Sitzungs-Cookie, und ohne den ist niemand angemeldet.
Findet der Installer nginx, bietet er an, den nötigen Block selbst
einzutragen: mit Sicherung, anschliessendem `nginx -t` und Neuladen. Wird
die Datei dabei beanstandet, spielt er die Sicherung zurück, statt eine
kaputte Konfiguration stehen zu lassen.

Bei einem anderen Reverse Proxy – Apache, Caddy, Traefik – sagt er, was
einzurichten ist: den Pfad `/papertree/` auf `http://127.0.0.1:<port>/`
leiten, ungepuffert, damit die PDF-Vorschau als Strom ankommt. Als Vorlage
dient `deploy/nginx-papertree.conf`.

Nur nachsehen, ohne irgendetwas zu ändern:

```bash
./deploy/install.sh --pruefen
```

Den nginx-Schritt kann man auch einzeln nachholen:

```bash
sudo python3 deploy/nginx_einfuegen.py \
     --host paperless.example.org --pfad papertree --port 8080 --neuladen
```

### Einstellungen

| Variable | Vorgabe | Bedeutung |
| --- | --- | --- |
| `PAPERTREE_PAPERLESS_URL` | `http://localhost:8000` | wohin PaperTree intern greift |
| `PAPERTREE_PAPERLESS_PUBLIC_URL` | leer | wie Paperless für den Browser erreichbar ist |
| `PAPERTREE_BASE_PATH` | `papertree` | nginx-Pfad |
| `PAPERLESS_NETZ` | `paperless_default` | Docker-Netz des Paperless-Stacks |
| `PAPERTREE_PORT` | `8080` | Port auf `127.0.0.1` |
| `PAPERTREE_DB` | `/data/papertree.sqlite3` | die Datenbank mit dem Baum |
| `PAPERTREE_LOGO_DIR` | neben der Datenbank | Ablage der Korrespondenten-Logos |
| `PAPERTREE_LOGO_MAX_BYTES` | `1048576` | Obergrenze je Logo |
| `PAPERTREE_INDEX_TTL` | `60` | Sekunden, die die ID-Reihenfolge gilt |
| `PAPERTREE_TIMEOUT` | `30` | Zeitgrenze einer Abfrage an Paperless |

### Daten und Sicherung

Alles, was PaperTree besitzt, liegt im Volume `papertree_daten`:

- `papertree.sqlite3` – Ordnerbaum, Tag-Symbole, Logo-Zuordnungen
- `logos/` – die hochgeladenen Bilddateien

Der Volume-Name steht fest in der Compose-Datei und hängt nicht am
Projektnamen. Ohne diesen festen Namen stellte Compose den Projektnamen
voran, und der kommt aus dem Verzeichnis der Compose-Datei – aus einem
anderen Ordner gestartet entstünde ein zweites, leeres Volume, und der
Ordnerbaum schiene verloren.

Gesichert wird mit `deploy/papertree-sichern.sh`. Das Skript legt eine in
sich stimmige Kopie der Datenbank an – über die Online-Backup-Schnittstelle
von SQLite, denn eine einfache Dateikopie wäre im WAL-Modus womöglich
unvollständig – und packt sie mit den Logos in ein Archiv:

```bash
sudo install -m 755 deploy/papertree-sichern.sh /usr/local/sbin/papertree-sichern
papertree-sichern /pfad/zum/sicherungsordner
```

Wer Paperless schon per systemd sichert, hängt PaperTree mit einem Drop-in
an denselben Dienst, statt einen eigenen Zeitgeber zu pflegen:

```ini
# /etc/systemd/system/<dienst>.service.d/papertree.conf
[Service]
ExecStart=/usr/local/sbin/papertree-sichern
```

Bei `Type=oneshot` führt systemd mehrere `ExecStart` nacheinander aus.

**Wichtig:** Eine Sicherung von Paperless erfasst diese Daten nicht. Der
Ordnerbaum liegt allein hier.

## Entwicklung

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
python -m unittest discover -s tests
```

Die Prüfungen laufen ohne Paperless: `tests/test_kern.py` prüft Filtermodell
und Baumlogik, `tests/test_ausfuehrung.py` das Zusammenführen über IDs gegen
eine Attrappe, und `tests/test_sprachen.py`, dass jeder Schlüssel, den die
Oberfläche anfragt, in allen fünf Sprachen steht – mit denselben Platzhaltern.

### Eine Sprache hinzufügen

1. `web/sprachen/en.json` nach `<kürzel>.json` kopieren und die Werte
   übersetzen. Die Schlüssel bleiben, wie sie sind – sie sind die Abmachung
   mit dem Code.
2. Das Kürzel in `SPRACHEN` eintragen, in `web/js/sprache.js` und in
   `app/sprache.py`.
3. Die Prüfungen laufen lassen. Sie nennen, was noch fehlt.

Die Einträge `thema.*.woerter` sind Suchwörter für den Symbolwähler, keine
Übersetzung: dort gehören die Wörter hin, die in dieser Sprache wirklich
eingegeben werden. Ein Thema wird über seinen Namen oder eines dieser Wörter
gefunden.

## Getroffene Annahmen über Paperless 3.1.3

Aus der Installation ausgelesen, nicht geraten:

- 104 Filterparameter aus `DocumentFilterSet`
- Sortierfelder aus `DocumentViewSet.ordering_fields`, dazu
  `custom_field_<id>`
- `custom_field_query` versteht `AND`, `OR` und `NOT`, höchstens zehn Ebenen
  tief und zwanzig Bedingungen
- Operatoren je Zusatzfeldtyp aus `CustomFieldQueryParser.EXPR_BY_CATEGORY`
- `fields=id` wird unterstützt, `max_page_size` ist 100000
- `ui_settings` nennt, wer angemeldet ist, ob er Vollzugriff hat, die
  Anzeigesprache als `settings.language` und die Datumssprache verschachtelt
  unter `settings.date_display.date_locale` – nicht unter dem flachen Namen,
  den das Frontend verwendet. Dort kann der Sonderwert `iso-8601` stehen, der
  keine Sprache ist, sondern eine Schreibweise
- Die Volltextsuche läuft über Tantivy und kennt `query`, `text`,
  `title_search` und `more_like_id`. Paperless lässt genau einen davon je
  Abfrage zu, wendet die übrigen Filter aber davor an – `filters.verschmelzen`
  hält sich daran.

## Lizenz

Apache-Lizenz 2.0, siehe [LICENSE](LICENSE). Sie erlaubt Gebrauch, Änderung
und Weitergabe, auch gewerblich, und schliesst eine ausdrückliche
Patentlizenz ein.

PaperTree spricht Paperless-ngx nur über dessen HTTP-Schnittstelle an und
bindet keinen Code daraus ein. Die GPL von Paperless erstreckt sich deshalb
nicht auf dieses Projekt.

Die mitgelieferten Bibliotheken unter `web/vendor/` behalten ihre eigenen
Lizenzen; welche das sind und wo die Texte liegen, steht in
[NOTICE](NOTICE) und in [web/vendor/HERKUNFT.md](web/vendor/HERKUNFT.md).
