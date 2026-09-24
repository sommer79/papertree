// Die Sprache der Oberfläche.
//
// PaperTree hat keine eigene Spracheinstellung. Es spricht die Sprache, die
// der Benutzer in Paperless gewählt hat – zwei Einstellungen für dieselbe
// Sache laufen sonst auseinander, und niemand sucht sie an zwei Orten.
//
// Fünf Sprachen liegen bei. Wer Paperless auf etwas anderes gestellt hat,
// bekommt Englisch; Englisch ist auch der Rückfall für einen Schlüssel, den
// eine Übersetzung noch nicht kennt. Deshalb liegt der englische Katalog
// immer mit im Speicher: eine fehlende Zeile soll einen einzelnen Text
// betreffen und nicht die halbe Ansicht.
import { BASIS } from './api.js';

export const SPRACHEN = ['de', 'en', 'fr', 'it', 'es'];
export const RUECKFALL = 'en';

// Paperless kennt fürs Datum neben den Sprachen einen Sonderwert: ISO 8601,
// also 2026-09-24, in jeder Sprache gleich. Intl nimmt "iso-8601" als
// wohlgeformtes Sprachkürzel an und übergeht es dann stillschweigend – wer
// das einstellt, sähe sonst weiter das Datum seiner Anzeigesprache.
export const ISO = 'iso-8601';

let katalog = {};
let englisch = {};
let aktuelleSprache = RUECKFALL;
let datumsSprache = RUECKFALL;

// Intl-Formatierer sind teuer genug, dass es sich lohnt, sie zu behalten.
let datumsformat = null;
let zahlformat = null;
let pluralregel = null;

/** Der Sprachcode, in dem gerade gesprochen wird. */
export const sprache = () => aktuelleSprache;

/** Das Sprachkürzel, mit dem Datum und Zahlen geschrieben werden. */
export const datumssprache = () => datumsSprache;

function katalogHolen(code) {
  return fetch(BASIS + 'sprachen/' + code + '.json', { credentials: 'same-origin' })
    .then((antwort) => (antwort.ok ? antwort.json() : {}))
    .catch(() => ({}));
}

/** Welche Sprache gilt: die aus Paperless, sonst die des Browsers, sonst Englisch. */
export function spracheBestimmen(ausPaperless) {
  if (SPRACHEN.includes(ausPaperless)) return ausPaperless;
  for (const wunsch of navigator.languages || [navigator.language || '']) {
    const kurz = String(wunsch).toLowerCase().split('-')[0];
    if (SPRACHEN.includes(kurz)) return kurz;
  }
  return RUECKFALL;
}

/** Prüft, ob der Browser dieses Sprachkürzel fürs Datum kennt. */
function datumsspracheBestimmen(gewuenscht, ersatz) {
  if (gewuenscht === ISO) return ISO;
  for (const kandidat of [gewuenscht, ersatz]) {
    if (!kandidat || kandidat === ISO) continue;
    try {
      // Wirft bei unbrauchbarer Angabe – dann gilt der nächste Kandidat.
      new Intl.DateTimeFormat(kandidat);
      return kandidat;
    } catch (_) { /* nächster */ }
  }
  return RUECKFALL;
}

/**
 * Lädt die Kataloge und stellt die Formatierer ein.
 *
 * `benutzer` ist die Auskunft aus /api/ich: sie nennt die Sprache aus
 * Paperless und, getrennt davon, die Sprache fürs Datum.
 */
export async function spracheEinrichten(benutzer) {
  const person = benutzer || {};
  aktuelleSprache = spracheBestimmen(person.sprache || '');
  datumsSprache = datumsspracheBestimmen(person.datumssprache || '', aktuelleSprache);

  const [gewaehlt, ersatz] = await Promise.all([
    katalogHolen(aktuelleSprache),
    aktuelleSprache === RUECKFALL ? Promise.resolve(null) : katalogHolen(RUECKFALL),
  ]);
  katalog = gewaehlt || {};
  englisch = ersatz || katalog;

  // ISO ist keine Sprache: Zahlen schreibt dann die Anzeigesprache, sonst
  // stünde in einer deutschen Oberfläche plötzlich 1,660 statt 1'660.
  const zahlSprache = datumsSprache === ISO ? aktuelleSprache : datumsSprache;
  datumsformat = datumsSprache === ISO
    ? null : new Intl.DateTimeFormat(datumsSprache, { dateStyle: 'medium' });
  zahlformat = new Intl.NumberFormat(zahlSprache);
  pluralregel = new Intl.PluralRules(aktuelleSprache);

  // Damit der Browser richtig trennt und vorliest.
  document.documentElement.lang = aktuelleSprache;
  return aktuelleSprache;
}

