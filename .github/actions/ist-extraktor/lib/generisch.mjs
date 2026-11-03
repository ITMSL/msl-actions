import { readFileSync } from 'node:fs';
import path from 'node:path';

const URL_RE = /\bhttps?:\/\/[^\s"'`<>)\]},;$]+/g;
const SCHLUESSEL_RE = /^\s*(%[a-z]+\.)?([A-Za-z0-9_.\-]*(?:url|uri|host|endpoint|base|dsn)[A-Za-z0-9_.\-]*)\s*[=:]\s*(.+?)\s*$/i;
const KONFIG = /\.(properties|ya?ml|env|toml|cfg|conf)$/i;
const NICHT_PROD = /^\s*%(dev|test)\./;

export function generischeTreffer(root, dateien, besitzt = new Set()) {
  const out = [];
  for (const d of dateien) {
    if (besitzt.has(d)) continue;
    const konfig = KONFIG.test(d);
    readFileSync(path.join(root, d), 'utf8').split(/\r?\n/).forEach((z, i) => {
      if (NICHT_PROD.test(z)) return;
      if (konfig) {
        const m = SCHLUESSEL_RE.exec(z);
        if (m) out.push({ datei: d, zeile: i + 1, schluessel: (m[1] ?? '') + m[2], rohwert: m[3].replace(/^["']|["']$/g, ''), hinweis: 'schluessel' });
      } else for (const u of z.match(URL_RE) ?? []) out.push({ datei: d, zeile: i + 1, schluessel: null, rohwert: u.replace(/[.:]+$/, ''), hinweis: 'url' });
    });
  }
  return out;
}
