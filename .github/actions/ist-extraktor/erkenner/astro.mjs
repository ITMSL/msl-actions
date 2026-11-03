import { readFileSync } from 'node:fs';
import path from 'node:path';

export const BESITZT = null;
const SEITE = /\.(astro|html)$/i;
const ATTRIBUT = /<(script|link)\b[^>]*\b(?:src|href)\s*=\s*(?:(['"])(https?:\/\/[^'"]+)\2|\{\s*`(https?:\/\/[^`]*)`\s*\})/gi;
const INJEKTION = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*document\.createElement\(\s*['"]script['"]\s*\)/g;

const zeileVon = (src, idx) => src.slice(0, idx).split('\n').length;

// Template-Literal am ersten ${ abschneiden; ist danach kein Pfad mehr da, war der Host interpoliert
function schneide(raw) {
  const i = raw.indexOf('${');
  if (i < 0) return raw;
  const kopf = raw.slice(0, i);
  return kopf.slice(kopf.indexOf('://') + 3).includes('/') ? kopf : null;
}

function treffer(datei, zeile, raw) {
  const rohwert = schneide(raw);
  return { datei, zeile, schluessel: rohwert === null ? 'script-src' : null, rohwert, art: 'script', quelle: 'code' };
}

export function astroTreffer(root, dateien) {
  const out = [];
  for (const d of dateien.filter(d => SEITE.test(d))) {
    const src = readFileSync(path.join(root, d), 'utf8');
    for (const m of src.matchAll(ATTRIBUT)) out.push(treffer(d, zeileVon(src, m.index), m[3] ?? m[4]));
    for (const b of src.matchAll(INJEKTION)) {
      const zuweisung = new RegExp(String.raw`\b${b[1].replace(/\$/g, '\\$')}\.src\s*=\s*(['"` + '`' + String.raw`])(https?:\/\/[^'"` + '`' + String.raw`]+)\1`, 'g');
      for (const m of src.matchAll(zuweisung)) out.push(treffer(d, zeileVon(src, m.index), m[2]));
    }
  }
  return out;
}
