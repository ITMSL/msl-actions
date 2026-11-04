import test from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, kante, kantenSchluessel, parseKantenSchluessel, kanonisch, serialisieren } from '../lib/modell.mjs';

test('VERSION ist x.y.z', () => assert.match(VERSION, /^\d+\.\d+\.\d+$/));
test('Kantenschlüssel hin und zurück', () => {
  const k = kante('http', 'host:geo-service', { datei: 'src/main/resources/application.properties', schluessel: 'geo-service.url' });
  assert.equal(kantenSchluessel(k), 'http host:geo-service');
  assert.deepEqual(parseKantenSchluessel('db db:postgresql@postgres'), { art: 'db', ziel: 'db:postgresql@postgres' });
  assert.throws(() => parseKantenSchluessel('unbekannt host:x'));
});
test('kanonisch sortiert und serialisiert byteidentisch', () => {
  const a = kanonisch({ repo: 'ITMSL/x', extraktor_version: '0.1.0', typ: ['node'], knoten: ['url:b.example.org', 'url:a.example.org'],
    kanten: [kante('http', 'url:b.example.org', { datei: 'b', schluessel: 'k' }), kante('http', 'url:a.example.org', { datei: 'a', schluessel: 'k' })] });
  const b = kanonisch({ repo: 'ITMSL/x', extraktor_version: '0.1.0', typ: ['node'], knoten: ['url:a.example.org', 'url:b.example.org'],
    kanten: [kante('http', 'url:a.example.org', { datei: 'a', schluessel: 'k' }), kante('http', 'url:b.example.org', { datei: 'b', schluessel: 'k' })] });
  assert.equal(serialisieren(a), serialisieren(b));
  assert.ok(!serialisieren(a).includes('zeile'));
  assert.ok(serialisieren(a).endsWith('\n'));
});
test('Zusammenführen behält env und die spezifischste Quelle', () => {
  const ist = kanonisch({ repo: 'ITMSL/x', extraktor_version: VERSION, typ: ['quarkus'], knoten: [],
    kanten: [
      kante('http', 'url:app.partner-a.example.org', { datei: 'a.java', schluessel: 'literal' }, 'code'),
      kante('http', 'url:app.partner-a.example.org', { datei: 'application.properties', schluessel: 'partner-a.url' }, 'config', 'PARTNER_A_URL'),
    ] });
  assert.equal(ist.kanten.length, 1);
  assert.deepEqual(ist.kanten[0].env, ['PARTNER_A_URL']);
  assert.equal(ist.kanten[0].quelle, 'config');
  assert.equal(ist.kanten[0].belege.length, 2);
  const umgekehrt = kanonisch({ repo: 'ITMSL/x', extraktor_version: VERSION, typ: ['quarkus'], knoten: [],
    kanten: [
      kante('http', 'url:app.partner-a.example.org', { datei: 'application.properties', schluessel: 'partner-a.url' }, 'config', 'PARTNER_A_URL'),
      kante('http', 'url:app.partner-a.example.org', { datei: 'a.java', schluessel: 'literal' }, 'code'),
    ] });
  assert.deepEqual(umgekehrt.kanten[0].env, ['PARTNER_A_URL']);
  assert.equal(umgekehrt.kanten[0].quelle, 'config');
});

import { vereinigeKanten } from '../lib/modell.mjs';
const rohIst = kanten => ({ repo: 'ITMSL/x', extraktor_version: VERSION, typ: ['b', 'A', 'a'], knoten: ['url:b.example.org', 'Z', 'a'], kanten });

test('Sortierung nach Bytes: Großbuchstaben vor Kleinbuchstaben, unabhängig von der Locale', () => {
  const ist = kanonisch(rohIst([
    kante('http', 'env:a', { datei: 'a.java', schluessel: 'k' }),
    kante('http', 'env:Z', { datei: 'b.java', schluessel: 'k' }),
    kante('http', 'url:x.example.org', { datei: 'z.java', schluessel: 'k' }),
    kante('http', 'url:x.example.org', { datei: 'B.java', schluessel: 'k' }),
    kante('http', 'url:x.example.org', { datei: 'a.java', schluessel: 'z' }),
    kante('http', 'url:x.example.org', { datei: 'a.java', schluessel: 'Z' }),
  ]));
  assert.deepEqual(ist.kanten.map(k => k.ziel), ['env:Z', 'env:a', 'url:x.example.org']);
  assert.deepEqual(ist.kanten[2].belege.map(b => `${b.datei}#${b.schluessel}`), ['B.java#k', 'a.java#Z', 'a.java#z', 'z.java#k']);
  assert.deepEqual(ist.typ, ['A', 'a', 'b']);
  assert.deepEqual(ist.knoten, ['ITMSL/x', 'Z', 'a', 'env:Z', 'env:a', 'url:b.example.org', 'url:x.example.org']);
  const schluessel = ist.kanten.map(k => `${k.art} ${k.ziel}`);
  for (let i = 1; i < schluessel.length; i++) assert.ok(schluessel[i - 1] <= schluessel[i], schluessel.join());
  assert.ok(serialisieren(ist).indexOf('"env:Z"') < serialisieren(ist).indexOf('"env:a"'));
});

test('env ist eine sortierte Liste distinkter Namen, unabhängig von der Reihenfolge', () => {
  const a = kante('http', 'url:x.example.org', { datei: 'a', schluessel: 'k' }, 'config', 'B_URL');
  const b = kante('http', 'url:x.example.org', { datei: 'b', schluessel: 'k' }, 'config', 'A_URL');
  const c = kante('http', 'url:x.example.org', { datei: 'c', schluessel: 'k' }, 'config', 'A_URL');
  for (const liste of [[a, b, c], [c, b, a], [b, a, c]]) {
    const k = kanonisch(rohIst(liste)).kanten;
    assert.equal(k.length, 1);
    assert.deepEqual(k[0].env, ['A_URL', 'B_URL']);
  }
  assert.deepEqual(vereinigeKanten([a, b])[0].env, ['A_URL', 'B_URL']);
  assert.deepEqual(a.env, ['B_URL'], 'ein einzelner Name steht ebenfalls als Liste');
});

test('env: ohne Namen fehlt das Feld, Merge mutiert die Eingabe nicht, Liste aus ist.json wird übernommen', () => {
  const ohne = kante('http', 'url:x.example.org', { datei: 'a', schluessel: 'k' });
  const mit = kante('http', 'url:x.example.org', { datei: 'b', schluessel: 'k' }, 'config', 'A_URL');
  assert.ok(!('env' in ohne));
  assert.ok(!serialisieren(kanonisch(rohIst([ohne]))).includes('"env"'));
  vereinigeKanten([mit, kante('http', 'url:x.example.org', { datei: 'c', schluessel: 'k' }, 'config', 'B_URL')]);
  assert.deepEqual(mit.env, ['A_URL']);
  const aus = { ...mit, env: ['Z_URL', 'A_URL'] };
  assert.deepEqual(kanonisch(rohIst([aus])).kanten[0].env, ['A_URL', 'Z_URL']);
});
