import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { repoTypen } from '../lib/dateien.mjs';
import { extrahiereRoh } from '../lib/extraktion.mjs';
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
