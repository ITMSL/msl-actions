const GEHEIM = [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bAKIA[0-9A-Z]{16}\b/, /\bgh[pousr]_[A-Za-z0-9]{20,}\b/];
const SCHEMA = /^(?:jdbc:)?[a-z][a-z0-9+.-]*:\/\//i;
const USERINFO = /^(?:jdbc:)?[a-z][a-z0-9+.-]*:\/\/[^/@\s]+@/i;
const TOKEN_PARAM = /[?&](key|token|sig|signature|secret|password|pass|apikey|api_key|access_token)=/i;
const LANG_ZUFALL_QUERY = /[?&][^=&]+=(?![^&]*\/)[A-Za-z0-9+_-]{20,}(?:&|$)/;
const LANG_ZUFALL_PFAD = /:\/\/[^/?#]+\/(?:[^/?#]+\/)*[A-Za-z0-9+_-]{24,}(?:[/?#]|$)/;

export function pruefeRohwert(wert) {
  const w = String(wert ?? '');
  if (GEHEIM.some(m => m.test(w))) return { status: 'geheimnis', grund: 'Geheimnismuster' };
  if (USERINFO.test(w)) return { status: 'url_anteil', grund: 'Userinfo in URL' };
  if (TOKEN_PARAM.test(w)) return { status: 'url_anteil', grund: 'Token-Parameter im Query' };
  if (LANG_ZUFALL_QUERY.test(w)) return { status: 'url_anteil', grund: 'langer Zufallswert im Query' };
  if (SCHEMA.test(w) && LANG_ZUFALL_PFAD.test(w) && !/\.[a-z]{2,5}(?:[?#]|$)/i.test(w)) return { status: 'url_anteil', grund: 'langer Zufallswert im Pfad' };
  if (/[?#]/.test(w)) return { status: 'reduziert', grund: 'Query/Fragment verworfen' };
  return { status: 'ok' };
}
