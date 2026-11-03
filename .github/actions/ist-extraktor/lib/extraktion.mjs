import { kante, vereinigeKanten, kantenSchluessel, kanonisch, VERSION } from './modell.mjs';
import { zielknoten, formGuardOeffentlich } from './normalisierung.mjs';
import { leseRegeln } from './regeln.mjs';
import { pruefeRohwert } from './secret-guard.mjs';
import { textDateien, repoTypen } from './dateien.mjs';
import { generischeTreffer } from './generisch.mjs';
import * as quarkus from '../erkenner/quarkus.mjs';
import * as node from '../erkenner/node.mjs';
import * as astro from '../erkenner/astro.mjs';
import * as compose from '../erkenner/compose.mjs';

const ERKENNER = { quarkus, node, astro };

// listen: [{rang, treffer}] – Erkenner Rang 2, generische Suche Rang 1
export function vereinigeTreffer(listen) {
  const map = new Map();
  for (const { rang, treffer } of listen) for (const t of treffer) {
    const id = `${t.datei}:${t.zeile}:${t.rohwert ?? t.pfad ?? t.schluessel}`;
    const alt = map.get(id);
    if (!alt) { map.set(id, { ...t, rang }); continue; }
    if ((alt.art ?? 'http') !== (t.art ?? 'http') && alt.rang === rang) {
      const e = new Error(`Konflikt ${id}: ${alt.art ?? 'http'} vs ${t.art ?? 'http'}`);
      e.code = 'KONFLIKT';
      throw e;
    }
    if (rang > alt.rang) map.set(id, { ...t, rang });
  }
  return [...map.values()];
}

export const pfadPraefix = p => {
  const s = p.split('?')[0].split('/').filter(Boolean);
  return '/' + (s.length > 1 && /^v\d+$/.test(s[1]) ? s.slice(0, 2).join('/') : s[0] ?? '');
};

export function trefferZuKanten(treffer, { laufausgabe = [] } = {}) {
  const out = [];
  for (const t of treffer) {
    const art = t.art ?? 'http', beleg = { datei: t.datei, schluessel: t.schluessel ?? '(literal)' }, quelle = t.quelle ?? 'code';
    const roh = t.pfad ?? t.rohwert;
    if (roh != null) {
      const g = pruefeRohwert(roh);
      if (g.status === 'geheimnis' || g.status === 'url_anteil') {
        const e = new Error(`Secret-Guard (${g.grund}) in ${t.datei}:${t.zeile}`);
        e.code = 'SECRET';
        throw e;
      }
    }
    if (t.pfad) { out.push(kante(art, 'pfad:' + pfadPraefix(t.pfad), beleg, quelle)); continue; }
    if (t.rohwert == null) { out.push(kante(art, t.env ? `env:${t.env}` : `var:${t.schluessel ?? 'unbekannt'}`, beleg, quelle)); continue; }
    const ziel = zielknoten(art, t.rohwert);
    if (!ziel) { laufausgabe.push(`verworfen ${t.datei}:${t.zeile} ${t.schluessel ?? ''}`); continue; }
    laufausgabe.push(`${t.datei}:${t.zeile} ${art} ${ziel} (${t.schluessel ?? 'literal'})`);
    out.push(kante(art, ziel, beleg, quelle, t.env ?? undefined));
  }
  return out;
}

export function extrahiereRoh(root) {
  const typ = repoTypen(root), dateien = textDateien(root), besitzt = new Set(), listen = [], laufausgabe = [];
  const aktiv = typ.filter(t => ERKENNER[t]).map(t => ERKENNER[t]);
  for (const t of typ) if (ERKENNER[t]) listen.push({ rang: 2, treffer: ERKENNER[t][`${t}Treffer`](root, dateien) });
  for (const erkenner of [...aktiv, compose]) {
    if (erkenner.BESITZT) for (const d of dateien) if (erkenner.BESITZT.test(d)) besitzt.add(d);
  }
  listen.push({ rang: 2, treffer: compose.composeTreffer(root, dateien) });
  listen.push({ rang: 1, treffer: generischeTreffer(root, dateien, besitzt) });
  const treffer = vereinigeTreffer(listen);
  const kanten = vereinigeKanten(trefferZuKanten(treffer, { laufausgabe }));
  return { typ, kanten, laufausgabe, diagnose: { treffer: treffer.length, verworfen: laufausgabe.filter(z => z.startsWith('verworfen ')).length } };
}

export function extrahiere(root, { repo, oeffentlich = false, pflichtRegeln = false } = {}) {
  const fehler = [], laufausgabe = [];
  const regeln = leseRegeln(root, { pflicht: pflichtRegeln });
  for (const text of regeln.fehler) fehler.push({ code: 'REGEL', text });
  const diagnose = { treffer: 0, ignoriert: 0, deklariert: 0, erwartetFehlend: [] };
  let roh;
  try { roh = extrahiereRoh(root); } catch (e) {
    if (e.code !== 'SECRET' && e.code !== 'KONFLIKT') throw e;
    return { ist: null, laufausgabe, diagnose, fehler: [...fehler, { code: e.code, text: e.message }] };
  }
  laufausgabe.push(...roh.laufausgabe);
  Object.assign(diagnose, roh.diagnose);

  let kanten = roh.kanten;
  for (const { datei, ziel, grund } of regeln.ignorieren) {
    for (const k of kanten) {
      if (k.ziel !== ziel) continue;
      const vorher = k.belege.length;
      k.belege = k.belege.filter(b => b.datei !== datei);
      if (k.belege.length < vorher) {
        diagnose.ignoriert += vorher - k.belege.length;
        laufausgabe.push(`ignoriert ${datei} ${ziel} (${grund})`);
      }
    }
    kanten = kanten.filter(k => k.belege.length > 0);
  }

  const deklariert = regeln.deklariert.map(d => kante(d.art, d.ziel, { datei: d.datei, schluessel: 'deklariert' }, 'deklariert'));
  diagnose.deklariert = deklariert.length;
  kanten = vereinigeKanten([...kanten, ...deklariert]);

  const vorhanden = new Set(kanten.map(kantenSchluessel));
  if (regeln.erwartet === 'keine') {
    if (kanten.length) fehler.push({ code: 'ERWARTET', text: `erwartet: keine, aber ${kanten.length} Kanten` });
  } else for (const k of regeln.erwartet) if (!vorhanden.has(k)) {
    diagnose.erwartetFehlend.push(k);
    fehler.push({ code: 'ERWARTET', text: `erwartet fehlt: ${k}` });
  }

  if (oeffentlich) for (const k of formGuardOeffentlich([...new Set(kanten.map(x => x.ziel))]))
    fehler.push({ code: 'FORM', text: `Form-Guard (öffentliches Repo): ${k}` });

  const ist = kanonisch({ repo, extraktor_version: VERSION, typ: roh.typ, knoten: [], kanten });
  return { ist, laufausgabe, diagnose, fehler };
}
