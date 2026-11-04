import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';

const aktion = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(aktion, 'bin', 'archify-ist.mjs');

function mitKopie(name, fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ist-cli-'));
  try {
    if (name) cpSync(path.join(aktion, 'fixtures', name), dir, { recursive: true });
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function lauf(args, { env = {}, ohneRepoEnv = true } = {}) {
  const e = { ...process.env, ...env };
  if (ohneRepoEnv) delete e.GITHUB_REPOSITORY;
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: e });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const istJson = dir => path.join(dir, 'docs', 'architektur', 'ist.json');
const regelDatei = dir => path.join(dir, 'docs', 'architektur', 'ist-regeln.md');

test('extract: gültiges JSON ohne Zeilen und Rohliterale, Regeldatei ignoriert das Beispiel, alle erwarteten Kanten da', () => {
  mitKopie('quarkus', dir => {
    const r = lauf(['extract', dir, '--repo', 'ITMSL/fixture']);
    assert.equal(r.code, 0, r.err);
    const ist = JSON.parse(r.out);
    assert.equal(ist.repo, 'ITMSL/fixture');
    assert.ok(!r.out.includes('"zeile"'));
    assert.ok(!r.out.includes('https://'));
    const schluessel = ist.kanten.map(k => `${k.art} ${k.ziel}`);
    assert.ok(!schluessel.includes('http url:beispiel.example.org'));
    for (const k of ['db env:DB_URL', 'http env:GEO_SERVICE_URL', 'http url:app.partner-a.example.org', 'http url:preise.partner-b.example.org',
      'http url:routen.partner-c.example.org', 'http var:partner-d.base-url', 'http var:quarkus.rest-client.ohne-property.url', 'smtp smtp:smtp.example.org']) assert.ok(schluessel.includes(k), k);
  });
});

test('extract --diagnose liefert ist, diagnose und laufausgabe', () => {
  mitKopie('quarkus', dir => {
    const r = lauf(['extract', dir, '--repo', 'ITMSL/fixture', '--diagnose']);
    assert.equal(r.code, 0, r.err);
    const d = JSON.parse(r.out);
    assert.deepEqual(Object.keys(d).sort(), ['diagnose', 'fehler', 'ist', 'laufausgabe']);
    assert.equal(d.diagnose.ignoriert, 1);
    assert.ok(d.laufausgabe.some(z => /App\.java:\d+ http url:partner|App\.java:\d+ http url:routen/.test(z)));
  });
});

test('check: ohne ist.json Exit 1, nach update Exit 0, nach Manipulation Exit 1 mit Diff-Zeile', () => {
  mitKopie('quarkus', dir => {
    const a = lauf(['check', dir, '--repo', 'ITMSL/fixture']);
    assert.equal(a.code, 1);
    assert.match(a.err + a.out, /ist\.json fehlt/);

    const u = lauf(['update', dir, '--repo', 'ITMSL/fixture']);
    assert.equal(u.code, 0, u.err);
    assert.ok(existsSync(istJson(dir)));
    assert.equal(lauf(['check', dir, '--repo', 'ITMSL/fixture']).code, 0);

    const ist = JSON.parse(readFileSync(istJson(dir), 'utf8'));
    ist.kanten = ist.kanten.filter(k => !(k.art === 'http' && k.ziel === 'url:app.partner-a.example.org'));
    writeFileSync(istJson(dir), JSON.stringify(ist, null, 2) + '\n');
    const m = lauf(['check', dir, '--repo', 'ITMSL/fixture']);
    assert.equal(m.code, 1);
    assert.match(m.err + m.out, /^\+ http url:app\.partner-a\.example\.org$/m);
  });
});

test('check: reine Formatabweichung wird als solche gemeldet', () => {
  mitKopie('quarkus', dir => {
    lauf(['update', dir, '--repo', 'ITMSL/fixture']);
    writeFileSync(istJson(dir), JSON.stringify(JSON.parse(readFileSync(istJson(dir), 'utf8'))));
    const r = lauf(['check', dir, '--repo', 'ITMSL/fixture']);
    assert.equal(r.code, 1);
    assert.match(r.err + r.out, /Formatierung/);
  });
});

test('check: eine Regeldatei ist Pflicht, update legt eine Vorlage mit allen Kanten als erwartet an', () => {
  mitKopie('node-astro', dir => {
    const a = lauf(['check', dir, '--repo', 'ITMSL/fixture']);
    assert.equal(a.code, 1);
    assert.match(a.err + a.out, /ist-regeln\.md fehlt/);
    const u = lauf(['update', dir, '--repo', 'ITMSL/fixture']);
    assert.equal(u.code, 0, u.err);
    assert.match(u.err + u.out, /ist-regeln\.md angelegt/);
    const vorlage = readFileSync(regelDatei(dir), 'utf8');
    const ist = JSON.parse(readFileSync(istJson(dir), 'utf8'));
    assert.ok(ist.kanten.length > 0);
    for (const k of ist.kanten) assert.ok(vorlage.includes(`erwartet: ${k.art} ${k.ziel}\n`), k.ziel);
    assert.equal(lauf(['check', dir, '--repo', 'ITMSL/fixture']).code, 0);
  });
});

test('update schreibt nichts, wenn eine erwartete Kante fehlt', () => {
  mitKopie('quarkus', dir => {
    writeFileSync(regelDatei(dir), 'erwartet: http url:gibt-es-nicht.example.org\n');
    const r = lauf(['update', dir, '--repo', 'ITMSL/fixture']);
    assert.equal(r.code, 1);
    assert.match(r.err, /erwartet fehlt: http url:gibt-es-nicht\.example\.org/);
    assert.ok(!existsSync(istJson(dir)));
  });
});

test('öffentliches Repo: roter Host gibt Exit 2 und nennt den Knoten, ohne --oeffentlich Exit 0', () => {
  mitKopie('oeffentlich-rot', dir => {
    const r = lauf(['extract', dir, '--repo', 'x/y', '--oeffentlich']);
    assert.equal(r.code, 2);
    assert.match(r.err, /host:geo-service:8083/);
    assert.equal(r.out, '');
    assert.equal(lauf(['extract', dir, '--repo', 'x/y']).code, 0);
    assert.equal(lauf(['update', dir, '--repo', 'x/y', '--oeffentlich']).code, 2);
    assert.ok(!existsSync(istJson(dir)));
  });
});

test('Secret-Guard: Exit 2, die Meldung nennt Datei und Zeile, nie den Wert', () => {
  mitKopie('quarkus', dir => {
    writeFileSync(path.join(dir, 'src', 'main', 'java', 'Geheim.java'), '// https://' + 'benutzer:geheimwort' + '@host.example.org/x\n');
    const r = lauf(['check', dir, '--repo', 'x/y']);
    assert.equal(r.code, 2);
    assert.match(r.err, /Geheim\.java:1/);
    assert.ok(!(r.err + r.out).includes('geheimwort'));
  });
});

test('erwartet: keine mit Kanten gibt Exit 1 und nennt die Anzahl', () => {
  mitKopie('quarkus', dir => {
    writeFileSync(regelDatei(dir), 'ignorieren: src/main/java/App.java url:beispiel.example.org — Kommentar, kein Aufruf\nerwartet: keine — test\n');
    const r = lauf(['check', dir, '--repo', 'ITMSL/fixture']);
    assert.equal(r.code, 1);
    assert.match(r.err + r.out, /erwartet: keine, aber 9 Kanten/);
  });
});

test('Regelfehler gibt Exit 1', () => {
  mitKopie('quarkus', dir => {
    writeFileSync(regelDatei(dir), 'ignorieren: kaputt\n');
    const r = lauf(['extract', dir, '--repo', 'x/y']);
    assert.equal(r.code, 1);
    assert.match(r.err, /Z\.1:/);
  });
});

test('--repo fehlt: ohne Argument, Umgebung und Git Exit 3', () => {
  mitKopie(null, dir => {
    const r = lauf(['extract', dir]);
    assert.equal(r.code, 3);
    assert.match(r.err, /--repo fehlt/);
  });
});

test('--repo Fallback: GITHUB_REPOSITORY, sonst origin-Remote ohne Zugangsdaten', () => {
  mitKopie(null, dir => {
    const a = lauf(['extract', dir], { env: { GITHUB_REPOSITORY: 'ORG/AUS-ENV' }, ohneRepoEnv: false });
    assert.equal(a.code, 0, a.err);
    assert.equal(JSON.parse(a.out).repo, 'ORG/AUS-ENV');
    execFileSync('git', ['-C', dir, 'init', '-q']);
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', 'https://nutzer:' + 'zugang' + '@github.com/ORG/AUS-REMOTE.git']);
    const b = lauf(['extract', dir]);
    assert.equal(b.code, 0, b.err);
    assert.equal(JSON.parse(b.out).repo, 'ORG/AUS-REMOTE');
    assert.ok(!(b.out + b.err).includes('zugang'));
    execFileSync('git', ['-C', dir, 'remote', 'set-url', 'origin', 'git@github.com:ORG/SSH-FORM.git']);
    assert.equal(JSON.parse(lauf(['extract', dir]).out).repo, 'ORG/SSH-FORM');
  });
});

test('--repo mit ungültigem Format, unbekanntes Kommando und fehlende Wurzel geben Exit 3', () => {
  mitKopie(null, dir => {
    assert.equal(lauf(['extract', dir, '--repo', 'ohne-schraegstrich']).code, 3);
    assert.equal(lauf(['frisst', dir, '--repo', 'a/b']).code, 3);
    assert.equal(lauf(['extract', path.join(dir, 'gibt-es-nicht'), '--repo', 'a/b']).code, 3);
  });
});

const WERT = 'geheimwort';
const alles = r => r.out + r.err;

test('deklariert mit Zugangsdaten, Roh-IP oder Kurzhost ist ein Regelfehler ohne den Wert, ist.json bleibt aus', () => {
  for (const ziel of [`url:https://nutzer:${WERT}@api.example.org/v1?token=abcdefabcdefabcdefab`, 'url:10.0.0.5', 'url:intern-host']) {
    mitKopie('quarkus', dir => {
      writeFileSync(regelDatei(dir), `deklariert: http ${ziel} src/a.java — Grund\nerwartet: keine — test\n`);
      for (const kmd of ['extract', 'update', 'check']) {
        const r = lauf([kmd, dir, '--repo', 'x/y']);
        assert.equal(r.code, 1, `${kmd} ${ziel}`);
        assert.match(r.err, /REGEL: Z\.1:/);
        assert.ok(!alles(r).includes(WERT) && !alles(r).includes('10.0.0.5') && !alles(r).includes('intern-host'), kmd);
      }
      assert.ok(!existsSync(istJson(dir)));
    });
  }
});

test('Regeldatei ohne erwartet-Zeile: check Exit 1 mit einer und mit null Kanten, update bleibt lauffähig', () => {
  mitKopie('node-astro', dir => {
    mkdirSync(path.dirname(regelDatei(dir)), { recursive: true });
    writeFileSync(regelDatei(dir), '# nur ein Kommentar\n');
    const r = lauf(['check', dir, '--repo', 'x/y']);
    assert.equal(r.code, 1);
    assert.match(r.err, /REGEL: .*erwartet/);
  });
  mitKopie(null, dir => {
    writeFileSync(path.join(dir, 'package.json'), '{ "name": "leer" }\n');
    mkdirSync(path.dirname(regelDatei(dir)), { recursive: true });
    writeFileSync(regelDatei(dir), '# nur ein Kommentar\n');
    assert.equal(lauf(['check', dir, '--repo', 'x/y']).code, 1);
    assert.equal(lauf(['update', dir, '--repo', 'x/y']).code, 0);
    assert.equal(lauf(['check', dir, '--repo', 'x/y']).code, 1);
  });
});

test('Vorlage von update für ein Repo ohne Kante erfüllt die Regel', () => {
  mitKopie(null, dir => {
    writeFileSync(path.join(dir, 'package.json'), '{ "name": "leer" }\n');
    assert.equal(lauf(['update', dir, '--repo', 'x/y']).code, 0);
    assert.equal(lauf(['check', dir, '--repo', 'x/y']).code, 0);
  });
});

test('check bei neuer Kante: Diff-Zeile, dazu Datei, Zeile und reduziertes Literal, ohne Query', () => {
  mitKopie('quarkus', dir => {
    assert.equal(lauf(['update', dir, '--repo', 'x/y']).code, 0);
    const app = path.join(dir, 'src', 'main', 'java', 'App.java');
    const alt = readFileSync(app, 'utf8');
    writeFileSync(app, alt + '// https://neu.example.org/pfad?lang=de#kopf\n');
    const zeile = alt.split('\n').length;
    const r = lauf(['check', dir, '--repo', 'x/y']);
    assert.equal(r.code, 1);
    assert.match(r.err, /^\+ http url:neu\.example\.org$/m);
    assert.ok(r.err.includes(`src/main/java/App.java:${zeile} http url:neu.example.org [https://neu.example.org/pfad]`), r.err);
    assert.ok(!r.err.includes('lang=de') && !r.err.includes('kopf'));
  });
});

test('check: Knoten nur in ist.json ist keine reine Formatabweichung', () => {
  mitKopie('quarkus', dir => {
    lauf(['update', dir, '--repo', 'x/y']);
    const ist = JSON.parse(readFileSync(istJson(dir), 'utf8'));
    ist.knoten.push('url:zusatz.example.org');
    writeFileSync(istJson(dir), JSON.stringify(ist, null, 2) + '\n');
    const r = lauf(['check', dir, '--repo', 'x/y']);
    assert.equal(r.code, 1);
    assert.match(r.err, /^- knoten=url:zusatz\.example\.org$/m);
    assert.ok(!r.err.includes('Formatierung'));
  });
});

test('check: Windows-Zeilenenden in ist.json machen den Lauf nicht rot', () => {
  mitKopie('quarkus', dir => {
    lauf(['update', dir, '--repo', 'x/y']);
    writeFileSync(istJson(dir), readFileSync(istJson(dir), 'utf8').replace(/\n/g, '\r\n'));
    assert.equal(lauf(['check', dir, '--repo', 'x/y']).code, 0);
  });
});

test('Konflikt zweier Erkenner: Exit 3, die Meldung nennt Datei und Zeile, nie den Wert', () => {
  mitKopie('node-astro', dir => {
    const u = `https://nutzer:${WERT}@x.example.org/s.js`;
    writeFileSync(path.join(dir, 'src', 'pages', 'konflikt.astro'), `<script src="${u}"></script><script>fetch('${u}')</script>\n`);
    const r = lauf(['extract', dir, '--repo', 'x/y']);
    assert.equal(r.code, 3, alles(r));
    assert.match(r.err, /KONFLIKT: .*konflikt\.astro:1/);
    assert.ok(!alles(r).includes(WERT) && !alles(r).includes('nutzer'));
  });
});

test('unerwartete Ausnahme: Exit 3', () => {
  mitKopie(null, dir => {
    const datei = path.join(dir, 'keine-wurzel.txt');
    writeFileSync(datei, 'x');
    assert.equal(lauf(['extract', datei, '--repo', 'x/y']).code, 3);
  });
});

test('Exit-Code-Priorität: Guard-Fehler zusammen mit Regelfehler gibt Exit 2', () => {
  mitKopie('quarkus', dir => {
    writeFileSync(path.join(dir, 'src', 'main', 'java', 'Geheim.java'), '// https://' + 'benutzer:' + WERT + '@host.example.org/x\n');
    writeFileSync(regelDatei(dir), 'ignorieren: kaputt\n');
    const r = lauf(['extract', dir, '--repo', 'x/y']);
    assert.equal(r.code, 2);
    assert.match(r.err, /REGEL:/);
    assert.match(r.err, /SECRET:/);
  });
  mitKopie('oeffentlich-rot', dir => {
    mkdirSync(path.dirname(regelDatei(dir)), { recursive: true });
    writeFileSync(regelDatei(dir), 'ignorieren: kaputt\n');
    const r = lauf(['extract', dir, '--repo', 'x/y', '--oeffentlich']);
    assert.equal(r.code, 2);
    assert.match(r.err, /REGEL:/);
    assert.match(r.err, /FORM:/);
  });
});

function actionSkript() {
  const zeilen = readFileSync(path.join(aktion, 'action.yml'), 'utf8').split(/\r?\n/);
  const i = zeilen.findIndex(z => /^\s+run: \|\s*$/.test(z));
  assert.ok(i >= 0, 'run-Block fehlt');
  const einzug = /^\s*/.exec(zeilen[i + 1])[0].length;
  const block = [];
  for (const z of zeilen.slice(i + 1)) { if (z.trim() && !z.startsWith(' '.repeat(einzug))) break; block.push(z.slice(einzug)); }
  return block.join('\n') + '\n';
}

test('action.yml: run-Block gibt bei privat Exit 0, bei false und leer Exit 2 (Form-Guard)', () => {
  mitKopie('oeffentlich-rot', dir => {
    mkdirSync(path.dirname(regelDatei(dir)), { recursive: true });
    writeFileSync(regelDatei(dir), 'erwartet: http host:geo-service:8083\n');
    assert.equal(lauf(['update', dir, '--repo', 'x/y']).code, 0);
    const skript = path.join(dir, 'aktion.sh');
    writeFileSync(skript, actionSkript());
    const ausfuehren = privat => spawnSync('bash', [skript], {
      encoding: 'utf8',
      env: { ...process.env, REPO_PRIVAT: privat, REPO_NAME: 'x/y', AKTION: aktion.replace(/\\/g, '/'), PFAD: dir.replace(/\\/g, '/') },
    });
    const a = ausfuehren('true');
    assert.equal(a.status, 0, a.stderr);
    assert.equal(ausfuehren('false').status, 2);
    assert.equal(ausfuehren('').status, 2);
  });
});

test('Wert mit führendem Leerzeichen oder Tab in einer .env-Datei: Exit 2, das Passwort steht nirgends in der Ausgabe', () => {
  for (const pre of [' ', '\t']) {
    mitKopie('quarkus', dir => {
      writeFileSync(path.join(dir, 'app.env'), `BACKEND_URL="${pre}https://nutzer:geheimwort1@lead.example.org/x"\n`);
      for (const kmd of ['extract', 'check']) {
        const r = lauf([kmd, dir, '--repo', 'x/y']);
        assert.equal(r.code, 2, `${kmd} ${JSON.stringify(pre)}: ${alles(r)}`);
        assert.match(r.err, /SECRET: .*app\.env:1/);
        assert.ok(!alles(r).includes('geheimwort1') && !alles(r).includes('nutzer'));
      }
    });
  }
});

test('update-Vorlage besteht die eigene Prüfung auch mit Punkt-Env und Profil-var', () => {
  mitKopie('quarkus', dir => {
    const p = path.join(dir, 'src', 'main', 'resources', 'application.properties');
    writeFileSync(p, readFileSync(p, 'utf8') + 'foo.url=${db.url}\n');
    mkdirSync(path.join(dir, 'config'), { recursive: true });
    writeFileSync(path.join(dir, 'config', 'andere.properties'), '%prod.bar.url=${BAR_URL_X}\n');
    rmSync(regelDatei(dir));
    const u = lauf(['update', dir, '--repo', 'x/y']);
    assert.equal(u.code, 0, alles(u));
    const ist = JSON.parse(readFileSync(istJson(dir), 'utf8'));
    const ziele = ist.kanten.map(k => k.ziel);
    assert.ok(ziele.includes('env:db.url'), ziele.join());
    assert.ok(ziele.includes('var:%prod.bar.url'), ziele.join());
    const c = lauf(['check', dir, '--repo', 'x/y']);
    assert.equal(c.code, 0, alles(c));
  });
});
