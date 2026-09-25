// Der Ordner-Editor (F1.2, F1.4, F1.5, F1.6, F2, F3).
import { api } from './api.js';
import { stamm } from './stamm.js';
import { baum, kinderVon } from './baum.js';
import { alleArten, artFinden, ausFilter, beschreibe, nachFilter } from './kriterien.js';
import { SORTIERUNGEN } from './liste.js';
import { symbolInhalt, symboleLaden, symbolSvg } from './symbole.js';
import { symbolWaehlen } from './symbolwahl.js';
import { t, tn, zahlText } from './sprache.js';

const d = (id) => document.getElementById(id);
let zustand = null;
let vorschauZeitgeber = null;

export function editorVorbereiten(beiAenderung) {
  const dialog = d('editor');

  d('e-abbrechen').addEventListener('click', () => dialog.close());
  d('e-schliessen').addEventListener('click', () => dialog.close());

  d('e-symbol').addEventListener('click', () => {
    // Der Name kommt aus dem Feld, nicht aus dem gespeicherten Knoten: bei
    // einem neuen Ordner steht dort schon etwas, im Knoten noch nichts.
    const ordnername = d('e-name').value.trim() || zustand.knoten.name || '';
    symbolWaehlen(zustand.knoten.symbol || '', (name) => {
      zustand.knoten.symbol = name;
      symbolknopfZeichnen();
    }, { name: ordnername || t('editor.dieserOrdner'), art: t('art.ordner') });
  });
  d('editor-form').addEventListener('submit', (ereignis) => ereignis.preventDefault());

  d('e-speichern').addEventListener('click', async () => {
    try {
      await speichern();
      dialog.close();
      beiAenderung && beiAenderung(zustand.knoten.id || null);
    } catch (fehler) {
      meldung(fehler.message || t('fehler.speichern'), true);
    }
  });

  d('e-loeschen').addEventListener('click', async () => {
    if (!zustand || !zustand.knoten.id) return;
    const wieViele = zustand.kinderZahl;
    const frage = wieViele
      ? tn('menue.loeschenMitKindern', wieViele, { name: zustand.knoten.name })
      : t('menue.loeschenFrage', { name: zustand.knoten.name });
    if (!confirm(frage)) return;
    const zurueck = zustand.knoten.eltern_id || null;
    await api.ordnerLoeschen(zustand.knoten.id);
    dialog.close();
    // Zum übergeordneten Ordner: die Ansicht, die gerade offen war, gibt es
    // nicht mehr. Bei einem Reiter ist das immer der Fall - er wird aus
    // seiner eigenen Ansicht heraus gelöscht.
    beiAenderung && beiAenderung(zurueck);
  });

  for (const id of ['e-eigener', 'e-kinder', 'e-tief']) {
    d(id).addEventListener('change', () => { modusZeigen(); vorschauAnstossen(); });
  }
  d('e-eigenstaendig').addEventListener('change', () => { geerbtZeigen(); vorschauAnstossen(); });

  d('e-eltern').addEventListener('change', async () => {
    const ziel = d('e-eltern').value;
    zustand.knoten.eltern_id = ziel ? Number(ziel) : null;
    zustand.geerbt = [];
    if (ziel) {
      try {
        const ergebnis = await api.effektiv(Number(ziel));
        zustand.geerbt = ergebnis.fuer_kind || [];
      } catch (_) { /* dann ohne Anzeige */ }
    }
    geerbtZeigen();
    vorschauAnstossen();
  });

  d('e-neues-kriterium').addEventListener('change', (ereignis) => {
    const art = ereignis.target.value;
    ereignis.target.value = '';
    if (!art) return;
    const definition = artFinden(art);
    if (!definition) return;
    zustand.kriterien.push({
      art,
      op: definition.ops[0].op,
      wert: definition.typ === 'mehrfach' || definition.typ === 'optionen' ? []
        : definition.typ === 'jaNein' ? true : '',
    });
    kriterienZeichnen();
    vorschauAnstossen();
  });

  d('e-link-holen').addEventListener('click', async () => {
    const feld = d('e-link');
    if (!feld.value.trim()) return;
    try {
      const ergebnis = await api.ausLink(feld.value.trim());
      const anzahl = Object.keys(ergebnis.filter || {}).length;
      if (!anzahl) {
        d('e-link-meldung').textContent = t('editor.linkOhneFilter');
        return;
      }
      const gelesen = ausFilter(ergebnis.filter);
      zustand.kriterien = gelesen.kriterien;
      zustand.roh = gelesen.roh;
      d('e-eigener').checked = true;
      if (ergebnis.sortierung) d('e-sortierung').value = ergebnis.sortierung;
      const verworfen = (ergebnis.verworfen || []).length
        ? ' ' + t('import.verworfen', { was: ergebnis.verworfen.join(', ') })
        : '';
      d('e-link-meldung').textContent = tn('editor.linkUebernommen', anzahl) + verworfen;
      feld.value = '';
      modusZeigen();
      kriterienZeichnen();
      vorschauAnstossen();
    } catch (fehler) {
      d('e-link-meldung').textContent = t('editor.linkUnlesbar');
    }
  });
}

