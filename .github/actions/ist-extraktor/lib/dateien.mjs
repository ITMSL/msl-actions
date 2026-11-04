import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const AUSSCHLUSS_VERZ = new Set(['node_modules', 'target', 'dist', 'build', 'coverage', 'docs', 'doc', 'test', 'tests', '__tests__', 'fixtures']);
const TEXT = /\.(java|kt|properties|ya?ml|json|mjs|cjs|js|ts|tsx|astro|html|sh|py|php|env|toml|cfg|conf)$/i;
const TESTDATEI = /\.(test|spec)\.[^./]+$/i;
const LOCKFILE =/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock)$/;

function verzeichnisErlaubt(name) {
  return !AUSSCHLUSS_VERZ.has(name) && !(name.startsWith('.') && name !== '.github');
}

function erlaubt(rel) {
  const teile = rel.split('/');
  return teile.slice(0, -1).every(verzeichnisErlaubt) && !rel.startsWith('src/test/') && TEXT.test(teile.at(-1)) && !TESTDATEI.test(teile.at(-1)) && !LOCKFILE.test(rel);
}

function kandidaten(root) {
  if (existsSync(path.join(root, '.git'))) {
    return execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
  }
  const out = [];
  (function geh(dir, rel) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (verzeichnisErlaubt(e.name)) geh(path.join(dir, e.name), r); }
      else out.push(r);
    }
  })(root, '');
  return out;
}

function istKleineDatei(root, rel) {
  try {
    const st = statSync(path.join(root, rel));
    return st.isFile() && st.size < 2_000_000;
  } catch { return false; }
}

export function textDateien(root) {
  return kandidaten(root).filter(rel => erlaubt(rel) && istKleineDatei(root, rel)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function repoTypen(root) {
  const hat = f => existsSync(path.join(root, f)), t = new Set();
  if (hat('pom.xml') && readFileSync(path.join(root, 'pom.xml'), 'utf8').includes('quarkus')) t.add('quarkus');
  if (hat('package.json')) t.add('node');
  if (['astro.config.mjs', 'astro.config.ts', 'astro.config.js'].some(hat)) t.add('astro');
  if (hat('.github/workflows')) t.add('actions');
  if (t.size === 0) t.add('unbekannt');
  return [...t].sort();
}
