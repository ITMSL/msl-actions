# ist-extraktor

Liest aus dem Code eines Repos die ausgehenden Verbindungen (Dienstaufrufe,
Datenbank, Mail, SSH, Dateien, Actions) und prüft, ob die eingecheckte
`docs/architektur/ist.json` noch dazu passt. Node 24, keine Abhängigkeiten.

`ist.json` enthält nur kanonischen Inhalt: Kantenart, Zielknoten, Quelle und je
Kante die Belegdateien mit Schlüsselname. Keine Zeilennummern, keine
Zeitstempel, keinen Commit, keine Rohwerte.

## Nutzung

```yaml
- uses: actions/checkout@v7
- uses: ITMSL/msl-actions/.github/actions/ist-extraktor@<sha>
```

Immer auf einen Commit-SHA pinnen, nie auf `@main`. Eingabe `pfad` (Standard
`.`) ist die Repo-Wurzel. Die Action ruft `check` auf. Ist
`github.event.repository.private` nicht ausdrücklich `true`, gilt das Repo als
öffentlich und der Form-Guard ist aktiv.

## Kommandos

```
archify-ist extract <root> [--repo org/name] [--oeffentlich] [--diagnose]
archify-ist update  <root> [--repo org/name] [--oeffentlich]
archify-ist check   <root> [--repo org/name] [--oeffentlich]
archify-ist --version
```

- `extract`: schreibt die `ist.json` nach stdout. Mit `--diagnose` kommt
  `{ist, diagnose, laufausgabe, fehler}`; die Laufausgabe nennt je Treffer
  Datei, Zeile und Zielknoten (nie den Rohwert) und ist die Grundlage für
  `ignorieren:`-Zeilen.
- `update`: schreibt `docs/architektur/ist.json`. Fehlt die Regeldatei, legt es
  eine Vorlage an, in der alle gefundenen Kanten als `erwartet:` stehen. Bei
  jedem Fehler schreibt es nichts.
- `check`: vergleicht den Code mit der eingecheckten Datei und verlangt die
  Regeldatei. Abweichungen erscheinen als `+ <Zeile>` (im Code, nicht in der
  Datei) und `- <Zeile>` (in der Datei, nicht mehr im Code).
- `--repo` fehlt: erst `GITHUB_REPOSITORY`, dann der `origin`-Remote des Repos
  (ohne Zugangsdaten), sonst Exit 3.

## Regeldatei `docs/architektur/ist-regeln.md`

Eine Regel je Zeile, alles andere (Überschriften, `#`-Zeilen) wird übersprungen.
Der Grund steht nach ` — ` (Gedankenstrich mit Leerzeichen).

```
ignorieren: src/main/java/App.java url:beispiel.example.org — Kommentar, kein Aufruf
deklariert: http url:api.example.org src/main/java/Client.java — URL wird zur Laufzeit gebaut
erwartet: http env:GEO_SERVICE_URL
erwartet: db env:DB_URL — Datenbank
```

- `ignorieren: <Datei> <Zielknoten> — <Grund>` entfernt den Beleg dieser Datei
  von der Kante mit diesem Zielknoten; eine Kante ohne Belege fällt weg. Genau
  eine Datei, keine Muster. Der Secret-Guard ist damit nicht abschaltbar.
- `deklariert: <art> <Zielknoten> <Datei> — <Grund>` fügt eine Kante hinzu, die
  der Extraktor nicht sehen kann (Quelle `deklariert`).
- `erwartet: <art> <Zielknoten>` ist die Positivkontrolle: Fehlt die Kante,
  ist das ein Fehler. Weitere, nicht aufgeführte Kanten sind erlaubt.
- `erwartet: keine — <Grund>` sagt, dass das Repo keine Kante haben darf. Es
  darf nicht zusammen mit anderen `erwartet:`-Zeilen stehen.

Kantenarten: `http`, `db`, `smtp`, `ssh`, `file`, `action`, `script`. Zielknoten:
`host:`, `url:`, `db:<engine>@<host>`, `smtp:`, `ssh:`, `file:`, `action:`,
`env:`, `var:`, `pfad:`.

## Ablauf und Guards

1. Secret-Guard auf den Rohwerten: Zugangsdaten, Tokens, lange Zufallswerte in
   URL-Query oder -Pfad machen den Lauf rot. Nicht ignorierbar.
2. `ignorieren`, `deklariert`, `erwartet`.
3. Form-Guard nur für öffentliche Repos: Jeder Host ohne vollständigen
   Domainnamen und jeder `db:`-, `ssh:`-, `smtp:`- oder `file:`-Knoten ist rot.
4. Kanonische Ausgabe.

Der Extraktor liest nur git-getrackte Dateien (ohne `.git` den Dateibaum).
Ausgenommen sind Dokumentation (`docs`, `doc`, `*.md`), `*.xml`, Lockfiles,
`node_modules`, `target`, `dist`, `build`, `coverage`, Verzeichnisse mit
führendem Punkt außer `.github`, sowie `test`, `tests`, `__tests__`,
`fixtures` und `src/test`. Die Liste ist fest und nicht konfigurierbar.

## Exit-Codes

| Code | Bedeutung |
|---|---|
| 0 | Alles gleich |
| 1 | Abweichung, Regelfehler, `ist.json` oder Regeldatei fehlt, erwartete Kante fehlt |
| 2 | Secret-Guard oder Form-Guard |
| 3 | Aufruf- oder Extraktorfehler (`--repo` fehlt, Konflikt zweier Erkenner) |

## Lokale Reparatur

`check` rot, weil sich der Code geändert hat: `ist.json` mit demselben Stand der
Action neu erzeugen und mitcommitten.

```
git clone --depth 1 https://github.com/ITMSL/msl-actions /tmp/msl-actions
git -C /tmp/msl-actions fetch --depth 1 origin <sha> && git -C /tmp/msl-actions checkout <sha>
node /tmp/msl-actions/.github/actions/ist-extraktor/bin/archify-ist.mjs update . --repo <org/name>
```

## Tests

```
node --test '.github/actions/ist-extraktor/test/*.test.mjs'
```

Immer mit Datei-Glob, nie mit Verzeichnis. In der CI hat jede Testdatei einen
eigenen Schritt.
