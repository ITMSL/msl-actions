import { readFileSync } from 'node:fs';
import path from 'node:path';

export const BESITZT = /(^|\/)docker-compose[^/]*\.ya?ml$|^deploy\/.*\.ya?ml$/;
const GEHEIM_NAME = /SECRET|TOKEN|PASSWORD|PASS|KEY/;
const LISTE = /^\s*-\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
const MAP = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/;

export function composeTreffer(root, dateien) {
  const out = [];
  for (const d of dateien.filter(d => BESITZT.test(d))) {
    let einrueckung = null;
    readFileSync(path.join(root, d), 'utf8').split(/\r?\n/).forEach((z, i) => {
      const kopf = /^(\s*)environment\s*:\s*$/.exec(z);
      if (kopf) { einrueckung = kopf[1].length; return; }
      if (einrueckung === null || z.trim() === '') return;
      if (z.length - z.trimStart().length <= einrueckung) { einrueckung = null; return; }
      const m = LISTE.exec(z) ?? MAP.exec(z);
      if (!m || GEHEIM_NAME.test(m[1])) return;
      const wert = m[2].trim().replace(/^["']|["']$/g, '');
      if (/^https?:\/\//.test(wert)) out.push({ datei: d, zeile: i + 1, schluessel: m[1], rohwert: wert, env: m[1], art: 'http', quelle: 'compose' });
    });
  }
  return out;
}
