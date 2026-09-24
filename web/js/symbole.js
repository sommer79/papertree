// Symbole für die Ordner (F1.7).
//
// Der mitgelieferte Satz ist gross (gut 400 KB) und wird deshalb erst
// geholt, wenn er wirklich gebraucht wird: sobald ein Ordner ein eigenes
// Symbol trägt oder der Wähler aufgeht. Wer die Funktion nicht nutzt, lädt
// die Datei nie – das Standardsymbol steht hier fest im Modul.

// Ein Ordner, aus demselben Satz (lucide "folder"), damit der Strich zu den
// gewählten Symbolen passt, ohne dafür die ganze Datei zu brauchen.
export const STANDARD_SYMBOL =
  "<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\" />";

let satz = null;
let laedt = null;

/** Lädt den Symbolsatz einmalig nach. Mehrfache Aufrufe teilen sich denselben
 *  Ladevorgang. */
export function symboleLaden() {
  if (satz) return Promise.resolve(satz);
  if (!laedt) {
    laedt = import('../vendor/lucide/symbole.js')
      .then((modul) => {
        satz = modul.SYMBOLE;
        // Wer schon gezeichnet hat, als der Satz noch fehlte, zeichnet jetzt
        // neu. Das entkoppelt den Baum vom Wähler: einer von beiden stösst
        // das Laden an, beide bekommen das Ergebnis mit.
        document.dispatchEvent(new CustomEvent('papertree:symbole-geladen'));
        return satz;
      })
      .catch((fehler) => {
        // Ohne den Satz bleibt es beim Standardsymbol – das ist kein Grund,
        // den Baum nicht zu zeichnen.
        laedt = null;
        console.warn('Symbolsatz nicht ladbar:', fehler);
        return {};
      });
  }
  return laedt;
}

/** Was schon da ist, ohne zu laden. Null heisst: noch nicht geholt. */
export function satzJetzt() {
  return satz;
}

/** Alle Namen, alphabetisch. Setzt einen geladenen Satz voraus. */
export function symbolNamen() {
  return satz ? Object.keys(satz) : [];
}

/** Das Innere eines Symbols, oder null wenn es den Namen nicht gibt. */
export function symbolInhalt(name) {
  if (!name) return STANDARD_SYMBOL;
  if (!satz) return null;
  return Object.prototype.hasOwnProperty.call(satz, name) ? satz[name] : null;
}

/** Ein fertiges <svg>. Unbekannte Namen ergeben das Standardsymbol. */
export function symbolSvg(name, groesse = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(groesse));
  svg.setAttribute('height', String(groesse));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  // Der Inhalt stammt aus der mitgelieferten Datei, nicht von aussen: hier
  // steht reines SVG ohne Skript, das Feld in der Datenbank lässt ohnehin
  // nur Namen aus [a-z0-9-] durch.
  svg.innerHTML = symbolInhalt(name) || STANDARD_SYMBOL;
  return svg;
}
