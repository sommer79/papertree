// Dokumentliste und Blättern (F5.1), für Ordner wie für Suchergebnisse.
import { api } from './api.js';
import { stamm } from './stamm.js';
import { popperDa } from './tooltip.js';
import { korrespondentLogo, tagSymbol } from './darstellung.js';
import { symbolInhalt, symboleLaden, symbolSvg } from './symbole.js';

export const SPALTEN = {
  title: { name: 'Titel', zeichne: (dok) => verweis(dok) },
  correspondent: { name: 'Korrespondent', zeichne: (dok) => korrespondentZelle(dok) },
  document_type: { name: 'Typ', zeichne: (dok) => text(namen('document_types', dok.document_type)) },
  storage_path: { name: 'Speicherpfad', zeichne: (dok) => text(namen('storage_paths', dok.storage_path)) },
  tags: { name: 'Tags', zeichne: (dok, kontext) => marken(dok.tags, kontext) },
  created: { name: 'Erstellt', klasse: 'datum', zeichne: (dok) => text(datum(dok.created_date || dok.created)) },
  added: { name: 'Hinzugefügt', klasse: 'datum', zeichne: (dok) => text(datum(dok.added)) },
  page_count: { name: 'Seiten', klasse: 'datum', zeichne: (dok) => text(dok.page_count) },
  archive_serial_number: { name: 'Archivnr.', klasse: 'datum', zeichne: (dok) => text(dok.archive_serial_number) },
};

const SORTIERBAR = {
  title: 'title',
  correspondent: 'correspondent__name',
  document_type: 'document_type__name',
  storage_path: 'storage_path__name',
  created: 'created',
  added: 'added',
  page_count: 'page_count',
  archive_serial_number: 'archive_serial_number',
};

// Eine Liste für beide Stellen, die sortieren lassen: das Dropdown über der
// Liste (am Handy der einzige Weg, weil der Tabellenkopf dort fehlt) und der
// Ordner-Editor.
export const SORTIERUNGEN = [
  ['-created', 'Erstellt, neueste zuerst'],
  ['created', 'Erstellt, älteste zuerst'],
  ['-added', 'Hinzugefügt, neueste zuerst'],
  ['added', 'Hinzugefügt, älteste zuerst'],
  ['title', 'Titel A–Z'],
  ['-title', 'Titel Z–A'],
  ['correspondent__name', 'Korrespondent A–Z'],
  ['-correspondent__name', 'Korrespondent Z–A'],
  ['document_type__name', 'Dokumenttyp A–Z'],
  ['storage_path__name', 'Speicherpfad A–Z'],
  ['-modified', 'Geändert, neueste zuerst'],
  ['-page_count', 'Seitenzahl, absteigend'],
  ['page_count', 'Seitenzahl, aufsteigend'],
  ['archive_serial_number', 'Archivnummer'],
  ['id', 'Kennung'],
];

function namen(art, id) {
  if (id == null) return '';
  const eintrag = stamm.nachId[art] && stamm.nachId[art][String(id)];
  return eintrag ? eintrag.name : '#' + id;
}

// Immer DD.MM.YYYY. Ein reiner Datumstext wird direkt umgestellt und nicht
// durch Date geschickt: "2026-01-23" wäre dort UTC-Mitternacht und könnte je
// nach Zeitzone auf den Vortag fallen.
export function datum(wert) {
  if (!wert) return '';
  const text = String(wert);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return iso[3] + '.' + iso[2] + '.' + iso[1];
  const d = new Date(text);
  if (isNaN(d)) return text.slice(0, 10);
  const zwei = (n) => String(n).padStart(2, '0');
  return zwei(d.getDate()) + '.' + zwei(d.getMonth() + 1) + '.' + d.getFullYear();
}

function text(wert) {
  const knoten = document.createElement('span');
  knoten.textContent = wert == null ? '' : String(wert);
  return knoten;
}

function verweis(dok) {
  const a = document.createElement('a');
  a.href = '#/dok/' + dok.id;
  a.textContent = dok.title || '(ohne Titel)';
  return a;
}

// Wie viele Zeichen ein Tag in der Liste zeigt. Mehr sprengt die Zeile,
// der ganze Name steht im Tooltip.
const MARKE_ZEICHEN = 5;

