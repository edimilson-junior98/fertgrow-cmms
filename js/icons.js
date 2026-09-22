/* ==========================================================================
   FertGrow CMMS — Icon System
   Lightweight inline-SVG icon set (no external icon font/library).
   Usage: <i data-ic="grid"></i>  → replaced on DOMContentLoaded
          Icon('grid','16')       → returns raw svg string for dynamic HTML
   ========================================================================== */

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  bolt: '<path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>',
  layers: '<path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 11h6M9 15h6"/>',
  drop: '<path d="M12 2s7 8.2 7 12.8A7 7 0 1 1 5 14.8C5 10.2 12 2 12 2z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5c0-1.2 1.3-2 3-2s3 .8 3 2-1.3 1.7-3 2-3 .8-3 2 1.3 2 3 2 3-.8 3-2"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M5 3h14"/>',
  qrcode: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  alert: '<path d="M12 2L2 20h20L12 2z"/><path d="M12 9v5M12 17h.01"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
  'arrow-left': '<path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/>',
  filter: '<path d="M3 4h18l-7 9v6l-4 2v-8L3 4z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 1 5.4-5.4l-2.5 2.5-2-2 2.5-2.5z"/>',
  gauge: '<circle cx="12" cy="12" r="9"/><path d="M12 12l4-4"/><path d="M8 12a4 4 0 1 1 4 4"/>',
  package: '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  signature: '<path d="M3 17s2-1 4-1 3 2 5 2 3-3 5-3 4 1 4 1"/><path d="M3 21h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  truck: '<path d="M1 8h13v8H1z"/><path d="M14 11h4l3 3v2h-7z"/><circle cx="6" cy="19" r="2"/><circle cx="17" cy="19" r="2"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
  paperclip: '<path d="M21 11.5L12.5 20a5 5 0 0 1-7-7L14 4.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3L15 7"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path d="M12 3v1M12 20v1M4.2 4.2l.7.7M19.1 19.1l.7.7M3 12h1M20 12h1M4.2 19.8l.7-.7M19.1 4.9l.7-.7"/>',
  play: '<path d="M6 4l14 8-14 8V4z"/>',
  pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 12v5"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="7"/><path d="M6 14H3v-4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v4h-3"/>',
  building: '<rect x="4" y="2" width="16" height="20"/><path d="M9 6h1M14 6h1M9 10h1M14 10h1M9 14h1M14 14h1M9 18h1M14 18h1"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 6l10 7 10-7"/>',
};

function Icon(name, size = 18) {
  const p = ICONS[name] || ICONS.grid;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}

function renderIcons(root = document) {
  root.querySelectorAll('[data-ic]').forEach(el => {
    const name = el.getAttribute('data-ic');
    const size = el.getAttribute('data-size') || 18;
    if (!el.dataset.rendered) {
      el.innerHTML = Icon(name, size);
      el.dataset.rendered = '1';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => renderIcons());
