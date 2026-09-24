// Die Ordneransicht in der Seitenleiste (F1).
import { api } from './api.js';
import { stamm } from './stamm.js';
import { ausFilter } from './kriterien.js';
import { satzJetzt, symbolInhalt, symboleLaden, symbolSvg } from './symbole.js';

export const baum = { knoten: [], nachId: {}, kinder: {}, geladen: false };

const OFFEN_SCHLUESSEL = 'papertree.offen';
const offen = new Set(ladeOffen());
const zaehler = new Map();

function ladeOffen() {
  try { return JSON.parse(localStorage.getItem(OFFEN_SCHLUESSEL) || '[]'); }
  catch (_) { return []; }
}
function merkeOffen() {
  try { localStorage.setItem(OFFEN_SCHLUESSEL, JSON.stringify([...offen])); }
  catch (_) { /* privates Fenster: dann eben nicht */ }
}

export async function baumLaden() {
  const daten = await api.baum();
  baum.knoten = daten.ordner || [];
  baum.nachId = Object.fromEntries(baum.knoten.map((k) => [k.id, k]));
  baum.kinder = {};
  for (const knoten of baum.knoten) {
    const schluessel = knoten.eltern_id == null ? 'wurzel' : String(knoten.eltern_id);
    (baum.kinder[schluessel] = baum.kinder[schluessel] || []).push(knoten);
  }
  for (const liste of Object.values(baum.kinder)) {
    liste.sort((a, b) => (a.reihenfolge - b.reihenfolge) || a.name.localeCompare(b.name, 'de'));
  }
  baum.geladen = true;
  return baum;
}

export function kinderVon(id) {
  return baum.kinder[id == null ? 'wurzel' : String(id)] || [];
}

export function nachfahrenZahl(id) {
  return kinderVon(id).reduce((summe, kind) => summe + 1 + nachfahrenZahl(kind.id), 0);
}

export function pfadVon(id) {
  const kette = [];
  let aktuell = baum.nachId[id];
  const gesehen = new Set();
  while (aktuell && !gesehen.has(aktuell.id)) {
    gesehen.add(aktuell.id);
    kette.unshift(aktuell);
    aktuell = aktuell.eltern_id ? baum.nachId[aktuell.eltern_id] : null;
  }
  return kette;
}

// Fehlende Referenzen (F1.8) – gegen die geladenen Stammdaten geprüft, ohne
// zusätzliche Abfrage.
export function fehlendeReferenzen(filter) {
  const { kriterien } = ausFilter(filter || {});
  const fehlend = [];
  for (const kriterium of kriterien) {
    if (kriterium.art === 'tags') pruefe('tags', kriterium.wert, 'Tag');
    else if (kriterium.art === 'korrespondent') pruefe('correspondents', kriterium.wert, 'Korrespondent');
    else if (kriterium.art === 'dokumenttyp') pruefe('document_types', kriterium.wert, 'Dokumenttyp');
    else if (kriterium.art === 'speicherpfad') pruefe('storage_paths', kriterium.wert, 'Speicherpfad');
    else if (kriterium.art.startsWith('zf:')) {
      const id = kriterium.art.slice(3);
      if (!stamm.nachId.custom_fields[String(id)]) fehlend.push('Zusatzfeld #' + id);
    }
  }
  function pruefe(art, werte, wort) {
    for (const id of werte || []) {
      if (!stamm.nachId[art][String(id)]) fehlend.push(wort + ' #' + id);
    }
  }
  return fehlend;
}

// --- Zeichnen ----------------------------------------------------------------
let beiAuswahl = null;
let beiBearbeiten = null;
let beiAnlegen = null;
let beiAktualisieren = null;

export function baumVerdrahten({ auswahl, bearbeiten, anlegen, aktualisieren }) {
  beiAuswahl = auswahl;
  beiBearbeiten = bearbeiten;
  beiAnlegen = anlegen;
  beiAktualisieren = aktualisieren;
}

