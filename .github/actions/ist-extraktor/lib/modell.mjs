export const VERSION = '0.1.0';
export const ARTEN = ['http', 'db', 'smtp', 'ssh', 'file', 'action', 'script'];
const RANG = { code: 1, compose: 2, workflow: 2, config: 3, deklariert: 4 };

export function kante(art, ziel, beleg, quelle = 'code', env) {
  if (!ARTEN.includes(art)) throw new Error(`unbekannte Kantenart ${art}`);
  const k = { art, ziel, quelle, belege: [{ datei: beleg.datei, schluessel: beleg.schluessel }] };
  if (env) k.env = env;
  return k;
}

export const kantenSchluessel = k => `${k.art} ${k.ziel}`;

export function parseKantenSchluessel(s) {
  const [art, ziel, rest] = String(s).trim().split(/\s+/);
  if (!ARTEN.includes(art) || !ziel || rest) throw new Error(`ungültiger Kantenschlüssel: ${s}`);
  return { art, ziel };
}

function sortObj(o) {
  if (Array.isArray(o)) return o.map(sortObj);
  if (o && typeof o === 'object') return Object.fromEntries(Object.keys(o).sort().map(k => [k, sortObj(o[k])]));
  return o;
}

export function kanonisch(ist) {
  const kantenMap = new Map();
  for (const k of ist.kanten) {
    const id = kantenSchluessel(k) + (k.quelle === 'deklariert' ? ' deklariert' : '');
    const vorhanden = kantenMap.get(id);
    if (vorhanden) {
      vorhanden.belege.push(...k.belege);
      if (!vorhanden.env && k.env) vorhanden.env = k.env;
      if ((RANG[k.quelle] ?? 0) > (RANG[vorhanden.quelle] ?? 0)) vorhanden.quelle = k.quelle;
    } else kantenMap.set(id, { ...k, belege: [...k.belege] });
  }
  const kanten = [...kantenMap.values()].map(k => ({ ...k, belege: k.belege
    .filter((b, i, a) => a.findIndex(x => x.datei === b.datei && x.schluessel === b.schluessel) === i)
    .sort((a, b) => (a.datei + a.schluessel).localeCompare(b.datei + b.schluessel)) }))
    .sort((a, b) => kantenSchluessel(a).localeCompare(kantenSchluessel(b)));
  const knoten = [...new Set([ist.repo, ...ist.knoten, ...kanten.map(k => k.ziel)])].sort();
  return sortObj({ repo: ist.repo, extraktor_version: ist.extraktor_version, typ: [...ist.typ].sort(), knoten, kanten });
}

export const serialisieren = ist => JSON.stringify(kanonisch(ist), null, 2) + '\n';
