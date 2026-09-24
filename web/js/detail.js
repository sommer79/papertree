// Dokumentansicht mit eingebautem PDF-Betrachter (F5.2–F5.5). Nur lesend.
import { api } from './api.js';
import { markeChip } from './liste.js';
import { datum, t } from './sprache.js';
import { pdfZeigen, selbstRendern } from './pdf.js';
import { stamm } from './stamm.js';
import { korrespondentLogo } from './darstellung.js';

// Beim Verlassen der Ansicht wird das PDF-Dokument freigegeben, sonst
// sammeln sich Worker und Puffer an.
let aktuellesAufraeumen = null;

export function detailAufraeumen() {
  if (aktuellesAufraeumen) {
    aktuellesAufraeumen();
    aktuellesAufraeumen = null;
  }
}

function name(art, id) {
  if (id == null) return '';
  const eintrag = stamm.nachId[art] && stamm.nachId[art][String(id)];
  return eintrag ? eintrag.name : '#' + id;
}

function zusatzfeldWert(eintrag) {
  const feld = stamm.nachId.custom_fields[String(eintrag.field)];
  if (!feld) return { name: '#' + eintrag.field, wert: String(eintrag.value) };
  let wert = eintrag.value;
  if (feld.data_type === 'select') {
    const option = ((feld.extra_data && feld.extra_data.select_options) || [])
      .find((o) => String(o.id) === String(wert));
    wert = option ? option.label : wert;
  } else if (feld.data_type === 'boolean') {
    wert = t(wert ? 'allgemein.ja' : 'allgemein.nein');
  } else if (feld.data_type === 'date') {
    wert = datum(wert);
  } else if (feld.data_type === 'monetary') {
    wert = String(wert);
  }
  return { name: feld.name, wert: wert == null ? '' : String(wert) };
}

export async function detailZeichnen(dokumentId) {
  const huelle = document.createElement('div');
  // detailseite: füllt den Inhaltsbereich, damit die beiden Karten bis zum
  // unteren Fensterrand reichen statt auf halber Höhe aufzuhören.
  huelle.className = 'detailseite';
  const dok = await api.dokument(dokumentId);

  const kopf = document.createElement('div');
  // haftend: Titel und die beiden Knöpfe bleiben beim Scrollen sichtbar.
  kopf.className = 'titelzeile haftend';
  const titel = document.createElement('h1');
  titel.textContent = dok.title || t('liste.ohneTitel');
  const werkzeuge = document.createElement('div');
  werkzeuge.className = 'werkzeuge';

  const inPaperless = document.createElement('a');
  inPaperless.className = 'knopf haupt';
  inPaperless.href = dok.paperless_link || '#';
  inPaperless.target = '_blank';
  inPaperless.rel = 'noopener';
  inPaperless.textContent = t('allgemein.inPaperless');
  inPaperless.title = t('detail.nurLesend');

  const herunterladen = document.createElement('a');
  herunterladen.className = 'knopf';
  herunterladen.href = api.dateiUrl(dok.id);
  herunterladen.textContent = t('detail.herunterladen');

  werkzeuge.append(herunterladen, inPaperless);
  kopf.append(titel, werkzeuge);
  huelle.append(kopf);

  const gitter = document.createElement('div');
  gitter.className = 'detail';

  const betrachter = document.createElement('div');
  betrachter.className = 'betrachter';
  if (selbstRendern()) {
    // Mobil: pdf.js rendert die Seiten selbst, weil der Browser PDFs in
    // einem iframe nicht brauchbar anzeigt.
    betrachter.classList.add('selbst');
    pdfZeigen(betrachter, api.vorschauUrl(dok.id)).then((aufraeumen) => {
      aktuellesAufraeumen = aufraeumen;
    });
  } else {
    const rahmen = document.createElement('iframe');
    rahmen.src = api.vorschauUrl(dok.id);
    rahmen.title = t('detail.vorschauVon', { titel: dok.title || dok.id });
    betrachter.append(rahmen);
  }

  const seite = document.createElement('div');
  seite.className = 'karte eigenschaften';

  // Das Logo des Korrespondenten sitzt in der oberen rechten Ecke der Karte,
  // bündig an beiden Kanten; der Bogen darum ist zur Ecke hin offen.
  const logoUrl = dok.correspondent ? korrespondentLogo(dok.correspondent) : '';
  if (logoUrl) {
    const ecke = document.createElement('div');
    ecke.className = 'logo-ecke';
    const bild = document.createElement('img');
    bild.src = logoUrl;
    bild.alt = name('correspondents', dok.correspondent);
    bild.addEventListener('error', () => ecke.remove());
    ecke.append(bild);
    seite.append(ecke);
    seite.classList.add('hat-logo');
  }

  const liste = document.createElement('dl');

  const eintraege = [
    ['detail.korrespondent', name('correspondents', dok.correspondent)],
    ['detail.dokumenttyp', name('document_types', dok.document_type)],
    ['detail.speicherpfad', name('storage_paths', dok.storage_path)],
    ['detail.erstellt', datum(dok.created_date || dok.created)],
    ['detail.hinzugefuegt', datum(dok.added)],
    ['detail.seiten', dok.page_count],
    ['detail.archivnummer', dok.archive_serial_number],
    ['detail.originaldatei', dok.original_file_name],
  ];

  for (const [schluessel, wert] of eintraege) {
    if (wert == null || wert === '') continue;
    const dt = document.createElement('dt');
    dt.textContent = t(schluessel);
    const dd = document.createElement('dd');
    dd.textContent = String(wert);
    liste.append(dt, dd);
  }

  if ((dok.tags || []).length) {
    const dt = document.createElement('dt');
    dt.textContent = t('detail.tags');
    const dd = document.createElement('dd');
    const marken = document.createElement('span');
    marken.className = 'marken';
    // Hier ist Platz – darum der ganze Name statt der Kurzform.
    for (const id of dok.tags) marken.append(markeChip(id, { voll: true }));
    dd.append(marken);
    liste.append(dt, dd);
  }

  for (const eintrag of dok.custom_fields || []) {
    if (eintrag.value == null || eintrag.value === '') continue;
    const { name: feldName, wert } = zusatzfeldWert(eintrag);
    const dt = document.createElement('dt');
    dt.textContent = feldName;
    const dd = document.createElement('dd');
    dd.textContent = wert;
    liste.append(dt, dd);
  }

  seite.append(liste);

  try {
    const notizen = await api.notizen(dok.id);
    const alle = notizen.ergebnisse || [];
    if (alle.length) {
      const dt = document.createElement('dt');
      dt.textContent = t('detail.notizen');
      liste.append(dt);
      for (const notiz of alle) {
        const dd = document.createElement('dd');
        dd.textContent = notiz.note;
        liste.append(dd);
      }
    }
  } catch (_) { /* Notizen sind eine Zugabe */ }

  // Eigenschaften links, Vorschau rechts.
  gitter.append(seite, betrachter);
  huelle.append(gitter);
  return huelle;
}
