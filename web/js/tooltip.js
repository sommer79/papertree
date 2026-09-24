// Tooltips über Popper (lokal mitgeliefert, kein Abruf nach draussen).
//
// Ein einziger Tooltip wird wiederverwendet und über Ereignis-Delegation
// gesteuert: jedes Element mit data-tooltip bekommt ihn, ohne eigenen
// Listener. Das trägt auch Listen mit hunderten Tag-Chips.
//
// Fehlt Popper, bleibt der eingebaute title-Tooltip des Browsers als Rückfall
// (siehe markeChip in liste.js) – die Oberfläche funktioniert dann unverändert.

const VERZOEGERUNG_MS = 180;

let blase = null;
let pfeil = null;
let popper = null;
let zeitgeber = null;
let anker = null;

export const popperDa = () => typeof window.Popper !== 'undefined';

function bauen() {
  if (blase) return;
  blase = document.createElement('div');
  blase.className = 'tooltip';
  blase.setAttribute('role', 'tooltip');
  pfeil = document.createElement('div');
  pfeil.className = 'tooltip-pfeil';
  pfeil.setAttribute('data-popper-arrow', '');
  blase.append(document.createElement('span'), pfeil);
  document.body.append(blase);
}

function zeigen(ziel) {
  const text = ziel.getAttribute('data-tooltip');
  if (!text) return;
  bauen();
  anker = ziel;
  blase.firstChild.textContent = text;

  if (popper) popper.destroy();
  popper = window.Popper.createPopper(ziel, blase, {
    placement: ziel.getAttribute('data-tooltip-seite') || 'top',
    modifiers: [
      { name: 'offset', options: { offset: [0, 7] } },
      { name: 'arrow', options: { element: pfeil, padding: 5 } },
      { name: 'preventOverflow', options: { padding: 8 } },
      { name: 'flip', options: { fallbackPlacements: ['bottom', 'right', 'left'] } },
    ],
  });
  blase.setAttribute('data-zeige', '');
}

function verbergen() {
  clearTimeout(zeitgeber);
  anker = null;
  if (!blase) return;
  blase.removeAttribute('data-zeige');
  if (popper) {
    popper.destroy();
    popper = null;
  }
}

function anstossen(ziel) {
  if (ziel === anker) return;
  clearTimeout(zeitgeber);
  zeitgeber = setTimeout(() => zeigen(ziel), VERZOEGERUNG_MS);
}

export function tooltipVerdrahten() {
  if (!popperDa()) return false;

  document.addEventListener('mouseover', (ereignis) => {
    const ziel = ereignis.target.closest && ereignis.target.closest('[data-tooltip]');
    if (ziel) anstossen(ziel);
  });

  document.addEventListener('mouseout', (ereignis) => {
    const ziel = ereignis.target.closest && ereignis.target.closest('[data-tooltip]');
    if (ziel && ziel === anker) verbergen();
    else if (ziel) clearTimeout(zeitgeber);
  });

  // Mit der Tastatur erreichbar: beim Fokussieren sofort, ohne Verzögerung.
  document.addEventListener('focusin', (ereignis) => {
    const ziel = ereignis.target.closest && ereignis.target.closest('[data-tooltip]');
    if (ziel) zeigen(ziel);
  });
  document.addEventListener('focusout', verbergen);

  document.addEventListener('keydown', (ereignis) => {
    if (ereignis.key === 'Escape') verbergen();
  });
  // Beim Scrollen oder Wechsel der Ansicht stünde die Blase sonst in der Luft.
  window.addEventListener('scroll', verbergen, true);
  window.addEventListener('resize', verbergen);
  window.addEventListener('hashchange', verbergen);

  return true;
}
