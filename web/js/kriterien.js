// Kriterien des Editors und ihre Übersetzung in Query-Parameter (A4, F2).
//
// Der Editor kennt keine Paperless-Regeltypen. Jedes Kriterium nennt einen
// Parameter der API, und der Filter ist nichts als die Summe dieser Parameter.
// Was sich nicht in ein Kriterium übersetzen lässt – etwa eine verschachtelte
// Zusatzfeld-Abfrage aus einem Paperless-Link – bleibt als Rohparameter
// erhalten und geht nicht verloren.
import { stamm } from './stamm.js';

// --- Feste Arten -------------------------------------------------------------
export const STATISCHE_ARTEN = [
  {
    art: 'tags', name: 'Tags', typ: 'mehrfach', quelle: 'tags',
    ops: [
      { op: 'alle', name: 'hat alle von', param: 'tags__id__all' },
      { op: 'eines', name: 'hat eines von', param: 'tags__id__in' },
      { op: 'keines', name: 'hat keines von', param: 'tags__id__none' },
    ],
  },
  {
    art: 'getaggt', name: 'Tags vorhanden', typ: 'jaNein',
    ops: [{ op: 'ist', name: 'ist', param: 'is_tagged' }],
  },
  {
    art: 'korrespondent', name: 'Korrespondent', typ: 'mehrfach', quelle: 'correspondents',
    ops: [
      { op: 'eines', name: 'ist eines von', param: 'correspondent__id__in' },
      { op: 'keines', name: 'ist keines von', param: 'correspondent__id__none' },
    ],
  },
  {
    art: 'ohne_korrespondent', name: 'Korrespondent leer', typ: 'jaNein',
    ops: [{ op: 'ist', name: 'ist', param: 'correspondent__isnull' }],
  },
  {
    art: 'dokumenttyp', name: 'Dokumenttyp', typ: 'mehrfach', quelle: 'document_types',
    ops: [
      { op: 'eines', name: 'ist eines von', param: 'document_type__id__in' },
      { op: 'keines', name: 'ist keines von', param: 'document_type__id__none' },
    ],
  },
  {
    art: 'ohne_dokumenttyp', name: 'Dokumenttyp leer', typ: 'jaNein',
    ops: [{ op: 'ist', name: 'ist', param: 'document_type__isnull' }],
  },
  {
    art: 'speicherpfad', name: 'Speicherpfad', typ: 'mehrfach', quelle: 'storage_paths',
    ops: [
      { op: 'eines', name: 'ist eines von', param: 'storage_path__id__in' },
      { op: 'keines', name: 'ist keines von', param: 'storage_path__id__none' },
    ],
  },
  {
    art: 'titel', name: 'Titel', typ: 'text',
    ops: [
      { op: 'enthaelt', name: 'enthält', param: 'title__icontains' },
      { op: 'beginnt', name: 'beginnt mit', param: 'title__istartswith' },
      { op: 'genau', name: 'ist genau', param: 'title__iexact' },
    ],
  },
  {
    art: 'inhalt', name: 'Inhalt (OCR)', typ: 'text',
    ops: [{ op: 'enthaelt', name: 'enthält', param: 'content__icontains' }],
  },
  {
    art: 'volltext', name: 'Volltextsuche (Abfrage)', typ: 'text',
    ops: [{ op: 'ist', name: 'nach', param: 'query' }],
  },
  {
    art: 'einfachsuche', name: 'Volltextsuche (einfach)', typ: 'text',
    ops: [{ op: 'ist', name: 'nach', param: 'text' }],
  },
  {
    art: 'titelsuche', name: 'Titelsuche', typ: 'text',
    ops: [{ op: 'ist', name: 'nach', param: 'title_search' }],
  },
  {
    art: 'dateiname', name: 'Originaldateiname', typ: 'text',
    ops: [
      { op: 'enthaelt', name: 'enthält', param: 'original_filename__icontains' },
      { op: 'beginnt', name: 'beginnt mit', param: 'original_filename__istartswith' },
    ],
  },
  {
    art: 'erstellt', name: 'Erstellt am', typ: 'datum',
    ops: [
      { op: 'ab', name: 'ab', param: 'created__date__gte' },
      { op: 'bis', name: 'bis', param: 'created__date__lte' },
    ],
  },
  {
    art: 'erstellt_jahr', name: 'Erstellt – Jahr', typ: 'zahl',
    ops: [{ op: 'ist', name: 'ist', param: 'created__year' }],
  },
  {
    art: 'erstellt_monat', name: 'Erstellt – Monat', typ: 'zahl',
    ops: [{ op: 'ist', name: 'ist', param: 'created__month' }],
  },
  {
    art: 'hinzugefuegt', name: 'Hinzugefügt am', typ: 'datum',
    ops: [
      { op: 'ab', name: 'ab', param: 'added__date__gte' },
      { op: 'bis', name: 'bis', param: 'added__date__lte' },
    ],
  },
  {
    art: 'posteingang', name: 'Im Posteingang', typ: 'jaNein',
    ops: [{ op: 'ist', name: 'ist', param: 'is_in_inbox' }],
  },
  {
    art: 'hat_zusatzfelder', name: 'Zusatzfelder vorhanden', typ: 'jaNein',
    ops: [{ op: 'ist', name: 'ist', param: 'has_custom_fields' }],
  },
];

