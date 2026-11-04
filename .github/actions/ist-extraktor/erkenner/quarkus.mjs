import { readFileSync } from 'node:fs';
import path from 'node:path';
import { urlLiterale } from '../lib/generisch.mjs';

export const BESITZT = /^(?:[^/]+\/)?src\/main\/resources\/application(?:-[a-z]+)?\.properties$/;
const PLATZHALTER = /^\$\{([A-Za-z0-9_.\-]+)(?::(.*))?\}(.*)$/;

function leseProperties(root, dateien) {
  const map = new Map();
  for (const d of dateien.filter(d => BESITZT.test(d))) {
    readFileSync(path.join(root, d), 'utf8').split(/\r?\n/).forEach((z, i) => {
      const m = /^\s*(%([a-z]+)\.)?([^#=\s][^=]*?)\s*=\s*(.*)$/.exec(z);
      if (!m) return;
      const profil = m[2] ?? '';
      if (profil === 'dev' || profil === 'test') return;
      const k = m[3].trim(), alt = map.get(k);
      if (!alt || profil === 'prod') map.set(k, { wert: m[4].trim(), datei: d, zeile: i + 1, profil });
    });
  }
  return map;
}

function aufloesen(wert, map, tiefe = 0) {
  const m = PLATZHALTER.exec(wert);
  if (!m || tiefe > 5) return { wert, env: null };
  const name = m[1];
  if (map.has(name)) return aufloesen(map.get(name).wert + (m[3] ?? ''), map, tiefe + 1);
  return { wert: m[2] != null && m[2] !== '' ? m[2] + (m[3] ?? '') : null, env: name };
}

function artAusSchluessel(k) {
  if (/datasource.*jdbc\.url$/.test(k)) return 'db';
  if (/mailer\.host$|imap\.host$|smtp/i.test(k)) return 'smtp';
  return 'http';
}

// Namensteile getrennt prüfen (Punkt, Bindestrich, Unterstrich, CamelCase): "courier" enthält "uri" nur als Teilstring
const ZIEL_TEIL = name => name.replace(/([a-z0-9])([A-Z])/g, '$1.$2').toLowerCase().split(/[.\-_]+/).some(t => /^(?:url|uri|host|base|baseurl)$/.test(t));

const zeileVon =(src, idx) => src.slice(0, idx).split('\n').length;

export function quarkusTreffer(root, dateien) {
  const map = leseProperties(root, dateien), out = [];
  for (const [k, v] of map) {
    const r = aufloesen(v.wert, map);
    const urlSchluessel = /(url|uri|host|base-url|endpoint|jdbc\.url|erlaubte-hosts)$/i.test(k);
    // genau ein Literal ohne Komma und Leerraum bleibt ganz (auch mit Platzhalter), alles andere wird je URL zerlegt
    const w = (r.wert ?? '').trim(), einzeln = /^https?:\/\/[^\s,]*$/.test(w);
    const literale = einzeln ? [w] : urlLiterale(w);
    if (literale.length && (!urlSchluessel || !einzeln)) {
      for (const u of literale)
        out.push({ datei: v.datei, zeile: v.zeile, schluessel: k, rohwert: u, env: r.env, art: urlSchluessel ? artAusSchluessel(k) : 'http', quelle: 'config' });
      continue;
    }
    if (!urlSchluessel) continue;
    out.push({ datei: v.datei, zeile: v.zeile, schluessel: k, rohwert: r.wert, env: r.env, art: artAusSchluessel(k), quelle: 'config' });
  }
  for (const d of dateien.filter(d => /\.java$/.test(d) && d.includes('src/main/'))) {
    const src = readFileSync(path.join(root, d), 'utf8');
    for (const m of src.matchAll(/@RegisterRestClient\s*\(([^)]*)\)/g)) {
      const base = /baseUri\s*=\s*"([^"]+)"/.exec(m[1]);
      const key = /configKey\s*=\s*"([^"]+)"/.exec(m[1]);
      if (base) out.push({ datei: d, zeile: zeileVon(src, m.index), schluessel: 'baseUri', rohwert: base[1], env: null, art: 'http', quelle: 'code' });
      else if (key && ![...map.keys()].some(k => k.startsWith(`quarkus.rest-client.${key[1]}.`)))
        out.push({ datei: d, zeile: zeileVon(src, m.index), schluessel: `quarkus.rest-client.${key[1]}.url`, rohwert: null, env: null, art: 'http', quelle: 'code' });
    }
    if (/HttpClient\.newBuilder\(/.test(src))
      for (const m of src.matchAll(/@ConfigProperty\s*\(\s*name\s*=\s*"([^"]*)"/g))
        if (ZIEL_TEIL(m[1]) && !map.has(m[1])) out.push({ datei: d, zeile: zeileVon(src, m.index), schluessel: m[1], rohwert: null, env: null, art: 'http', quelle: 'code' });
  }
  return out;
}
