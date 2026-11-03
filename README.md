# msl-actions

Geteilte GitHub-Actions-Mechanik (Composite Actions + ein wiederverwendbarer
Workflow) für die CI/CD-Pipelines mehrerer MSL-interner Repositories.

Dieses Repo enthält keine eigenständige Anwendung — nur Automatisierung, die
von den Workflows anderer Repos per `uses: ITMSL/msl-actions/...@main`
eingebunden wird:

- **`.github/actions/next-version`** — berechnet CalVer und SemVer aus der
  Git-Historie des aufrufenden Repos (Conventional-Commits-Auswertung).
  Der CalVer-Kalendertag zählt in Berliner Zeit (CET/CEST), nicht UTC.
- **`.github/actions/release-tags`** — setzt Git-Tags und legt das
  GitHub-Release für die berechnete Version an.
- **`.github/actions/flyway-guard`** — prüft geänderte Datenbank-Migrationen
  (Flyway-SQL, Liquibase-XML, eigene Migrationsläufer) auf Statements, die
  einen Image-Rollback unmöglich machen würden.
- **`.github/actions/ist-extraktor`** — prüft die eingecheckte
  `docs/architektur/ist.json` gegen den Code des aufrufenden Repos (ausgehende
  Verbindungen, Secret-Guard, Form-Guard für öffentliche Repos). Node 24, keine
  Abhängigkeiten. Siehe dessen README.
- **`.github/workflows/deploy-stack.yml`** — wiederverwendbarer
  Deploy-Workflow: löst die Zielversion auf, baut eine Vorschau, ruft per SSH
  ein serverseitig fest gebundenes Deploy-Kommando auf und verifiziert das
  Ergebnis. Zielserver, Port und User sind Eingaben des Aufrufers — dieses
  Repo kennt keine konkrete Infrastruktur.

Jede Komponente hat eigene Tests (`*.test.sh`), die in der CI dieses Repos
laufen und die Vertrauensgrundlage für den Einsatz in den abhängigen
Pipelines sind.

## Warum ein eigenes, öffentliches Repo

Die eigentliche MSL-Infrastruktur (Server, Betriebsdaten, Service-Verträge)
lebt in einem privaten Repo. Composite Actions und wiederverwendbare
Workflows zählen für Dependabot aber als Abhängigkeiten — ein privates
Ziel-Repo macht den `github-actions`-Dependabot-Updater in allen
referenzierenden Repos komplett funktionsunfähig, nicht nur für die
betroffenen Referenzen selbst. Dieses Repo enthält deshalb ausschließlich die
generische Automatisierungsmechanik, ohne jede Angabe zur MSL-Infrastruktur.

## Nutzung

Dieses Repo ist auf den internen Gebrauch durch MSL-Repositories
zugeschnitten (Namenskonventionen, Version-/Release-Schema, unterstützte
Migrationswerkzeuge). Es steht öffentlich, damit Dependabot es erreichen
kann — nicht als allgemein wiederverwendbares Actions-Paket für Dritte.

### Ist-Extraktor

Ein Aufruf je Repo in einem Prüf-Job, auf einen Commit-SHA gepinnt:

```yaml
- uses: actions/checkout@v7
- uses: ITMSL/msl-actions/.github/actions/ist-extraktor@<sha>
```

Das Repo braucht `docs/architektur/ist.json` und `docs/architektur/ist-regeln.md`.
Beides legt `archify-ist update` an; Regelsyntax, Exit-Codes und die lokale
Reparatur stehen in `.github/actions/ist-extraktor/README.md`.
