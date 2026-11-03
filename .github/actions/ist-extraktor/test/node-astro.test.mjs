import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { repoTypen, textDateien } from '../lib/dateien.mjs';
import { nodeTreffer } from '../erkenner/node.mjs';
import { astroTreffer } from '../erkenner/astro.mjs';
import { composeTreffer } from '../erkenner/compose.mjs';
import { extrahiereRoh } from '../lib/extraktion.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'node-astro');
const erwartet = JSON.parse(readFileSync(path.join(root, 'erwartet.json'), 'utf8'));
test('Typ', () => assert.deepEqual(repoTypen(root), erwartet.typ));
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
const dateien = textDateien(root);
const A = 'src/lib/api.ts', I = 'src/pages/index.astro', C = 'docker-compose.yml';
test('Node-Erkenner direkt: exakte Treffermenge', () => {
  const erwartetTreffer = [
    `${A} | http | code | fetch | - | - | /orders/v1/list`,
    `${A} | http | code | fetch | - | - | /a/v2/x`,
    `${A} | http | code | fetch | - | - | /b/y`,
    `${A} | http | code | fetch | https://code.example.org/repos | - | -`,
    `${A} | http | code | baseURL | https://push.example.org/1 | - | -`,
    `${A} | http | code | new URL | https://monitor.example.org/health | - | -`,
    `${A} | http | code | base | - | PUBLIC_BACKEND_URL | -`,
    `${A} | http | code | cfg.base | - | - | -`,
    `${A} | http | code | PUBLIC_BACKEND_URL | - | PUBLIC_BACKEND_URL | -`,
    `${A} | http | code | PARTNER_H_URL | - | PARTNER_H_URL | -`,
  ];
  assert.deepEqual(nodeTreffer(root, dateien).map(fmt).sort(), erwartetTreffer.sort());
});
test('Astro-Erkenner direkt: exakte Treffermenge', () => {
  const erwartetTreffer = [
    `${I} | script | code | - | https://challenges.example.org/turnstile/v0/api.js | - | -`,
    `${I} | script | code | - | https://challenges.example.org/turnstile/v0/api.js | - | -`,
    `${I} | script | code | - | https://fonts.example.org/css2?family=Inter&display=swap | - | -`,
    `${I} | script | code | - | https://tag.example.org/gtag/js?id= | - | -`,
    `${I} | script | code | script-src | - | - | -`,
  ];
  assert.deepEqual(astroTreffer(root, dateien).map(fmt).sort(), erwartetTreffer.sort());
});
test('Compose-Erkenner direkt: beide Formen und Default, nichts außerhalb von environment', () => {
  const erwartetTreffer = [
    `${C} | http | compose | GEO_SERVICE_URL | http://geo-service:8083 | GEO_SERVICE_URL | -`,
    `${C} | http | compose | PARTNER_F_URL | https://partner-f.example.org/api | PARTNER_F_URL | -`,
    `${C} | http | compose | PARTNER_G_URL | - | PARTNER_G_URL | -`,
    `${C} | http | compose | PARTNER_E_URL | http://partner-e:9000 | PARTNER_E_URL | -`,
  ];
  assert.deepEqual(composeTreffer(root, dateien).map(fmt).sort(), erwartetTreffer.sort());
});