let aktuelleId = null;

// Der Symbolsatz wird nur geholt, wenn ihn überhaupt jemand braucht: solange
// alle Ordner das Standardsymbol tragen, bleibt die grosse Datei ungeladen.
// Kommt sie später, wird der Baum einmal neu gezeichnet.
function symbolsatzSichern() {
  if (satzJetzt()) return;
  // Nur anfordern, wenn ein Ordner ein Symbol trägt, das noch fehlt.
  if (!baum.knoten.some((k) => k.symbol && symbolInhalt(k.symbol) === null)) return;
  symboleLaden();
}

// Sobald der Satz da ist – gleich wer ihn geholt hat, Baum oder Wähler –
// steht in den Zeilen noch das Standardsymbol. Einmal neu zeichnen.
document.addEventListener('papertree:symbole-geladen', () => {
  if (document.getElementById('baum')) baumZeichnen(aktuelleId);
});

export function baumZeichnen(aktiveId) {
  aktuelleId = aktiveId;
  const behaelter = document.getElementById('baum');
  behaelter.innerHTML = '';
  symbolsatzSichern();
  if (!baum.knoten.length) {
    const leer = document.createElement('p');
    leer.className = 'hinweis';
    leer.style.padding = '8px 10px';
    leer.textContent = 'Noch keine Ordner. Mit "+ Ordner" den ersten anlegen.';
    behaelter.append(leer);
    return;
  }
  behaelter.append(ebene(null, aktiveId));
  hintergrundVerdrahten(behaelter);
  zaehlerNachladen();
}

// Ablegen auf die freie Fläche heisst: auf die oberste Ebene, ans Ende.
// Der Behälter bleibt über alle Neuzeichnungen derselbe – darum nur einmal.
let hintergrundVerdrahtet = false;

function hintergrundVerdrahten(behaelter) {
  if (hintergrundVerdrahtet) return;
  hintergrundVerdrahtet = true;

  behaelter.addEventListener('dragover', (ereignis) => {
    if (gezogen == null) return;
    ereignis.preventDefault();
    behaelter.classList.add('ziel-oberste');
  });
  behaelter.addEventListener('dragleave', (ereignis) => {
    if (ereignis.target === behaelter) behaelter.classList.remove('ziel-oberste');
  });
  behaelter.addEventListener('drop', async (ereignis) => {
    behaelter.classList.remove('ziel-oberste');
    if (gezogen == null) return;
    ereignis.preventDefault();
    const knoten = baum.nachId[gezogen];
    if (!knoten || knoten.eltern_id == null) { gezogen = null; return; }
    const ids = kinderVon(null).map((k) => k.id).filter((id) => id !== gezogen);
    ids.push(gezogen);
    gezogen = null;
    try {
      await api.reihenfolge(null, ids);
      await baumLaden();
      baumZeichnen(aktuelleId);
    } catch (fehler) {
      alert('Verschieben nicht möglich: ' + (fehler.message || fehler));
    }
  });
}

function ebene(elternId, aktiveId) {
  const huelle = document.createElement('div');
  for (const knoten of kinderVon(elternId)) {
    huelle.append(zeile(knoten, aktiveId));
    if (!offen.has(knoten.id)) continue;

    const hatManuelle = kinderVon(knoten.id).length > 0;
    const spannt = !!knoten.gruppieren_nach;
    if (!hatManuelle && !spannt) continue;

    const kinder = hatManuelle ? ebene(knoten.id, aktiveId) : document.createElement('div');
    kinder.className = 'kinder';
    if (spannt) gruppenAnhaengen(kinder, knoten, aktiveId);
    huelle.append(kinder);
  }
  return huelle;
}

// --- Dynamische Unterknoten (F4) ---------------------------------------------
const gruppenCache = new Map();
const gruppenLaeuft = new Set();