function hellIst(farbe) {
  const treffer = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(farbe || '').trim());
  if (!treffer) return true;
  let hex = treffer[1];
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Wahrgenommene Helligkeit; darüber trägt der Badge dunkle Schrift.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

/** Korrespondent mit seinem Logo davor, sofern eines hinterlegt ist. */
function korrespondentZelle(dok) {
  const name = namen('correspondents', dok.correspondent);
  if (!dok.correspondent) return text(name);
  const url = korrespondentLogo(dok.correspondent);
  if (!url) return text(name);
  const huelle = document.createElement('span');
  huelle.className = 'mit-logo';
  const bild = document.createElement('img');
  bild.className = 'korrespondent-logo';
  bild.src = url;
  bild.alt = '';
  bild.loading = 'lazy';
  // Fehlt die Datei doch einmal, soll kein kaputtes Bild stehen bleiben.
  bild.addEventListener('error', () => bild.remove());
  const beschriftung = document.createElement('span');
  beschriftung.textContent = name;
  huelle.append(bild, beschriftung);
  return huelle;
}

export function markeChip(id, { voll = false, beiKlick = null, gewaehlt = false } = {}) {
  const tag = stamm.nachId.tags[String(id)];
  const name = tag ? (tag.name || String(id)) : '#' + id;
  const gekuerzt = !voll && name.length > MARKE_ZEICHEN;

  // Mit Klickwirkung ein Knopf – sonst wäre er weder mit der Tastatur
  // erreichbar noch für Vorleseprogramme als Bedienelement erkennbar.
  const chip = document.createElement(beiKlick ? 'button' : 'span');
  chip.className = 'marke-chip' + (beiKlick ? ' klickbar' : '') + (gewaehlt ? ' gewaehlt' : '');
  if (beiKlick) {
    chip.type = 'button';
    chip.addEventListener('click', (ereignis) => {
      ereignis.preventDefault();
      ereignis.stopPropagation();
      beiKlick(id, name);
    });
  }
  const symbol = tagSymbol(id);
  if (symbol && !symbolInhalt(symbol)) {
    // Der Satz ist noch nicht da: einmal holen, danach zeichnet die Liste
    // beim nächsten Aufbau mit Symbol.
    symboleLaden();
  }

  if (symbol && symbolInhalt(symbol)) {
    // Ein zugewiesenes Symbol tritt an die Stelle der Kurzform: in der
    // Tabelle steht es allein, in der Kartenansicht neben dem ganzen Namen.
    const kurz = document.createElement('span');
    kurz.className = 'marke-kurz marke-symbol';
    kurz.append(symbolSvg(symbol, 16));
    const lang = document.createElement('span');
    lang.className = 'marke-voll';
    lang.textContent = name;
    chip.append(kurz, lang);
    chip.setAttribute('aria-label', name);
  } else if (gekuerzt) {
    // Beide Formen stehen im Markup, das Stylesheet entscheidet: in der
    // Tabelle die Kurzform, in der Kartenansicht am Handy der ganze Name.
    // So stimmt es auch, wenn das Gerät gedreht wird.
    const kurz = document.createElement('span');
    kurz.className = 'marke-kurz';
    kurz.textContent = name.slice(0, MARKE_ZEICHEN);
    const lang = document.createElement('span');
    lang.className = 'marke-voll';
    lang.textContent = name;
    chip.append(kurz, lang);
    chip.setAttribute('aria-label', name);
  } else {
    chip.textContent = name;
  }
  // Popper übernimmt den Tooltip; ohne Popper bleibt der des Browsers.
  chip.dataset.tooltip = beiKlick
    ? name + (gewaehlt ? ' – Filter entfernen' : ' – nur diese anzeigen')
    : name;
  if (!popperDa()) chip.title = chip.dataset.tooltip;

  if (tag && tag.color) {
    chip.style.background = tag.color;
    chip.style.borderColor = tag.color;
    chip.style.color = tag.text_color || (hellIst(tag.color) ? '#1c2430' : '#ffffff');
  }
  return chip;
}

function marken(ids, kontext) {
  const huelle = document.createElement('span');
  huelle.className = 'marken';
  const beiKlick = kontext && kontext.beiTagKlick;
  const gewaehlt = (kontext && kontext.gewaehlteTags) || [];
  for (const id of ids || []) {
    huelle.append(markeChip(id, {
      beiKlick: beiKlick || null,
      gewaehlt: gewaehlt.includes(String(id)),
    }));
  }
  return huelle;
}