// --- Zusatzfelder ------------------------------------------------------------
// Operatoren genau nach EXPR_BY_CATEGORY von Paperless, je Datentyp.
// "ist nicht" und "ist keines von" sind keine Operatoren von Paperless: die
// Atome kennen nur exact und in. Verneint wird über den Knoten ["NOT", …],
// den der Parser als Regel 6 führt. Nach aussen sind es trotzdem gewöhnliche
// Operatoren, damit der Editor sie wie jeden anderen behandeln kann.
//
// Zu beachten: verneint wird die ganze Bedingung. "Typ Dokument ist nicht
// Lohnabrechnung" trifft deshalb auch Dokumente, bei denen das Feld gar
// nicht gesetzt ist. Wer das ausschliessen will, nimmt zusätzlich
// "ist gesetzt = ja".
const OPS_BASIS = [
  { op: 'exact', name: 'ist' },
  { op: 'nicht', name: 'ist nicht' },
  { op: 'in', name: 'ist eines von' },
  { op: 'nicht_in', name: 'ist keines von' },
  { op: 'exists', name: 'ist gesetzt' },
];

// Verneinter Operator -> Operator im Atom, und der Weg zurück.
const VERNEINT_ZU = { nicht: 'exact', nicht_in: 'in' };
const VERNEINT_VON = { exact: 'nicht', in: 'nicht_in' };
const OPS_TEXT = [
  { op: 'icontains', name: 'enthält' },
  { op: 'istartswith', name: 'beginnt mit' },
  { op: 'iendswith', name: 'endet mit' },
];
const OPS_RECHNEN = [
  { op: 'gt', name: 'grösser als' },
  { op: 'gte', name: 'grösser oder gleich' },
  { op: 'lt', name: 'kleiner als' },
  { op: 'lte', name: 'kleiner oder gleich' },
  { op: 'range', name: 'zwischen' },
];

const ZF_TYPEN = {
  string: { typ: 'text', ops: [...OPS_BASIS, ...OPS_TEXT] },
  url: { typ: 'text', ops: [...OPS_BASIS, ...OPS_TEXT] },
  longtext: { typ: 'text', ops: [...OPS_BASIS, ...OPS_TEXT] },
  date: { typ: 'datum', ops: [...OPS_BASIS, ...OPS_RECHNEN] },
  boolean: { typ: 'jaNein', ops: OPS_BASIS },
  integer: { typ: 'zahl', ops: [...OPS_BASIS, ...OPS_RECHNEN] },
  float: { typ: 'zahl', ops: [...OPS_BASIS, ...OPS_RECHNEN] },
  monetary: { typ: 'zahl', ops: [...OPS_BASIS, ...OPS_TEXT, ...OPS_RECHNEN] },
  select: { typ: 'optionen', ops: OPS_BASIS },
  documentlink: { typ: 'zahl', ops: [...OPS_BASIS, { op: 'contains', name: 'enthält' }] },
};

