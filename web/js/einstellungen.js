// Einstellungen für Administratoren (F7).
//
// Hier wird festgelegt, wie Tags und Korrespondenten in PaperTree aussehen.
// Das gilt für alle Benutzer, darum ist die Seite Administratoren
// vorbehalten – die Prüfung steht im Server, diese Oberfläche blendet nur
// aus, was ohnehin abgewiesen würde.
import { api } from './api.js';
import { stamm } from './stamm.js';
import {
  darstellungLaden, korrespondentLogo, logoMerken, tagSymbol, tagSymbolMerken,
} from './darstellung.js';
import { symboleLaden, symbolSvg } from './symbole.js';
import { symbolWaehlen } from './symbolwahl.js';

function filterfeld(platzhalter, beiEingabe) {
  const feld = document.createElement('input');
  feld.type = 'search';
  feld.className = 'listensuche';
  feld.placeholder = platzhalter;
  feld.autocomplete = 'off';
  feld.addEventListener('input', () => beiEingabe(feld.value.trim().toLowerCase()));
  return feld;
}

function meldung(behaelter, text, istFehler = false) {
  behaelter.textContent = text;
  behaelter.className = 'hinweis' + (istFehler ? ' fehler-text' : '');
  if (!istFehler && text) setTimeout(() => { behaelter.textContent = ''; }, 3000);
}

// --- Tags --------------------------------------------------------------------
function tagsAbschnitt() {
  const karte = document.createElement('div');
  karte.className = 'karte einstellungskarte';

  const kopf = document.createElement('div');
  kopf.className = 'einstellungskopf';
  const titel = document.createElement('h2');
  titel.textContent = 'Tags';
  const erklaerung = document.createElement('p');
  erklaerung.className = 'hinweis';
  erklaerung.textContent =
    'Ein Symbol tritt in den Listen an die Stelle der Kurzform des Namens. '
    + 'Es gilt nur in PaperTree; in Paperless ändert sich nichts.';
  kopf.append(titel, erklaerung);

  const rueckmeldung = document.createElement('p');
  rueckmeldung.className = 'hinweis';

  const tabelle = document.createElement('div');
  tabelle.className = 'zuordnungsliste';

  const zeichnen = (suche = '') => {
    tabelle.innerHTML = '';
    const treffer = (stamm.tags || [])
      .filter((t) => !suche || String(t.name || '').toLowerCase().includes(suche));
    if (!treffer.length) {
      const leer = document.createElement('p');
      leer.className = 'hinweis';
      leer.textContent = 'Kein Tag gefunden.';
      tabelle.append(leer);
      return;
    }
    for (const tag of treffer) tabelle.append(tagZeile(tag, rueckmeldung));
  };

  karte.append(kopf, filterfeld('Tag suchen …', zeichnen), tabelle, rueckmeldung);
  zeichnen();
  return karte;
}

function tagZeile(tag, rueckmeldung) {
  const zeile = document.createElement('div');
  zeile.className = 'zuordnung';

  const vorschau = document.createElement('span');
  vorschau.className = 'zuordnung-vorschau';

  const name = document.createElement('span');
  name.className = 'zuordnung-name';
  name.textContent = tag.name || '#' + tag.id;
  if (tag.color) {
    name.style.borderLeft = '3px solid ' + tag.color;
    name.style.paddingLeft = '7px';
  }

  const waehlen = document.createElement('button');
  waehlen.type = 'button';
  waehlen.className = 'knopf klein';
  waehlen.textContent = 'Symbol wählen';

  const weg = document.createElement('button');
  weg.type = 'button';
  weg.className = 'knopf klein gefahr';
  weg.textContent = 'Entfernen';

  const zeigen = () => {
    const symbol = tagSymbol(tag.id);
    vorschau.innerHTML = '';
    if (symbol) {
      vorschau.append(symbolSvg(symbol, 18));
      vorschau.title = symbol;
    } else {
      // Ohne Symbol steht hier, was die Liste sonst zeigt: die Kurzform.
      const kurz = document.createElement('span');
      kurz.className = 'zuordnung-kurz';
      kurz.textContent = String(tag.name || '').slice(0, 5);
      vorschau.append(kurz);
      vorschau.title = 'Kein Symbol – in der Liste steht die Kurzform';
    }
    weg.disabled = !symbol;
  };

  const speichern = async (symbol) => {
    try {
      const ergebnis = await api.tagSymbol(tag.id, symbol);
      tagSymbolMerken(tag.id, ergebnis.symbol);
      zeigen();
      meldung(rueckmeldung, ergebnis.symbol
        ? `${tag.name}: Symbol ${ergebnis.symbol} gesetzt.`
        : `${tag.name}: Symbol entfernt.`);
    } catch (fehler) {
      meldung(rueckmeldung, 'Nicht gespeichert: ' + (fehler.message || fehler), true);
    }
  };

  waehlen.addEventListener('click', () => {
    symbolWaehlen(tagSymbol(tag.id), (symbol) => speichern(symbol),
                  { name: tag.name || '#' + tag.id, art: 'Tag' });
  });
  weg.addEventListener('click', () => speichern(''));

  zeigen();
  // Ist ein Symbol gesetzt, aber der Satz noch nicht geladen, nachziehen.
  if (tagSymbol(tag.id)) symboleLaden().then(zeigen);

  const knoepfe = document.createElement('span');
  knoepfe.className = 'zuordnung-knoepfe';
  knoepfe.append(waehlen, weg);
  zeile.append(vorschau, name, knoepfe);
  return zeile;
}

