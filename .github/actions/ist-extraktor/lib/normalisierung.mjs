import { pruefeRohwert } from './secret-guard.mjs';
export function istFqdn(host) {
  const h = host.replace(/:\d+$/, '');
  return h !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(h) && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(h);
}

export function hostAusUrl(rohwert) {
  const w = String(rohwert).trim();
  const mitSchema = /^(?:jdbc:)?[a-z][a-z0-9+.-]*:\/\/(?:[^/@\s]+@)?([A-Za-z0-9.-]+)(:\d+)?(?=[/?#]|$)/i.exec(w);
  let host, port;
  if (mitSchema) { host = mitSchema[1]; port = mitSchema[2] ?? ''; }
  else {
    const ohne = /^([a-z0-9.-]+)(:\d+)?$/.exec(w);
    if (!ohne) return null;
    host = ohne[1]; port = ohne[2] ?? '';
    if (!(istFqdn(host) || host === 'localhost' || port)) return null;
    if (!istFqdn(host) && !/^[a-z0-9-]+$/.test(host)) return null;
  }
  host = host.toLowerCase();
  return (istFqdn(host) ? 'url:' : 'host:') + host + port;
}

export function dbSchluessel(rohwert) {
  const m = /^(?:jdbc:)?(postgresql|postgres|mysql|mariadb|sqlserver|oracle):\/\/(?:[^/@\s]+@)?([A-Za-z0-9.-]+)(?::\d+)?/i.exec(String(rohwert).trim());
  if (!m) return null;
  const engine = m[1].toLowerCase() === 'postgres' ? 'postgresql' : m[1].toLowerCase();
  return `db:${engine}@${m[2].toLowerCase()}`;
}

export function zielknoten(art, rohwert) {
  const w = String(rohwert).trim();
  switch (art) {
    case 'db': return dbSchluessel(w) ?? (hostAusUrl(w) ? 'db:unbekannt@' + hostAusUrl(w).replace(/^(host|url):/, '') : null);
    case 'smtp': case 'ssh': { const h = hostAusUrl(w); return h ? `${art}:` + h.replace(/^(host|url):/, '') : null; }
    case 'file': return /^[\w./-]+$/.test(w) ? 'file:' + w.replace(/\/[^/]*\*.*$/, '/*') : null;
    case 'action': { const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/.exec(w); return m ? `action:${m[1]}/${m[2]}` : null; }
    default: return hostAusUrl(w);
  }
}

export function formGuardOeffentlich(knoten) {
  return knoten.filter(k => (k.startsWith('host:') && !istFqdn(k.slice(5))) || /^(db|ssh|smtp|file):/.test(k));
}

const HOST = /^[a-z0-9]+(?:[.-][a-z0-9]+)*(?::\d+)?$/;
const KNOTEN_FORM = {
  url: /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?::\d+)?$/,
  host: HOST,
  db: /^[a-z]+@[a-z0-9]+(?:[.-][a-z0-9]+)*(?::\d+)?$/,
  smtp: HOST,
  ssh: HOST,
  file: /^[\w./*-]+$/,
  action: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
  env: /^[A-Za-z0-9_.-]+$/,
  var: /^[A-Za-z0-9_.%-]+$/,
  pfad: /^\/[^\s?#]*$/,
};

export function knotenGueltig(knoten) {
  const m = /^([a-z]+):(.+)$/s.exec(String(knoten));
  if (!m || !Object.hasOwn(KNOTEN_FORM, m[1]) || !KNOTEN_FORM[m[1]].test(m[2])) return false;
  const g = pruefeRohwert(m[2]);
  return g.status !== 'geheimnis' && g.status !== 'url_anteil';
}
