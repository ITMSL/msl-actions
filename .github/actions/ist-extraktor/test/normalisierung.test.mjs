import test from 'node:test';
import assert from 'node:assert/strict';
import { hostAusUrl, dbSchluessel, istFqdn, zielknoten, formGuardOeffentlich } from '../lib/normalisierung.mjs';
const jwt = 'ey' + 'JhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc';
test('hostAusUrl braucht Schema oder FQDN/localhost/Port', () => {
  assert.equal(hostAusUrl('http://geo-service:8083/v1'), 'host:geo-service:8083');
  assert.equal(hostAusUrl('https://API.EXAMPLE.ORG/v1'), 'url:api.example.org');
  assert.equal(hostAusUrl('https://u:p@x.example.org/?a=b'), 'url:x.example.org');
  assert.equal(hostAusUrl('localhost:7700'), 'host:localhost:7700');
  assert.equal(hostAusUrl('smtp.example.org'), 'url:smtp.example.org');
  assert.equal(hostAusUrl('true'), null);
  assert.equal(hostAusUrl('v1.2'), null);
  assert.equal(hostAusUrl(jwt), null);
});
test('zielknoten je Kantenart', () => {
  assert.equal(zielknoten('smtp', 'smtp.example.org'), 'smtp:smtp.example.org');
  assert.equal(zielknoten('db', 'jdbc:postgresql://postgres:5432/bridge?sslmode=require'), 'db:postgresql@postgres');
  assert.equal(zielknoten('action', 'actions/checkout'), 'action:actions/checkout');
  assert.equal(zielknoten('action', 'ITMSL/msl-actions/.github/actions/flyway-guard'), 'action:ITMSL/msl-actions');
  assert.equal(zielknoten('http', 'https://code.example.org/repos'), 'url:code.example.org');
  assert.equal(zielknoten('http', 'kein host'), null);
});
test('Form-Guard', () => {
  assert.deepEqual(formGuardOeffentlich(['url:code.example.org', 'host:geo-service', 'db:postgresql@postgres', 'smtp:smtp.example.org']),
    ['host:geo-service', 'db:postgresql@postgres', 'smtp:smtp.example.org']);
  assert.equal(istFqdn('geo-service'), false); assert.equal(istFqdn('code.example.org'), true);
});

import { knotenGueltig } from '../lib/normalisierung.mjs';
test('knotenGueltig: eng je Präfix, Zufallswerte und Zugangsdaten sind ungültig', () => {
  for (const k of ['url:api.example.org', 'url:api.example.org:8443', 'host:geo-service:8083', 'db:postgresql@postgres', 'smtp:smtp.example.org',
    'ssh:ssh.example.org', 'file:/var/data/*', 'action:ITMSL/msl-actions', 'env:A_URL', 'env:db.url', 'var:a.b-c_d', 'var:%prod.bar.url', 'pfad:/orders/v1']) assert.equal(knotenGueltig(k), true, k);
  for (const k of ['url:10.0.0.5', 'url:intern-host', 'url:Api.example.org', 'url:https://u:pw@api.example.org/v1', 'url:api.example.org/pfad',
    'host:A', 'db:postgresql', 'env:a/b', 'env:https://u:pw@h.example.org', 'var:https://u:pw@h.example.org', 'var:a b', 'pfad:x', 'file:', 'action:x', 'xyz:abc', '', 'url:', 'pfad:/hooks/Zq9vL2mN8kP4rT6wY1bC3dF7gH']) assert.equal(knotenGueltig(k), false, k);
});