export async function editorOeffnen({ knoten, elternId, geerbt, kinderZahl, alsReiter }) {
  zustand = {
    knoten: knoten ? { ...knoten } : {
      id: null, name: '', eltern_id: elternId || null,
      eigener_filter: false, filter: {}, kinder_einbeziehen: false,
      kinder_tief: true, eigenstaendig: false, sortierung: '-created',
      darstellung: 'liste', spalten: [], seitengroesse: 50, auf_dashboard: false,
      // Über "+ Reiter" angelegt: der Schalter steht dann schon richtig.
      als_reiter: !!alsReiter,
    },
    geerbt: geerbt || [],
    kinderZahl: kinderZahl || 0,
    kriterien: [],
    roh: {},
  };
  const gelesen = ausFilter(zustand.knoten.filter || {});
  zustand.kriterien = gelesen.kriterien;
  zustand.roh = gelesen.roh;

  // Der Name gehört in den Titel: bei mehreren gleich aufgebauten Ordnern
  // ist sonst nicht zu sehen, welchen man gerade offen hat.
  d('editor-titel').textContent = zustand.knoten.id
    ? t('editor.titelBearbeiten', { name: zustand.knoten.name || t('editor.ohneNamen') })
    : t('editor.titelNeu');
  d('e-name').value = zustand.knoten.name || '';
  symbolknopfZeichnen();
  d('e-eigener').checked = !!zustand.knoten.eigener_filter;
  d('e-kinder').checked = !!zustand.knoten.kinder_einbeziehen;
  d('e-tief').checked = zustand.knoten.kinder_tief !== false;
  d('e-eigenstaendig').checked = !!zustand.knoten.eigenstaendig;
  d('e-seitengroesse').value = zustand.knoten.seitengroesse || 50;
  d('e-dashboard').checked = !!zustand.knoten.auf_dashboard;
  d('e-reiter').checked = !!zustand.knoten.als_reiter;
  d('e-loeschen').style.display = zustand.knoten.id ? '' : 'none';
  d('e-link').value = '';
  d('e-link-meldung').textContent = '';

  sortierungFuellen(zustand.knoten.sortierung || '-created');
  gruppierungFuellen(zustand.knoten.gruppieren_nach || '');
  elternFuellen();
  artenFuellen();
  geerbtZeigen();
  modusZeigen();
  kriterienZeichnen();
  d('editor').showModal();
  d('e-name').focus();
  vorschauAnstossen();
}

// --- Bausteine ---------------------------------------------------------------
function sortierungFuellen(gewaehlt) {
  const feld = d('e-sortierung');
  feld.innerHTML = '';
  const eintraege = [...SORTIERUNGEN];
  for (const zf of stamm.custom_fields || []) {
    eintraege.push(['custom_field_' + zf.id, t('editor.sortZusatzfeld', { name: zf.name })]);
    eintraege.push(['-custom_field_' + zf.id,
                    t('editor.sortZusatzfeldAb', { name: zf.name })]);
  }
  for (const [wert, name] of eintraege) {
    const option = document.createElement('option');
    option.value = wert;
    // Die festen Sortierungen tragen einen Schlüssel, die Zusatzfelder
    // ihren fertigen Namen - t() gibt Unbekanntes unverändert zurück.
    option.textContent = name.startsWith('sortierung.') ? t(name) : name;
    feld.append(option);
  }
  feld.value = gewaehlt;
  if (feld.value !== gewaehlt) {
    const eigen = document.createElement('option');
    eigen.value = gewaehlt;
    eigen.textContent = gewaehlt;
    feld.append(eigen);
    feld.value = gewaehlt;
  }
}

