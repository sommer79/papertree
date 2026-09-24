// PaperTree – Verdrahtung und Wegweiser.
import { api } from './api.js';
import { stammLaden, stamm } from './stamm.js';
import { baum, baumLaden, baumZeichnen, baumVerdrahten, fehlendeReferenzen,
         gruppenVergessen, kinderVon, nachfahrenZahl, pfadVon,
         zaehlerVergessen } from './baum.js';
import { listeZeichnen, markeChip, SPALTEN } from './liste.js';
import { detailAufraeumen, detailZeichnen } from './detail.js';
import { editorOeffnen, editorVorbereiten } from './editor.js';
import { beschreibe } from './kriterien.js';
import { tooltipVerdrahten } from './tooltip.js';
import { darstellung, darstellungLaden } from './darstellung.js';
import { symboleLaden } from './symbole.js';
import { einstellungenZeichnen } from './einstellungen.js';

const inhalt = document.getElementById('inhalt');
let ich = null;

// --- Hilfen ------------------------------------------------------------------
function zeige(knoten) {
  inhalt.innerHTML = '';
  inhalt.append(knoten);
  inhalt.scrollTop = 0;
}

function laedt(text = 'Wird geladen …') {
  const p = document.createElement('div');
  p.className = 'laedt';
  p.textContent = text;
  return p;
}

