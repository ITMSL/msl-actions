import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const AUSSCHLUSS_VERZ = new Set(['node_modules', 'target', 'dist', 'build', 'coverage', 'test', 'tests', '__tests__', 'fixtures']);
const TEXT = /\.(java|kt|properties|ya?ml|json|mjs|cjs|js|ts|tsx|astro|html|md|sh|py|php|env|toml|xml|cfg|conf)$/i;

export function textDateien(root) {
  const out = [];
  (function geh(dir, rel) {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (AUSSCHLUSS_VERZ.has(e.name) || (e.name.startsWith('.') && e.name !== '.github') || r === 'src/test') continue;
        geh(path.join(dir, e.name), r);
      } else if (TEXT.test(e.name) && statSync(path.join(dir, e.name)).size < 2_000_000) out.push(r);
    }
  })(root, '');
  return out;
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
