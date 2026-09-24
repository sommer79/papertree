// Themen für den Symbolwähler – erzeugt von werkzeuge/themen_bauen.py.
//
// Der Symbolsatz ist englisch benannt. Diese Liste ordnet ihn nach dem, wofür
// Ordner tatsächlich stehen, und macht ihn über Stichwörter auffindbar.
//
// Name und Stichwörter stehen hier nicht: sie gehören in web/sprachen/, weil
// sie in jeder Sprache andere sind. Wer auf Französisch "assurance" sucht,
// findet dasselbe Thema wie auf Deutsch mit "Versicherung" – die Symbole sind
// dieselben, die Wörter nicht.
export const THEMEN = [
  { schluessel: 'thema.geld', symbole: ['landmark', 'banknote', 'piggy-bank', 'wallet', 'wallet-cards', 'credit-card', 'coins', 'hand-coins', 'circle-dollar-sign', 'euro', 'vault', 'receipt-euro', 'arrow-left-right', 'trending-up', 'chart-no-axes-combined', 'calculator'] },
  { schluessel: 'thema.rechnung', symbole: ['receipt', 'receipt-euro', 'receipt-text', 'file-text', 'scroll-text', 'clipboard-list', 'badge-euro', 'banknote-arrow-up', 'banknote-arrow-down', 'circle-alert', 'hourglass'] },
  { schluessel: 'thema.steuern', symbole: ['landmark', 'scale', 'gavel', 'stamp', 'file-badge', 'file-check', 'building-2', 'shield-check', 'book-marked', 'percent'] },
  { schluessel: 'thema.versicherung', symbole: ['shield', 'shield-check', 'shield-half', 'umbrella', 'file-signature', 'handshake', 'scale', 'gavel', 'file-lock', 'life-buoy'] },
  { schluessel: 'thema.gesundheit', symbole: ['stethoscope', 'heart-pulse', 'cross', 'pill', 'syringe', 'activity', 'hospital', 'bandage', 'thermometer', 'brain', 'toothbrush', 'microscope', 'smile'] },
  { schluessel: 'thema.arbeit', symbole: ['briefcase', 'briefcase-business', 'building', 'building-2', 'id-card', 'user-round-check', 'file-user', 'award', 'handshake', 'clock', 'calendar-clock', 'piggy-bank', 'hard-hat', 'presentation'] },
  { schluessel: 'thema.wohnen', symbole: ['house', 'home', 'building', 'key', 'key-round', 'door-open', 'sofa', 'lamp', 'bed', 'flame', 'droplets', 'wrench', 'hammer', 'paintbrush'] },
  { schluessel: 'thema.energie', symbole: ['zap', 'plug', 'plug-zap', 'lightbulb', 'flame', 'droplets', 'sun', 'battery-charging', 'gauge', 'power'] },
  { schluessel: 'thema.telefon', symbole: ['smartphone', 'phone', 'phone-call', 'wifi', 'globe', 'router', 'server', 'cloud', 'signal', 'antenna', 'tv', 'cable', 'at-sign'] },
  { schluessel: 'thema.technik', symbole: ['laptop', 'monitor', 'cpu', 'hard-drive', 'printer', 'camera', 'keyboard', 'mouse', 'usb', 'database', 'code', 'settings', 'bug'] },
  { schluessel: 'thema.auto', symbole: ['car', 'car-front', 'caravan', 'truck', 'bike', 'bus', 'train-front', 'fuel', 'parking-meter', 'traffic-cone', 'wrench', 'circle-parking', 'plane', 'ship'] },
  { schluessel: 'thema.ferien', symbole: ['palmtree', 'plane', 'luggage', 'map', 'map-pin', 'tent', 'mountain', 'sun', 'ticket', 'camera', 'compass', 'backpack', 'waves'] },
  { schluessel: 'thema.sport', symbole: ['dumbbell', 'bike', 'footprints', 'trophy', 'medal', 'volleyball', 'target', 'timer', 'waves', 'mountain-snow'] },
  { schluessel: 'thema.schule', symbole: ['graduation-cap', 'book', 'book-open', 'library', 'pencil', 'notebook-pen', 'award', 'school', 'backpack', 'ruler'] },
  { schluessel: 'thema.familie', symbole: ['users', 'user-round', 'baby', 'heart', 'heart-handshake', 'house', 'cake', 'gift', 'contact-round', 'footprints'] },
  { schluessel: 'thema.tiere', symbole: ['dog', 'cat', 'bird', 'fish', 'rabbit', 'bone', 'paw-print', 'turtle', 'squirrel', 'snail'] },
  { schluessel: 'thema.einkauf', symbole: ['shopping-bag', 'shopping-cart', 'shirt', 'footprints', 'gift', 'package', 'package-check', 'truck', 'store', 'tag', 'megaphone', 'glasses', 'watch'] },
  { schluessel: 'thema.essen', symbole: ['utensils', 'coffee', 'wine', 'beer', 'apple', 'carrot', 'pizza', 'cake-slice', 'cooking-pot', 'soup'] },
  { schluessel: 'thema.post', symbole: ['mail', 'mail-open', 'send', 'inbox', 'archive', 'paperclip', 'message-square', 'megaphone', 'newspaper', 'stamp', 'heart-handshake'] },
  { schluessel: 'thema.ordnung', symbole: ['folder', 'folder-open', 'folders', 'file', 'files', 'archive', 'archive-restore', 'inbox', 'bookmark', 'star', 'flag', 'circle-check', 'circle-alert', 'clock', 'pin', 'tags', 'list-checks'] },
];