export function zusatzfeldArten() {
  return (stamm.custom_fields || []).map((feld) => {
    const form = ZF_TYPEN[feld.data_type] || ZF_TYPEN.string;
    return {
      art: 'zf:' + feld.id,
      name: feld.name,
      gruppe: 'Zusatzfelder',
      zusatzfeld: feld,
      typ: form.typ,
      optionen: ((feld.extra_data && feld.extra_data.select_options) || []).filter((o) => o.id),
      ops: form.ops,
    };
  });
}

export function alleArten() {
  return [...STATISCHE_ARTEN, ...zusatzfeldArten()];
}

export function artFinden(art) {
  return alleArten().find((a) => a.art === art) || null;
}

// --- Kriterien -> Filter -----------------------------------------------------
function kodiere(typ, wert) {
  if (typ === 'mehrfach' || typ === 'optionen') {
    return (Array.isArray(wert) ? wert : [wert]).filter((w) => w !== '' && w != null).join(',');
  }
  if (typ === 'jaNein') return wert ? 'true' : 'false';
  return String(wert == null ? '' : wert);
}

function zfAtom(kriterium, definition) {
  const id = definition.zusatzfeld.id;
  const { op, wert } = kriterium;
  if (op === 'exists') return [id, 'exists', !!wert];
  if (op === 'in') return [id, 'in', Array.isArray(wert) ? wert : [wert]];
  if (op === 'range') return [id, 'range', Array.isArray(wert) ? wert : ['', '']];
  if (definition.typ === 'jaNein') return [id, op, !!wert];
  // Die Auswahlliste liefert auch bei "ist" mehrere Werte, weil dasselbe
  // Eingabefeld für "ist eines von" dient. exact vergleicht mit genau einem
  // Wert – der erste gewählte gilt, sonst käme eine Zeichenkette wie "a,b"
  // heraus, die keine Option trifft.
  if (definition.typ === 'optionen' && Array.isArray(wert)) {
    return [id, op, String(wert[0] == null ? '' : wert[0])];
  }
  if (definition.typ === 'zahl' && wert !== '' && !isNaN(Number(wert))) {
    return [id, op, Number(wert)];
  }
  return [id, op, String(wert == null ? '' : wert)];
}

/** Ein Zusatzfeld-Kriterium als Ausdruck – verneinte Operatoren als NOT. */
function zfAusdruck(kriterium, definition) {
  const innerer = VERNEINT_ZU[kriterium.op];
  if (!innerer) return zfAtom(kriterium, definition);
  return ['NOT', zfAtom({ ...kriterium, op: innerer }, definition)];
}

export function nachFilter(kriterien, roh = {}) {
  const filter = { ...roh };
  const atome = [];

  for (const kriterium of kriterien || []) {
    const definition = artFinden(kriterium.art);
    if (!definition) continue;

    if (definition.zusatzfeld) {
      atome.push(zfAusdruck(kriterium, definition));
      continue;
    }
    const op = definition.ops.find((o) => o.op === kriterium.op) || definition.ops[0];
    const wert = kodiere(definition.typ, kriterium.wert);
    if (wert === '' && definition.typ !== 'jaNein') continue;
    filter[op.param] = wert;
  }

  if (atome.length === 1) {
    filter.custom_field_query = JSON.stringify(atome[0]);
  } else if (atome.length > 1) {
    filter.custom_field_query = JSON.stringify(['AND', atome]);
  }
  return filter;
}

// --- Filter -> Kriterien -----------------------------------------------------
function dekodiere(typ, wert) {
  if (typ === 'mehrfach' || typ === 'optionen') {
    return String(wert).split(',').map((t) => t.trim()).filter(Boolean);
  }
  if (typ === 'jaNein') return ['true', '1', 'yes'].includes(String(wert).toLowerCase());
  return wert;
}

const istAtom = (a) => Array.isArray(a) && a.length === 3 && typeof a[0] !== 'string';

/** Ein Atom, auch als ["NOT", atom]. Gibt die Form [feld, op, wert] zurück,
 *  bei NOT mit dem verneinten Operator – der Rest liest es dann wie jedes
 *  andere Atom. Null heisst: nicht flach lesbar. */
