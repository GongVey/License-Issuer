// Tiny DOM builder. All text goes through text nodes; markup strings are never parsed.
const PROPS = new Set(['value', 'checked', 'indeterminate', 'selected', 'disabled', 'hidden', 'open']);
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (PROPS.has(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}
export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === '') continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}
export const replace = (el, ...children) => { el.replaceChildren(); return append(el, children); };
export const $ = (selector, root = document) => root.querySelector(selector);

const SVG = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) if (value !== undefined && value !== null) el.setAttribute(key, String(value));
  for (const child of children.flat()) if (child) el.append(child);
  return el;
}

// Stroke icons on a 24×24 grid.
const ICONS = {
  logo: 'M7.5 12a4.5 4.5 0 1 0 9 0 4.5 4.5 0 1 0-9 0|M16.5 12H22|M19.5 12v3|M22 12v2.5|M2 12h3',
  overview: 'M3 3h7v9H3z|M14 3h7v5h-7z|M14 12h7v9h-7z|M3 16h7v5H3z',
  cards: 'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z|M7 12.01h.01|M11 12h6',
  batches: 'M12 2 2 7l10 5 10-5-10-5z|M2 17l10 5 10-5|M2 12l10 5 10-5',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  archive: 'M3 4h18v4H3z|M5 8v12h14V8|M10 12h4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z|M21 21l-4.35-4.35',
  plus: 'M12 5v14|M5 12h14',
  minus: 'M5 12h14',
  copy: 'M9 9h11v11H9z|M5 15H4V4h11v1',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M7 10l5 5 5-5|M12 15V3',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z|M12 1v2|M12 21v2|M4.22 4.22l1.42 1.42|M18.36 18.36l1.42 1.42|M1 12h2|M21 12h2|M4.22 19.78l1.42-1.42|M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  monitor: 'M2 4h20v13H2z|M8 21h8|M12 17v4',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9',
  x: 'M18 6 6 18|M6 6l12 12',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  refresh: 'M23 4v6h-6|M1 20v-6h6|M3.51 9a9 9 0 0 1 14.85-3.36L23 10|M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  check: 'M20 6 9 17l-5-5',
  alert: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z|M12 9v4|M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 16v-4|M12 8h.01',
  trash: 'M3 6h18|M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6|M10 11v6|M14 11v6|M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  ban: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M4.93 4.93l14.14 14.14',
  play: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M10 8l6 4-6 4z',
  unlink: 'M18.84 12.25l1.72-1.71a4.5 4.5 0 0 0-6.36-6.37l-1.72 1.72|M5.17 11.75l-1.71 1.71a4.5 4.5 0 0 0 6.36 6.37l1.71-1.72|M8 2v3|M2 8h3|M16 22v-3|M22 16h-3',
  message: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  monitorSmall: 'M3 5h18v11H3z|M9 20h6|M12 16v4',
  database: 'M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3z|M21 12c0 1.66-4 3-9 3s-9-1.34-9-3|M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5',
  key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6|M15 3h6v6|M10 14 21 3',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z|M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z|M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  edit: 'M12 20h9|M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z',
};
export function icon(name, extra = '') {
  return svg('svg', { class: `icon ${extra}`.trim(), viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    ...(ICONS[name] || '').split('|').map(d => svg('path', { d })));
}
