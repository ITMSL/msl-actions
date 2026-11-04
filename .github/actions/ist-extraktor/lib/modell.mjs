export const VERSION = '0.1.0';
export const ARTEN = ['http', 'db', 'smtp', 'ssh', 'file', 'action', 'script'];
const RANG = { code: 1, compose: 2, workflow: 2, config: 3, deklariert: 4 };

export const vergleiche = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const envListe = (...quellen) => [...new Set(quellen.flat().filter(Boolean))].sort(vergleiche);

export function kante(art, ziel, beleg, quelle = 'code', env) {
  if (!ARTEN.includes(art)) throw new Error(`unbekannte Kantenart ${art}`);
  const k = { art, ziel, quelle, belege: [{ datei: beleg.datei, schluessel: beleg.schluessel }] };
  if (env) k.env = envListe(env);
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

export function vereinigeKanten(liste) {
  const kantenMap = new Map();
  for (const k of liste) {
    const id = kantenSchluessel(k);
    const vorhanden = kantenMap.get(id);
    if (vorhanden) {
      vorhanden.belege.push(...k.belege);
      if (k.env) vorhanden.env = envListe(vorhanden.env ?? [], k.env);
      if ((RANG[k.quelle] ?? 0) > (RANG[vorhanden.quelle] ?? 0)) vorhanden.quelle = k.quelle;
    } else kantenMap.set(id, { ...k, belege: [...k.belege], ...(k.env ? { env: envListe(k.env) } : {}) });
  }
  return [...kantenMap.values()].map(k => ({ ...k, belege: k.belege
    .filter((b, i, a) => a.findIndex(x => x.datei === b.datei && x.schluessel === b.schluessel) === i)
    .sort((a, b) => vergleiche(a.datei, b.datei) || vergleiche(a.schluessel, b.schluessel)) }))
    .sort((a, b) => vergleiche(kantenSchluessel(a), kantenSchluessel(b)));
}

export function kanonisch(ist) {
  const kanten = vereinigeKanten(ist.kanten);
  const knoten = [...new Set([ist.repo, ...ist.knoten, ...kanten.map(k => k.ziel)])].sort(vergleiche);
  return sortObj({ repo: ist.repo, extraktor_version: ist.extraktor_version, typ: [...ist.typ].sort(vergleiche), knoten, kanten });
}

export const serialisieren = ist => JSON.stringify(kanonisch(ist), null, 2) + '\n';
