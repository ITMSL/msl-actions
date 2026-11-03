#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { extrahiere } from '../lib/extraktion.mjs';
import { serialisieren, kanonisch, VERSION } from '../lib/modell.mjs';
import { REGELDATEI } from '../lib/regeln.mjs';

const EXIT = { REGEL: 1, ERWARTET: 1, SECRET: 2, FORM: 2, KONFLIKT: 3, REPO: 3, AUFRUF: 3 };
const REPO_FORM = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const IST = 'docs/architektur/ist.json';

class Aufruf extends Error {
  constructor(text, code = 'AUFRUF') { super(text); this.code = code; }
}

function parseArgs(argv) {
  const a = { cmd: null, root: null, repo: null, oeffentlich: false, diagnose: false, version: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--repo') { a.repo = argv[++i]; if (!a.repo) throw new Aufruf('--repo braucht org/name'); }
    else if (t === '--oeffentlich') a.oeffentlich = true;
    else if (t === '--diagnose') a.diagnose = true;
    else if (t === '--version') a.version = true;
    else if (t.startsWith('--')) throw new Aufruf(`unbekannte Option ${t}`);
    else pos.push(t);
  }
  [a.cmd, a.root] = pos;
  if (pos.length > 2) throw new Aufruf('zu viele Argumente');
  return a;
}

function repoAusRemote(root) {
  if (!existsSync(path.join(root, '.git'))) return null;
  try {
    const url = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const m = /[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url);
    return m ? `${m[1]}/${m[2]}` : null;
  } catch { return null; }
}

function bestimmeRepo(a) {
  const repo = a.repo ?? (process.env.GITHUB_REPOSITORY || null) ?? repoAusRemote(a.root);
  if (!repo) throw new Aufruf('--repo fehlt (weder Argument noch GITHUB_REPOSITORY noch origin-Remote)', 'REPO');
  if (!REPO_FORM.test(repo)) throw new Aufruf(`--repo muss org/name sein: ${repo}`, 'REPO');
  return repo;
}

function exitCode(fehler) {
  return Math.max(...fehler.map(f => EXIT[f.code] ?? 3));
}

function meldeFehler(fehler) {
  for (const f of fehler) console.error(`${f.code}: ${f.text}`);
}

function abbild(ist) {
  const z = [`repo=${ist.repo}`, `extraktor_version=${ist.extraktor_version}`, ...ist.typ.map(t => `typ=${t}`)];
  for (const k of ist.kanten) {
    const s = `${k.art} ${k.ziel}`;
    z.push(s, `${s} quelle=${k.quelle}`);
    if (k.env) z.push(`${s} env=${k.env}`);
    for (const b of k.belege) z.push(`${s} beleg=${b.datei}#${b.schluessel}`);
  }
  return z;
}

function diffZeilen(alt, neu) {
  const a = new Set(abbild(alt)), n = new Set(abbild(neu));
  return [...[...n].filter(z => !a.has(z)).map(z => `+ ${z}`), ...[...a].filter(z => !n.has(z)).map(z => `- ${z}`)];
}

const vorlage = kanten => [
  '# Regeln fuer den Ist-Extraktor (Syntax: README der Action)',
  '# ignorieren: <Datei> <Zielknoten> — <Grund>',
  '# deklariert: <art> <Zielknoten> <Datei> — <Grund>',
  '# erwartet: <art> <Zielknoten>   |   erwartet: keine — <Grund>',
  ...(kanten.length ? kanten.map(k => `erwartet: ${k.art} ${k.ziel}`) : ['erwartet: keine — TODO Begruendung pruefen, es wurde keine Kante gefunden']),
  '',
].join('\n');

function main(argv) {
  const a = parseArgs(argv);
  if (a.version) { console.log(VERSION); return 0; }
  if (!['extract', 'update', 'check'].includes(a.cmd)) throw new Aufruf('Aufruf: archify-ist <extract|update|check> <root> [--repo org/name] [--oeffentlich] [--diagnose]');
  if (!a.root || !existsSync(a.root)) throw new Aufruf(`Wurzelverzeichnis fehlt: ${a.root ?? '(keins)'}`);
  const root = path.resolve(a.root), repo = bestimmeRepo({ ...a, root });
  const r = extrahiere(root, { repo, oeffentlich: a.oeffentlich, pflichtRegeln: a.cmd === 'check' });

  if (a.cmd === 'extract') {
    meldeFehler(r.fehler);
    if (a.diagnose) { if (r.ist) console.log(JSON.stringify({ ist: r.ist, diagnose: r.diagnose, laufausgabe: r.laufausgabe, fehler: r.fehler }, null, 2)); }
    else if (!r.fehler.length) process.stdout.write(serialisieren(r.ist));
    return r.fehler.length ? exitCode(r.fehler) : 0;
  }

  if (r.fehler.length) { meldeFehler(r.fehler); return exitCode(r.fehler); }
  const ziel = path.join(root, IST);

  if (a.cmd === 'update') {
    const regelPfad = path.join(root, REGELDATEI);
    if (!existsSync(regelPfad)) {
      mkdirSync(path.dirname(regelPfad), { recursive: true });
      writeFileSync(regelPfad, vorlage(r.ist.kanten));
      console.error(`${REGELDATEI} angelegt (alle gefundenen Kanten als erwartet) – bitte pruefen`);
    }
    mkdirSync(path.dirname(ziel), { recursive: true });
    writeFileSync(ziel, serialisieren(r.ist));
    console.error(`${IST} geschrieben (${r.ist.kanten.length} Kanten)`);
    return 0;
  }

  if (!existsSync(ziel)) { console.error(`${IST} fehlt – mit "archify-ist update" anlegen`); return 1; }
  const soll = serialisieren(r.ist), ist = readFileSync(ziel, 'utf8');
  if (soll === ist) { console.error(`${IST} aktuell (${r.ist.kanten.length} Kanten)`); return 0; }
  let diff = [];
  try { diff = diffZeilen(kanonisch(JSON.parse(ist)), r.ist); } catch { console.error(`${IST} ist kein gueltiges JSON`); return 1; }
  console.error(`${IST} weicht vom Code ab:`);
  if (diff.length) console.error(diff.join('\n'));
  else console.error('Inhalt gleich, nur die Formatierung weicht ab');
  return 1;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(`${e.code ?? 'FEHLER'}: ${e.message}`);
  process.exitCode = EXIT[e.code] ?? 3;
}
