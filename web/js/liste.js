// Dokumentliste und Blättern (F5.1), für Ordner wie für Suchergebnisse.
import { api } from './api.js';
import { stamm } from './stamm.js';
import { popperDa } from './tooltip.js';
import { korrespondentLogo, tagSymbol } from './darstellung.js';
import { symbolInhalt, symboleLaden, symbolSvg } from './symbole.js';
import { datum, t, zahlText } from './sprache.js';

// In den Tabellen steht nicht die Beschriftung, sondern ihr Schlüssel: die
// Spaltenliste entsteht beim Laden des Moduls, die Sprache erst danach.
export const SPALTEN = {
  title: { beschriftung: 'liste.spalte.titel', zeichne: (dok, kontext) => dokumentZelle(dok, kontext) },
  // Der Korrespondent hat keine eigene Spalte mehr: er steht unter dem Titel.
  // In der Spaltenwahl bleibt er, denn dort entscheidet sich, ob er überhaupt
  // erscheint - deshalb nur ein Schalter, keine Spalte.
  correspondent: { beschriftung: 'liste.spalte.korrespondent', nurSchalter: true },
  document_type: { beschriftung: 'liste.spalte.typ', zeichne: (dok) => text(namen('document_types', dok.document_type)) },
  storage_path: { beschriftung: 'liste.spalte.speicherpfad', zeichne: (dok) => text(namen('storage_paths', dok.storage_path)) },
  tags: { beschriftung: 'liste.spalte.tags', zeichne: (dok, kontext) => marken(dok.tags, kontext) },
  created: { beschriftung: 'liste.spalte.erstellt', klasse: 'datum', zeichne: (dok) => text(datum(dok.created_date || dok.created)) },
  added: { beschriftung: 'liste.spalte.hinzugefuegt', klasse: 'datum', zeichne: (dok) => text(datum(dok.added)) },
  page_count: { beschriftung: 'liste.spalte.seiten', klasse: 'datum', zeichne: (dok) => text(dok.page_count) },
  archive_serial_number: { beschriftung: 'liste.spalte.archivnr', klasse: 'datum', zeichne: (dok) => text(dok.archive_serial_number) },
};


// Eine Liste für beide Stellen, die sortieren lassen: das Auswahlfeld über
// der Liste und der Ordner-Editor. Der dritte Eintrag nennt die Spalte, zu
// der die Sortierung gehört - in der Liste erscheint nur, wonach man dort
// auch etwas sieht. Null heisst: an keine Spalte gebunden, nur im Editor.
export const SORTIERUNGEN = [
  ['-created', 'sortierung.erstelltNeu', 'created'],
  ['created', 'sortierung.erstelltAlt', 'created'],
  ['-added', 'sortierung.hinzugefuegtNeu', 'added'],
  ['added', 'sortierung.hinzugefuegtAlt', 'added'],
  ['title', 'sortierung.titelAuf', 'title'],
  ['-title', 'sortierung.titelAb', 'title'],
  ['correspondent__name', 'sortierung.korrespondentAuf', 'correspondent'],
  ['-correspondent__name', 'sortierung.korrespondentAb', 'correspondent'],
  ['document_type__name', 'sortierung.typAuf', 'document_type'],
  ['storage_path__name', 'sortierung.speicherpfadAuf', 'storage_path'],
  ['-modified', 'sortierung.geaendertNeu', null],
  ['-page_count', 'sortierung.seitenAb', 'page_count'],
  ['page_count', 'sortierung.seitenAuf', 'page_count'],
  ['archive_serial_number', 'sortierung.archivnummer', 'archive_serial_number'],
  ['id', 'sortierung.kennung', null],
];

function namen(art, id) {
  if (id == null) return '';
  const eintrag = stamm.nachId[art] && stamm.nachId[art][String(id)];
  return eintrag ? eintrag.name : '#' + id;
}

