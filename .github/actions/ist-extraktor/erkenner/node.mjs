import { readFileSync } from 'node:fs';
import path from 'node:path';

export const BESITZT = null;
const QUELLE = /\.(ts|tsx|js|mjs|cjs|astro)$/;

export function nodeTreffer(root, dateien) {
  const out = [];
  for (const d of dateien.filter(d => QUELLE.test(d) && !/\.test\./.test(d))) {
    const src = readFileSync(path.join(root, d), 'utf8'), z = i => src.slice(0, i).split('\n').length;
    const envVon = new Map();
    for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:import\.meta\.env|process\.env)\.([A-Z0-9_]+)/g)) envVon.set(m[1], m[2]);
    for (const m of src.matchAll(/\b(fetch|axios\.(?:get|post|put|delete|request)|https?\.request)\s*\(\s*(['"])([^'"]*)\2/g)) {
      if (/^https?:\/\//.test(m[3])) out.push({ datei: d, zeile: z(m.index), schluessel: m[1], rohwert: m[3], art: 'http', quelle: 'code' });
      else if (m[3].startsWith('/')) out.push({ datei: d, zeile: z(m.index), schluessel: m[1], rohwert: null, pfad: m[3], art: 'http', quelle: 'code' });
    }
    for (const m of src.matchAll(/\bfetch\s*\(\s*`\$\{([A-Za-z_$][\w$.]*)\}/g))
      out.push({ datei: d, zeile: z(m.index), schluessel: m[1], rohwert: null, env: envVon.get(m[1]) ?? null, art: 'http', quelle: 'code' });
    for (const m of src.matchAll(/baseURL\s*:\s*(['"])([^'"]+)\1/g)) out.push({ datei: d, zeile: z(m.index), schluessel: 'baseURL', rohwert: m[2], art: 'http', quelle: 'code' });
    for (const m of src.matchAll(/new URL\(\s*(['"])(https?:\/\/[^'"]+)\1/g)) out.push({ datei: d, zeile: z(m.index), schluessel: 'new URL', rohwert: m[2], art: 'http', quelle: 'code' });
    for (const m of src.matchAll(/(?:import\.meta\.env|process\.env)\.([A-Z0-9_]+)/g))
      if (/(^|_)(URL|HOST|ENDPOINT|BASE_URL)$/.test(m[1]) && m[1] !== 'HOST')
        out.push({ datei: d, zeile: z(m.index), schluessel: m[1], rohwert: null, env: m[1], art: 'http', quelle: 'code' });
  }
  return out;
}
