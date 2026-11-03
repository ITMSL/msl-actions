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
  assert.equal(ist.kanten[0].env, 'PARTNER_A_URL');
  assert.equal(ist.kanten[0].quelle, 'config');
  assert.equal(ist.kanten[0].belege.length, 2);
  const umgekehrt = kanonisch({ repo: 'ITMSL/x', extraktor_version: VERSION, typ: ['quarkus'], knoten: [],
    kanten: [
      kante('http', 'url:app.partner-a.example.org', { datei: 'application.properties', schluessel: 'partner-a.url' }, 'config', 'PARTNER_A_URL'),
      kante('http', 'url:app.partner-a.example.org', { datei: 'a.java', schluessel: 'literal' }, 'code'),
    ] });
  assert.equal(umgekehrt.kanten[0].env, 'PARTNER_A_URL');
  assert.equal(umgekehrt.kanten[0].quelle, 'config');
});