function text(wert) {
  const knoten = document.createElement('span');
  knoten.textContent = wert == null ? '' : String(wert);
  return knoten;
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

/** Das Blatt, das für ein Dokument ohne Korrespondentenlogo einsteht. */
function blattSymbol() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
                   'M14 3v5h5', 'M9 13h6', 'M9 17h4']) {
    const pfad = document.createElementNS(ns, 'path');
    pfad.setAttribute('d', d);
    svg.append(pfad);
  }
  return svg;
}

/**
 * Die erste Spalte: das Zeichen des Korrespondenten, daneben der Titel und
 * darunter der Korrespondent.
 *
 * Titel und Korrespondent gehören zusammen - getrennt in zwei Spalten war die
 * Zeile breiter, ohne mehr zu sagen. Ist der Korrespondent in der Spaltenwahl
 * abgeschaltet, bleibt nur der Titel stehen.
 */
function dokumentZelle(dok, kontext) {
  const huelle = document.createElement('div');
  huelle.className = 'dok-zelle';

  const marke = document.createElement('span');
  marke.className = 'dok-marke';
  const url = dok.correspondent ? korrespondentLogo(dok.correspondent) : '';
  if (url) {
    const bild = document.createElement('img');
    bild.src = url;
    bild.alt = '';
    bild.loading = 'lazy';
    // Fehlt die Datei doch einmal, tritt das Blatt an ihre Stelle.
    bild.addEventListener('error', () => {
      bild.remove();
      marke.append(blattSymbol());
    });
    marke.append(bild);
  } else {
    marke.append(blattSymbol());
  }

  const spalte = document.createElement('span');
  spalte.className = 'dok-text';
  const a = document.createElement('a');
  a.className = 'dok-titel';
  a.href = '#/dok/' + dok.id;
  a.textContent = dok.title || t('liste.ohneTitel');
  spalte.append(a);

  if (kontext && kontext.mitKorrespondent && dok.correspondent) {
    const wer = document.createElement('span');
    wer.className = 'dok-korrespondent';
    wer.textContent = namen('correspondents', dok.correspondent);
    spalte.append(wer);
  }

  huelle.append(marke, spalte);
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
    ? t(gewaehlt ? 'liste.tagFilterAus' : 'liste.tagNurDiese', { name })
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
  a.dataset.tooltip = t('allgemein.inPaperless');
  a.setAttribute('aria-label',
    t('liste.inPaperlessDok', { titel: dok.title || dok.id }));
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
  knopf.dataset.tooltip = t('liste.spaltenTitel');
  knopf.append(spaltenSymbol(), document.createTextNode(t('liste.spalten')));

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
      zeile.dataset.tooltip = t('liste.titelBleibt');
    }
    haken.addEventListener('change', () => {
      if (haken.checked) gewaehlt.add(schluessel); else gewaehlt.delete(schluessel);
      // In der Reihenfolge von SPALTEN, nicht in der des Anklickens.
      beiSpalten(Object.keys(SPALTEN).filter((k) => gewaehlt.has(k)));
    });
    const text = document.createElement('span');
    text.textContent = t(definition.beschriftung);
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
  // Der Korrespondent ist keine eigene Spalte mehr, sondern ein Schalter für
  // die zweite Zeile unter dem Titel.
  const mitKorrespondent = spalten.includes('correspondent');
  const tabellenspalten = spalten.filter((s) => SPALTEN[s] && !SPALTEN[s].nurSchalter);
  const kontext = { beiTagKlick, gewaehlteTags, paperlessBasis, mitKorrespondent };
  const huelle = document.createElement('div');

  // Kopfleiste über der Liste: Suchfeld links, Blättern rechts. Sie steht
  // auch dann, wenn nichts gefunden wurde – sonst könnte man den Suchbegriff
  // nicht mehr ändern.
  const kopfleiste = document.createElement('div');
  kopfleiste.className = 'listenleiste';
  if (suchfeld) kopfleiste.append(suchfeld);
  // Sortiert wird hier, nicht mehr über die Spaltenköpfe: dort war es am
  // Handy gar nicht erreichbar, und eine Spalte wie die Tags kann Paperless
  // ohnehin nicht sortieren.
  if (beiSortierung) kopfleiste.append(sortierwahl(ergebnis, beiSortierung, spalten));
  if (beiSpalten) kopfleiste.append(spaltenknopf(spalten, beiSpalten));
  if (ergebnis.pages > 1 && beiSeite) kopfleiste.append(blaettern(ergebnis, beiSeite, true));
  if (kopfleiste.children.length) huelle.append(kopfleiste);

  if (!ergebnis.results.length) {
    const leer = document.createElement('div');
    leer.className = 'karte leer';
    leer.textContent = t(ergebnis.count === 0
      ? 'liste.leerOrdner' : 'liste.leerSeite');
    huelle.append(leer);
    return huelle;
  }

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
      beschriftung.textContent = dok.title || t('liste.ohneTitel');
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
    for (const schluessel of tabellenspalten) {
      const definition = SPALTEN[schluessel];
      const zelle = document.createElement('th');
      if (definition.klasse) zelle.className = definition.klasse;
      // Die erste Spalte trägt beides, sofern der Korrespondent eingeschaltet ist.
      zelle.textContent = (schluessel === 'title' && mitKorrespondent)
        ? t('liste.spalte.titelKorrespondent')
        : t(definition.beschriftung);
      kopfzeile.append(zelle);
    }
    // Die Verweisspalte hängt fest am rechten Rand und steht nicht zur
    // Auswahl: sie zeigt keine Daten, sondern führt aus PaperTree hinaus.
    if (paperlessBasis) {
      const zelle = document.createElement('th');
      zelle.className = 'verweisspalte';
      const verborgen = document.createElement('span');
      verborgen.className = 'nur-vorlesen';
      verborgen.textContent = t('allgemein.inPaperless');
      zelle.append(verborgen);
      kopfzeile.append(zelle);
    }
    kopf.append(kopfzeile);
    tabelle.append(kopf);

    const koerper = document.createElement('tbody');
    for (const dok of ergebnis.results) {
      const zeile = document.createElement('tr');
      for (const schluessel of tabellenspalten) {
        const definition = SPALTEN[schluessel];
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

function sortierwahl(ergebnis, beiSortierung, spalten) {
  const leiste = document.createElement('div');
  leiste.className = 'sortierwahl';

  const beschriftung = document.createElement('label');
  beschriftung.className = 'hinweis';
  beschriftung.textContent = t('liste.sortierung');
  beschriftung.setAttribute('for', 'sortierwahl-feld');

  const feld = document.createElement('select');
  feld.id = 'sortierwahl-feld';
  const aktuell = ergebnis.ordering || '';
  // Angeboten wird, was zu einer sichtbaren Spalte gehört: wonach man nichts
  // sieht, will man auch nicht sortieren.
  const moeglich = SORTIERUNGEN.filter(
    ([wert, , spalte]) => wert === aktuell || (spalte && spalten.includes(spalte)));
  for (const [wert, schluessel] of moeglich) {
    const option = document.createElement('option');
    option.value = wert;
    option.textContent = t(schluessel);
    feld.append(option);
  }
  // Eine Sortierung, die nicht in der Liste steht (etwa nach einem
  // Zusatzfeld), wird als eigener Eintrag ergänzt, damit sie sichtbar bleibt.
  if (aktuell && !moeglich.some(([w]) => w === aktuell)) {
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
  const zurueck = blattknopf('links', t('liste.vorherige'));
  zurueck.disabled = ergebnis.page <= 1;
  zurueck.addEventListener('click', () => beiSeite(ergebnis.page - 1));

  const stand = document.createElement('span');
  stand.textContent = t('liste.seiteVon', {
    seite: zahlText(ergebnis.page), von: zahlText(ergebnis.pages) });

  const vor = blattknopf('rechts', t('liste.naechste'));
  vor.disabled = ergebnis.page >= ergebnis.pages;
  vor.addEventListener('click', () => beiSeite(ergebnis.page + 1));

  leiste.append(zurueck, stand, vor);
  return leiste;
}
