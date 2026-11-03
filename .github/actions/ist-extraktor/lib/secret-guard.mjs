const GEHEIM = [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bAKIA[0-9A-Z]{16}\b/, /\bgh[pousr]_[A-Za-z0-9]{20,}\b/];
const SCHEMA = /^(?:jdbc:)?[a-z][a-z0-9+.-]*:\/\//i;
const USERINFO = /^(?:jdbc:)?[a-z][a-z0-9+.-]*:\/\/[^/@\s]+@/i;
const TOKEN_PARAM = /[?&](key|token|sig|signature|secret|password|pass|apikey|api_key|access_token)=/i;
const GIT_REF = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const GIT_VORSEGMENT = new Set(['tree', 'blob', 'commit', 'commits', 'raw']);

export function istZufallswert(k) {
  if (k.length < 20) return false;
  const stuecke = k.split(/[-_]+/).filter(Boolean);
  const gesamt = stuecke.reduce((n, s) => n + s.length, 0);
  const gemischt = stuecke
    .filter(s => /[A-Za-z]/.test(s) && /[0-9]/.test(s))
    .reduce((n, s) => n + s.length, 0);
  return gemischt * 2 >= gesamt;
}

const hatZufallslauf = text => (text.match(/[A-Za-z0-9_-]+/g) ?? []).some(istZufallswert);

function queryZufall(w) {
  const ohneFragment = w.split('#')[0], q = ohneFragment.indexOf('?');
  if (q < 0) return false;
  return ohneFragment.slice(q + 1).split('&').some(paar => {
    const i = paar.indexOf('=');
    return hatZufallslauf(i < 0 ? paar : paar.slice(i + 1));
  });
}

function pfadZufall(w) {
  let rest;
  if (SCHEMA.test(w)) rest = w.replace(SCHEMA, '').replace(/^[^/?#]*/, '');
  else if (w.startsWith('/')) rest = w;
  else return false;
  const segmente = rest.split(/[?#]/)[0].split('/').filter(Boolean);
  return segmente.some((s, i) => {
    if (GIT_REF.test(s) && i > 0 && GIT_VORSEGMENT.has(segmente[i - 1])) return false;
    return hatZufallslauf(s);
  });
}

export function pruefeRohwert(wert) {
  const w = String(wert ?? '');
  if (GEHEIM.some(m => m.test(w))) return { status: 'geheimnis', grund: 'Geheimnismuster' };
  if (USERINFO.test(w)) return { status: 'url_anteil', grund: 'Userinfo in URL' };
  if (TOKEN_PARAM.test(w)) return { status: 'url_anteil', grund: 'Token-Parameter im Query' };
  if (queryZufall(w)) return { status: 'url_anteil', grund: 'langer Zufallswert im Query' };
  if (pfadZufall(w)) return { status: 'url_anteil', grund: 'langer Zufallswert im Pfad' };
  if (/[?#]/.test(w)) return { status: 'reduziert', grund: 'Query/Fragment verworfen' };
  return { status: 'ok' };
}
