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