// Dynamische Unterknoten (F4): die Dimensionen, nach denen aufgespannt
// werden kann. Zusatzfelder kommen aus den Stammdaten dazu.
const GRUPPIERUNGEN = [
  ['', 'gruppierung.keine'],
  ['created_year', 'gruppierung.jahrErstellt'],
  ['added_year', 'gruppierung.jahrHinzugefuegt'],
  ['correspondent', 'art.korrespondent'],
  ['document_type', 'art.dokumenttyp'],
  ['tag', 'art.tag'],
  ['storage_path', 'art.speicherpfad'],
];

function gruppierungFuellen(gewaehlt) {
  const feld = d('e-gruppieren');
  feld.innerHTML = '';
  for (const [wert, schluessel] of GRUPPIERUNGEN) {
    const option = document.createElement('option');
    option.value = wert;
    option.textContent = t(schluessel);
    feld.append(option);
  }
  const auswahlfelder = (stamm.custom_fields || []).filter(
    (zf) => ['select', 'string', 'integer', 'boolean', 'url'].includes(zf.data_type),
  );
  if (auswahlfelder.length) {
    const bereich = document.createElement('optgroup');
    bereich.label = t('art.zusatzfelder');
    for (const zf of auswahlfelder) {
      const option = document.createElement('option');
      option.value = 'cf:' + zf.id;
      option.textContent = zf.name;
      bereich.append(option);
    }
    feld.append(bereich);
  }
  feld.value = gewaehlt;
  if (feld.value !== gewaehlt) feld.value = '';
}

function elternFuellen() {
  const feld = d('e-eltern');
  feld.innerHTML = '';
  const oben = document.createElement('option');
  oben.value = '';
  oben.textContent = t('editor.obersteEbene');
  feld.append(oben);

  // Ein Ordner darf nicht unter sich selbst liegen.
  const verboten = new Set();
  if (zustand.knoten.id) {
    const sammle = (id) => {
      verboten.add(id);
      for (const kind of kinderVon(id)) sammle(kind.id);
    };
    sammle(zustand.knoten.id);
  }

  const einruecken = (elternId, tiefe) => {
    for (const knoten of kinderVon(elternId)) {
      if (verboten.has(knoten.id)) continue;
      const option = document.createElement('option');
      option.value = String(knoten.id);
      option.textContent = ' '.repeat(tiefe * 3) + knoten.name;
      feld.append(option);
      einruecken(knoten.id, tiefe + 1);
    }
  };
  if (baum.geladen) einruecken(null, 0);

  feld.value = zustand.knoten.eltern_id ? String(zustand.knoten.eltern_id) : '';
}

function artenFuellen() {
  const feld = d('e-neues-kriterium');
  feld.innerHTML = '';
  const leer = document.createElement('option');
  leer.value = '';
  leer.textContent = t('editor.kriteriumNeu');
  feld.append(leer);
  const gruppen = new Map();
  for (const definition of alleArten()) {
    const gruppe = definition.gruppe || 'art.dokumentfelder';
    if (!gruppen.has(gruppe)) gruppen.set(gruppe, []);
    gruppen.get(gruppe).push(definition);
  }
  for (const [name, liste] of gruppen) {
    const bereich = document.createElement('optgroup');
    bereich.label = t(name);
    for (const definition of liste) {
      const option = document.createElement('option');
      option.value = definition.art;
      option.textContent = t(definition.name);
      bereich.append(option);
    }
    feld.append(bereich);
  }
}

function modusZeigen() {
  const eigener = d('e-eigener').checked;
  const kinder = d('e-kinder').checked;
  d('e-tief-zeile').style.display = kinder ? '' : 'none';
  d('e-filterteil').style.display = eigener ? '' : 'none';
  let schluessel;
  if (!eigener && !kinder) schluessel = 'editor.modusNavigation';
  else if (!eigener && kinder) schluessel = 'editor.modusKinder';
  else if (eigener && !kinder) schluessel = 'editor.modusEigener';
  else schluessel = 'editor.modusBeides';
  d('e-modus').textContent = t(schluessel);
}

