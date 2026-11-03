import { readFileSync } from 'node:fs';
import path from 'node:path';

export const BESITZT = null;
const SEITE = /\.(astro|html)$/i;
const MUSTER = [
  /<script\b[^>]*\bsrc\s*=\s*(['"])(https?:\/\/[^'"]+)\1/gi,
  /<link\b[^>]*\bhref\s*=\s*(['"])(https?:\/\/[^'"]+)\1/gi,
];

export function astroTreffer(root, dateien) {
  const out = [];
  for (const d of dateien.filter(d => SEITE.test(d))) {
    const src = readFileSync(path.join(root, d), 'utf8');
    for (const re of MUSTER) for (const m of src.matchAll(re))
      out.push({ datei: d, zeile: src.slice(0, m.index).split('\n').length, schluessel: null, rohwert: m[2], art: 'script', quelle: 'code' });
  }
  return out;
}
