import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { repoTypen, textDateien } from '../lib/dateien.mjs';
import { extrahiereRoh } from '../lib/extraktion.mjs';
import { quarkusTreffer } from '../erkenner/quarkus.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'quarkus');
const erwartet = JSON.parse(readFileSync(path.join(root, 'erwartet.json'), 'utf8'));
test('Typ', () => assert.deepEqual(repoTypen(root), ['quarkus']));
test('Kantenmenge exakt', () => {
  const { kanten } = extrahiereRoh(root);
  assert.deepEqual(kanten.map(k => `${k.art} ${k.ziel}`).sort(), [...erwartet.kanten].sort());
  for (const [s, env] of Object.entries(erwartet.env)) assert.deepEqual(kanten.find(k => `${k.art} ${k.ziel}` === s).env, env);
});
test('keine Zeile und kein Rohliteral in den Kanten', () => {
  const txt = JSON.stringify(extrahiereRoh(root).kanten);
  assert.ok(!txt.includes('"zeile"')); assert.ok(!txt.includes('https://'));
});


const fmt = t => [t.datei, t.art ?? 'http', t.quelle, t.schluessel, t.rohwert, t.env, t.pfad].map(x => x ?? '-').join(' | ');
const P = 'src/main/resources/application.properties', J = 'src/main/java/App.java';
test('Quarkus-Erkenner direkt: exakte Treffermenge ohne generische Suche', () => {
  const erwartetTreffer = [
    `${J} | http | code | baseUri | https://routen.partner-c.example.org | - | -`,
    `${J} | http | code | partner-d.base-url | - | - | -`,
    `${J} | http | code | quarkus.rest-client.ohne-property.url | - | - | -`,
    `${P} | http | config | dienst.geo.base-url | - | GEO_SERVICE_URL | -`,
    `${P} | http | config | geo-service.url | - | GEO_SERVICE_URL | -`,
    `${P} | http | config | partner-e.adresse | https://adresse.partner-e.example.org | - | -`,
    `${P} | http | config | partner-a.url | https://app.partner-a.example.org | PARTNER_A_URL | -`,
    `${P} | http | config | quarkus.rest-client.geo-client.url | - | GEO_SERVICE_URL | -`,
    `${P} | http | config | quarkus.rest-client.partner-b-client.uri | https://preise.partner-b.example.org/json | PARTNER_B_BASE_URL | -`,
    `${P} | db | config | quarkus.datasource.jdbc.url | - | DB_URL | -`,
    `${P} | smtp | config | quarkus.mailer.host | smtp.example.org | SMTP_HOST | -`,
  ];
  assert.deepEqual(quarkusTreffer(root, textDateien(root)).map(fmt).sort(), erwartetTreffer.sort());
});

import os from 'node:os';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
test('Quarkus-Erkenner direkt: Listen mit Komma oder Leerzeichen werden je URL zerlegt, ein einzelnes Literal mit Platzhalter bleibt ganz', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ist-quarkus-liste-'));
  try {
    const rel = 'src/main/resources/application.properties';
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), [
      'cors.origins=https://a.example.org,https://b.example.org',
      'foo.liste=https://c.example.org https://d.example.org',
      'x.urls=https://e.example.org,https://f.example.org',
      'foo.hostvar=https://${HOST}/x',
      'foo.einzeln=https://g.example.org/p',
    ].join('\n') + '\n');
    assert.deepEqual(quarkusTreffer(dir, [rel]).map(t => `${t.schluessel}|${t.rohwert}`), [
      'cors.origins|https://a.example.org', 'cors.origins|https://b.example.org',
      'foo.liste|https://c.example.org', 'foo.liste|https://d.example.org',
      'x.urls|https://e.example.org', 'x.urls|https://f.example.org',
      'foo.hostvar|https://${HOST}/x',
      'foo.einzeln|https://g.example.org/p',
    ]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
