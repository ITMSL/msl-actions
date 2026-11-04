import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { textDateien } from '../lib/dateien.mjs';
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


function mitBaum(dateien, fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ist-baum-'));
  try {
    for (const [name, inhalt] of Object.entries(dateien)) {
      mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      writeFileSync(path.join(dir, name), inhalt);
    }
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('Doku, Lockfiles und XML werden nicht gescannt, HTML und JSON außerhalb docs/ schon', () => {
  const url = 'https://x.example.org/p\n';
  mitBaum({
    'README.md': url, 'docs/hinweis.json': url, 'doc/a.html': url, 'package-lock.json': url, 'sub/yarn.lock': url,
    'pom.xml': url, 'seite.html': url, 'stil.json': url, 'src/A.java': url,
  }, dir => {
    assert.deepEqual(textDateien(dir), ['seite.html', 'src/A.java', 'stil.json']);
    const t = generischeTreffer(dir, textDateien(dir), new Set());
    assert.deepEqual(t.map(x => x.datei).sort(), ['seite.html', 'src/A.java', 'stil.json']);
  });
});
test('mit .git zählen nur getrackte Dateien, ohne .git der Dateisystem-Lauf', () => {
  mitBaum({ 'a.js': 'x\n', 'b.js': 'y\n', '.env': 'u.url=https://geheim.example.org\n', 'sub/c.js': 'z\n',
    'docs/x.json': 'z\n', 'node_modules/y.js': 'z\n', '.versteckt/z.js': 'z\n' }, dir => {
    assert.deepEqual(textDateien(dir), ['.env', 'a.js', 'b.js', 'sub/c.js']);
    execFileSync('git', ['init', '-q', dir]);
    execFileSync('git', ['-C', dir, 'add', 'a.js', 'b.js', 'sub/c.js', 'docs/x.json', 'node_modules/y.js', '.versteckt/z.js']);
    rmSync(path.join(dir, 'b.js'));
    assert.deepEqual(textDateien(dir), ['a.js', 'sub/c.js']);
  });
});

test('URL mit $ im Query wird wie bisher vor dem $ geschnitten, mit @ nach dem $ geht der ganze Token weiter', () => {
  mitDateien({ 'A.java': [
    '// https://h.example.org/x?id=${ID}',
    '// https://nutzer:12345$x@h.example.org/',
    '// https://u:${PW}@h.example.org/x',
    '// https://h.example.org/p/${ID}/ende',
    '// siehe https://h.example.org/a und mail@example.org',
  ].join('\n') + '\n' }, (dir, dateien) => {
    assert.deepEqual(generischeTreffer(dir, dateien).map(t => t.rohwert), [
      'https://h.example.org/x?id=',
      'https://nutzer:12345$x@h.example.org/',
      'https://u:${PW}@h.example.org/x',
      'https://h.example.org/p/',
      'https://h.example.org/a',
    ]);
  });
});