export function gruppenVergessen(id) {
  if (id == null) gruppenCache.clear();
  else gruppenCache.delete(id);
}

function gruppenAnhaengen(behaelter, knoten, aktiveId) {
  const gefunden = gruppenCache.get(knoten.id);

  if (!gefunden) {
    const platzhalter = document.createElement('div');
    platzhalter.className = 'hinweis';
    platzhalter.style.padding = '2px 8px';
    platzhalter.textContent = 'Unterordner werden ermittelt …';
    behaelter.append(platzhalter);

    if (!gruppenLaeuft.has(knoten.id)) {
      gruppenLaeuft.add(knoten.id);
      api.gruppen(knoten.id)
        .then((ergebnis) => { gruppenCache.set(knoten.id, ergebnis.gruppen || []); })
        .catch(() => { gruppenCache.set(knoten.id, []); })
        .finally(() => {
          gruppenLaeuft.delete(knoten.id);
          if (offen.has(knoten.id)) baumZeichnen(aktuelleId);
        });
    }
    return;
  }

  if (!gefunden.length) {
    const leer = document.createElement('div');
    leer.className = 'hinweis';
    leer.style.padding = '2px 8px';
    leer.textContent = 'keine Werte vorhanden';
    behaelter.append(leer);
    return;
  }

  const aktiveGruppe = new URLSearchParams((location.hash.split('?')[1] || '')).get('gruppe');
  const aufDiesemKnoten = String(aktiveId) === String(knoten.id);

  for (const gruppe of gefunden) {
    const zeile = document.createElement('div');
    zeile.className = 'knoten-zeile gruppe'
      + (aufDiesemKnoten && aktiveGruppe === gruppe.wert ? ' aktiv' : '');

    const platz = document.createElement('span');
    platz.className = 'pfeil platzhalter';
    zeile.append(platz);

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'knoten-name';
    name.textContent = gruppe.name;
    name.title = 'Automatisch aufgespannt';
    name.addEventListener('click', () => {
      location.hash = '#/ordner/' + knoten.id + '?gruppe=' + encodeURIComponent(gruppe.wert);
    });
    zeile.append(name);

    const anzahl = document.createElement('span');
    anzahl.className = 'zaehler';
    anzahl.textContent = gruppe.anzahl;
    zeile.append(anzahl);

    behaelter.append(zeile);
  }
}

// --- Ziehen und Ablegen ------------------------------------------------------
// Nur am Rechner; am Handy führen Menü und Editor-Feld zum selben Ergebnis.
let gezogen = null;

function istNachfahre(id, moeglicher) {
  if (String(id) === String(moeglicher)) return true;
  return kinderVon(id).some((kind) => istNachfahre(kind.id, moeglicher));
}

function zoneVon(ereignis, element) {
  const hoehe = element.offsetHeight || 24;
  const anteil = (ereignis.clientY - element.getBoundingClientRect().top) / hoehe;
  if (anteil < 0.3) return 'davor';
  if (anteil > 0.7) return 'danach';
  return 'hinein';
}

function markierungWeg() {
  for (const element of document.querySelectorAll('.ziel-davor, .ziel-danach, .ziel-hinein')) {
    element.classList.remove('ziel-davor', 'ziel-danach', 'ziel-hinein');
  }
  const behaelter = document.getElementById('baum');
  if (behaelter) behaelter.classList.remove('ziel-oberste');
}

// dragend feuert immer auf dem gezogenen Element und steigt bis hierher auf –
// auch wenn auf einer Zeile abgelegt wurde (deren drop-Handler das Ereignis
// anhält) oder der Vorgang abgebrochen wurde. Nur hier lässt sich die
// Markierung verlässlich wieder wegnehmen.
document.addEventListener('dragend', () => {
  gezogen = null;
  markierungWeg();
});
document.addEventListener('drop', () => {
  gezogen = null;
  markierungWeg();
});

