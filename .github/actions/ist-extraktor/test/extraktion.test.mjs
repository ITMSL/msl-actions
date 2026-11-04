import test from 'node:test';
import assert from 'node:assert/strict';
import { vereinigeTreffer, trefferZuKanten } from '../lib/extraktion.mjs';

test('Pfad-Treffer wird zur pfad:-Kante, nicht zur var:-Kante', () => {
  const k = trefferZuKanten([{ datei: 'a.ts', zeile: 1, schluessel: 'fetch', rohwert: null, pfad: '/orders/v1/list', art: 'http' }]);
  assert.deepEqual(k.map(x => x.ziel), ['pfad:/orders/v1']);
});
test('Rohwert ohne Auflösung wird env: oder var:', () => {
  const k = trefferZuKanten([
    { datei: 'a', zeile: 1, schluessel: 'a.url', rohwert: null, env: 'A_URL', art: 'http' },
    { datei: 'a', zeile: 2, schluessel: 'b.url', rohwert: null, art: 'http' },
  ]);
  assert.deepEqual(k.map(x => x.ziel), ['env:A_URL', 'var:b.url']);
});
test('Secret-Guard wirft SECRET bei url_anteil', () => {
  assert.throws(() => trefferZuKanten([{ datei: 'a', zeile: 1, schluessel: 'x', rohwert: 'https://u:pw@x.example.org/', art: 'http' }]),
    e => e.code === 'SECRET');
});
test('Laufausgabe trägt Zeile, die Kante nicht', () => {
  const laufausgabe = [];
  const k = trefferZuKanten([{ datei: 'a.md', zeile: 7, schluessel: null, rohwert: 'https://x.example.org/p?q=1', art: 'http' }], { laufausgabe });
  assert.equal(k[0].ziel, 'url:x.example.org');
  assert.ok(laufausgabe[0].includes('a.md:7'));
  assert.ok(!JSON.stringify(k).includes('"zeile"'));
});
test('vereinigeTreffer: höherer Rang gewinnt, gleicher Rang mit anderer Art wirft KONFLIKT', () => {
  const g = { datei: 'a', zeile: 1, schluessel: 'k', rohwert: 'x', art: 'http' }, e = { ...g, art: 'smtp' };
  assert.equal(vereinigeTreffer([{ rang: 1, treffer: [g] }, { rang: 2, treffer: [e] }])[0].art, 'smtp');
  assert.equal(vereinigeTreffer([{ rang: 2, treffer: [e] }, { rang: 1, treffer: [g] }])[0].art, 'smtp');
  assert.throws(() => vereinigeTreffer([{ rang: 2, treffer: [g] }, { rang: 2, treffer: [e] }]), x => x.code === 'KONFLIKT');
});

