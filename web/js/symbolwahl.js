// Der Symbolwähler: ein Raster aller mitgelieferten Symbole mit Suche.
//
// Über zweitausend Kacheln auf einmal in den Baum zu hängen macht die Seite
// zäh. Gezeichnet wird darum immer nur ein Ausschnitt, der beim Scrollen
// wächst – gefiltert wird auf der vollen Liste, angezeigt in Portionen.
import { symbolNamen, symboleLaden, symbolSvg } from './symbole.js';
import { THEMEN } from './themen.js';

const PORTION = 120;

let dialog = null;
let zustand = null;

function bauen() {
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.className = 'dialog symbolwahl';
  dialog.innerHTML = `
    <div class="dialog-kopf">
      <div class="symbolwahl-titel">
        <h2 id="sw-titel">Symbol auswählen</h2>
        <p class="hinweis" id="sw-anzahl"></p>
      </div>
      <button type="button" class="knopf klein schliessknopf" id="sw-zu"
              aria-label="Schliessen" title="Schliessen">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none"
             stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
             aria-hidden="true"><path d="M4 4 12 12M12 4 4 12"/></svg>
      </button>
    </div>
    <div class="dialog-koerper">
      <div class="symbolwahl-leiste">
        <select id="sw-thema" aria-label="Thema"></select>
        <input type="search" id="sw-suche" placeholder="Symbole suchen …"
               autocomplete="off" aria-label="Symbole suchen">
      </div>
      <div class="symbolgitter" id="sw-gitter" role="listbox"
           aria-label="Symbole"></div>
    </div>
    <div class="dialog-fuss">
      <button type="button" class="knopf" id="sw-standard">Standard verwenden</button>
      <span class="luecke"></span>
      <button type="button" class="knopf" id="sw-abbrechen">Abbrechen</button>
    </div>`;
  document.body.append(dialog);

  const d = (id) => dialog.querySelector('#' + id);
  const schliessen = () => { if (dialog.open) dialog.close(); };
  d('sw-zu').addEventListener('click', schliessen);
  d('sw-abbrechen').addEventListener('click', schliessen);
  d('sw-standard').addEventListener('click', () => {
    if (zustand) zustand.fertig('');
    schliessen();
  });
  const themenfeld = d('sw-thema');
  const alle = document.createElement('option');
  alle.value = '';
  alle.textContent = 'Alle Symbole';
  themenfeld.append(alle);
  for (const thema of THEMEN) {
    const option = document.createElement('option');
    option.value = thema.name;
    option.textContent = thema.name + ' (' + thema.symbole.length + ')';
    themenfeld.append(option);
  }
  themenfeld.addEventListener('change', () => filtern(d('sw-suche').value));
  d('sw-suche').addEventListener('input', () => filtern(d('sw-suche').value));

  // Nachladen, sobald das Ende des Gitters in Sicht kommt.
  d('sw-gitter').addEventListener('scroll', () => {
    const g = d('sw-gitter');
    if (g.scrollTop + g.clientHeight >= g.scrollHeight - 200) nachlegen();
  });

  return dialog;
}

/** Symbole, die über ein deutsches Stichwort zu diesem Suchtext passen.
 *
 *  Der Satz ist englisch benannt – "Versicherung" fände sonst nichts. Ein
 *  Thema zählt als Treffer, wenn sein Name oder eines seiner Stichwörter
 *  den Suchtext enthält; seine Symbole kommen dann mit in die Liste.
 */
function ueberThema(suche) {
  // Als Liste, nicht als Menge: die Symbole eines Themas sind von Hand
  // sortiert, das Naheliegendste zuerst. Bei "auto" soll car vorn stehen
  // und nicht bike, nur weil das alphabetisch früher kommt.
  const gefunden = [];
  const schon = new Set();
  for (const thema of THEMEN) {
    const passt = thema.name.toLowerCase().includes(suche)
      || thema.woerter.some((w) => w.includes(suche) || suche.includes(w));
    if (!passt) continue;
    for (const symbol of thema.symbole) {
      if (!schon.has(symbol)) { schon.add(symbol); gefunden.push(symbol); }
    }
  }
  return gefunden;
}

