#!/usr/bin/env bash
# Tests fuer vorschau.sh. SSH_CMD wird durch ein Stub-Skript ersetzt, das
# den Ist-Stand als JSON liefert; GITHUB_STEP_SUMMARY zeigt auf eine
# Wegwerf-Datei, deren Inhalt geprueft wird.
set -uo pipefail
SKRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/vorschau.sh"
FEHLER=0

pruefe() { # pruefe <name> <erwartet> <ist>
  if [ "$2" = "$3" ]; then
    echo "  ok   $1"
  else
    echo "  FAIL $1: erwartet '$2', war '$3'"; FEHLER=$((FEHLER+1))
  fi
}

neues_repo() {
  local d; d="$(mktemp -d)"
  git -C "$d" init -q
  git -C "$d" config user.email t@example.invalid
  git -C "$d" config user.name Test
  git -C "$d" commit -q --allow-empty -m "chore: init"
  echo "$d"
}

wert() { echo "$1" | grep "^$2=" | cut -d= -f2-; }

ssh_stub() { # ssh_stub <json> -> Pfad zum Stub-Skript
  local s; s="$(mktemp)"
  printf '#!/usr/bin/env bash\necho %q\n' "$1" > "$s"
  chmod +x "$s"
  echo "$s"
}

echo "Fall 1: Upgrade -- alt korrekt, Summary zeigt Aenderungen ohne Rollback"
R=$(neues_repo)
git -C "$R" tag "2026.08.20-3"
git -C "$R" commit -q --allow-empty -m "feat: neue Funktion"
git -C "$R" tag "2026.08.25-1"
STUB=$(ssh_stub '{"version":"2026.08.20-3"}')
SUMMARY=$(mktemp)
A=$(cd "$R" && STACK=demo ZIEL=2026.08.25-1 CALVER=2026.08.25-1 SSH_CMD="bash $STUB" \
    GITHUB_STEP_SUMMARY="$SUMMARY" bash "$SKRIPT"); exit=$?
pruefe "exit"        "0"            "$exit"
pruefe "alt"         "2026.08.20-3" "$(wert "$A" alt)"
pruefe "Aenderungen" "1" "$(grep -c '### Aenderungen' "$SUMMARY")"
pruefe "kein Rollback" "0" "$(grep -c 'Rollback' "$SUMMARY")"

echo "Fall 2: Rollback -- Summary zeigt zurueckgenommene Aenderungen"
R=$(neues_repo)
git -C "$R" tag "2026.08.20-3"
git -C "$R" commit -q --allow-empty -m "feat: wird zurueckgenommen"
git -C "$R" tag "2026.08.25-1"
STUB=$(ssh_stub '{"version":"2026.08.25-1"}')
SUMMARY=$(mktemp)
A=$(cd "$R" && STACK=demo ZIEL=2026.08.20-3 CALVER=2026.08.20-3 SSH_CMD="bash $STUB" \
    GITHUB_STEP_SUMMARY="$SUMMARY" bash "$SKRIPT"); exit=$?
pruefe "exit" "0" "$exit"
pruefe "alt"  "2026.08.25-1" "$(wert "$A" alt)"
pruefe "Rueckwaertsschritt" "1" "$(grep -c 'Rueckwaertsschritt' "$SUMMARY")"
pruefe "Zurueckgenommene Aenderungen" "1" "$(grep -c 'Zurueckgenommene Aenderungen' "$SUMMARY")"
pruefe "Commit-Betreff" "1" "$(grep -c 'wird zurueckgenommen' "$SUMMARY")"

echo "Fall 3: Leeres alt -- kein Rollback-Zweig, Exit 0"
R=$(neues_repo)
git -C "$R" tag "2026.08.25-1"
STUB=$(ssh_stub '{}')
SUMMARY=$(mktemp)
A=$(cd "$R" && STACK=demo ZIEL=2026.08.25-1 CALVER=2026.08.25-1 SSH_CMD="bash $STUB" \
    GITHUB_STEP_SUMMARY="$SUMMARY" bash "$SKRIPT"); exit=$?
pruefe "exit" "0" "$exit"
pruefe "alt leer" "" "$(wert "$A" alt)"
pruefe "kein Rollback" "0" "$(grep -c 'Rollback' "$SUMMARY")"

echo "Fall 4: \$GITHUB_OUTPUT wird mit alt= befuellt"
R=$(neues_repo)
git -C "$R" tag "2026.08.25-1"
STUB=$(ssh_stub '{"version":"2026.08.20-3"}')
SUMMARY=$(mktemp)
GHOUT=$(mktemp)
(cd "$R" && STACK=demo ZIEL=2026.08.25-1 CALVER=2026.08.25-1 SSH_CMD="bash $STUB" \
    GITHUB_STEP_SUMMARY="$SUMMARY" GITHUB_OUTPUT="$GHOUT" bash "$SKRIPT" >/dev/null)
pruefe "GITHUB_OUTPUT alt" "1" "$(grep -c '^alt=2026.08.20-3$' "$GHOUT")"

echo
if [ "$FEHLER" -eq 0 ]; then echo "Alle Faelle bestanden."; else echo "$FEHLER Fehlschlag/Fehlschlaege."; fi
exit "$FEHLER"