async function ablegen(zielKnoten, zone, aktiveId) {
  if (!gezogen || String(gezogen) === String(zielKnoten.id)) return;
  if (istNachfahre(gezogen, zielKnoten.id)) return;

  if (zone === 'hinein') {
    const ids = kinderVon(zielKnoten.id).map((k) => k.id).filter((id) => id !== gezogen);
    ids.push(gezogen);
    await api.reihenfolge(zielKnoten.id, ids);
  } else {
    const ids = kinderVon(zielKnoten.eltern_id).map((k) => k.id).filter((id) => id !== gezogen);
    const stelle = ids.indexOf(zielKnoten.id);
    ids.splice(zone === 'davor' ? stelle : stelle + 1, 0, gezogen);
    await api.reihenfolge(zielKnoten.eltern_id, ids);
  }
  gezogen = null;
  await baumLaden();
  baumZeichnen(aktiveId);
}

function ziehenVerdrahten(zeile, knoten, aktiveId) {
  zeile.draggable = true;

  zeile.addEventListener('dragstart', (ereignis) => {
    gezogen = knoten.id;
    ereignis.dataTransfer.effectAllowed = 'move';
    // Firefox braucht eine Nutzlast, damit der Vorgang startet.
    ereignis.dataTransfer.setData('text/plain', String(knoten.id));
    zeile.style.opacity = '.5';
  });

  zeile.addEventListener('dragend', () => {
    zeile.style.opacity = '';
    markierungWeg();
  });

  zeile.addEventListener('dragover', (ereignis) => {
    if (gezogen == null || istNachfahre(gezogen, knoten.id)) return;
    ereignis.preventDefault();
    ereignis.dataTransfer.dropEffect = 'move';
    const zone = zoneVon(ereignis, zeile);
    if (zeile.classList.contains('ziel-' + zone)) return;
    zeile.classList.remove('ziel-davor', 'ziel-danach', 'ziel-hinein');
    zeile.classList.add('ziel-' + zone);
  });

  zeile.addEventListener('dragleave', () => {
    zeile.classList.remove('ziel-davor', 'ziel-danach', 'ziel-hinein');
  });

  zeile.addEventListener('drop', async (ereignis) => {
    ereignis.preventDefault();
    ereignis.stopPropagation();
    const zone = zoneVon(ereignis, zeile);
    markierungWeg();
    try {
      await ablegen(knoten, zone, aktiveId);
    } catch (fehler) {
      alert('Verschieben nicht möglich: ' + (fehler.message || fehler));
    }
  });
}

