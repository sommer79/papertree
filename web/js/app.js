// PaperTree – Verdrahtung und Wegweiser.
import { api } from './api.js';
import { stammLaden, stamm } from './stamm.js';
import { baum, baumLaden, baumZeichnen, baumVerdrahten, fehlendeReferenzen,
         gruppenVergessen, nachfahrenZahl, ordnerKinder, pfadVon, reiterVon,
         zaehlerVergessen } from './baum.js';
import { listeZeichnen, markeChip, SPALTEN } from './liste.js';
import { detailAufraeumen, detailZeichnen } from './detail.js';
import { editorOeffnen, editorVorbereiten } from './editor.js';
import { beschreibe } from './kriterien.js';
import { tooltipVerdrahten } from './tooltip.js';
import { darstellung, darstellungLaden } from './darstellung.js';
import { symbolInhalt, symboleLaden, symbolSvg } from './symbole.js';
import { einstellungenZeichnen } from './einstellungen.js';
import { sprache, spracheEinrichten, t, textenSetzen, tn, zahlText } from './sprache.js';

const inhalt = document.getElementById('inhalt');
let ich = null;

// --- Hilfen ------------------------------------------------------------------
function zeige(knoten) {
  inhalt.innerHTML = '';
  inhalt.append(knoten);
  inhalt.scrollTop = 0;
}

function laedt(text = null) {
  const p = document.createElement('div');
  p.className = 'laedt';
  p.textContent = text === null ? t('allgemein.laedt') : text;
  return p;
}

function kasten(text, istFehler = false) {
  const p = document.createElement('div');
  p.className = 'hinweiskasten' + (istFehler ? ' fehler' : '');
  p.textContent = text;
  return p;
}

// Die Zeichen an den Knöpfen. Klein gehalten und ohne eigene Datei: es sind
// vier Striche, dafür lohnt der Symbolsatz nicht.
const ZEICHEN = {
  ordner: 'M4 6.5a1.5 1.5 0 0 1 1.5-1.5h3.2l1.4 1.8h5.9a1.5 1.5 0 0 1 1.5 1.5v6.2'
    + 'a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 14.5Z',
  stift: 'M11.6 3.9a1.6 1.6 0 0 1 2.3 2.3l-7 7-3 .7.7-3Z',
  reiter: 'M3.5 7.5h5l1.2-2h6.8v9a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1Z',
};

function zeichen(name, groesse = 15) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', String(groesse));
  svg.setAttribute('height', String(groesse));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const pfad = document.createElementNS(ns, 'path');
  pfad.setAttribute('d', ZEICHEN[name]);
  svg.append(pfad);
  return svg;
}

/** Ein Knopf mit Zeichen davor. */
function werkzeugknopf(name, text, beiKlick) {
  const knopf = document.createElement('button');
  knopf.className = 'knopf werkzeugknopf';
  knopf.append(zeichen(name), document.createTextNode(text));
  knopf.addEventListener('click', beiKlick);
  return knopf;
}