/** Das Kästchen mit dem Pfeil hinaus – der gewohnte Hinweis auf einen Link,
 *  der die Anwendung verlässt. */
function symbolExtern() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M9.5 2.5H13.5V6.5', 'M13.5 2.5L7.5 8.5',
                   'M12 9.5V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V4.5A.5.5 0 0 1 3 4h3.5']) {
    const pfad = document.createElementNS(ns, 'path');
    pfad.setAttribute('d', d);
    svg.append(pfad);
  }
  return svg;
}

/** Die Zelle ganz rechts: führt dieses Dokument in Paperless vor. */
function paperlessVerweis(dok, kontext) {
  const basis = kontext && kontext.paperlessBasis;
  if (!basis) return document.createTextNode('');
  const a = document.createElement('a');
  a.className = 'paperless-verweis';
  a.href = basis.replace(/\/$/, '') + '/documents/' + dok.id + '/details';
  a.target = '_blank';
  a.rel = 'noopener';
  a.dataset.tooltip = 'In Paperless öffnen';
  a.setAttribute('aria-label', 'In Paperless öffnen: ' + (dok.title || dok.id));
  a.append(symbolExtern());
  return a;
}

/** Knopf mit Auswahlmenü: welche Spalten die Tabelle zeigt.
 *
 *  Die Auswahl gehört zum Ordner und wird dort gespeichert; beiSpalten
 *  bekommt die neue Liste und kümmert sich darum. Ohne beiSpalten – etwa in
 *  den Suchergebnissen, die zu keinem Ordner gehören – erscheint der Knopf
 *  gar nicht.
 */
function spaltenknopf(aktuelle, beiSpalten) {
  const huelle = document.createElement('div');
  huelle.className = 'spaltenwahl';

  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'knopf klein';
  knopf.dataset.tooltip = 'Welche Spalten die Tabelle zeigt';
  knopf.append(spaltenSymbol(), document.createTextNode('Spalten'));

  const menue = document.createElement('div');
  menue.className = 'spaltenmenue';
  menue.hidden = true;

  const gewaehlt = new Set(aktuelle);
  for (const [schluessel, definition] of Object.entries(SPALTEN)) {
    const zeile = document.createElement('label');
    zeile.className = 'spaltenzeile';
    const haken = document.createElement('input');
    haken.type = 'checkbox';
    haken.checked = gewaehlt.has(schluessel);
    // Der Titel trägt den Verweis auf das Dokument – ohne ihn käme man aus
    // der Liste nicht mehr heraus.
    if (schluessel === 'title') {
      haken.checked = true;
      haken.disabled = true;
      zeile.dataset.tooltip = 'Der Titel bleibt immer sichtbar';
    }
    haken.addEventListener('change', () => {
      if (haken.checked) gewaehlt.add(schluessel); else gewaehlt.delete(schluessel);
      // In der Reihenfolge von SPALTEN, nicht in der des Anklickens.
      beiSpalten(Object.keys(SPALTEN).filter((k) => gewaehlt.has(k)));
    });
    const text = document.createElement('span');
    text.textContent = definition.name;
    zeile.append(haken, text);
    menue.append(zeile);
  }

  const zu = (ereignis) => {
    if (huelle.contains(ereignis.target)) return;
    menue.hidden = true;
    document.removeEventListener('click', zu);
  };
  knopf.addEventListener('click', (ereignis) => {
    ereignis.stopPropagation();
    menue.hidden = !menue.hidden;
    if (!menue.hidden) setTimeout(() => document.addEventListener('click', zu), 0);
  });

  huelle.append(knopf, menue);
  return huelle;
}

function spaltenSymbol() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M2.5 2.5h11v11h-11z', 'M6.5 2.5v11', 'M10.5 2.5v11']) {
    const pfad = document.createElementNS(ns, 'path');
    pfad.setAttribute('d', d);
    svg.append(pfad);
  }
  return svg;
}

