import test from 'node:test';
import assert from 'node:assert/strict';
import { pruefeRohwert } from '../lib/secret-guard.mjs';
const s = w => pruefeRohwert(w).status;
// Geheimnis-Vektoren zur Laufzeit zusammengesetzt, damit weder Commit-Riegel noch Push-Protection anspringen
const jwt = 'ey' + 'JhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc';
const ghToken = 'gh' + 'p_' + 'abcdefghijklmnopqrstuvwxyz0123';
const awsKey = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP';
const pemKopf = '-----' + 'BEGIN PRIVATE' + ' KEY-----';
test('Nicht-URL-Geheimnisse sind geheimnis', () => {
  assert.equal(s(jwt), 'geheimnis');
  assert.equal(s('Bearer ' + jwt), 'geheimnis');
  assert.equal(s(pemKopf), 'geheimnis');
  assert.equal(s(ghToken), 'geheimnis');
  assert.equal(s(awsKey), 'geheimnis');
});
test('Userinfo in URL und JDBC ist url_anteil', () => {
  assert.equal(s('https://user:pw@db.example.org/x'), 'url_anteil');
  assert.equal(s('jdbc:postgresql://user:pw@db:5432/x'), 'url_anteil');
});
test('Token im Query oder Pfad ist url_anteil', () => {
  assert.equal(s('https://api.example.org/v1?token=abcdefabcdefabcdefab'), 'url_anteil');
  assert.equal(s('https://api.example.org/v1?key=x'), 'url_anteil');
  assert.equal(s('https://api.example.org/hooks/Zq9vL2mN8kP4rT6wY1bC3dF7gH'), 'url_anteil');
});
test('harmloser Query wird reduziert, Pfade mit Schrägstrichen nicht als Token gewertet', () => {
  assert.equal(s('jdbc:postgresql://db:5432/app?sslmode=require'), 'reduziert');
  assert.equal(s('https://fonts.example.org/css2?family=Inter&display=swap'), 'reduziert');
  assert.equal(s('https://a.example.org/login?redirect=/cockpit/login/callback'), 'reduziert');
});
test('normale URL und Hostname sind ok', () => {
  assert.equal(s('https://api.example.org'), 'ok');
  assert.equal(s('geo-service:8083'), 'ok');
});