function einsetzen(vorlage, werte) {
  if (!werte) return vorlage;
  return vorlage.replace(/\{(\w+)\}/g, (ganz, name) =>
    (Object.prototype.hasOwnProperty.call(werte, name) ? String(werte[name]) : ganz));
}

/**
 * Der Text zu einem Schlüssel.
 *
 * Fehlt er in beiden Katalogen, kommt der Schlüssel selbst zurück. Das ist
 * hässlich und genau deshalb richtig: die Lücke fällt auf, statt dass die
 * Stelle leer bleibt und niemand sie bemerkt.
 */
export function t(schluessel, werte) {
  let text = katalog[schluessel];
  if (text === undefined) text = englisch[schluessel];
  if (text === undefined) return schluessel;
  return einsetzen(text, werte);
}

/**
 * Ein Text mit Anzahl: `tn('suche.treffer', 3)` sucht sich zwischen
 * `suche.treffer.one` und `suche.treffer.other` das Richtige.
 *
 * Welche Form gilt, sagt der Browser. Im Französischen gehört die Null zur
 * Einzahl, im Deutschen nicht – das steht in keiner Tabelle hier, sondern in
 * Intl.PluralRules.
 */
export function tn(schluessel, anzahl, werte) {
  const zahl = Number(anzahl) || 0;
  const form = pluralregel ? pluralregel.select(zahl) : (zahl === 1 ? 'one' : 'other');
  const voll = { anzahl: zahlText(zahl), ...(werte || {}) };
  let text = katalog[schluessel + '.' + form];
  if (text === undefined) text = katalog[schluessel + '.other'];
  if (text === undefined) text = englisch[schluessel + '.' + form];
  if (text === undefined) text = englisch[schluessel + '.other'];
  if (text === undefined) return schluessel;
  return einsetzen(text, voll);
}

/** Ob es diesen Schlüssel gibt – für Fälle, die ohne Text auskommen. */
export const kenntText = (schluessel) =>
  katalog[schluessel] !== undefined || englisch[schluessel] !== undefined;

function isoText(zeitpunkt) {
  const zwei = (n) => String(n).padStart(2, '0');
  return zeitpunkt.getFullYear() + '-' + zwei(zeitpunkt.getMonth() + 1)
    + '-' + zwei(zeitpunkt.getDate());
}

/**
 * Ein Datum in der mittleren Form: "24. Sept. 2026", "Sep 24, 2026" – oder
 * "2026-09-24", wenn in Paperless ISO 8601 eingestellt ist.
 *
 * Immer mittel, nie ausgeschrieben – in einer Liste mit dreissig Zeilen zählt
 * die gleiche Breite mehr als der volle Monatsname, und die kurze Form
 * schreibt das Jahr zweistellig, was in einer Ablage niemand will.
 *
 * Ein reiner Datumstext wird von Hand zerlegt statt durch Date geschickt:
 * "2026-01-23" wäre dort UTC-Mitternacht und fiele westlich von Greenwich auf
 * den Vortag.
 */
export function datum(wert) {
  if (!wert) return '';
  const text = String(wert);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const zeitpunkt = iso
    ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    : new Date(text);
  if (isNaN(zeitpunkt)) return text.slice(0, 10);
  if (datumsSprache === ISO) return isoText(zeitpunkt);
  return datumsformat ? datumsformat.format(zeitpunkt) : isoText(zeitpunkt);
}

/** Eine Zahl mit den Trennzeichen der eingestellten Sprache. */
export function zahlText(wert) {
  const zahl = Number(wert);
  if (!isFinite(zahl)) return String(wert == null ? '' : wert);
  return zahlformat ? zahlformat.format(zahl) : String(zahl);
}

/**
 * Setzt die festen Texte im HTML.
 *
 * `data-i18n` ersetzt den Inhalt, `data-i18n-titel`, `data-i18n-marke` und
 * `data-i18n-platzhalter` die zugehörigen Attribute. So bleibt index.html
 * lesbar: dort steht weiter, was gemeint ist, und daneben der Schlüssel.
 */
export function textenSetzen(wurzel = document) {
  for (const knoten of wurzel.querySelectorAll('[data-i18n]')) {
    knoten.textContent = t(knoten.getAttribute('data-i18n'));
  }
  const attribute = [
    ['data-i18n-titel', 'title'],
    ['data-i18n-marke', 'aria-label'],
    ['data-i18n-platzhalter', 'placeholder'],
  ];
  for (const [quelle, ziel] of attribute) {
    for (const knoten of wurzel.querySelectorAll('[' + quelle + ']')) {
      knoten.setAttribute(ziel, t(knoten.getAttribute(quelle)));
    }
  }
}
