// Stammdaten aus Paperless. Der Editor baut sich daraus selbst auf (F2.1):
// ein neuer Tag oder ein neues Zusatzfeld erscheint ohne Änderung am Code.
import { api } from './api.js';
import { sprache } from './sprache.js';

const ARTEN = ['tags', 'correspondents', 'document_types', 'storage_paths', 'custom_fields'];

export const stamm = {
  tags: [], correspondents: [], document_types: [], storage_paths: [], custom_fields: [],
  nachId: { tags: {}, correspondents: {}, document_types: {}, storage_paths: {}, custom_fields: {} },
  geladen: false,
};

export async function stammLaden(neu = false) {
  if (stamm.geladen && !neu) return stamm;
  const ergebnisse = await Promise.all(ARTEN.map((a) => api.stammdaten(a)));
  ARTEN.forEach((art, n) => {
    const liste = (ergebnisse[n] && ergebnisse[n].ergebnisse) || [];
    // Sortiert wird in der Sprache des Benutzers: im Spanischen steht das
    // ñ hinter dem n, im Deutschen zählt das ä wie ein a.
    liste.sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), sprache()));
    stamm[art] = liste;
    stamm.nachId[art] = Object.fromEntries(liste.map((e) => [String(e.id), e]));
  });
  stamm.geladen = true;
  return stamm;
}

export function name(art, id) {
  const eintrag = stamm.nachId[art] && stamm.nachId[art][String(id)];
  return eintrag ? (eintrag.name || String(id)) : ('#' + id);
}

export function namen(art, ids) {
  return (ids || []).map((id) => name(art, id)).join(', ');
}
