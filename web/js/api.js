// Zugriff auf die PaperTree-API. Relative Pfade, damit die Oberfläche unter
// jedem nginx-Präfix läuft.
export const BASIS = new URL('.', location.href).href;

let angemeldet = true;

export class ApiFehler extends Error {
  constructor(status, daten) {
    super((daten && (daten.fehler || daten.text)) || ('HTTP ' + status));
    this.status = status;
    this.daten = daten || {};
  }
}

async function ruf(pfad, einstellungen = {}) {
  const antwort = await fetch(BASIS + pfad.replace(/^\//, ''), {
    credentials: 'same-origin',
    headers: einstellungen.koerper ? { 'Content-Type': 'application/json' } : {},
    method: einstellungen.methode || 'GET',
    body: einstellungen.koerper ? JSON.stringify(einstellungen.koerper) : undefined,
  });
  if (antwort.status === 401) {
    angemeldet = false;
    let daten = {};
    try { daten = await antwort.json(); } catch (_) { /* leer */ }
    document.dispatchEvent(new CustomEvent('papertree:abgemeldet', { detail: daten }));
    throw new ApiFehler(401, daten);
  }
  if (!antwort.ok) {
    let daten = {};
    try { daten = await antwort.json(); } catch (_) { /* leer */ }
    throw new ApiFehler(antwort.status, daten);
  }
  angemeldet = true;
  if (antwort.status === 204) return null;
  return antwort.json();
}

export const istAngemeldet = () => angemeldet;

export const api = {
  ich: () => ruf('api/ich'),
  stammdaten: (art) => ruf('api/stammdaten/' + art),

  baum: () => ruf('api/baum'),
  ordnerAnlegen: (daten) => ruf('api/baum', { methode: 'POST', koerper: daten }),
  ordnerAendern: (id, daten) => ruf('api/baum/' + id, { methode: 'PATCH', koerper: daten }),
  ordnerLoeschen: (id) => ruf('api/baum/' + id, { methode: 'DELETE' }),
  reihenfolge: (eltern_id, ids) =>
    ruf('api/baum/reihenfolge', { methode: 'POST', koerper: { eltern_id, ids } }),

  effektiv: (id) => ruf('api/baum/' + id + '/effektiv'),
  anzahl: (id) => ruf('api/baum/' + id + '/anzahl'),
  gruppen: (id) => ruf('api/baum/' + id + '/gruppen'),
  ordnerDokumente: (id, params) => ruf('api/baum/' + id + '/dokumente?' + new URLSearchParams(params)),

  export: () => ruf('api/baum/export'),
  import: (daten, eltern_id) =>
    ruf('api/baum/import', { methode: 'POST', koerper: { ...daten, eltern_id } }),

  vorschau: (filter, geerbt) =>
    ruf('api/vorschau', { methode: 'POST', koerper: { filter, geerbt } }),
  ausLink: (link) => ruf('api/link', { methode: 'POST', koerper: { link } }),
  suche: (params) => ruf('api/suche?' + new URLSearchParams(params)),

  dokument: (id) => ruf('api/dokumente/' + id),
  notizen: (id) => ruf('api/dokumente/' + id + '/notizen'),

  // Darstellung: Symbole für Tags, Logos für Korrespondenten (F7). Lesen
  // darf jeder, ändern nur ein Administrator – geprüft wird das im Server.
  darstellung: () => ruf('api/darstellung'),
  tagSymbol: (tagId, symbol) =>
    ruf('api/einstellungen/tags/' + tagId, { methode: 'PUT', koerper: { symbol } }),
  logoHochladen: async (korrespondentId, datei) => {
    const feld = new FormData();
    feld.append('datei', datei);
    const antwort = await fetch(
      BASIS + 'api/einstellungen/korrespondenten/' + korrespondentId + '/logo',
      { method: 'POST', body: feld, credentials: 'same-origin' });
    let daten = {};
    try { daten = await antwort.json(); } catch (_) { /* leer */ }
    if (!antwort.ok) throw new ApiFehler(antwort.status, daten);
    return daten;
  },
  logoLoeschen: (korrespondentId) =>
    ruf('api/einstellungen/korrespondenten/' + korrespondentId + '/logo',
        { methode: 'DELETE' }),
  logoUrl: (korrespondentId) => BASIS + 'api/logos/' + korrespondentId,

  vorschauUrl: (id) => BASIS + 'api/dokumente/' + id + '/vorschau',
  bildUrl: (id) => BASIS + 'api/dokumente/' + id + '/bild',
  dateiUrl: (id) => BASIS + 'api/dokumente/' + id + '/datei',
};