function zeile(knoten, aktiveId) {
  // Ein aufspannender Ordner ist aufklappbar, auch ohne eigene Unterordner.
  const hatKinder = kinderVon(knoten.id).length > 0 || !!knoten.gruppieren_nach;
  const zeile = document.createElement('div');
  zeile.className = 'knoten-zeile' + (String(knoten.id) === String(aktiveId) ? ' aktiv' : '');
  zeile.dataset.knotenId = knoten.id;
  ziehenVerdrahten(zeile, knoten, aktiveId);

  const pfeil = document.createElement('button');
  pfeil.className = 'pfeil' + (hatKinder ? '' : ' platzhalter');
  pfeil.type = 'button';
  pfeil.textContent = offen.has(knoten.id) ? '▼' : '▶';
  pfeil.title = offen.has(knoten.id) ? 'Zuklappen' : 'Aufklappen';
  pfeil.addEventListener('click', (ereignis) => {
    ereignis.stopPropagation();
    if (offen.has(knoten.id)) offen.delete(knoten.id); else offen.add(knoten.id);
    merkeOffen();
    baumZeichnen(aktiveId);
  });
  zeile.append(pfeil);

  // symbolFeld, nicht symbol: weiter unten steht schon eine Funktion symbol()
  // für die Zeichen im Kontextmenü.
  const symbolFeld = document.createElement('span');
  symbolFeld.className = 'knoten-symbol';
  symbolFeld.append(symbolSvg(knoten.symbol || '', 15));
  zeile.append(symbolFeld);

  const name = document.createElement('button');
  name.type = 'button';
  const nurNavigation = !knoten.eigener_filter && !knoten.kinder_einbeziehen;
  name.className = 'knoten-name' + (nurNavigation ? ' navigation' : '');
  name.textContent = knoten.name;
  name.title = nurNavigation ? 'Reine Navigation' : '';
  name.addEventListener('click', () => {
    if (nurNavigation && hatKinder) {
      if (offen.has(knoten.id)) offen.delete(knoten.id); else offen.add(knoten.id);
      merkeOffen();
    }
    beiAuswahl && beiAuswahl(knoten.id);
  });
  zeile.append(name);

  const fehlend = knoten.eigener_filter ? fehlendeReferenzen(knoten.filter) : [];
  if (fehlend.length) {
    const warnung = document.createElement('span');
    warnung.className = 'warnung';
    warnung.textContent = '⚠';
    warnung.title = 'Fehlt in Paperless: ' + fehlend.join(', ');
    zeile.append(warnung);
  }

  if (!nurNavigation) {
    const anzahl = document.createElement('span');
    anzahl.className = 'zaehler';
    anzahl.dataset.knoten = knoten.id;
    anzahl.textContent = zaehler.has(knoten.id) ? zaehler.get(knoten.id) : '';
    zeile.append(anzahl);
  }

  const menue = document.createElement('button');
  menue.type = 'button';
  menue.className = 'stift';
  menue.textContent = '⋯';
  menue.title = 'Ordner verwalten';
  menue.setAttribute('aria-haspopup', 'menu');
  menue.addEventListener('click', (ereignis) => {
    ereignis.stopPropagation();
    kontextmenue(knoten, menue, aktiveId);
  });
  zeile.append(menue);

  return zeile;
}

// --- Ordnermenü --------------------------------------------------------------
const SYMBOLE = {
  stift: '<path d="M11.5 2.5a1.6 1.6 0 0 1 2.3 2.3l-7.4 7.4-3 .7.7-3 7.4-7.4Z"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  hoch: '<path d="M8 13V3M4 7l4-4 4 4"/>',
  runter: '<path d="M8 3v10M4 9l4 4 4-4"/>',
  muell: '<path d="M3 5h10M6.5 5V3.5h3V5M5 5l.7 8h4.6L11 5"/>',
};

function symbol(name) {
  return '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" '
    + 'stroke="currentColor" stroke-width="1.4" stroke-linecap="round" '
    + 'stroke-linejoin="round" aria-hidden="true">' + SYMBOLE[name] + '</svg>';
}

let offenesMenue = null;

function menueSchliessen() {
  if (offenesMenue) {
    offenesMenue.remove();
    offenesMenue = null;
  }
}

document.addEventListener('click', (ereignis) => {
  if (offenesMenue && !offenesMenue.contains(ereignis.target)) menueSchliessen();
});
document.addEventListener('keydown', (ereignis) => {
  if (ereignis.key === 'Escape') menueSchliessen();
});
window.addEventListener('resize', menueSchliessen);
window.addEventListener('scroll', menueSchliessen, true);