function kasten(text, istFehler = false) {
  const p = document.createElement('div');
  p.className = 'hinweiskasten' + (istFehler ? ' fehler' : '');
  p.textContent = text;
  return p;
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

// --- Dashboard (F7) ----------------------------------------------------------
async function dashboard() {
  const huelle = document.createElement('div');
  const kopf = document.createElement('div');
  kopf.className = 'titelzeile';
  const titel = document.createElement('h1');
  titel.textContent = 'Dashboard';
  kopf.append(titel);
  huelle.append(kopf);

  const gewaehlt = baum.knoten.filter((k) => k.auf_dashboard);
  if (!gewaehlt.length) {
    huelle.append(kasten(
      'Noch keine Ordner auf dem Dashboard. Im Editor eines Ordners "Auf dem '
      + 'PaperTree-Dashboard anzeigen" einschalten.'));
    zeige(huelle);
    return;
  }

  const gitter = document.createElement('div');
  gitter.className = 'dashkacheln';
  for (const knoten of gewaehlt) {
    const kachel = document.createElement('a');
    kachel.className = 'karte dashkachel';
    kachel.href = '#/ordner/' + knoten.id;
    const zahl = document.createElement('div');
    zahl.className = 'zahl';
    zahl.textContent = '…';
    const name = document.createElement('div');
    name.textContent = knoten.name;
    const wo = document.createElement('div');
    wo.className = 'wo';
    wo.textContent = pfadVon(knoten.id).slice(0, -1).map((k) => k.name).join(' › ');
    kachel.append(zahl, name, wo);
    gitter.append(kachel);
    api.anzahl(knoten.id)
      .then((ergebnis) => { zahl.textContent = ergebnis.anzahl; })
      .catch(() => { zahl.textContent = '–'; });
  }
  huelle.append(gitter);
  zeige(huelle);
}

// --- Ordner ------------------------------------------------------------------
async function ordnerZeigen(id, params) {
  const knoten = baum.nachId[id];
  if (!knoten) { zeige(kasten('Diesen Ordner gibt es nicht.', true)); return; }

  const huelle = document.createElement('div');

  const krumen = document.createElement('div');
  krumen.className = 'brotkrumen';
  pfadVon(id).forEach((teil, n, alle) => {
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
  titel.textContent = knoten.name;
  const anzahlAnzeige = document.createElement('span');
  anzahlAnzeige.className = 'anzahl';

  const werkzeuge = document.createElement('div');
  werkzeuge.className = 'werkzeuge';

  const bearbeiten = document.createElement('button');
  bearbeiten.className = 'knopf';
  bearbeiten.textContent = 'Ordner bearbeiten';
  bearbeiten.addEventListener('click', () => ordnerBearbeiten(id));

  const unterordner = document.createElement('button');
  unterordner.className = 'knopf';
  unterordner.textContent = '+ Unterordner';
  unterordner.addEventListener('click', () => ordnerAnlegen(id));

  werkzeuge.append(unterordner, bearbeiten);
  kopf.append(titel, anzahlAnzeige, werkzeuge);
  huelle.append(kopf);

  // Was dieser Ordner zeigt, in Worten
  const worte = [];
  if (knoten.eigener_filter) worte.push(beschreibe(knoten.filter) || 'alle Dokumente');
  if (knoten.kinder_einbeziehen) {
    worte.push(knoten.kinder_tief
      ? 'zusätzlich alle Unterordner'
      : 'zusätzlich die direkten Unterordner');
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
      'Dieser Filter nennt etwas, das in Paperless nicht mehr existiert: '
      + fehlend.join(', ') + '. Der Ordner bleibt bestehen – bitte den Filter anpassen.',
      true));
  }

  const unterliste = kinderVon(id);
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
    leiste.append(laedt('Unterordner werden ermittelt …'));
    huelle.append(leiste);
    api.gruppen(id).then((ergebnis) => {
      leiste.innerHTML = '';
      if (!(ergebnis.gruppen || []).length) {
        const leer = document.createElement('span');
        leer.className = 'hinweis';
        leer.textContent = 'Keine Werte für „' + (ergebnis.dimension_name || '') + '“ vorhanden.';
        leiste.append(leer);
        return;
      }
      if (inGruppe) {
        const zurueck = document.createElement('a');
        zurueck.className = 'knopf klein';
        zurueck.href = '#/ordner/' + id;
        zurueck.textContent = '‹ alle';
        leiste.append(zurueck);
      }
      for (const g of ergebnis.gruppen) {
        const a = document.createElement('a');
        a.className = 'knopf klein' + (gruppe === g.wert ? ' haupt' : '');
        a.href = '#/ordner/' + id + '?gruppe=' + encodeURIComponent(g.wert);
        a.textContent = g.name + ' (' + g.anzahl + ')';
        leiste.append(a);
      }
    }).catch(() => { leiste.innerHTML = ''; });
  }

  // Reine Navigation – ausser wenn eine Gruppe gewählt ist, dann ist die
  // Gruppe selbst die Bedingung.
  if (!knoten.eigener_filter && !knoten.kinder_einbeziehen && !inGruppe) {
    const woanders = unterliste.length || knoten.gruppieren_nach;
    huelle.append(kasten(woanders
      ? 'Dieser Ordner dient der Navigation. Oben einen Unterordner wählen.'
      : 'Dieser Ordner dient der Navigation und hat noch keine Unterordner.'));
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
  const suchfeld = listensuche(() => nachladen());

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
      anzahlAnzeige.textContent = ergebnis.count === 1 ? '1 Dokument' : ergebnis.count + ' Dokumente';
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
      bereich.append(kasten('Die Dokumente liessen sich nicht laden: ' + fehler.message, true));
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

  function listensuche(beiEingabe) {
    const feld = document.createElement('input');
    feld.type = 'search';
    feld.className = 'listensuche';
    feld.placeholder = 'In dieser Liste suchen …';
    feld.autocomplete = 'off';
    feld.value = params.get('q') || '';
    feld.setAttribute('aria-label', 'In dieser Liste suchen');
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

  await nachladen();
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
  beschriftung.textContent = gewaehlt.length === 1 ? 'Gefiltert nach Tag:' : 'Gefiltert nach Tags:';
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
  zuruecksetzen.textContent = 'Filter zurücksetzen';
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
  titel.textContent = 'Suche';
  const anzahlAnzeige = document.createElement('span');
  anzahlAnzeige.className = 'anzahl';
  kopf.append(titel, anzahlAnzeige);
  huelle.append(kopf);

  const beschreibung = document.createElement('p');
  beschreibung.className = 'hinweis';
  beschreibung.style.margin = '-6px 0 12px';
  beschreibung.textContent = 'Volltextsuche über den ganzen Bestand: „' + frage + '“';
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
    anzahlAnzeige.textContent = ergebnis.count === 1 ? '1 Treffer' : ergebnis.count + ' Treffer';
    bereich.innerHTML = '';
    bereich.append(listeZeichnen(ergebnis, ['title', 'correspondent', 'document_type', 'tags', 'created'], {
      gewaehlteTags,
      paperlessBasis: ich && ich.paperless,
      beiTagKlick: (tagId) => tagUmschalten(params, tagId, neuLadenSuche),
      beiSeite: (nummer) => gehe(wegMit({ page: nummer })),
    }));
  } catch (fehler) {
    bereich.innerHTML = '';
    bereich.append(kasten('Die Suche schlug fehl: ' + fehler.message, true));
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

async function ordnerAnlegen(elternId) {
  let geerbt = [];
  if (elternId) {
    try {
      const ergebnis = await api.effektiv(elternId);
      geerbt = ergebnis.fuer_kind || [];
    } catch (_) { /* dann ohne Anzeige */ }
  }
  editorOeffnen({ knoten: null, elternId: elternId || null, geerbt });
}

// --- Wegweiser ---------------------------------------------------------------
async function wegweiser() {
  const { teile, params } = wegAuslesen();
  // Ein offenes PDF freigeben, bevor die Ansicht wechselt.
  detailAufraeumen();
  if (!baum.geladen) await baumLaden();

  if (teile[0] === 'ordner' && teile[1]) {
    baumZeichnen(teile[1]);
    await ordnerZeigen(Number(teile[1]), params);
    return;
  }
  if (teile[0] === 'dok' && teile[1]) {
    baumZeichnen(null);
    zeige(laedt('Dokument wird geladen …'));
    try {
      zeige(await detailZeichnen(Number(teile[1])));
    } catch (fehler) {
      zeige(kasten('Das Dokument liess sich nicht laden: ' + fehler.message, true));
    }
    return;
  }
  if (teile[0] === 'einstellungen') {
    baumZeichnen(null);
    if (!ich || !ich.benutzer.admin) {
      zeige(kasten('Die Einstellungen sind Administratoren vorbehalten.', true));
      return;
    }
    zeige(laedt('Einstellungen werden geladen …'));
    try {
      zeige(await einstellungenZeichnen());
    } catch (fehler) {
      zeige(kasten('Die Einstellungen liessen sich nicht laden: ' + fehler.message, true));
    }
    return;
  }
  if (teile[0] === 'suche') {
    baumZeichnen(null);
    await sucheZeigen(params);
    return;
  }
  baumZeichnen(null);
  await dashboard();
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
    alert('Die Datei enthält kein gültiges JSON.');
    return;
  }
  if (!Array.isArray(daten.ordner)) {
    alert('In der Datei steht kein PaperTree-Baum.');
    return;
  }
  const wieViele = daten.ordner.length;
  if (!confirm('Aus dieser Datei ' + wieViele + ' Ordner (samt Unterordnern) '
      + 'zusätzlich anlegen? Der bestehende Baum bleibt unverändert.')) return;
  const ergebnis = await api.import(daten, null);
  const hinweis = (ergebnis.verworfen || []).length
    ? '\nNicht übernommen: ' + ergebnis.verworfen.slice(0, 5).join(', ')
    : '';
  alert(ergebnis.angelegt + ' Ordner angelegt.' + hinweis);
  await neuLaden(null);
}

async function neuLaden(aktiveId) {
  zaehlerVergessen();
  gruppenVergessen(null);
  await baumLaden();
  if (aktiveId && baum.nachId[aktiveId]) gehe('#/ordner/' + aktiveId);
  else { baumZeichnen(null); await wegweiser(); }
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
    (daten && daten.hinweis) || 'Bitte in Paperless anmelden – PaperTree nutzt dieselbe Sitzung.',
    true));
  const ziel = anmeldung || (daten && daten.paperless);
  if (ziel) {
    const a = document.createElement('a');
    a.className = 'knopf haupt';
    a.href = ziel;
    a.textContent = 'Zur Paperless-Anmeldung';
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

  try {
    ich = await api.ich();
    marke(false);
  } catch (fehler) {
    if (fehler.status === 401) return;
    zeige(kasten('PaperTree erreicht Paperless nicht: ' + fehler.message, true));
    return;
  }

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
    catch (fehler) { alert('Export fehlgeschlagen: ' + fehler.message); }
  });
  const importFeld = document.getElementById('import-datei');
  document.getElementById('baum-import').addEventListener('click', () => importFeld.click());
  importFeld.addEventListener('change', async () => {
    const datei = importFeld.files && importFeld.files[0];
    importFeld.value = '';
    if (!datei) return;
    try { await baumImportieren(datei); }
    catch (fehler) { alert('Import fehlgeschlagen: ' + fehler.message); }
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
