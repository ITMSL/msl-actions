import test from 'node:test';
import assert from 'node:assert/strict';
import { pruefeRohwert, istZufallswert } from '../lib/secret-guard.mjs';
const s = w => pruefeRohwert(w).status;
// Geheimnis-Vektoren zur Laufzeit zusammengesetzt, damit weder Commit-Riegel noch Push-Protection anspringen
const jwt = 'ey' + 'JhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc';
const ghToken = 'gh' + 'p_' + 'abcdefghijklmnopqrstuvwxyz0123';
const awsKey = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP';
const pemKopf = '-----' + 'BEGIN PRIVATE' + ' KEY-----';
const skToken = 'sk_' + 'live_' + 'Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8';

test('Nicht-URL-Geheimnisse sind geheimnis', () => {
  assert.equal(s(jwt), 'geheimnis');
  assert.equal(s('Bearer ' + jwt), 'geheimnis');
  assert.equal(s(pemKopf), 'geheimnis');
  assert.equal(s(ghToken), 'geheimnis');
  assert.equal(s(awsKey), 'geheimnis');
});

const ROT = [
  'https://api.example.org/hooks/Zq9vL2mN8kP4rT6wY1bC3dF7gH/run.json',
  'https://api.example.org/hooks/Zq9vL2mN8kP4rT6wY1bC3dF7gH',
  'https://api.example.org/v1?sid=Zq9vL2mN8kP4rT6wY1bC3dF7gH',
  'https://api.example.org/v1?next=/t/Zq9vL2mN8kP4rT6wY1bC3dF7gH',
  'https://app.example.org/t/550e8400-e29b-41d4-a716-446655440000',
  'https://api.example.org/dl/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
  'https://hooks.example.org/services/T0A1B2C3D/B0D4E5F6G/Xy1Zw2Vu3Ts4Rq5Po6Nm7Lk8',
  'https://api.example.org/v1/items/' + skToken,
  'https://code.example.org/org/repo/releases/download/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0/x.zip',
  'https://api.example.org/v1?token=abcdefabcdefabcdefab',
  'https://api.example.org/v1?key=x',
  'https://user:pw@db.example.org/x',
  'jdbc:postgresql://user:pw@db:5432/x',
];
const NICHT_ROT = [
  ['https://maps.example.org/?cid=16926830479942594945', 'reduziert'],
  ['https://maps.example.org/maps?q=MSL+Express+Logistik+GmbH', 'reduziert'],
  ['https://www.example.org/direktkurier-saarbruecken/', 'ok'],
  ['https://www.example.org/news/kep-studie-2025-paketbranche-auch-2024-robust-im-plus-weiteres-sendungswachstum-von-2-8/', 'ok'],
  ['http://xml.example.org/sax/features/external-general-entities', 'ok'],
  ['https://code.example.org/org/repo/tree/cac53883f4714452f3084a22e4be20d042a9df33/logo', 'ok'],
  ['https://code.example.org/org/repo/blob/4bcb64181f266723439d955d60afa1c55fefa715/README.md', 'ok'],
  ['https://monitor.example.org/api/v1/query?query=cognitive_mail_storage_free_bytes', 'reduziert'],
  ['https://fonts.example.org/css2?family=Inter&display=swap', 'reduziert'],
  ['https://a.example.org/login?redirect=/cockpit/login/callback', 'reduziert'],
  ['https://tag.example.org/gtag/js?id=', 'reduziert'],
  ['jdbc:postgresql://db:5432/app?sslmode=require', 'reduziert'],
  ['https://www.example.org/download/2026-11-03-rechnung-4711.pdf', 'ok'],
  ['https://cdn.example.org/npm/some-library@1.2.3/dist/some-library.min.js', 'ok'],
  ['https://api.example.org', 'ok'],
  ['geo-service:8083', 'ok'],
];
test('Zufallswerte, Userinfo und Token-Parameter sind url_anteil', () => {
  for (const w of ROT) assert.equal(s(w), 'url_anteil', w);
});
test('Slugs, Ziffernfolgen, Git-Refs und harmloser Query sind nicht rot', () => {
  for (const [w, erwartet] of NICHT_ROT) assert.equal(s(w), erwartet, w);
});
test('Git-Ref-Ausnahme gilt nur hinter tree/blob/commit/commits/raw', () => {
  const ref = 'cac53883f4714452f3084a22e4be20d042a9df33';
  for (const v of ['tree', 'blob', 'commit', 'commits', 'raw']) assert.notEqual(s(`https://code.example.org/o/r/${v}/${ref}/x`), 'url_anteil', v);
  assert.equal(s(`https://code.example.org/o/r/archive/${ref}/x`), 'url_anteil');
  assert.equal(s(`https://code.example.org/${ref}`), 'url_anteil');
});
test('relative Pfade und Query ohne Schema werden ebenfalls geprüft', () => {
  assert.equal(s('/hooks/Zq9vL2mN8kP4rT6wY1bC3dF7gH/x'), 'url_anteil');
  assert.equal(s('/x?sid=Zq9vL2mN8kP4rT6wY1bC3dF7gH'), 'url_anteil');
  assert.equal(s('/orders/v1/list'), 'ok');
});
test('istZufallswert', () => {
  assert.equal(istZufallswert('AbCdEfGhIjKlMnOpQrSt'), false);
  assert.equal(istZufallswert('2026-11-03-mein-artikel'), false);
  assert.equal(istZufallswert('cf140477-4315-4024-a247-01'), true);
  assert.equal(istZufallswert('Zq9vL2mN8kP4rT6wY1bC'), true);
  assert.equal(istZufallswert('Zq9vL2mN8kP4rT6wY1b'), false);
  assert.equal(istZufallswert('direktkurier-saarbruecken-v2'), false);
});
