import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { generischeTreffer } from '../lib/generisch.mjs';

function mitDateien(dateien, fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ist-generisch-'));
  try {
    for (const [name, inhalt] of Object.entries(dateien)) writeFileSync(path.join(dir, name), inhalt);
    return fn(dir, Object.keys(dateien));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('Dateien aus besitzt werden übersprungen', () => {
  mitDateien({ 'a.properties': 'x.url=https://a.example.org\n', 'b.properties': 'y.url=https://b.example.org\n' }, (dir, dateien) => {
    const t = generischeTreffer(dir, dateien, new Set(['a.properties']));
    assert.deepEqual(t.map(x => x.datei), ['b.properties']);
  });
});
test('%dev.- und %test.-Zeilen liefern nichts', () => {
  const inhalt = '%dev.x.url=http://localhost:1\n%test.y.url=http://localhost:2\n%prod.z.url=https://z.example.org\n';
  mitDateien({ 'c.properties': inhalt }, (dir, dateien) => {
    const t = generischeTreffer(dir, dateien, new Set());
    assert.equal(t.length, 1);
    assert.equal(t[0].rohwert, 'https://z.example.org');
  });
});
test('URL-Literal aus .md/.java liefert Treffer, in .properties nur über den Schlüssel', () => {
  mitDateien({
    'doku.md': 'Siehe https://m.example.org/doku.\n',
    'A.java': 'String u = "https://j.example.org/v1";\n',
    'd.properties': '# siehe https://kommentar.example.org\npartner.url=https://p.example.org/x\n',
  }, (dir, dateien) => {
    const t = generischeTreffer(dir, dateien, new Set());
    const je = d => t.filter(x => x.datei === d);
    assert.deepEqual(je('doku.md').map(x => x.rohwert), ['https://m.example.org/doku']);
    assert.deepEqual(je('A.java').map(x => x.rohwert), ['https://j.example.org/v1']);
    assert.equal(je('d.properties').length, 1);
    assert.equal(je('d.properties')[0].schluessel, 'partner.url');
  });
});