function geerbtZeigen() {
  const kasten = d('e-geerbt');
  const eigenstaendig = d('e-eigenstaendig').checked;
  if (!zustand.geerbt.length) {
    kasten.textContent = t('editor.keinGeerbter');
    return;
  }
  const worte = zustand.geerbt.map((satz) => beschreibe(satz)).filter(Boolean).join(' · ');
  kasten.innerHTML = eigenstaendig
    ? '<s>' + escape(t('editor.geerbt') + ' ' + worte) + '</s> '
      + escape(t('editor.geerbtAus'))
    : '<strong>' + escape(t('editor.geerbt')) + '</strong> ' + escape(worte);
}

function kriterienZeichnen() {
  const behaelter = d('e-kriterien');
  behaelter.innerHTML = '';

  zustand.kriterien.forEach((kriterium, stelle) => {
    const definition = artFinden(kriterium.art);
    if (!definition) return;
    const zeile = document.createElement('div');
    zeile.className = 'kriterium';

    const feldName = document.createElement('span');
    feldName.textContent = t(definition.name);
    zeile.append(feldName);

    const opFeld = document.createElement('select');
    for (const op of definition.ops) {
      const option = document.createElement('option');
      option.value = op.op;
      option.textContent = t(op.name);
      opFeld.append(option);
    }
    opFeld.value = kriterium.op;
    opFeld.addEventListener('change', () => {
      kriterium.op = opFeld.value;
      if (kriterium.op === 'range' && !Array.isArray(kriterium.wert)) kriterium.wert = ['', ''];
      kriterienZeichnen();
      vorschauAnstossen();
    });
    zeile.append(opFeld);

    zeile.append(wertFeld(definition, kriterium));

    const weg = document.createElement('button');
    weg.type = 'button';
    weg.className = 'weg';
    weg.title = t('editor.kriteriumWeg');
    weg.textContent = '×';
    weg.addEventListener('click', () => {
      zustand.kriterien.splice(stelle, 1);
      kriterienZeichnen();
      vorschauAnstossen();
    });
    zeile.append(weg);

    behaelter.append(zeile);
  });

  for (const [param, wert] of Object.entries(zustand.roh)) {
    const zeile = document.createElement('div');
    zeile.className = 'kriterium';
    const name = document.createElement('span');
    name.textContent = param;
    const anzeige = document.createElement('input');
    anzeige.type = 'text';
    anzeige.value = wert;
    anzeige.readOnly = true;
    anzeige.title = t('editor.rohHinweis');
    const weg = document.createElement('button');
    weg.type = 'button';
    weg.className = 'weg';
    weg.textContent = '×';
    weg.addEventListener('click', () => {
      delete zustand.roh[param];
      kriterienZeichnen();
      vorschauAnstossen();
    });
    zeile.append(name, document.createElement('span'), anzeige, weg);
    behaelter.append(zeile);
  }

  if (!zustand.kriterien.length && !Object.keys(zustand.roh).length) {
    const leer = document.createElement('p');
    leer.className = 'hinweis';
    leer.textContent = t('editor.keinKriterium');
    behaelter.append(leer);
  }
}

function wertFeld(definition, kriterium) {
  if (kriterium.op === 'exists' || definition.typ === 'jaNein') {
    const feld = document.createElement('select');
    for (const [wert, schluessel] of [['true', 'allgemein.ja'], ['false', 'allgemein.nein']]) {
      const option = document.createElement('option');
      option.value = wert;
      option.textContent = t(schluessel);
      feld.append(option);
    }
    feld.value = kriterium.wert ? 'true' : 'false';
    feld.addEventListener('change', () => {
      kriterium.wert = feld.value === 'true';
      vorschauAnstossen();
    });
    return feld;
  }

  if (definition.typ === 'mehrfach' || definition.typ === 'optionen') {
    const feld = document.createElement('select');
    feld.multiple = true;
    feld.className = 'mehrfach';
    const liste = definition.typ === 'optionen'
      ? (definition.optionen || []).map((o) => [o.id, o.label])
      : (stamm[definition.quelle] || []).map((e) => [e.id, e.name]);
    const gewaehlt = (kriterium.wert || []).map(String);
    for (const [wert, name] of liste) {
      const option = document.createElement('option');
      option.value = wert;
      option.textContent = name;
      option.selected = gewaehlt.includes(String(wert));
      feld.append(option);
    }
    feld.addEventListener('change', () => {
      kriterium.wert = [...feld.selectedOptions].map((o) => o.value);
      vorschauAnstossen();
    });
    return feld;
  }

  if (kriterium.op === 'range') {
    const huelle = document.createElement('span');
    huelle.style.display = 'flex';
    huelle.style.gap = '6px';
    const werte = Array.isArray(kriterium.wert) ? kriterium.wert : ['', ''];
    [0, 1].forEach((n) => {
      const feld = document.createElement('input');
      feld.type = definition.typ === 'datum' ? 'date' : 'number';
      feld.value = werte[n] || '';
      feld.addEventListener('input', () => {
        const aktuell = Array.isArray(kriterium.wert) ? [...kriterium.wert] : ['', ''];
        aktuell[n] = feld.value;
        kriterium.wert = aktuell;
        vorschauAnstossen();
      });
      huelle.append(feld);
    });
    return huelle;
  }

  const feld = document.createElement('input');
  feld.type = definition.typ === 'datum' ? 'date' : definition.typ === 'zahl' ? 'number' : 'text';
  feld.value = kriterium.wert == null ? '' : kriterium.wert;
  feld.addEventListener('input', () => {
    kriterium.wert = feld.value;
    vorschauAnstossen();
  });
  return feld;
}