function kontextmenue(knoten, anker, aktiveId) {
  menueSchliessen();

  const geschwister = kinderVon(knoten.eltern_id);
  const stelle = geschwister.findIndex((g) => g.id === knoten.id);
  const nachfahren = nachfahrenZahl(knoten.id);

  const eintraege = [
    { symbol: 'stift', text: 'Bearbeiten', tun: () => beiBearbeiten && beiBearbeiten(knoten.id) },
    { symbol: 'plus', text: 'Unterordner anlegen', tun: () => beiAnlegen && beiAnlegen(knoten.id) },
  ];
  if (stelle > 0) {
    eintraege.push({ symbol: 'hoch', text: 'Nach oben', tun: () => verschieben(knoten, -1, aktiveId) });
  }
  if (stelle < geschwister.length - 1) {
    eintraege.push({ symbol: 'runter', text: 'Nach unten', tun: () => verschieben(knoten, 1, aktiveId) });
  }
  eintraege.push({ trenner: true });
  eintraege.push({
    symbol: 'muell', text: 'Löschen', gefahr: true,
    tun: async () => {
      const frage = nachfahren
        ? `"${knoten.name}" und ${nachfahren} Unterordner löschen? Die Dokumente in Paperless bleiben unberührt.`
        : `"${knoten.name}" löschen? Die Dokumente in Paperless bleiben unberührt.`;
      if (!confirm(frage)) return;
      await api.ordnerLoeschen(knoten.id);
      if (beiAktualisieren) beiAktualisieren(null);
    },
  });

  const menue = document.createElement('div');
  menue.className = 'menue';
  menue.setAttribute('role', 'menu');

  const kopf = document.createElement('div');
  kopf.className = 'menue-kopf';
  kopf.textContent = knoten.name;
  menue.append(kopf);

  for (const eintrag of eintraege) {
    if (eintrag.trenner) {
      const linie = document.createElement('div');
      linie.className = 'menue-trenner';
      menue.append(linie);
      continue;
    }
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'menue-eintrag' + (eintrag.gefahr ? ' gefahr' : '');
    knopf.setAttribute('role', 'menuitem');
    knopf.innerHTML = symbol(eintrag.symbol) + '<span></span>';
    knopf.lastChild.textContent = eintrag.text;
    knopf.addEventListener('click', async (ereignis) => {
      ereignis.stopPropagation();
      menueSchliessen();
      try {
        await eintrag.tun();
      } catch (fehler) {
        alert('Das ging nicht: ' + (fehler.message || fehler));
      }
    });
    menue.append(knopf);
  }

  document.body.append(menue);
  offenesMenue = menue;

  // Am Knopf ausrichten, aber innerhalb des Fensters bleiben.
  const platz = anker.getBoundingClientRect();
  const masse = menue.getBoundingClientRect();
  let links = platz.right - masse.width;
  let oben = platz.bottom + 4;
  if (links < 8) links = 8;
  if (oben + masse.height > window.innerHeight - 8) {
    oben = Math.max(8, platz.top - masse.height - 4);
  }
  menue.style.left = links + 'px';
  menue.style.top = oben + 'px';

  const erster = menue.querySelector('.menue-eintrag');
  if (erster) erster.focus();
}

async function verschieben(knoten, richtung, aktiveId) {
  const geschwister = kinderVon(knoten.eltern_id).map((g) => g.id);
  const stelle = geschwister.indexOf(knoten.id);
  const ziel = stelle + richtung;
  if (ziel < 0 || ziel >= geschwister.length) return;
  geschwister.splice(stelle, 1);
  geschwister.splice(ziel, 0, knoten.id);
  await api.reihenfolge(knoten.eltern_id, geschwister);
  await baumLaden();
  baumZeichnen(aktiveId);
}

// --- Zähler (F1.7) -----------------------------------------------------------
// Nur für sichtbare Knoten, und je Sitzung nur einmal.
async function zaehlerNachladen() {
  const felder = [...document.querySelectorAll('.zaehler[data-knoten]')];
  for (const feld of felder) {
    const id = Number(feld.dataset.knoten);
    if (zaehler.has(id)) { feld.textContent = zaehler.get(id); continue; }
    try {
      const ergebnis = await api.anzahl(id);
      zaehler.set(id, ergebnis.anzahl);
      const nochDa = document.querySelector('.zaehler[data-knoten="' + id + '"]');
      if (nochDa) nochDa.textContent = ergebnis.anzahl;
    } catch (_) {
      zaehler.set(id, '');
    }
  }
}

export function zaehlerVergessen() {
  zaehler.clear();
}
