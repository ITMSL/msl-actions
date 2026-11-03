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