// --- Korrespondenten ---------------------------------------------------------
function korrespondentenAbschnitt() {
  const karte = document.createElement('div');
  karte.className = 'karte einstellungskarte';

  const kopf = document.createElement('div');
  kopf.className = 'einstellungskopf';
  const titel = document.createElement('h2');
  titel.textContent = 'Korrespondenten';
  const erklaerung = document.createElement('p');
  erklaerung.className = 'hinweis';
  erklaerung.textContent =
    'Das Logo erscheint klein vor dem Namen in den Listen und gross in der '
    + 'Ecke der Dokumentansicht. PNG, JPEG, GIF, WEBP oder SVG, höchstens 1 MB.';
  kopf.append(titel, erklaerung);

  const rueckmeldung = document.createElement('p');
  rueckmeldung.className = 'hinweis';

  const tabelle = document.createElement('div');
  tabelle.className = 'zuordnungsliste';

  const zeichnen = (suche = '') => {
    tabelle.innerHTML = '';
    const treffer = (stamm.correspondents || [])
      .filter((k) => !suche || String(k.name || '').toLowerCase().includes(suche));
    if (!treffer.length) {
      const leer = document.createElement('p');
      leer.className = 'hinweis';
      leer.textContent = 'Kein Korrespondent gefunden.';
      tabelle.append(leer);
      return;
    }
    for (const eintrag of treffer) tabelle.append(logoZeile(eintrag, rueckmeldung));
  };

  karte.append(kopf, filterfeld('Korrespondent suchen …', zeichnen), tabelle,
               rueckmeldung);
  zeichnen();
  return karte;
}

function logoZeile(korrespondent, rueckmeldung) {
  const zeile = document.createElement('div');
  zeile.className = 'zuordnung';

  const vorschau = document.createElement('span');
  vorschau.className = 'zuordnung-vorschau logo';

  const name = document.createElement('span');
  name.className = 'zuordnung-name';
  name.textContent = korrespondent.name || '#' + korrespondent.id;

  const auswahl = document.createElement('input');
  auswahl.type = 'file';
  auswahl.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
  auswahl.hidden = true;

  const waehlen = document.createElement('button');
  waehlen.type = 'button';
  waehlen.className = 'knopf klein';
  waehlen.textContent = 'Logo wählen';

  const weg = document.createElement('button');
  weg.type = 'button';
  weg.className = 'knopf klein gefahr';
  weg.textContent = 'Entfernen';

  const zeigen = () => {
    const url = korrespondentLogo(korrespondent.id);
    vorschau.innerHTML = '';
    if (url) {
      const bild = document.createElement('img');
      // Zeitstempel, damit nach dem Austausch nicht das alte Bild aus dem
      // Zwischenspeicher des Browsers stehen bleibt.
      bild.src = url + '?t=' + Date.now();
      bild.alt = '';
      vorschau.append(bild);
    } else {
      vorschau.textContent = '—';
    }
    weg.disabled = !url;
  };

  waehlen.addEventListener('click', () => auswahl.click());
  auswahl.addEventListener('change', async () => {
    const datei = auswahl.files && auswahl.files[0];
    if (!datei) return;
    waehlen.disabled = true;
    try {
      const ergebnis = await api.logoHochladen(korrespondent.id, datei);
      logoMerken(korrespondent.id, ergebnis.logo);
      zeigen();
      meldung(rueckmeldung, `${korrespondent.name}: Logo gesetzt.`);
    } catch (fehler) {
      const text = (fehler.daten && fehler.daten.fehler) || fehler.message || fehler;
      meldung(rueckmeldung, `${korrespondent.name}: ${text}`, true);
    } finally {
      waehlen.disabled = false;
      auswahl.value = '';
    }
  });

  weg.addEventListener('click', async () => {
    try {
      await api.logoLoeschen(korrespondent.id);
      logoMerken(korrespondent.id, '');
      zeigen();
      meldung(rueckmeldung, `${korrespondent.name}: Logo entfernt.`);
    } catch (fehler) {
      meldung(rueckmeldung, 'Nicht entfernt: ' + (fehler.message || fehler), true);
    }
  });

  zeigen();
  const knoepfe = document.createElement('span');
  knoepfe.className = 'zuordnung-knoepfe';
  knoepfe.append(waehlen, weg, auswahl);
  zeile.append(vorschau, name, knoepfe);
  return zeile;
}

// --- Seite -------------------------------------------------------------------
export async function einstellungenZeichnen() {
  await darstellungLaden(true);

  const huelle = document.createElement('div');
  const kopf = document.createElement('div');
  kopf.className = 'titelzeile haftend';
  const titel = document.createElement('h1');
  titel.textContent = 'Einstellungen';
  kopf.append(titel);
  huelle.append(kopf);

  const spalten = document.createElement('div');
  spalten.className = 'einstellungen';
  spalten.append(tagsAbschnitt(), korrespondentenAbschnitt());
  huelle.append(spalten);
  return huelle;
}