export function listeZeichnen(ergebnis, spalten, optionen = {}) {
  const { beiSortierung, beiSeite, darstellung, beiTagKlick, gewaehlteTags,
          suchfeld, paperlessBasis, beiSpalten } = optionen;
  const kontext = { beiTagKlick, gewaehlteTags, paperlessBasis };
  const huelle = document.createElement('div');

  // Kopfleiste über der Liste: Suchfeld links, Blättern rechts. Sie steht
  // auch dann, wenn nichts gefunden wurde – sonst könnte man den Suchbegriff
  // nicht mehr ändern.
  const kopfleiste = document.createElement('div');
  kopfleiste.className = 'listenleiste';
  if (suchfeld) kopfleiste.append(suchfeld);
  if (beiSpalten) kopfleiste.append(spaltenknopf(spalten, beiSpalten));
  if (ergebnis.pages > 1 && beiSeite) kopfleiste.append(blaettern(ergebnis, beiSeite, true));
  if (kopfleiste.children.length) huelle.append(kopfleiste);

  if (!ergebnis.results.length) {
    const leer = document.createElement('div');
    leer.className = 'karte leer';
    leer.textContent = ergebnis.count === 0
      ? 'Keine Dokumente in diesem Ordner.'
      : 'Auf dieser Seite keine Dokumente.';
    huelle.append(leer);
    return huelle;
  }

  // Sortierung als Auswahlfeld: am Handy der einzige Weg, weil der
  // Tabellenkopf dort ausgeblendet ist. Auf breiten Schirmen versteckt es das
  // Stylesheet, dort sortiert man über die Spaltenköpfe.
  if (beiSortierung) huelle.append(sortierwahl(ergebnis, beiSortierung));

  if (darstellung === 'kacheln') {
    const gitter = document.createElement('div');
    gitter.className = 'kacheln';
    for (const dok of ergebnis.results) {
      const kachel = document.createElement('a');
      kachel.className = 'karte kachel';
      kachel.href = '#/dok/' + dok.id;
      const bild = document.createElement('img');
      bild.loading = 'lazy';
      bild.src = api.bildUrl(dok.id);
      bild.alt = '';
      const beschriftung = document.createElement('div');
      beschriftung.className = 'text';
      beschriftung.textContent = dok.title || '(ohne Titel)';
      kachel.append(bild, beschriftung);
      gitter.append(kachel);
    }
    huelle.append(gitter);
  } else {
    const rahmen = document.createElement('div');
    rahmen.className = 'karte tabellenrahmen';
    const tabelle = document.createElement('table');
    tabelle.className = 'liste';

    const kopf = document.createElement('thead');
    const kopfzeile = document.createElement('tr');
    for (const schluessel of spalten) {
      const definition = SPALTEN[schluessel];
      if (!definition) continue;
      const zelle = document.createElement('th');
      if (definition.klasse) zelle.className = definition.klasse;
      const feld = SORTIERBAR[schluessel];
      if (feld && beiSortierung) {
        const aktiv = (ergebnis.ordering || '').replace('-', '') === feld;
        const absteigend = (ergebnis.ordering || '').startsWith('-');
        const knopf = document.createElement('button');
        knopf.type = 'button';
        knopf.className = 'sortierknopf' + (aktiv ? ' aktiv' : '');
        const beschriftung = document.createElement('span');
        beschriftung.textContent = definition.name;
        const zeiger = document.createElement('span');
        zeiger.className = 'sortierpfeil';
        // Aktive Spalte: wohin es gerade sortiert. Sonst blass, was ein Klick
        // täte - erst damit ist überhaupt zu sehen, dass man klicken kann.
        zeiger.textContent = aktiv ? (absteigend ? '↓' : '↑') : '↕';
        knopf.append(beschriftung, zeiger);
        knopf.dataset.tooltip = aktiv
          ? (absteigend ? 'Absteigend sortiert – klicken für aufsteigend'
                        : 'Aufsteigend sortiert – klicken für absteigend')
          : 'Nach ' + definition.name + ' sortieren';
        knopf.addEventListener('click', () => {
          beiSortierung(aktiv && !absteigend ? '-' + feld : feld);
        });
        zelle.append(knopf);
      } else {
        zelle.textContent = definition.name;
        if (schluessel === 'tags') {
          // Paperless kann nicht nach Tags sortieren (ordering_fields kennt
          // das Feld nicht). Lieber sagen als einen Knopf anbieten, der nichts tut.
          zelle.dataset.tooltip = 'Paperless kann nicht nach Tags sortieren';
          zelle.classList.add('nicht-sortierbar');
        }
      }
      kopfzeile.append(zelle);
    }
    // Die Verweisspalte hängt fest am rechten Rand und steht nicht zur
    // Auswahl: sie zeigt keine Daten, sondern führt aus PaperTree hinaus.
    if (paperlessBasis) {
      const zelle = document.createElement('th');
      zelle.className = 'verweisspalte';
      const verborgen = document.createElement('span');
      verborgen.className = 'nur-vorlesen';
      verborgen.textContent = 'In Paperless öffnen';
      zelle.append(verborgen);
      kopfzeile.append(zelle);
    }
    kopf.append(kopfzeile);
    tabelle.append(kopf);

    const koerper = document.createElement('tbody');
    for (const dok of ergebnis.results) {
      const zeile = document.createElement('tr');
      for (const schluessel of spalten) {
        const definition = SPALTEN[schluessel];
        if (!definition) continue;
        const zelle = document.createElement('td');
        zelle.className = [schluessel === 'title' ? 'titel' : '', definition.klasse || '']
          .filter(Boolean).join(' ');
        zelle.append(definition.zeichne(dok, kontext));
        zeile.append(zelle);
      }
      if (paperlessBasis) {
        const zelle = document.createElement('td');
        zelle.className = 'verweisspalte';
        zelle.append(paperlessVerweis(dok, kontext));
        zeile.append(zelle);
      }
      koerper.append(zeile);
    }
    tabelle.append(koerper);
    rahmen.append(tabelle);
    huelle.append(rahmen);
  }

  if (ergebnis.pages > 1 && beiSeite) {
    huelle.append(blaettern(ergebnis, beiSeite));
  }
  return huelle;
}

