// Arial metrics adapted from @miragon/bpmn-cli 0.8.0 (MIT). See THIRD_PARTY_NOTICES.md.
const ARIAL = {
    ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584,
    ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
    A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722,
    O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
    '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
    a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556,
    o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
    '{': 334, '|': 260, '}': 334, '~': 584,
    ä: 556, ö: 556, ü: 556, Ä: 667, Ö: 778, Ü: 722, ß: 611, é: 556, è: 556, ê: 556, à: 556, á: 556, â: 556, ç: 500,
    ñ: 556, ó: 556, ò: 556, ô: 556, ú: 556, ù: 556, í: 278, ì: 278, î: 278, '€': 556, '–': 556, '—': 1000, '…': 1000,
    '„': 333, '“': 333, '”': 333, '‘': 222, '’': 222, '§': 556, '°': 400,
};
export const FONT_SIZE = 12;
export const LINE_HEIGHT = 14.4;
export const escapeSvg = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const coordinate = value => String(Math.round(value * 100) / 100 || 0);
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function textWidth(text, { native = false } = {}) {
  let units = 0;
  if (native) {
    for (const ch of text.trim()) units += ARIAL[ch] ?? 556;
    return units * FONT_SIZE / 1000;
  }
  for (const {segment} of graphemes.segment(text)) {
    if (/\p{Extended_Pictographic}/u.test(segment)) { units += 2000; continue; }
    for (const ch of segment) units += ARIAL[ch] ?? (/\p{Mark}|[\u200d\ufe0f]/u.test(ch) ? 0 : 1000);
  }
  // Leave room for browser font substitution and anti-aliasing.
  return units * FONT_SIZE / 1000 * 1.04;
}
export function wrapLines(text, width) {
  const output = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    let line = '';
    for (const token of paragraph.split(/(\s+)/).filter(Boolean)) {
      if (textWidth(line + token) <= width) { line += token; continue; }
      if (line.trim()) { output.push(line.trimEnd()); line = ''; }
      if (!token.trim()) continue;
      for (const {segment} of graphemes.segment(token)) {
        if (line && textWidth(line + segment) > width) { output.push(line); line = ''; }
        line += segment;
      }
    }
    output.push(line.trimEnd());
  }
  return output;
}