const ghToken = 'gh' + 'p_' + 'abcdefghijklmnopqrstuvwxyz0123';
test('geheimnis und url_anteil werfen SECRET', () => {
  for (const rohwert of ['https://x.example.org/?a=' + ghToken, 'https://u:pw@x.example.org/', 'https://x.example.org/hooks/Zq9vL2mN8kP4rT6wY1bC3dF7gH'])
    assert.throws(() => trefferZuKanten([{ datei: 'a', zeile: 1, schluessel: 'k', rohwert, art: 'http' }]), e => e.code === 'SECRET', rohwert);
});
test('relative Pfade laufen durch den Secret-Guard', () => {
  for (const pfad of ['/' + ghToken + '/x', '/x?token=abcdefabcdefabcdefab', '/hooks/Zq9vL2mN8kP4rT6wY1bC3dF7gH/run'])
    assert.throws(() => trefferZuKanten([{ datei: 'a.ts', zeile: 1, schluessel: 'fetch', rohwert: null, pfad, art: 'http' }]), e => e.code === 'SECRET', pfad);
});
test('Treffer-Id: zwei relative Pfade je Zeile bleiben, Erkenner verdrängt generischen Treffer mit gleichem Rohwert', () => {
  const p1 = { datei: 'a.ts', zeile: 1, schluessel: 'fetch', rohwert: null, pfad: '/a/x', art: 'http' }, p2 = { ...p1, pfad: '/b/y' };
  assert.equal(vereinigeTreffer([{ rang: 2, treffer: [p1, p2] }]).length, 2);
  const erk = { datei: 'a.astro', zeile: 3, schluessel: null, rohwert: 'https://x.example.org/s.js', art: 'script' };
  const gen = { datei: 'a.astro', zeile: 3, schluessel: null, rohwert: 'https://x.example.org/s.js' };
  const r = vereinigeTreffer([{ rang: 2, treffer: [{ ...erk, schluessel: 'script-src' }] }, { rang: 1, treffer: [gen] }]);
  assert.equal(r.length, 1); assert.equal(r[0].art, 'script');
});

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { extrahiere } from '../lib/extraktion.mjs';
import { VERSION } from '../lib/modell.mjs';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
function mitKopie(name, fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ist-extrahiere-'));
  try {
    cpSync(path.join(fixtures, name), dir, { recursive: true });
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const regelDatei = dir => path.join(dir, 'docs', 'architektur', 'ist-regeln.md');
const schluessel = ist => ist.kanten.map(k => `${k.art} ${k.ziel}`);

test('extrahiere: ignorieren entfernt die Kante samt Beleg und zählt', () => {
  mitKopie('quarkus', dir => {
    const r = extrahiere(dir, { repo: 'ITMSL/fixture' });
    assert.deepEqual(r.fehler, []);
    assert.ok(!schluessel(r.ist).includes('http url:beispiel.example.org'));
    assert.equal(r.diagnose.ignoriert, 1);
    assert.equal(r.ist.extraktor_version, VERSION);
    assert.equal(r.ist.repo, 'ITMSL/fixture');
    assert.ok(!JSON.stringify(r.ist).includes('"zeile"'));
    rmSync(regelDatei(dir));
    const ohne = extrahiere(dir, { repo: 'ITMSL/fixture' });
    assert.ok(schluessel(ohne.ist).includes('http url:beispiel.example.org'));
    assert.equal(ohne.diagnose.ignoriert, 0);
  });
});

test('extrahiere: fehlende erwartet-Kante ist ein ERWARTET-Fehler und steht in der Diagnose', () => {
  mitKopie('quarkus', dir => {
    writeFileSync(regelDatei(dir), 'erwartet: http url:gibt-es-nicht.example.org\n');
    const r = extrahiere(dir, { repo: 'ITMSL/fixture' });
    assert.deepEqual(r.diagnose.erwartetFehlend, ['http url:gibt-es-nicht.example.org']);
    assert.deepEqual(r.fehler.map(f => f.code), ['ERWARTET']);
  });
});

test('extrahiere: erwartet: keine mit Kanten nennt die Anzahl der Kanten', () => {
  mitKopie('quarkus', dir => {
    writeFileSync(regelDatei(dir), 'erwartet: keine — test\n');
    const r = extrahiere(dir, { repo: 'ITMSL/fixture' });
    assert.deepEqual(r.fehler.map(f => f.code), ['ERWARTET']);
    assert.match(r.fehler[0].text, /^erwartet: keine, aber 9 Kanten$/);
  });
});

test('extrahiere: Regelfehler werden als REGEL gemeldet', () => {
  mitKopie('quarkus', dir => {
    writeFileSync(regelDatei(dir), 'ignorieren: kaputt\n');
    assert.deepEqual(extrahiere(dir, { repo: 'a/b' }).fehler.map(f => f.code), ['REGEL']);
  });
});

test('extrahiere: pflichtRegeln verlangt die Regeldatei', () => {
  mitKopie('oeffentlich-rot', dir => {
    assert.deepEqual(extrahiere(dir, { repo: 'a/b' }).fehler, []);
    const r = extrahiere(dir, { repo: 'a/b', pflichtRegeln: true });
    assert.deepEqual(r.fehler.map(f => f.code), ['REGEL']);
  });
});

test('extrahiere: deklariert fügt eine Kante mit quelle deklariert und Beleg deklariert hinzu', () => {
  mitKopie('quarkus', dir => {
    writeFileSync(regelDatei(dir), 'deklariert: http url:api.partner-d.example.org src/main/java/PartnerDClient.java — URL wird gebaut\n');
    const k = extrahiere(dir, { repo: 'a/b' }).ist.kanten.find(x => x.ziel === 'url:api.partner-d.example.org');
    assert.equal(k.quelle, 'deklariert');
    assert.deepEqual(k.belege, [{ datei: 'src/main/java/PartnerDClient.java', schluessel: 'deklariert' }]);
  });
});

test('extrahiere: Form-Guard greift nur bei oeffentlich und meldet jeden roten Knoten', () => {
  mitKopie('oeffentlich-rot', dir => {
    const privat = extrahiere(dir, { repo: 'a/b' });
    assert.deepEqual(privat.fehler, []);
    assert.ok(schluessel(privat.ist).includes('http host:geo-service:8083'));
    const r = extrahiere(dir, { repo: 'a/b', oeffentlich: true });
    assert.deepEqual(r.fehler.map(f => f.code), ['FORM']);
    assert.match(r.fehler[0].text, /host:geo-service:8083/);
  });
});

test('extrahiere: Secret-Guard hat Vorrang und ist durch ignorieren nicht auszuschalten', () => {
  mitKopie('quarkus', dir => {
    writeFileSync(path.join(dir, 'src', 'main', 'java', 'Geheim.java'), '// https://' + 'benutzer:pw' + '@host.example.org/x\n');
    writeFileSync(regelDatei(dir), 'ignorieren: src/main/java/Geheim.java url:host.example.org — Versuch\nerwartet: http url:gibt-es-nicht.example.org\n');
    const r = extrahiere(dir, { repo: 'a/b' });
    assert.deepEqual(r.fehler.map(f => f.code), ['SECRET']);
    assert.equal(r.ist, null);
    assert.ok(!JSON.stringify(r).includes('pw@'));
  });
});

test('unaufgelöster Platzhalter mit Schlüssel wird var:-Kante ohne Rohwert, sonstiger Verwurf bleibt', () => {
  const laufausgabe = [];
  const k = trefferZuKanten([
    { datei: '.github/workflows/x.yml', zeile: 4, schluessel: 'SFTP_HOST', rohwert: '${{ secrets.X }}', art: 'http' },
    { datei: 'a.properties', zeile: 2, schluessel: 'foo-host', rohwert: 'true', art: 'http' },
    { datei: 'a.properties', zeile: 3, schluessel: null, rohwert: '${EIN_HOST}', art: 'http' },
  ], { laufausgabe });
  assert.deepEqual(k.map(x => `${x.art} ${x.ziel}`), ['http var:SFTP_HOST']);
  assert.deepEqual(k[0].belege, [{ datei: '.github/workflows/x.yml', schluessel: 'SFTP_HOST' }]);
  assert.ok(!JSON.stringify(k).includes('secrets'));
  assert.equal(laufausgabe.filter(z => z.startsWith('verworfen ')).length, 2);
});

test('Platzhalter in einer Workflow-Datei erscheint im Gesamtlauf als var:-Kante', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ist-platzhalter-'));
  try {
    mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(path.join(dir, '.github', 'workflows', 'x.yml'), 'env:\n  SFTP_HOST: ${{ secrets.X }}\n  foo-host: true\n');
    const r = extrahiere(dir, { repo: 'a/b' });
    assert.deepEqual(schluessel(r.ist), ['http var:SFTP_HOST']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Laufausgabe trägt das reduzierte Literal ohne Userinfo, Query und Fragment, auch für env-, var- und pfad-Kanten', () => {
  const laufausgabe = [];
  trefferZuKanten([
    { datei: 'a.java', zeile: 3, schluessel: null, rohwert: 'https://x.example.org:8443/p/q?lang=de#abschnitt', art: 'http' },
    { datei: 'a.ts', zeile: 5, schluessel: 'fetch', rohwert: null, pfad: '/orders/v1/list?seite=2', art: 'http' },
    { datei: 'a.properties', zeile: 1, schluessel: 'a.url', rohwert: null, env: 'A_URL', art: 'http' },
    { datei: 'a.properties', zeile: 2, schluessel: 'b.url', rohwert: null, art: 'http' },
  ], { laufausgabe });
  assert.deepEqual(laufausgabe, [
    'a.java:3 http url:x.example.org:8443 [https://x.example.org:8443/p/q] (literal)',
    'a.ts:5 http pfad:/orders/v1 [/orders/v1/list] (fetch)',
    'a.properties:1 http env:A_URL (a.url)',
    'a.properties:2 http var:b.url (b.url)',
  ]);
});

test('Konfliktmeldung nennt Datei, Zeile und Arten, aber nie den Rohwert', () => {
  const g = { datei: 'a.astro', zeile: 2, schluessel: 'k', rohwert: 'https://nutzer:geheimwort@x.example.org/s.js', art: 'http' };
  assert.throws(() => vereinigeTreffer([{ rang: 2, treffer: [g] }, { rang: 2, treffer: [{ ...g, art: 'script' }] }]),
    e => e.code === 'KONFLIKT' && /a\.astro:2/.test(e.message) && /http/.test(e.message) && /script/.test(e.message) && !/geheimwort|nutzer/.test(e.message));
});

test('extrahiere: erwartet prüft gegen die Kanten nach ignorieren und nach deklariert', () => {
  mitKopie('quarkus', dir => {
    writeFileSync(regelDatei(dir), 'ignorieren: src/main/java/App.java url:beispiel.example.org — Kommentar\nerwartet: http url:beispiel.example.org\n');
    const a = extrahiere(dir, { repo: 'a/b' });
    assert.deepEqual(a.diagnose.erwartetFehlend, ['http url:beispiel.example.org']);
    writeFileSync(regelDatei(dir), 'deklariert: http url:api.partner-d.example.org src/main/java/PartnerDClient.java — gebaut\nerwartet: http url:api.partner-d.example.org\n');
    assert.deepEqual(extrahiere(dir, { repo: 'a/b' }).fehler, []);
  });
});

test('extrahiere: ignorieren ist an die Datei gebunden, derselbe Knoten aus einer zweiten Datei bleibt', () => {
  mitKopie('quarkus', dir => {
    writeFileSync(path.join(dir, 'src', 'main', 'java', 'Zwei.java'), '// https://beispiel.example.org/zwei\n');
    const r = extrahiere(dir, { repo: 'a/b' });
    const k = r.ist.kanten.find(x => x.ziel === 'url:beispiel.example.org');
    assert.deepEqual(k.belege.map(b => b.datei), ['src/main/java/Zwei.java']);
    assert.equal(r.diagnose.ignoriert, 1);
  });
});

import { reduziertesLiteral } from '../lib/extraktion.mjs';
test('reduziertesLiteral entfernt Userinfo, Query und Fragment, behält Schema, Host, Port und Pfad', () => {
  assert.equal(reduziertesLiteral('https://nutzer:geheimwort@x.example.org:8443/p/q?a=1#f'), 'https://x.example.org:8443/p/q');
  assert.equal(reduziertesLiteral('jdbc:postgresql://u@db.example.org/x?ssl=1'), 'jdbc:postgresql://db.example.org/x');
  assert.equal(reduziertesLiteral('smtp.example.org?x=1'), 'smtp.example.org');
  assert.equal(reduziertesLiteral('/orders/v1/list?seite=2'), '/orders/v1/list');
});

test('reduziertesLiteral trimmt führende Leerzeichen und Tabs, bevor Userinfo und Query entfernt werden', () => {
  assert.equal(reduziertesLiteral(' https://nutzer:geheimwort1@x.example.org/p?a=1'), 'https://x.example.org/p');
  assert.equal(reduziertesLiteral('\thttps://nutzer:geheimwort1@x.example.org:8443/p#f '), 'https://x.example.org:8443/p');
  assert.equal(reduziertesLiteral('  /orders/v1?x=1'), '/orders/v1');
});

test('Quarkus-Platzhalter mit führendem Leerzeichen im Default wirft SECRET', () => {
  mitKopie('quarkus', dir => {
    const p = path.join(dir, 'src', 'main', 'resources', 'application.properties');
    writeFileSync(p, readFileSync(p, 'utf8') + 'foo.url=${FOO_URL: https://nutzer:geheimwort1@h.example.org}\n');
    const r = extrahiere(dir, { repo: 'a/b' });
    assert.deepEqual(r.fehler.map(f => f.code), ['SECRET']);
    assert.ok(!JSON.stringify(r).includes('geheimwort1'));
  });
});

test('deklariert-Kante verschmilzt mit einer gefundenen Kante gleichen Schlüssels: eine Kante, beide Belege, quelle deklariert', () => {
  mitKopie('quarkus', dir => {
    writeFileSync(regelDatei(dir), 'deklariert: http url:routen.partner-c.example.org src/main/java/PartnerCClient.java — zusätzlich gebaut\n');
    const r = extrahiere(dir, { repo: 'a/b' });
    const k = r.ist.kanten.filter(x => x.art === 'http' && x.ziel === 'url:routen.partner-c.example.org');
    assert.equal(k.length, 1);
    assert.equal(k[0].quelle, 'deklariert');
    assert.deepEqual(k[0].belege.map(b => `${b.datei}#${b.schluessel}`), ['src/main/java/App.java#baseUri', 'src/main/java/PartnerCClient.java#deklariert']);
  });
});

test('zwei Platzhalter mit gleichem Default ergeben eine Kante mit beiden Namen als Liste', () => {
  mitKopie('quarkus', dir => {
    const p = path.join(dir, 'src', 'main', 'resources', 'application.properties');
    writeFileSync(p, readFileSync(p, 'utf8')
      + 'eins.url=${EINS_URL:https://zwei-namen.example.org}\nzwei.url=${ZWEI_URL:https://zwei-namen.example.org}\n');
    const k = extrahiere(dir, { repo: 'a/b' }).ist.kanten.filter(x => x.ziel === 'url:zwei-namen.example.org');
    assert.equal(k.length, 1);
    assert.deepEqual(k[0].env, ['EINS_URL', 'ZWEI_URL']);
  });
});

function mitCompose(zeile, fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ist-compose-'));
  try {
    writeFileSync(path.join(dir, 'docker-compose.yml'), `services:\n  app:\n    environment:\n      ${zeile}\n`);
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('Compose: Leerzeichen in den Quotes oder im Default umgehen den Secret-Guard nicht', () => {
  for (const zeile of ['- X_URL=" https://nutzer:geheimwort1@h.example.org"', '- X_URL=${X_URL:- https://nutzer:geheimwort1@h.example.org}',
    "- X_URL=' https://nutzer:geheimwort1@h.example.org '", 'X_URL: "\thttps://nutzer:geheimwort1@h.example.org"']) {
    mitCompose(zeile, dir => {
      const r = extrahiere(dir, { repo: 'a/b' });
      assert.deepEqual(r.fehler.map(f => f.code), ['SECRET'], zeile);
      assert.ok(!JSON.stringify(r).includes('geheimwort1'), zeile);
    });
  }
});

test('Compose: Leerzeichen um einen harmlosen Wert ändern die Kante nicht', () => {
  mitCompose('- X_URL=" https://api.example.org/p "', dir => {
    assert.deepEqual(schluessel(extrahiere(dir, { repo: 'a/b' }).ist), ['http url:api.example.org']);
  });
});

test('Userinfo mit Platzhalter oder Dollarzeichen: der ungeschnittene Token geht an den Secret-Guard', () => {
  for (const zeile of ['// https://nutzer:12345$x@h.example.org/', '// https://u:${PW}@h.example.org/x', '// url = "https://u:${PW}@h.example.org/x"']) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ist-userinfo-'));
    try {
      writeFileSync(path.join(dir, 'A.java'), zeile + '\n');
      const r = extrahiere(dir, { repo: 'a/b' });
      assert.deepEqual(r.fehler.map(f => f.code), ['SECRET'], zeile);
      assert.ok(!JSON.stringify(r).includes('12345') && !JSON.stringify(r).includes('nutzer'), zeile);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});
