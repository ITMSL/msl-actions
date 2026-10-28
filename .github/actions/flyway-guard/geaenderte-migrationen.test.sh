#!/usr/bin/env bash
# Tests fuer geaenderte-migrationen.sh: ein fehlgeschlagener git diff darf NIE als
# "keine Migrationen" durchgehen (fail-open, Audit 2026-10-25 msl-actions #2) --
# nur eine wirklich leere Aenderungsmenge liefert eine leere Liste mit Exit 0.
set -uo pipefail
HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKRIPT="$HIER/geaenderte-migrationen.sh"
FEHLER=0

# Alle Wegwerf-Repos und Hilfsdateien liegen unter einem Wurzelverzeichnis, das beim
# Beenden geloescht wird (der CI-Runner ist persistent).
WURZEL="$(mktemp -d)"
trap 'rm -rf -- "${WURZEL:?}"' EXIT

pruefe() { # pruefe <name> <erwartet> <ist>
  if [ "$2" = "$3" ]; then
    echo "  ok   $1"
  else
    echo "  FAIL $1: erwartet '$2', war '$3'"; FEHLER=$((FEHLER+1))
  fi
}

# Wegwerf-Repo mit einem Commit und dem CalVer-Tag 2026.01.01-1 darauf.
neues_repo() {
  local work; work="$(mktemp -d "$WURZEL/repo.XXXXXX")"
  git -C "$work" init --quiet >/dev/null
  git -C "$work" config user.email t@t.de
  git -C "$work" config user.name t
  git -C "$work" commit --quiet --allow-empty -m init >/dev/null
  git -C "$work" tag 2026.01.01-1
  echo "$work"
}

echo "Fall 1: Migration nach dem Tag hinzugefuegt -> wird gelistet, Exit 0"
W=$(neues_repo)
mkdir -p "$W/src/main/resources/db/migration"
echo 'create table t(id int);' > "$W/src/main/resources/db/migration/V1__t.sql"
git -C "$W" add -A; git -C "$W" commit --quiet -m mig >/dev/null
out=$(cd "$W" && bash "$SKRIPT" 2026.01.01-1 2>/dev/null); rc=$?
pruefe "exit"  "0" "$rc"
pruefe "liste" "src/main/resources/db/migration/V1__t.sql" "$out"

echo "Fall 2: nur Nicht-Migrationsdatei geaendert -> leere Liste, Exit 0"
W=$(neues_repo)
echo x > "$W/README.md"
git -C "$W" add -A; git -C "$W" commit --quiet -m doc >/dev/null
out=$(cd "$W" && bash "$SKRIPT" 2026.01.01-1 2>/dev/null); rc=$?
pruefe "exit" "0" "$rc"
pruefe "leer" ""  "$out"

echo "Fall 3: Basis existiert nicht -> Exit 1 mit ::error, KEINE leere Liste"
W=$(neues_repo)
err="$(mktemp "$WURZEL/err.XXXXXX")"
out=$(cd "$W" && bash "$SKRIPT" 2099.01.01-1 2>"$err"); rc=$?
pruefe "exit"         "1" "$rc"
pruefe "error-marker" "1" "$(grep -c '::error::' "$err")"
rm -f "$err"

echo "Fall 4: Liquibase-Changelog und migrations/*.sql werden ebenfalls erkannt"
W=$(neues_repo)
mkdir -p "$W/src/main/resources/db/changelog" "$W/migrations"
echo '<databaseChangeLog/>' > "$W/src/main/resources/db/changelog/v1.xml"
echo 'select 1;' > "$W/migrations/001.sql"
git -C "$W" add -A; git -C "$W" commit --quiet -m mig >/dev/null
out=$(cd "$W" && bash "$SKRIPT" 2026.01.01-1 2>/dev/null | sort | tr '\n' ' '); rc=$?
pruefe "exit"  "0" "$rc"
pruefe "liste" "migrations/001.sql src/main/resources/db/changelog/v1.xml " "$out"

echo "Fall 3b: Basis aufloesbar, aber git diff scheitert (keine gemeinsame Historie) -> Exit 1"
W=$(neues_repo)
git -C "$W" checkout --quiet --orphan fremd
git -C "$W" commit --quiet --allow-empty -m fremd >/dev/null
err="$(mktemp "$WURZEL/err.XXXXXX")"
out=$(cd "$W" && bash "$SKRIPT" 2026.01.01-1 2>"$err"); rc=$?
pruefe "exit"         "1" "$rc"
pruefe "error-marker" "1" "$(grep -c '::error::git diff' "$err")"
pruefe "keine liste"  ""  "$out"
rm -f "$err"

echo "Fall 6: Tag und gleichnamiger Branch (mehrdeutiger Ref) -> Warnung geht nach stderr, Liste enthaelt nur die Migration, Exit 0"
W=$(neues_repo)
git -C "$W" branch 2026.01.01-1
mkdir -p "$W/src/main/resources/db/migration"
echo 'create table t(id int);' > "$W/src/main/resources/db/migration/V1__t.sql"
git -C "$W" add -A; git -C "$W" commit --quiet -m mig >/dev/null
out=$(cd "$W" && bash "$SKRIPT" 2026.01.01-1 2>/dev/null); rc=$?
pruefe "exit"  "0" "$rc"
pruefe "liste" "src/main/resources/db/migration/V1__t.sql" "$out"

echo "Fall 5: action.yml ruft das Skript und enthaelt keinen eigenen git-diff-Aufruf mehr"
# Bewusst auf den AUFRUF ('git diff --name-only') pruefen, nicht auf das Wort 'git diff':
# Kommentare duerfen es nennen (Kimi-Review 2026-10-26, Befund 1).
pruefe "skript-aufruf"       "1" "$(grep -c 'geaenderte-migrationen.sh' "$HIER/action.yml")"
pruefe "kein git-diff-Aufruf" "0" "$(grep -c 'git diff --name-only' "$HIER/action.yml")"
pruefe "kein || true"        "0" "$(grep -c '|| true' "$HIER/action.yml")"
# Die Aufrufzeile exakt: jede angehaengte Rueckfallebene (z. B. '|| dateien=""') wuerde den
# Fehler des Skripts wieder schlucken (WBR Audit-Topf 1, 2026-10-28, geparkter Gate-Minor).
pruefe "aufrufzeile exakt"   "1" "$(grep -cxF '        dateien="$(bash "${{ github.action_path }}/geaenderte-migrationen.sh" "$basis")"' "$HIER/action.yml")"

echo
if [ "$FEHLER" -eq 0 ]; then echo "Alle Faelle bestanden."; else echo "$FEHLER Fehlschlag/Fehlschlaege."; fi
exit "$FEHLER"