function filtern(text) {
  const suche = String(text || '').trim().toLowerCase();
  const thema = dialog.querySelector('#sw-thema').value;
  let grundmenge = zustand.alle;
  if (thema) {
    const gewaehlt = THEMEN.find((t) => t.name === thema);
    grundmenge = gewaehlt ? gewaehlt.symbole : zustand.alle;
  }
  if (!suche) {
    zustand.treffer = grundmenge;
  } else {
    const ausThema = ueberThema(suche);
    // Erst die Namenstreffer, dann was nur über das Stichwort kam – so steht
    // oben, was am ehesten gemeint ist. Die Thementreffer behalten dabei
    // ihre gepflegte Reihenfolge.
    const inMenge = new Set(grundmenge);
    const direkt = grundmenge.filter((n) => n.includes(suche));
    const schonDa = new Set(direkt);
    const indirekt = ausThema.filter((n) => inMenge.has(n) && !schonDa.has(n));
    zustand.treffer = [...direkt, ...indirekt];
  }
  zustand.gezeigt = 0;
  dialog.querySelector('#sw-gitter').innerHTML = '';
  const anzahl = zustand.treffer.length === 1
    ? '1 Symbol' : zustand.treffer.length + ' Symbole';
  dialog.querySelector('#sw-anzahl').textContent =
    (zustand.art ? zustand.art + ' · ' : '') + anzahl;
  nachlegen();
}

function nachlegen() {
  if (!zustand || zustand.gezeigt >= zustand.treffer.length) return;
  const gitter = dialog.querySelector('#sw-gitter');
  const bis = Math.min(zustand.gezeigt + PORTION, zustand.treffer.length);
  const haufen = document.createDocumentFragment();
  for (let i = zustand.gezeigt; i < bis; i++) {
    const name = zustand.treffer[i];
    const kachel = document.createElement('button');
    kachel.type = 'button';
    kachel.className = 'symbolkachel' + (name === zustand.aktuell ? ' aktiv' : '');
    kachel.dataset.tooltip = name;
    kachel.setAttribute('role', 'option');
    kachel.setAttribute('aria-label', name);
    kachel.setAttribute('aria-selected', String(name === zustand.aktuell));
    kachel.append(symbolSvg(name, 22));
    kachel.addEventListener('click', () => {
      zustand.fertig(name);
      if (dialog.open) dialog.close();
    });
    haufen.append(kachel);
  }
  gitter.append(haufen);
  zustand.gezeigt = bis;
}

/**
 * Öffnet den Wähler.
 * @param {string} aktuell  bisher gewähltes Symbol, '' für das Standardsymbol
 * @param {(name: string) => void} fertig  bekommt den neuen Namen, '' für Standard
 * @param {{name?: string, art?: string}} wofuer  wem das Symbol gilt – steht
 *        im Titel, damit bei offenem Dialog klar bleibt, was man gerade
 *        bearbeitet.
 */
export async function symbolWaehlen(aktuell, fertig, wofuer = {}) {
  bauen();
  await symboleLaden();
  zustand = {
    alle: symbolNamen(), treffer: [], gezeigt: 0, aktuell: aktuell || '',
    fertig, art: wofuer.art || '',
  };

  dialog.querySelector('#sw-titel').textContent = wofuer.name
    ? 'Symbol für ' + wofuer.name
    : 'Symbol auswählen';

  const suche = dialog.querySelector('#sw-suche');
  suche.value = '';
  dialog.querySelector('#sw-thema').value = '';
  filtern('');
  dialog.showModal();
  suche.focus();

  // Das gewählte Symbol steht vielleicht weit hinten: bis dorthin nachlegen
  // und hinscrollen, damit man sieht, was gerade gilt.
  if (zustand.aktuell) {
    const stelle = zustand.treffer.indexOf(zustand.aktuell);
    if (stelle >= 0) {
      while (zustand.gezeigt <= stelle) nachlegen();
      const kachel = dialog.querySelector('.symbolkachel.aktiv');
      if (kachel) kachel.scrollIntoView({ block: 'center' });
    }
  }
}