// --- Live-Trefferzahl (F2.3) -------------------------------------------------
function vorschauAnstossen() {
  clearTimeout(vorschauZeitgeber);
  const anzeige = d('e-treffer');
  if (!d('e-eigener').checked) { anzeige.textContent = ''; return; }
  anzeige.textContent = t('editor.zaehlt');
  vorschauZeitgeber = setTimeout(async () => {
    try {
      const filter = nachFilter(zustand.kriterien, zustand.roh);
      const geerbt = d('e-eigenstaendig').checked ? [] : zustand.geerbt;
      const ergebnis = await api.vorschau(filter, geerbt);
      const wieViele = tn('ordner.dokumente', ergebnis.anzahl);
      const abfragen = ergebnis.schichten > 1
        ? ' ' + t('editor.schichten', { anzahl: zahlText(ergebnis.schichten) }) : '';
      anzeige.textContent = wieViele + abfragen;
    } catch (fehler) {
      anzeige.textContent = t('editor.zaehlerFehler');
    }
  }, 350);
}

function meldung(text, istFehler) {
  const anzeige = d('e-treffer');
  anzeige.textContent = text;
  anzeige.style.color = istFehler ? 'var(--gefahr)' : '';
}

// --- Speichern ---------------------------------------------------------------
// Zeigt auf dem Knopf, was gerade gilt. Ist der Satz noch nicht geladen,
// steht dort das Standardsymbol, bis er da ist.
function symbolknopfZeichnen() {
  const knopf = d('e-symbol');
  const name = (zustand && zustand.knoten.symbol) || '';
  knopf.innerHTML = '';
  knopf.append(symbolSvg(name, 18));
  knopf.title = name ? t('editor.symbolName', { name }) : t('editor.symbolWaehlen');
  if (name && !symbolInhalt(name)) {
    symboleLaden().then(() => {
      if (zustand && zustand.knoten.symbol === name) symbolknopfZeichnen();
    });
  }
}


async function speichern() {
  const name = d('e-name').value.trim();
  if (!name) throw new Error(t('editor.nameFehlt'));

  const elternWert = d('e-eltern').value;
  const daten = {
    name,
    eltern_id: elternWert ? Number(elternWert) : null,
    eigener_filter: d('e-eigener').checked,
    kinder_einbeziehen: d('e-kinder').checked,
    kinder_tief: d('e-tief').checked,
    eigenstaendig: d('e-eigenstaendig').checked,
    sortierung: d('e-sortierung').value,
    gruppieren_nach: d('e-gruppieren').value,
    symbol: zustand.knoten.symbol || '',
    seitengroesse: Number(d('e-seitengroesse').value) || 50,
    auf_dashboard: d('e-dashboard').checked,
    als_reiter: d('e-reiter').checked,
    filter: d('e-eigener').checked ? nachFilter(zustand.kriterien, zustand.roh) : {},
  };

  if (zustand.knoten.id) {
    await api.ordnerAendern(zustand.knoten.id, daten);
  } else {
    const ergebnis = await api.ordnerAnlegen(daten);
    zustand.knoten.id = ergebnis.id;
  }
}

function escape(text) {
  const hilfe = document.createElement('span');
  hilfe.textContent = text == null ? '' : text;
  return hilfe.innerHTML;
}
