import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { leseRegeln } from '../lib/regeln.mjs';

function mitRegeln(text, fn, opt = { pflicht: false }) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ist-regeln-'));
  try {
    if (text != null) {
      mkdirSync(path.join(dir, 'docs', 'architektur'), { recursive: true });
      writeFileSync(path.join(dir, 'docs', 'architektur', 'ist-regeln.md'), text);
    }
    return fn(leseRegeln(dir, opt));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('ignorieren mit Datei, Zielknoten und Grund wird geparst', () => {
  mitRegeln('ignorieren: docs/README.md url:beispiel.example.org — Doku-Beispiel\n', r => {
    assert.deepEqual(r.fehler, []);
    assert.deepEqual(r.ignorieren, [{ datei: 'docs/README.md', ziel: 'url:beispiel.example.org', grund: 'Doku-Beispiel' }]);
  });
});

test('ignorieren ohne Begründung, mit fehlendem Ziel oder falschem Zielknoten landet in fehler', () => {
  mitRegeln('ignorieren: docs/README.md url:beispiel.example.org\nignorieren: a.md — Grund\nignorieren: a.md beispiel.example.org — Grund\n', r => {
    assert.equal(r.fehler.length, 3);
    assert.deepEqual(r.ignorieren, []);
    assert.ok(r.fehler[0].startsWith('Z.1:'));
  });
});

test('erwartet ohne Grund ist gültig, mit Grund auch', () => {
  mitRegeln('erwartet: http env:GEO_SERVICE_URL\nerwartet: db env:DB_URL — Datenbank\n', r => {
    assert.deepEqual(r.fehler, []);
    assert.deepEqual(r.erwartet, ['http env:GEO_SERVICE_URL', 'db env:DB_URL']);
  });
});

test('erwartet: keine setzt den Marker samt Grund', () => {
  mitRegeln('erwartet: keine — kein Netz\n', r => {
    assert.deepEqual(r.fehler, []);
    assert.equal(r.erwartet, 'keine');
    assert.equal(r.erwartetGrund, 'kein Netz');
  });
  mitRegeln('erwartet: keine\n', r => assert.equal(r.fehler.length, 1));
});

test('erwartet: keine zusammen mit einer Einzelzeile ist ein Fehler, in beiden Reihenfolgen, ohne Ausnahme', () => {
  for (const text of ['erwartet: keine — kein Netz\nerwartet: http env:A_URL\n', 'erwartet: http env:A_URL\nerwartet: keine — kein Netz\n']) {
    mitRegeln(text, r => {
      assert.equal(r.fehler.length, 1, text);
      assert.match(r.fehler[0], /keine/);
    });
  }
});

test('erwartet mit ungültigem Kantenschlüssel ist ein Fehler', () => {
  mitRegeln('erwartet: telnet env:A\nerwartet: http\n', r => assert.equal(r.fehler.length, 2));
});

test('deklariert mit Art, Ziel, Datei und Grund erzeugt einen Eintrag', () => {
  mitRegeln('deklariert: http url:api.partner-d.example.org src/main/java/PartnerDClient.java — URL wird gebaut\n', r => {
    assert.deepEqual(r.fehler, []);
    assert.deepEqual(r.deklariert, [{ art: 'http', ziel: 'url:api.partner-d.example.org', datei: 'src/main/java/PartnerDClient.java', grund: 'URL wird gebaut' }]);
  });
});

test('deklariert ohne Datei oder Grund ist ein Fehler', () => {
  mitRegeln('deklariert: http url:api.example.org — Grund\ndeklariert: http url:api.example.org a.java\n', r => {
    assert.equal(r.fehler.length, 2);
    assert.deepEqual(r.deklariert, []);
  });
});

test('Kommentarzeilen und fremde Zeilen werden übersprungen', () => {
  mitRegeln('# ignorieren: kaputt\nÜberschrift\nerwartet: http env:A_URL\n', r => {
    assert.deepEqual(r.fehler, []);
    assert.deepEqual(r.erwartet, ['http env:A_URL']);
  });
});

test('fehlende Datei: pflicht false liefert leere Regeln, pflicht true einen Fehler', () => {
  mitRegeln(null, r => {
    assert.deepEqual(r, { ignorieren: [], erwartet: [], erwartetGrund: null, deklariert: [], fehler: [] });
  }, { pflicht: false });
  mitRegeln(null, r => {
    assert.equal(r.fehler.length, 1);
    assert.match(r.fehler[0], /ist-regeln\.md fehlt/);
  }, { pflicht: true });
});

const ZUGANG = 'geheimwort';
const UNGUELTIG = [
  `url:https://nutzer:${ZUGANG}@api.example.org/v1?token=abcdefabcdefabcdefab`,
  'url:10.0.0.5',
  'url:intern-host',
  `url:API.EXAMPLE.ORG`,
  'host:Gross',
  'env:a/b', 'env:https://nutzer:geheimwort@h.example.org', 'var:%prod.a b',
  'pfad:ohne-schraegstrich',
  'file:',
  'action:nur-owner',
  'db:postgresql',
  'http:api.example.org',
  'url:' + 'gh' + 'p_' + 'abcdefghijklmnopqrstuvwxyz0123',
];

test('Regelknoten: ungültige Zielknoten sind in deklariert, ignorieren und erwartet ein Fehler ohne den Wert', () => {
  for (const ziel of UNGUELTIG) {
    mitRegeln(`deklariert: http ${ziel} src/a.java — Grund\nignorieren: src/a.java ${ziel} — Grund\nerwartet: http ${ziel}\n`, r => {
      assert.equal(r.fehler.length, 3, ziel);
      assert.deepEqual([r.deklariert, r.ignorieren, r.erwartet], [[], [], []], ziel);
      for (const f of r.fehler) {
        assert.ok(!f.includes(ZUGANG) && !f.includes(ziel), `${ziel}: ${f}`);
      }
    });
  }
});

test('Regelknoten: je Präfix ein gültiger Knoten wird angenommen', () => {
  const gueltig = ['url:api.example.org', 'url:api.example.org:8443', 'host:geo-service', 'host:geo-service:8083', 'db:postgresql@postgres',
    'db:unbekannt@db.example.org:5432', 'smtp:smtp.example.org', 'ssh:ssh.example.org:22', 'file:/var/data/export', 'file:/var/data/*',
    'action:ITMSL/msl-actions', 'env:GEO_SERVICE_URL', 'env:db.url', 'var:partner-d.base-url', 'var:%prod.bar.url', 'pfad:/orders/v1'];
  for (const ziel of gueltig) {
    mitRegeln(`deklariert: http ${ziel} src/a.java — Grund\nignorieren: src/a.java ${ziel} — Grund\nerwartet: http ${ziel}\n`, r => {
      assert.deepEqual(r.fehler, [], ziel);
      assert.equal(r.deklariert.length + r.ignorieren.length + r.erwartet.length, 3, ziel);
    });
  }
});

test('pflicht: eine Regeldatei ohne erwartet-Zeile ist ein Fehler, mit erwartet oder keine nicht', () => {
  const opt = { pflicht: true };
  mitRegeln('# nur Kommentar\nignorieren: a.java url:x.example.org — Grund\n', r => {
    assert.equal(r.fehler.length, 1);
    assert.match(r.fehler[0], /erwartet/);
  }, opt);
  mitRegeln('erwartet: http env:A_URL\n', r => assert.deepEqual(r.fehler, []), opt);
  mitRegeln('erwartet: keine — kein Netz\n', r => assert.deepEqual(r.fehler, []), opt);
  mitRegeln('# nur Kommentar\n', r => assert.deepEqual(r.fehler, []), { pflicht: false });
});

test('pflicht: eine kaputte erwartet-Zeile erzeugt nur ihren eigenen Fehler', () => {
  mitRegeln('erwartet: telnet env:A\n', r => assert.equal(r.fehler.length, 1), { pflicht: true });
});
