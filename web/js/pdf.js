// PDF-Betrachter (F5.3).
//
// Am Rechner zeigt der Browser PDFs in einem iframe gut an, mit Zoom, Suche
// und Drucken. Auf Mobilgeräten tut er das nicht: iOS Safari zeigt nur die
// erste Seite ohne Scrollmöglichkeit, Android Chrome lädt die Datei oft
// stattdessen herunter. Darum rendert PaperTree dort selbst, mit pdf.js.
//
// pdf.js liegt lokal (web/vendor), wird aber erst geladen, wenn es gebraucht
// wird – am Rechner also gar nicht.

const PDFJS_PFAD = '../vendor/pdf.min.mjs';
const WORKER_PFAD = 'vendor/pdf.worker.min.mjs';

let pdfjs = null;

/** Entscheidet, ob selbst gerendert werden muss.
 *
 * Selbst rendern kostet Rechenzeit, der eingebaute Viewer ist überall
 * vorzuziehen, wo er funktioniert. Darum zwei klare Fälle:
 *
 * 1. Der Browser kann PDFs gar nicht einbetten (pdfViewerEnabled === false).
 * 2. Ein echtes Touch-Gerät mit schmalem Schirm. iOS meldet
 *    pdfViewerEnabled: true, zeigt in einem iframe aber nur die erste Seite
 *    ohne Scrollmöglichkeit.
 *
 * Ein schmales Fenster allein genügt NICHT: ein Browserfenster auf halbem
 * Bildschirm ist kein Handy, und dort wäre der eingebaute Viewer mit Zoom,
 * Suche und Drucken deutlich besser.
 */
export function selbstRendern() {
  if (navigator.pdfViewerEnabled === false) return true;
  const beruehrung = (navigator.maxTouchPoints || 0) > 0;
  const schmal = window.matchMedia('(max-width: 820px)').matches;
  const grobeZeigegeraet = window.matchMedia('(any-pointer: coarse)').matches;
  return beruehrung && grobeZeigegeraet && schmal;
}

async function pdfjsLaden() {
  if (pdfjs) return pdfjs;
  const modul = await import(PDFJS_PFAD);
  const basis = new URL('.', location.href).href;
  modul.GlobalWorkerOptions.workerSrc = basis + WORKER_PFAD;
  pdfjs = modul;
  return pdfjs;
}

/** Rendert das PDF als Seitenfolge in den Behälter.
 *
 * Rückgabe: eine Funktion zum Aufräumen (beim Verlassen der Ansicht).
 */
export async function pdfZeigen(behaelter, url) {
  const meldung = document.createElement('div');
  meldung.className = 'laedt';
  meldung.textContent = 'Vorschau wird geladen …';
  behaelter.append(meldung);

  let ladeauftrag = null;
  let dokument = null;
  let abgebrochen = false;
  let beobachter = null;

  try {
    const jsapi = await pdfjsLaden();
    // Aufgeräumt wird über den Ladeauftrag: PDFDocumentProxy.destroy() gibt
    // es seit pdf.js 6 nicht mehr (im Browser nachgeprüft).
    ladeauftrag = jsapi.getDocument({ url, withCredentials: true });
    dokument = await ladeauftrag.promise;
    if (abgebrochen) { ladeauftrag.destroy(); return () => {}; }

    meldung.remove();

    const leiste = document.createElement('div');
    leiste.className = 'pdf-leiste';
    leiste.textContent = dokument.numPages === 1 ? '1 Seite' : dokument.numPages + ' Seiten';
    behaelter.append(leiste);

    const seiten = document.createElement('div');
    seiten.className = 'pdf-seiten';
    behaelter.append(seiten);

    // Für jede Seite ein Platzhalter; gerendert wird erst, was in Sicht kommt.
    // Ein Dokument mit 40 Seiten soll den Browser nicht lahmlegen.
    const platzhalter = [];
    for (let n = 1; n <= dokument.numPages; n += 1) {
      const kasten = document.createElement('div');
      kasten.className = 'pdf-seite';
      kasten.dataset.seite = String(n);
      seiten.append(kasten);
      platzhalter.push(kasten);
    }

    const gerendert = new Set();
    const rendern = async (kasten) => {
      const nummer = Number(kasten.dataset.seite);
      if (gerendert.has(nummer) || abgebrochen) return;
      gerendert.add(nummer);
      const seite = await dokument.getPage(nummer);
      const breite = kasten.clientWidth || seiten.clientWidth || 600;
      const roh = seite.getViewport({ scale: 1 });
      const skala = Math.min(3, Math.max(0.2, breite / roh.width))
        * Math.min(2, window.devicePixelRatio || 1);
      const sicht = seite.getViewport({ scale: skala });
      const leinwand = document.createElement('canvas');
      leinwand.width = Math.floor(sicht.width);
      leinwand.height = Math.floor(sicht.height);
      leinwand.style.width = '100%';
      leinwand.style.aspectRatio = roh.width + ' / ' + roh.height;
      kasten.innerHTML = '';
      kasten.append(leinwand);
      await seite.render({ canvasContext: leinwand.getContext('2d'), viewport: sicht }).promise;
    };

    if ('IntersectionObserver' in window) {
      beobachter = new IntersectionObserver((eintraege) => {
        for (const eintrag of eintraege) {
          if (eintrag.isIntersecting) {
            rendern(eintrag.target);
            beobachter.unobserve(eintrag.target);
          }
        }
        // Gescrollt wird im Betrachter selbst, nicht im Fenster – der
        // Beobachter muss denselben Bereich beobachten, sonst gelten alle
        // Seiten als sichtbar oder keine.
      }, { root: behaelter, rootMargin: '400px 0px' });
      for (const kasten of platzhalter) beobachter.observe(kasten);
    } else {
      for (const kasten of platzhalter) await rendern(kasten);
    }
  } catch (fehler) {
    meldung.className = 'hinweiskasten fehler';
    meldung.textContent = 'Die Vorschau liess sich nicht laden: '
      + (fehler && fehler.message ? fehler.message : fehler);
  }

  return () => {
    abgebrochen = true;
    if (beobachter) beobachter.disconnect();
    if (ladeauftrag) ladeauftrag.destroy();
  };
}
