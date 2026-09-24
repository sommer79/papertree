// Wie Tags und Korrespondenten aussehen sollen (F7).
//
// Anders als der Ordnerbaum gilt das für alle: ein Administrator pflegt es,
// jeder sieht dasselbe. Hier steht nur der Zwischenspeicher – geladen wird
// einmal beim Start, geändert wird über die Einstellungen.
import { api } from './api.js';

export const darstellung = {
  // Tag-ID (als Text) -> Symbolname
  tags: {},
  // Korrespondent-ID (als Text) -> { logo: url }
  korrespondenten: {},
  geladen: false,
};

export async function darstellungLaden(neu = false) {
  if (darstellung.geladen && !neu) return darstellung;
  try {
    const daten = await api.darstellung();
    darstellung.tags = daten.tags || {};
    darstellung.korrespondenten = daten.korrespondenten || {};
    darstellung.geladen = true;
  } catch (_) {
    // Ohne diese Angaben sieht die Liste schlichter aus, funktioniert aber.
    darstellung.geladen = true;
  }
  return darstellung;
}

/** Symbolname eines Tags, oder '' wenn keiner gesetzt ist. */
export function tagSymbol(tagId) {
  return darstellung.tags[String(tagId)] || '';
}

/** Logo-Adresse eines Korrespondenten, oder '' wenn keines hinterlegt ist. */
export function korrespondentLogo(korrespondentId) {
  const eintrag = darstellung.korrespondenten[String(korrespondentId)];
  return (eintrag && eintrag.logo) || '';
}

/** Nach einer Änderung in den Einstellungen: Zwischenspeicher nachführen,
 *  ohne alles neu zu holen. */
export function tagSymbolMerken(tagId, symbol) {
  if (symbol) darstellung.tags[String(tagId)] = symbol;
  else delete darstellung.tags[String(tagId)];
}

export function logoMerken(korrespondentId, url) {
  if (url) darstellung.korrespondenten[String(korrespondentId)] = { logo: url };
  else delete darstellung.korrespondenten[String(korrespondentId)];
}
