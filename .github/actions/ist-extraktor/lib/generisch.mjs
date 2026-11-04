import { readFileSync } from 'node:fs';
import path from 'node:path';

const URL_RE = /\bhttps?:\/\/[^\s"'`<>)\]},;$]+/g;
const SCHLUESSEL_RE = /^\s*(%[a-z]+\.)?([A-Za-z0-9_.\-]*(?:url|uri|host|endpoint|base|dsn)[A-Za-z0-9_.\-]*)\s*[=:]\s*(.+?)\s*$/i;
const KONFIG = /\.(properties|ya?ml|env|toml|cfg|conf)$/i;
const NICHT_PROD = /^\s*%(dev|test)\./;
const KOMMENTAR = /^\s*(#|;|\/\/)/;
const WORKFLOW = /^\.github\/workflows\//;

// URL_RE schneidet am $ ab; steht danach noch Userinfo (@), geht der ganze Token an den Secret-Guard
function ganzerToken(zeile, m) {
  if (zeile[m.index + m[0].length] !== '$') return m[0];
  const token = /^[^\s"'`<>]*/.exec(zeile.slice(m.index))[0];
  return token.includes('@') ? token : m[0];
}

export function urlLiterale(zeile) {
  return [...zeile.matchAll(URL_RE)].map(m => ganzerToken(zeile, m).replace(/[.:]+$/, ''));
}

export function generischeTreffer(root, dateien, besitzt = new Set()) {
  const out = [];
  for (const d of dateien) {
    if (besitzt.has(d)) continue;
    const konfig = KONFIG.test(d);
    readFileSync(path.join(root, d), 'utf8').split(/\r?\n/).forEach((z, i) => {
      if (NICHT_PROD.test(z)) return;
      if (konfig) {
        if (KOMMENTAR.test(z)) return;
        const m = SCHLUESSEL_RE.exec(z);
        const schluesselWert = m ? m[3].replace(/^["']|["']$/g, '') : null;
        if (m) out.push({ datei: d, zeile: i + 1, schluessel: (m[1] ?? '') + m[2], rohwert: schluesselWert, hinweis: 'schluessel' });
        if (!WORKFLOW.test(d)) for (const u of urlLiterale(z)) if (u !== schluesselWert) out.push({ datei: d, zeile: i + 1, schluessel: null, rohwert: u, hinweis: 'url' });
      } else for (const u of urlLiterale(z)) out.push({ datei: d, zeile: i + 1, schluessel: null, rohwert: u, hinweis: 'url' });
    });
  }
  return out;
}