function wegAuslesen() {
  const roh = (location.hash || '#/').replace(/^#/, '');
  const [pfad, anfrage] = roh.split('?');
  const teile = pfad.split('/').filter(Boolean);
  return { teile, params: new URLSearchParams(anfrage || '') };
}

function gehe(pfad) {
  location.hash = pfad;
}

// --- Startseite (F7) ---------------------------------------------------------
// Welche Spalten die Startseite zeigt, gehört zu keinem Ordner - es wird im
// Browser gemerkt, wie die aufgeklappten Ordner im Baum.
const SPALTEN_STARTSEITE = 'papertree.startseite.spalten';

function startseitenSpalten() {
  try {
    const gemerkt = JSON.parse(localStorage.getItem(SPALTEN_STARTSEITE) || 'null');
    if (Array.isArray(gemerkt) && gemerkt.length) return gemerkt.filter((s) => SPALTEN[s]);
  } catch (_) { /* privates Fenster: dann die Vorgabe */ }
  return ['title', 'correspondent', 'document_type', 'tags', 'created'];
}

// Welche Kachel gerade gezogen wird. Wie im Baum reicht eine Variable: es
// kann immer nur eine sein.
let gezogeneKachel = null;

/**
 * Kacheln lassen sich umsortieren.
 *
 * Abgelegt wird vor oder hinter der Kachel, über der die Maus steht – je
 * nachdem, auf welcher Hälfte sie loslässt. Gespeichert wird erst beim
 * Ablegen, mit einem Aufruf für die ganze Reihe.
 */
function kachelZiehen(kachel, gitter) {
  kachel.draggable = true;

  kachel.addEventListener('dragstart', (ereignis) => {
    gezogeneKachel = kachel;
    ereignis.dataTransfer.effectAllowed = 'move';
    // Firefox startet den Vorgang nur mit einer Nutzlast.
    ereignis.dataTransfer.setData('text/plain', kachel.dataset.knoten);
    kachel.classList.add('zieht');
  });

  kachel.addEventListener('dragend', () => {
    gezogeneKachel = null;
    kachel.classList.remove('zieht');
    for (const k of gitter.children) k.classList.remove('ziel-davor', 'ziel-danach');
  });

  kachel.addEventListener('dragover', (ereignis) => {
    if (!gezogeneKachel || gezogeneKachel === kachel) return;
    ereignis.preventDefault();
    ereignis.dataTransfer.dropEffect = 'move';
    const masse = kachel.getBoundingClientRect();
    const davor = ereignis.clientX < masse.left + masse.width / 2;
    kachel.classList.toggle('ziel-davor', davor);
    kachel.classList.toggle('ziel-danach', !davor);
  });

  kachel.addEventListener('dragleave', () => {
    kachel.classList.remove('ziel-davor', 'ziel-danach');
  });

  kachel.addEventListener('drop', async (ereignis) => {
    ereignis.preventDefault();
    ereignis.stopPropagation();
    const masse = kachel.getBoundingClientRect();
    const davor = ereignis.clientX < masse.left + masse.width / 2;
    kachel.classList.remove('ziel-davor', 'ziel-danach');
    if (!gezogeneKachel || gezogeneKachel === kachel) return;
    // Erst im Bild verschieben, dann speichern: so folgt die Kachel sofort,
    // auch wenn die Leitung langsam ist.
    gitter.insertBefore(gezogeneKachel, davor ? kachel : kachel.nextSibling);
    const ids = [...gitter.children].map((k) => Number(k.dataset.knoten));
    gezogeneKachel = null;
    try {
      await api.dashboardReihenfolge(ids);
      // Die geladenen Knoten nachziehen, damit ein Wechsel der Ansicht nicht
      // die alte Reihenfolge zurückholt.
      ids.forEach((id, stelle) => {
        if (baum.nachId[id]) baum.nachId[id].dashboard_reihenfolge = stelle + 1;
      });
    } catch (fehler) {
      alert(t('fehler.verschieben', { grund: fehler.message || fehler }));
    }
  });
}

async function dashboard(params) {
  const huelle = document.createElement('div');
  const kopf = document.createElement('div');
  kopf.className = 'titelzeile';
  const titel = document.createElement('h1');
  titel.textContent = t('dashboard.titel');
  kopf.append(titel);
  huelle.append(kopf);

  const gewaehlt = baum.knoten.filter((k) => k.auf_dashboard);
  if (!gewaehlt.length) huelle.append(kasten(t('dashboard.leer')));

  // Die Kacheln stehen in ihrer eigenen Reihenfolge, nicht in der des Baums:
  // hier liegen Ordner aus verschiedenen Ebenen nebeneinander.
  gewaehlt.sort((a, b) => (a.dashboard_reihenfolge || 0) - (b.dashboard_reihenfolge || 0)
    || a.name.localeCompare(b.name, sprache()));

  const gitter = document.createElement('div');
  gitter.className = 'dashkacheln';
  for (const knoten of gewaehlt) {
    const kachel = document.createElement('a');
    kachel.className = 'karte dashkachel';
    kachel.href = '#/ordner/' + knoten.id;
    kachel.dataset.knoten = knoten.id;

    // Das Symbol des Ordners oben rechts – dasselbe wie im Baum.
    const symbolfeld = document.createElement('span');
    symbolfeld.className = 'dashsymbol';
    symbolfeld.append(symbolSvg(knoten.symbol || '', 18));
    if (knoten.symbol && !symbolInhalt(knoten.symbol)) symboleLaden();

    const zahl = document.createElement('div');
    zahl.className = 'zahl';
    zahl.textContent = '…';
    const name = document.createElement('div');
    name.textContent = knoten.name;
    const wo = document.createElement('div');
    wo.className = 'wo';
    wo.textContent = pfadVon(knoten.id).slice(0, -1).map((k) => k.name).join(' › ');
    kachel.append(symbolfeld, zahl, name, wo);
    kachelZiehen(kachel, gitter);
    gitter.append(kachel);
    api.anzahl(knoten.id)
      .then((ergebnis) => { zahl.textContent = zahlText(ergebnis.anzahl); })
      .catch(() => { zahl.textContent = '–'; });
  }
  if (gewaehlt.length) huelle.append(gitter);

  // Der ganze Bestand, neueste zuerst - ohne Ordner, ohne Filter. Die Liste
  // steht auch dann, wenn keine Ordner auf dem Dashboard liegen: dann ist sie
  // das Einzige, was die Startseite zu zeigen hat.
  const neueste = document.createElement('div');
  neueste.className = 'neueste';
  const ueberschrift = document.createElement('h2');
  ueberschrift.textContent = t('dashboard.neueste');
  neueste.append(ueberschrift);
  const filterstelle = document.createElement('div');
  const bereich = document.createElement('div');
  bereich.append(laedt());
  neueste.append(filterstelle, bereich);
  huelle.append(neueste);
  zeige(huelle);

  function wegMerken() {
    const anfrage = params.toString();
    const ziel = '#/dashboard' + (anfrage ? '?' + anfrage : '');
    if (location.hash !== ziel) history.replaceState(null, '', ziel);
  }

  const suchfeld = listensuche(params, wegMerken, () => nachladen());
  let spalten = startseitenSpalten();

  async function nachladen() {
    const gewaehlteTags = tagsAus(params);
    filterstelle.innerHTML = '';
    const leiste = filterLeiste(params, () => { wegMerken(); nachladen(); });
    if (leiste) filterstelle.append(leiste);
    try {
      const ergebnis = await api.neueste({
        page: Number(params.get('page') || 1),
        page_size: 15,
        ordering: params.get('ordering') || '-created',
        q: params.get('q') || '',
        tag: gewaehlteTags.join(','),
      });
      bereich.innerHTML = '';
      bereich.append(listeZeichnen(ergebnis, spalten, {
        gewaehlteTags,
        suchfeld,
        paperlessBasis: ich && ich.paperless,
        beiSpalten: (neueSpalten) => {
          spalten = neueSpalten;
          try { localStorage.setItem(SPALTEN_STARTSEITE, JSON.stringify(neueSpalten)); }
          catch (_) { /* dann gilt die Wahl nur für diesen Besuch */ }
          nachladen();
        },
        beiTagKlick: (tagId) => tagUmschalten(params, tagId, nachladen),
        beiSeite: (nummer) => { params.set('page', nummer); wegMerken(); nachladen(); },
        beiSortierung: (feld) => {
          params.set('ordering', feld);
          params.set('page', 1);
          wegMerken();
          nachladen();
        },
      }));
    } catch (fehler) {
      bereich.innerHTML = '';
      bereich.append(kasten(t('fehler.dokumenteListe', { grund: fehler.message }), true));
    }
  }

  await nachladen();
}

// --- Ordner ------------------------------------------------------------------
async function ordnerZeigen(id, params) {
  const knoten = baum.nachId[id];
  if (!knoten) { zeige(kasten(t('ordner.unbekannt'), true)); return; }

  // Ein Reiter zeigt den Kopf seines Elternordners: der ist der Behälter,
  // die Reiter wechseln nur den Inhalt darunter. Bearbeitet wird trotzdem
  // der Reiter selbst - im Baum steht er nicht mehr, hier ist der einzige
  // Weg zu ihm.
  const behaelter = (knoten.als_reiter && baum.nachId[knoten.eltern_id])
    ? baum.nachId[knoten.eltern_id] : knoten;

  const huelle = document.createElement('div');

  const krumen = document.createElement('div');
  krumen.className = 'brotkrumen';
  krumen.append(zeichen('ordner', 16));
  pfadVon(behaelter.id).forEach((teil, n, alle) => {
    if (n) krumen.append(document.createTextNode(' › '));
    if (n === alle.length - 1) {
      krumen.append(document.createTextNode(teil.name));
    } else {
      const a = document.createElement('a');
      a.href = '#/ordner/' + teil.id;
      a.textContent = teil.name;
      krumen.append(a);
    }
  });
  huelle.append(krumen);

  const gruppe = params.get('gruppe');
  const inGruppe = gruppe !== null && !!knoten.gruppieren_nach;

  const kopf = document.createElement('div');
  kopf.className = 'titelzeile';
  const titel = document.createElement('h1');
  titel.textContent = behaelter.name;
  const anzahlAnzeige = document.createElement('span');
  anzahlAnzeige.className = 'anzahl';

  const werkzeuge = document.createElement('div');
  werkzeuge.className = 'werkzeuge';
  // Angelegt wird immer im Behälter; bearbeitet wird, was gerade offen ist.
  werkzeuge.append(
    // Ordnerzeichen, nicht Plus: das Plus steht schon im Text.
    werkzeugknopf('ordner', t('ordner.unterordnerNeu'), () => ordnerAnlegen(behaelter.id)),
    werkzeugknopf('reiter', t('ordner.reiterNeu'), () => ordnerAnlegen(behaelter.id, true)),
    werkzeugknopf('stift', t(knoten.als_reiter ? 'ordner.reiterBearbeiten' : 'ordner.bearbeiten'),
                  () => ordnerBearbeiten(id)));
  kopf.append(titel, anzahlAnzeige, werkzeuge);
  huelle.append(kopf);

  // Die Reiter des Behälters. Gibt es keine, fehlt die Leiste ganz - ein
  // einzelner Reiter "Alle Dokumente" sagt nichts.
  const reiter = reiterVon(behaelter.id);
  if (reiter.length) {
    huelle.append(reiterleiste(behaelter.id, id, reiter));
    // Jeder Reiter trägt seine Zahl; neben dem Titel stünde sie ein zweites Mal.
    anzahlAnzeige.hidden = true;
  }

  // Was dieser Ordner zeigt, in Worten
  const worte = [];
  if (knoten.eigener_filter) {
    worte.push(beschreibe(knoten.filter) || t('ordner.alleDokumente'));
  }
  if (knoten.kinder_einbeziehen) {
    worte.push(t(knoten.kinder_tief ? 'ordner.plusAlleUnter' : 'ordner.plusDirekteUnter'));
  }
  if (worte.length) {
    const beschreibung = document.createElement('p');
    beschreibung.className = 'hinweis';
    beschreibung.style.margin = '-6px 0 12px';
    beschreibung.textContent = worte.join(' · ');
    huelle.append(beschreibung);
  }

  const fehlend = knoten.eigener_filter ? fehlendeReferenzen(knoten.filter) : [];
  if (fehlend.length) {
    huelle.append(kasten(
      t('ordner.fehlendeReferenzen', { was: fehlend.join(', ') }), true));
  }

  const unterliste = ordnerKinder(id);
  if (unterliste.length) {
    const leiste = document.createElement('div');
    leiste.className = 'werkzeuge';
    leiste.style.margin = '0 0 12px';
    for (const kind of unterliste) {
      const a = document.createElement('a');
      a.className = 'knopf klein';
      a.href = '#/ordner/' + kind.id;
      a.textContent = kind.name;
      leiste.append(a);
    }
    huelle.append(leiste);
  }

  // Automatisch aufgespannte Unterordner (F4)
  if (knoten.gruppieren_nach) {
    const leiste = document.createElement('div');
    leiste.className = 'werkzeuge';
    leiste.style.margin = '0 0 12px';
    leiste.append(laedt(t('ordner.gruppenLaden')));
    huelle.append(leiste);
    api.gruppen(id).then((ergebnis) => {
      leiste.innerHTML = '';
      if (!(ergebnis.gruppen || []).length) {
        const leer = document.createElement('span');
        leer.className = 'hinweis';
        leer.textContent = t('ordner.gruppenLeer', { was: ergebnis.dimension_name || '' });
        leiste.append(leer);
        return;
      }
      if (inGruppe) {
        const zurueck = document.createElement('a');
        zurueck.className = 'knopf klein';
        zurueck.href = '#/ordner/' + id;
        zurueck.textContent = t('ordner.gruppeAlle');
        leiste.append(zurueck);
      }
      for (const g of ergebnis.gruppen) {
        const a = document.createElement('a');
        a.className = 'knopf klein' + (gruppe === g.wert ? ' haupt' : '');
        a.href = '#/ordner/' + id + '?gruppe=' + encodeURIComponent(g.wert);
        a.textContent = g.name + ' (' + zahlText(g.anzahl) + ')';
        leiste.append(a);
      }
    }).catch(() => { leiste.innerHTML = ''; });
  }

  // Reine Navigation – ausser wenn eine Gruppe gewählt ist, dann ist die
  // Gruppe selbst die Bedingung.
  if (!knoten.eigener_filter && !knoten.kinder_einbeziehen && !inGruppe) {
    const woanders = unterliste.length || knoten.gruppieren_nach;
    huelle.append(kasten(t(woanders
      ? 'ordner.nurNavigation' : 'ordner.nurNavigationLeer')));
    zeige(huelle);
    return;
  }

  const filterstelle = document.createElement('div');
  huelle.append(filterstelle);

  const bereich = document.createElement('div');
  bereich.append(laedt());
  huelle.append(bereich);
  zeige(huelle);

  // Das Suchfeld wird EINMAL gebaut und bei jedem Nachladen wiederverwendet.
  // Würde es mit der Liste neu entstehen, verlöre es bei jedem Tastendruck
  // den Fokus.
  const suchfeld = listensuche(params, wegMerken, () => nachladen());

  async function nachladen() {
    const seite = Number(params.get('page') || 1);
    const suche = params.get('q') || '';
    const ordering = params.get('ordering') || '';
    const gewaehlteTags = tagsAus(params);

    filterstelle.innerHTML = '';
    const leiste = filterLeiste(params, () => { wegMerken(); nachladen(); });
    if (leiste) filterstelle.append(leiste);

    try {
      const anfrage = { page: seite, q: suche, ordering };
      if (inGruppe) anfrage.gruppe = gruppe;
      if (gewaehlteTags.length) anfrage.tag = gewaehlteTags.join(',');
      const ergebnis = await api.ordnerDokumente(id, anfrage);
      anzahlAnzeige.textContent = tn('ordner.dokumente', ergebnis.count);
      const spalten = (knoten.spalten && knoten.spalten.length)
        ? knoten.spalten.filter((s) => SPALTEN[s])
        : ['title', 'correspondent', 'document_type', 'tags', 'created'];
      bereich.innerHTML = '';
      bereich.append(listeZeichnen(ergebnis, spalten, {
        darstellung: knoten.darstellung,
        gewaehlteTags,
        suchfeld,
        paperlessBasis: ich && ich.paperless,
        beiSpalten: async (neueSpalten) => {
          knoten.spalten = neueSpalten;
          try {
            await api.ordnerAendern(knoten.id, { spalten: neueSpalten });
          } catch (_) { /* die Ansicht stimmt, gespeichert wird beim nächsten Mal */ }
          nachladen();
        },
        beiTagKlick: (tagId) => tagUmschalten(params, tagId, nachladen),
        beiSeite: (nummer) => { params.set('page', nummer); wegMerken(); nachladen(); },
        beiSortierung: (feld) => {
          params.set('ordering', feld);
          params.set('page', 1);
          wegMerken();
          nachladen();
        },
      }));
    } catch (fehler) {
      bereich.innerHTML = '';
      bereich.append(kasten(t('fehler.dokumenteListe', { grund: fehler.message }), true));
    }
  }

  // Die Adresszeile mitführen, ohne hashchange auszulösen: sonst würde der
  // Wegweiser die ganze Ansicht neu bauen und der Fokus wäre weg. Der Link
  // bleibt damit trotzdem teilbar und der Zurück-Knopf sinnvoll.
  function wegMerken() {
    const anfrage = params.toString();
    const ziel = '#/ordner/' + id + (anfrage ? '?' + anfrage : '');
    if (location.hash !== ziel) history.replaceState(null, '', ziel);
  }

  await nachladen();
}

/**
 * Das Suchfeld über einer Liste.
 *
 * Es wird EINMAL gebaut und bei jedem Nachladen wiederverwendet - entstünde
 * es mit der Liste neu, verlöre es bei jedem Tastendruck den Fokus.
 */
function listensuche(params, wegMerken, beiEingabe) {
  const feld = document.createElement('input');
  feld.type = 'search';
  feld.className = 'listensuche';
  feld.placeholder = t('ordner.listensuche');
  feld.autocomplete = 'off';
  feld.value = params.get('q') || '';
  feld.setAttribute('aria-label', t('ordner.listensucheMarke'));
  let zeitgeber = null;
  feld.addEventListener('input', () => {
    clearTimeout(zeitgeber);
    zeitgeber = setTimeout(() => {
      const wert = feld.value.trim();
      if (wert) params.set('q', wert); else params.delete('q');
      params.set('page', 1);
      wegMerken();
      beiEingabe();
    }, 300);
  });
  feld.addEventListener('keydown', (ereignis) => {
    if (ereignis.key === 'Escape' && feld.value) {
      feld.value = '';
      feld.dispatchEvent(new Event('input'));
    }
  });
  return feld;
}

/**
 * Die Reiterleiste eines Ordners.
 *
 * Der erste Reiter ist der Ordner selbst - er zeigt, was ohne Reiter zu sehen
 * wäre. Die übrigen sind seine Unterordner mit gesetztem Schalter; ein Klick
 * führt auf deren eigene Ansicht, die denselben Kopf und dieselbe Leiste
 * zeigt, nur mit anderem Inhalt.
 */
function reiterleiste(elternId, aktiveId, reiter) {
  const leiste = document.createElement('div');
  leiste.className = 'reiterleiste';
  leiste.setAttribute('role', 'tablist');

  const eintrag = (ziel, beschriftung) => {
    const a = document.createElement('a');
    a.className = 'reiter' + (String(ziel) === String(aktiveId) ? ' aktiv' : '');
    a.href = '#/ordner/' + ziel;
    a.setAttribute('role', 'tab');
    a.setAttribute('aria-selected', String(ziel) === String(aktiveId) ? 'true' : 'false');
    const name = document.createElement('span');
    name.textContent = beschriftung;
    // Die Zahl kommt nach: sie kostet je Reiter eine Abfrage an Paperless,
    // und die Leiste soll deswegen nicht später erscheinen.
    const zahl = document.createElement('span');
    zahl.className = 'reiter-zahl';
    a.append(name, zahl);
    api.anzahl(ziel)
      .then((ergebnis) => { zahl.textContent = zahlText(ergebnis.anzahl); })
      .catch(() => { /* ohne Zahl bleibt der Reiter brauchbar */ });
    return a;
  };

  leiste.append(eintrag(elternId, t('ordner.reiterAlle')));
  for (const kind of reiter) leiste.append(eintrag(kind.id, kind.name));
  return leiste;
}

// --- Tag-Schnellfilter -------------------------------------------------------
// Ein Klick auf einen Tag in der Liste verengt die Ansicht. Der Filter steht
// in der Adresszeile, gilt also nur für diesen Besuch, lässt sich als Link
// weitergeben und verändert den gespeicherten Ordner nicht.
function tagsAus(params) {
  return (params.get('tag') || '').split(',').map((t) => t.trim()).filter(Boolean);
}

// Ändert die Auswahl in den Parametern; wer aktualisiert, entscheidet der
// Aufrufer – im Ordner wird nur die Liste nachgeladen, damit das Suchfeld
// seinen Fokus behält.
function tagsUmschaltenIn(params, id) {
  const aktuell = tagsAus(params);
  const text = String(id);
  const neu = aktuell.includes(text)
    ? aktuell.filter((t) => t !== text)
    : [...aktuell, text];
  if (neu.length) params.set('tag', neu.join(',')); else params.delete('tag');
  params.set('page', 1);
}

function tagUmschalten(params, id, aktualisieren) {
  tagsUmschaltenIn(params, id);
  aktualisieren();
}

function filterLeiste(params, aktualisieren) {
  const gewaehlt = tagsAus(params);
  if (!gewaehlt.length) return null;

  const leiste = document.createElement('div');
  leiste.className = 'filterleiste';

  const beschriftung = document.createElement('span');
  beschriftung.className = 'hinweis';
  beschriftung.textContent = tn('filter.gefiltertNach', gewaehlt.length);
  leiste.append(beschriftung);

  for (const id of gewaehlt) {
    const chip = markeChip(id, {
      voll: true,
      gewaehlt: true,
      beiKlick: () => tagUmschalten(params, id, aktualisieren),
    });
    leiste.append(chip);
  }

  const zuruecksetzen = document.createElement('button');
  zuruecksetzen.className = 'knopf klein';
  zuruecksetzen.textContent = t('filter.zuruecksetzen');
  zuruecksetzen.addEventListener('click', () => {
    params.delete('tag');
    params.set('page', 1);
    aktualisieren();
  });
  leiste.append(zuruecksetzen);

  return leiste;
}

function wegMit(neu) {
  const { teile, params } = wegAuslesen();
  for (const [schluessel, wert] of Object.entries(neu)) {
    if (wert === '' || wert == null) params.delete(schluessel);
    else params.set(schluessel, wert);
  }
  const anfrage = params.toString();
  return '#/' + teile.join('/') + (anfrage ? '?' + anfrage : '');
}

// --- Suche (F6.1) ------------------------------------------------------------
async function sucheZeigen(params) {
  const frage = params.get('q') || '';
  const seite = Number(params.get('page') || 1);
  const huelle = document.createElement('div');

  const kopf = document.createElement('div');
  kopf.className = 'titelzeile';
  const titel = document.createElement('h1');
  titel.textContent = t('suche.titel');
  const anzahlAnzeige = document.createElement('span');
  anzahlAnzeige.className = 'anzahl';
  kopf.append(titel, anzahlAnzeige);
  huelle.append(kopf);

  const beschreibung = document.createElement('p');
  beschreibung.className = 'hinweis';
  beschreibung.style.margin = '-6px 0 12px';
  beschreibung.textContent = t('suche.beschreibung', { frage });
  huelle.append(beschreibung);

  const gewaehlteTags = tagsAus(params);
  // In der Suchansicht darf die ganze Ansicht neu gebaut werden: dort gibt es
  // kein Feld, das seinen Fokus behalten muesste.
  const neuLadenSuche = () => {
    const anfrage = params.toString();
    gehe('#/suche' + (anfrage ? '?' + anfrage : ''));
  };
  const leiste = filterLeiste(params, neuLadenSuche);
  if (leiste) huelle.append(leiste);

  const bereich = document.createElement('div');
  bereich.append(laedt());
  huelle.append(bereich);
  zeige(huelle);

  try {
    const anfrage = { q: frage, page: seite };
    if (gewaehlteTags.length) anfrage.tag = gewaehlteTags.join(',');
    const ergebnis = await api.suche(anfrage);
    anzahlAnzeige.textContent = tn('suche.treffer', ergebnis.count);
    bereich.innerHTML = '';
    bereich.append(listeZeichnen(ergebnis, ['title', 'correspondent', 'document_type', 'tags', 'created'], {
      gewaehlteTags,
      paperlessBasis: ich && ich.paperless,
      beiTagKlick: (tagId) => tagUmschalten(params, tagId, neuLadenSuche),
      beiSeite: (nummer) => gehe(wegMit({ page: nummer })),
    }));
  } catch (fehler) {
    bereich.innerHTML = '';
    bereich.append(kasten(t('fehler.suche', { grund: fehler.message }), true));
  }
}

// --- Editor anstossen --------------------------------------------------------
async function ordnerBearbeiten(id) {
  const knoten = baum.nachId[id];
  if (!knoten) return;
  let geerbt = [];
  try {
    const ergebnis = await api.effektiv(id);
    geerbt = ergebnis.geerbt || [];
  } catch (_) { /* dann ohne Anzeige des geerbten Teils */ }
  editorOeffnen({ knoten, geerbt, kinderZahl: nachfahrenZahl(id) });
}

async function ordnerAnlegen(elternId, alsReiter = false) {
  let geerbt = [];
  if (elternId) {
    try {
      const ergebnis = await api.effektiv(elternId);
      geerbt = ergebnis.fuer_kind || [];
    } catch (_) { /* dann ohne Anzeige */ }
  }
  editorOeffnen({ knoten: null, elternId: elternId || null, geerbt, alsReiter });
}

// --- Wegweiser ---------------------------------------------------------------
async function wegweiser() {
  const { teile, params } = wegAuslesen();
  // Ein offenes PDF freigeben, bevor die Ansicht wechselt.
  detailAufraeumen();
  if (!baum.geladen) await baumLaden();

  if (teile[0] === 'ordner' && teile[1]) {
    // Ein Reiter steht nicht im Baum: dort wird sein Behälter hervorgehoben.
    const gezeigt = baum.nachId[teile[1]];
    baumZeichnen(gezeigt && gezeigt.als_reiter ? gezeigt.eltern_id : teile[1]);
    await ordnerZeigen(Number(teile[1]), params);
    return;
  }
  if (teile[0] === 'dok' && teile[1]) {
    baumZeichnen(null);
    zeige(laedt(t('detail.laedt')));
    try {
      zeige(await detailZeichnen(Number(teile[1])));
    } catch (fehler) {
      zeige(kasten(t('fehler.dokument', { grund: fehler.message }), true));
    }
    return;
  }
  if (teile[0] === 'einstellungen') {
    baumZeichnen(null);
    if (!ich || !ich.benutzer.admin) {
      zeige(kasten(t('einstellungen.nurAdmin'), true));
      return;
    }
    zeige(laedt(t('einstellungen.laedt')));
    try {
      zeige(await einstellungenZeichnen());
    } catch (fehler) {
      zeige(kasten(t('fehler.einstellungen', { grund: fehler.message }), true));
    }
    return;
  }
  if (teile[0] === 'suche') {
    baumZeichnen(null);
    await sucheZeigen(params);
    return;
  }
  baumZeichnen(null);
  await dashboard(params);
}

// --- Sicherung des Baums (F8.1) ----------------------------------------------
async function baumExportieren() {
  const daten = await api.export();
  const text = JSON.stringify(daten, null, 2);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'papertree-baum-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function baumImportieren(datei) {
  let daten;
  try {
    daten = JSON.parse(await datei.text());
  } catch (_) {
    alert(t('import.keinJson'));
    return;
  }
  if (!Array.isArray(daten.ordner)) {
    alert(t('import.keinBaum'));
    return;
  }
  const wieViele = daten.ordner.length;
  if (!confirm(tn('import.frage', wieViele))) return;
  const ergebnis = await api.import(daten, null);
  const hinweis = (ergebnis.verworfen || []).length
    ? '\n' + t('import.verworfen', { was: ergebnis.verworfen.slice(0, 5).join(', ') })
    : '';
  alert(tn('import.angelegt', ergebnis.angelegt) + hinweis);
  await neuLaden(null);
}

async function neuLaden(aktiveId) {
  zaehlerVergessen();
  gruppenVergessen(null);
  await baumLaden();
  if (aktiveId && baum.nachId[aktiveId]) { gehe('#/ordner/' + aktiveId); return; }
  // Zeigt die Adresse noch auf einen Ordner, den es nicht mehr gibt - etwa
  // nach dem Löschen -, stünde dort sonst "Diesen Ordner gibt es nicht".
  const { teile } = wegAuslesen();
  if (teile[0] === 'ordner' && teile[1] && !baum.nachId[teile[1]]) {
    gehe('#/dashboard');
    return;
  }
  baumZeichnen(null);
  await wegweiser();
}

// --- Start -------------------------------------------------------------------
// Merkt, dass wir soeben zur Anmeldung geschickt haben. Kommt danach gleich
// wieder ein 401, wird nicht erneut umgeleitet, sondern der Hinweis gezeigt –
// sonst liefe es zwischen PaperTree und Anmeldeseite im Kreis, etwa wenn die
// Sitzung zwar besteht, PaperTree aber trotzdem nichts bekommt. Die Marke
// gilt nur für diesen Tab und wird nach der ersten geglückten Abfrage
// wieder gelöscht.
const ANMELDUNG_VERSUCHT = 'papertree:anmeldung-versucht';

function marke(setzen) {
  try {
    if (setzen === undefined) return sessionStorage.getItem(ANMELDUNG_VERSUCHT) === '1';
    if (setzen) sessionStorage.setItem(ANMELDUNG_VERSUCHT, '1');
    else sessionStorage.removeItem(ANMELDUNG_VERSUCHT);
  } catch (_) { /* ohne sessionStorage bleibt es beim Hinweis */ }
  return false;
}

function abgemeldetZeigen(daten) {
  const anmeldung = daten && daten.anmeldung;
  if (anmeldung && !marke()) {
    marke(true);
    // Nach der Anmeldung dorthin zurück, wo der Benutzer hinwollte – das
    // Fragment gehört dazu, sonst landet er wieder auf der Startseite.
    const zurueck = location.pathname + location.search + location.hash;
    const trenner = anmeldung.includes('?') ? '&' : '?';
    location.replace(anmeldung + trenner + 'next=' + encodeURIComponent(zurueck));
    return;
  }

  const huelle = document.createElement('div');
  huelle.append(kasten(
    (daten && daten.hinweis) || t('anmeldung.hinweis'), true));
  const ziel = anmeldung || (daten && daten.paperless);
  if (ziel) {
    const a = document.createElement('a');
    a.className = 'knopf haupt';
    a.href = ziel;
    a.textContent = t('anmeldung.knopf');
    huelle.append(a);
  }
  zeige(huelle);
}

document.addEventListener('papertree:abgemeldet', (ereignis) => abgemeldetZeigen(ereignis.detail));

function seitenleisteVerdrahten() {
  const seitenleiste = document.getElementById('seite');
  document.getElementById('baum-auf').addEventListener('click', () => {
    seitenleiste.classList.toggle('offen');
  });

  // Ein Klick irgendwo neben der offenen Seitenleiste schliesst sie wieder.
  // Ausgenommen: der Burger-Knopf selbst (sonst würde sein Klick sie sofort
  // wieder zuklappen) sowie Ordnermenü und Dialoge – die hängen am body und
  // liegen damit technisch ausserhalb der Leiste.
  document.addEventListener('click', (ereignis) => {
    if (!seitenleiste.classList.contains('offen')) return;
    const ziel = ereignis.target;
    if (!ziel.closest) return;
    if (ziel.closest('#seite, #baum-auf, .menue, dialog')) return;
    seitenleiste.classList.remove('offen');
  });

  document.addEventListener('keydown', (ereignis) => {
    if (ereignis.key === 'Escape') seitenleiste.classList.remove('offen');
  });
}

function sucheVerdrahten() {
  // Suche: am Handy hinter einer Lupe, die das Feld unter dem Kopf aufklappt.
  const kopf = document.querySelector('.kopf');
  const sucheAuf = document.getElementById('suche-auf');
  const suchfeld = document.getElementById('suchfeld');

  const sucheZeigen = (offen) => {
    kopf.classList.toggle('suche-offen', offen);
    sucheAuf.setAttribute('aria-expanded', offen ? 'true' : 'false');
    if (offen) suchfeld.focus();
  };

  sucheAuf.addEventListener('click', (ereignis) => {
    ereignis.stopPropagation();
    sucheZeigen(!kopf.classList.contains('suche-offen'));
  });

  document.getElementById('suchform').addEventListener('submit', (ereignis) => {
    ereignis.preventDefault();
    const frage = suchfeld.value.trim();
    sucheZeigen(false);
    if (frage) gehe('#/suche?q=' + encodeURIComponent(frage));
  });

  document.addEventListener('click', (ereignis) => {
    if (!kopf.classList.contains('suche-offen')) return;
    if (ereignis.target.closest && ereignis.target.closest('.suchform, #suche-auf')) return;
    sucheZeigen(false);
  });

  suchfeld.addEventListener('keydown', (ereignis) => {
    if (ereignis.key === 'Escape') {
      suchfeld.blur();
      sucheZeigen(false);
    }
  });
}

// Alles, was ohne Paperless-Sitzung schon bedienbar sein soll: Burger,
// Suchfeld, Tooltips. Sonst tun die Knoepfe im Kopf nichts, solange man
// nicht angemeldet ist.
function oberflaecheVerdrahten() {
  tooltipVerdrahten();
  seitenleisteVerdrahten();
  sucheVerdrahten();
}

async function start() {
  oberflaecheVerdrahten();

  // Zuerst die Sprache des Browsers: die Abmeldemeldung entsteht mitten in
  // api.ich() und soll nicht auf Schlüsselnamen hinauslaufen. Sagt Paperless
  // danach etwas anderes, wird nachgezogen.
  await spracheEinrichten(null);
  textenSetzen();

  try {
    ich = await api.ich();
    marke(false);
  } catch (fehler) {
    if (fehler.status === 401) return;
    zeige(kasten(t('fehler.paperless', { grund: fehler.message }), true));
    return;
  }

  // Jetzt steht fest, was in Paperless eingestellt ist.
  await spracheEinrichten(ich.benutzer);
  textenSetzen();

  document.getElementById('benutzer').textContent = ich.benutzer.anzeige || ich.benutzer.name;
  // Der Einstellungslink erscheint nur für Administratoren. Das ist reine
  // Bequemlichkeit – wer die Adresse errät, wird vom Server abgewiesen.
  document.getElementById('einstellungen-link').hidden = !ich.benutzer.admin;
  await darstellungLaden();
  // Sind Tag-Symbole vergeben, braucht die erste Liste sie schon: lieber
  // einmal darauf warten, als sie ohne Symbole zu zeichnen und danach nicht
  // mehr nachzuziehen. Ohne vergebene Symbole bleibt die Datei ungeladen.
  if (Object.keys(darstellung.tags).length) await symboleLaden();
  const paperlessLink = document.getElementById('paperless-link');
  paperlessLink.href = ich.paperless || '/';

  await stammLaden();
  editorVorbereiten((aktiveId) => neuLaden(aktiveId));
  baumVerdrahten({
    auswahl: (id) => gehe('#/ordner/' + id),
    bearbeiten: (id) => ordnerBearbeiten(id),
    anlegen: (elternId) => ordnerAnlegen(elternId),
    aktualisieren: (aktiveId) => neuLaden(aktiveId),
  });

  document.getElementById('ordner-neu').addEventListener('click', () => ordnerAnlegen(null));

  document.getElementById('baum-export').addEventListener('click', async () => {
    try { await baumExportieren(); }
    catch (fehler) { alert(t('fehler.export', { grund: fehler.message })); }
  });
  const importFeld = document.getElementById('import-datei');
  document.getElementById('baum-import').addEventListener('click', () => importFeld.click());
  importFeld.addEventListener('change', async () => {
    const datei = importFeld.files && importFeld.files[0];
    importFeld.value = '';
    if (!datei) return;
    try { await baumImportieren(datei); }
    catch (fehler) { alert(t('fehler.import', { grund: fehler.message })); }
  });
  // Wer die Sprache oder die Datumsanzeige umstellt, tut das in Paperless –
  // in einem anderen Tab, während PaperTree offen bleibt. Die Einstellung
  // wird sonst erst beim nächsten Neuladen sichtbar, und das sieht aus, als
  // würde sie nicht übernommen. Beim Zurückwechseln also nachfragen und,
  // wenn sich etwas geändert hat, die Ansicht neu zeichnen.
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || !ich) return;
    let frisch;
    try { frisch = await api.ich(); } catch (_) { return; }
    const vorher = ich.benutzer || {};
    const jetzt = frisch.benutzer || {};
    if (vorher.sprache === jetzt.sprache
        && vorher.datumssprache === jetzt.datumssprache) return;
    ich = frisch;
    await spracheEinrichten(jetzt);
    textenSetzen();
    await wegweiser();
  });

  window.addEventListener('hashchange', () => {
    // Das Element hier holen, nicht über eine Variable aus start(): die
    // Seitenleisten-Verdrahtung liegt in ihrer eigenen Funktion.
    document.getElementById('seite').classList.remove('offen');
    wegweiser();
  });
  await wegweiser();
}

start();
