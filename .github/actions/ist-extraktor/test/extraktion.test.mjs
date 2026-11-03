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