function atomLesen(knoten) {
  if (istAtom(knoten)) return knoten;
  if (Array.isArray(knoten) && knoten.length === 2
      && String(knoten[0]).toUpperCase() === 'NOT' && istAtom(knoten[1])) {
    const [feld, op, wert] = knoten[1];
    const verneint = VERNEINT_VON[op];
    return verneint ? [feld, verneint, wert] : null;
  }
  return null;
}

function atomeAus(roh) {
  // Flach lesbar sind ein einzelnes Atom und ein AND über Atome, jeweils
  // auch verneint. Alles andere bleibt Rohparameter, damit keine Bedingung
  // stillschweigend verfälscht wird.
  let ausdruck;
  try { ausdruck = JSON.parse(roh); } catch (_) { return null; }
  if (!Array.isArray(ausdruck) || !ausdruck.length) return null;
  const einzeln = atomLesen(ausdruck);
  if (einzeln) return [einzeln];
  if (String(ausdruck[0]).toUpperCase() === 'AND' && Array.isArray(ausdruck[1])) {
    const gelesen = ausdruck[1].map(atomLesen);
    if (gelesen.every(Boolean)) return gelesen;
  }
  return null;
}

export function ausFilter(filter) {
  const kriterien = [];
  const roh = {};
  const arten = alleArten();

  for (const [param, wert] of Object.entries(filter || {})) {
    if (param === 'custom_field_query') {
      const atome = atomeAus(wert);
      if (!atome) { roh[param] = wert; continue; }
      let alleErkannt = true;
      const gefunden = [];
      for (const [feldId, op, atomWert] of atome) {
        const definition = arten.find((a) => a.zusatzfeld && String(a.zusatzfeld.id) === String(feldId));
        if (!definition || !definition.ops.some((o) => o.op === op)) { alleErkannt = false; break; }
        let w = atomWert;
        if (op === 'in' || op === 'nicht_in' || op === 'range') {
          w = Array.isArray(atomWert) ? atomWert : [atomWert];
        }
        else if (definition.typ === 'optionen') w = [String(atomWert)];
        else if (definition.typ === 'jaNein' || op === 'exists') w = !!atomWert;
        gefunden.push({ art: definition.art, op, wert: w });
      }
      if (alleErkannt) kriterien.push(...gefunden);
      else roh[param] = wert;
      continue;
    }

    let treffer = null;
    for (const definition of arten) {
      const op = (definition.ops || []).find((o) => o.param === param);
      if (op) { treffer = { definition, op }; break; }
    }
    if (!treffer) { roh[param] = wert; continue; }
    kriterien.push({
      art: treffer.definition.art,
      op: treffer.op.op,
      wert: dekodiere(treffer.definition.typ, wert),
    });
  }
  return { kriterien, roh };
}

// --- Beschreibung in Worten --------------------------------------------------
export function beschreibe(filter) {
  const { kriterien, roh } = ausFilter(filter || {});
  const teile = kriterien.map((kriterium) => {
    const definition = artFinden(kriterium.art);
    if (!definition) return '';
    const op = definition.ops.find((o) => o.op === kriterium.op) || definition.ops[0];
    let wert = kriterium.wert;
    if (definition.typ === 'mehrfach') {
      wert = (wert || []).map((id) => {
        const eintrag = stamm.nachId[definition.quelle] && stamm.nachId[definition.quelle][String(id)];
        return eintrag ? eintrag.name : '#' + id;
      }).join(', ');
    } else if (definition.typ === 'optionen') {
      wert = (wert || []).map((id) => {
        const gefunden = (definition.optionen || []).find((o) => String(o.id) === String(id));
        return gefunden ? gefunden.label : id;
      }).join(', ');
    } else if (definition.typ === 'jaNein') {
      wert = wert ? 'ja' : 'nein';
    } else if (Array.isArray(wert)) {
      wert = wert.join(' – ');
    }
    return definition.name + ' ' + op.name + ' ' + wert;
  }).filter(Boolean);

  for (const param of Object.keys(roh)) teile.push(param);
  return teile.join(' · ');
}
