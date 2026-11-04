import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ARTEN } from './modell.mjs';
import { knotenGueltig } from './normalisierung.mjs';

export const REGELDATEI = 'docs/architektur/ist-regeln.md';

function knoten(s) {
  if (!knotenGueltig(s)) throw new Error('ungültiger Zielknoten');
  return s;
}

function dateipfad(s) {
  if (!/^[^\s:@?#\\]+$/.test(s) || s.startsWith('/') || s.split('/').includes('..')) throw new Error('ungültiger Dateipfad');
  return s;
}

function art(s) {
  if (!ARTEN.includes(s)) throw new Error('unbekannte Kantenart');
  return s;
}

export function leseRegeln(root, { pflicht = false } = {}) {
  const r = { ignorieren: [], erwartet: [], erwartetGrund: null, deklariert: [], fehler: [] };
  const f = path.join(root, REGELDATEI);
  if (!existsSync(f)) {
    if (pflicht) r.fehler.push(`${REGELDATEI} fehlt`);
    return r;
  }
  let keine = null, erwartetZeilen = 0;
  for (const [i, z] of readFileSync(f, 'utf8').split(/\r?\n/).entries()) {
    const m = /^(ignorieren|erwartet|deklariert):\s*(.*)$/.exec(z.trim());
    if (!m) continue;
    const t = /^(.*?)\s+—\s+(.+)$/.exec(m[2]);
    const kopf = (t ? t[1] : m[2]).trim(), grund = t ? t[2].trim() : null;
    const teile = kopf.split(/\s+/).filter(Boolean);
    if (m[1] === 'erwartet') erwartetZeilen++;
    try {
      if (m[1] === 'erwartet') {
        if (kopf === 'keine') {
          if (!grund) throw new Error('erwartet: keine braucht eine Begründung nach " — "');
          if (keine) throw new Error('erwartet: keine steht mehrfach');
          keine = grund;
        } else {
          if (teile.length !== 2) throw new Error('erwartet braucht <art> <Zielknoten>');
          r.erwartet.push(`${art(teile[0])} ${knoten(teile[1])}`);
        }
      } else if (m[1] === 'ignorieren') {
        if (!grund || teile.length !== 2) throw new Error('ignorieren braucht <Datei> <Zielknoten> — <Grund>');
        r.ignorieren.push({ datei: dateipfad(teile[0]), ziel: knoten(teile[1]), grund });
      } else {
        if (!grund || teile.length !== 3) throw new Error('deklariert braucht <art> <Zielknoten> <Datei> — <Grund>');
        r.deklariert.push({ art: art(teile[0]), ziel: knoten(teile[1]), datei: dateipfad(teile[2]), grund });
      }
    } catch (e) { r.fehler.push(`Z.${i + 1}: ${e.message}`); }
  }
  if (keine) {
    if (r.erwartet.length) r.fehler.push('erwartet: keine und erwartet: <Kante> schließen sich aus');
    else { r.erwartet = 'keine'; r.erwartetGrund = keine; }
  }
  if (pflicht && erwartetZeilen === 0) r.fehler.push('weder erwartet: <Kante> noch erwartet: keine — <Grund> in der Regeldatei');
  return r;
}
