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
  for (const [s, env] of Object.entries(erwartet.env)) assert.equal(kanten.find(k => `${k.art} ${k.ziel}` === s).env, env);
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
    `${P} | http | config | partner-a.url | https://app.partner-a.example.org | PARTNER_A_URL | -`,
    `${P} | http | config | quarkus.rest-client.geo-client.url | - | GEO_SERVICE_URL | -`,
    `${P} | http | config | quarkus.rest-client.partner-b-client.uri | https://preise.partner-b.example.org/json | PARTNER_B_BASE_URL | -`,
    `${P} | db | config | quarkus.datasource.jdbc.url | - | DB_URL | -`,
    `${P} | smtp | config | quarkus.mailer.host | smtp.example.org | SMTP_HOST | -`,
  ];
  assert.deepEqual(quarkusTreffer(root, textDateien(root)).map(fmt).sort(), erwartetTreffer.sort());
});