function sortierwahl(ergebnis, beiSortierung) {
  const leiste = document.createElement('div');
  leiste.className = 'sortierwahl';

  const beschriftung = document.createElement('label');
  beschriftung.className = 'hinweis';
  beschriftung.textContent = 'Sortierung';
  beschriftung.setAttribute('for', 'sortierwahl-feld');

  const feld = document.createElement('select');
  feld.id = 'sortierwahl-feld';
  const aktuell = ergebnis.ordering || '';
  for (const [wert, name] of SORTIERUNGEN) {
    const option = document.createElement('option');
    option.value = wert;
    option.textContent = name;
    feld.append(option);
  }
  // Eine Sortierung, die nicht in der Liste steht (etwa nach einem
  // Zusatzfeld), wird als eigener Eintrag ergänzt, damit sie sichtbar bleibt.
  if (aktuell && !SORTIERUNGEN.some(([w]) => w === aktuell)) {
    const option = document.createElement('option');
    option.value = aktuell;
    option.textContent = aktuell;
    feld.append(option);
  }
  feld.value = aktuell;
  feld.addEventListener('change', () => beiSortierung(feld.value));

  leiste.append(beschriftung, feld);
  return leiste;
}

function blattknopf(richtung, beschreibung) {
  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'knopf blatt';
  knopf.setAttribute('aria-label', beschreibung);
  knopf.dataset.tooltip = beschreibung;
  knopf.innerHTML =
    '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" '
    + 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '
    + 'stroke-linejoin="round" aria-hidden="true"><path d="'
    + (richtung === 'links' ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5')
    + '"/></svg>';
  return knopf;
}

function blaettern(ergebnis, beiSeite, oben = false) {
  const leiste = document.createElement('div');
  leiste.className = 'blaettern' + (oben ? ' oben' : '');

  // Nur Zeichen, kein Wort – aber als gezeichnetes Symbol, nicht als
  // Schriftzeichen. Der Sinn steckt im aria-label und im Tooltip.
  const zurueck = blattknopf('links', 'Vorherige Seite');
  zurueck.disabled = ergebnis.page <= 1;
  zurueck.addEventListener('click', () => beiSeite(ergebnis.page - 1));

  const stand = document.createElement('span');
  stand.textContent = 'Seite ' + ergebnis.page + ' von ' + ergebnis.pages;

  const vor = blattknopf('rechts', 'Nächste Seite');
  vor.disabled = ergebnis.page >= ergebnis.pages;
  vor.addEventListener('click', () => beiSeite(ergebnis.page + 1));

  leiste.append(zurueck, stand, vor);
  return leiste;
}
