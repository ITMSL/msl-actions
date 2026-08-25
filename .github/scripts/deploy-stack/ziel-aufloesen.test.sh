#!/usr/bin/env bash
# Tests fuer ziel-aufloesen.sh. Jeder Fall baut ein eigenes Wegwerf-Repo.
set -uo pipefail
SKRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ziel-aufloesen.sh"
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

echo "Fall 1: CalVer direkt"
R=$(neues_repo)
git -C "$R" tag "2026.08.25-1"
SHA="$(git -C "$R" rev-parse HEAD)"
A=$(cd "$R" && ZIEL="2026.08.25-1" bash "$SKRIPT")
pruefe "calver" "2026.08.25-1" "$(wert "$A" calver)"
pruefe "commit" "$SHA"         "$(wert "$A" commit)"

echo "Fall 2: SemVer -> CalVer ueber denselben Commit"
R=$(neues_repo)
git -C "$R" tag -a v1.2.3 -m v1.2.3
git -C "$R" tag "2026.08.25-1"
SHA="$(git -C "$R" rev-parse HEAD)"
A=$(cd "$R" && ZIEL="1.2.3" bash "$SKRIPT")
pruefe "calver" "2026.08.25-1" "$(wert "$A" calver)"
pruefe "commit" "$SHA"         "$(wert "$A" commit)"

echo "Fall 3a: Unbekannte, nicht-semver-foermige Version -> Exit 1, 'nicht gefunden'"
R=$(neues_repo)
ausgabe=$(cd "$R" && ZIEL="kaputt" bash "$SKRIPT" 2>&1); exit=$?
pruefe "exit"          "1" "$exit"
pruefe "nicht gefunden" "1" "$(echo "$ausgabe" | grep -c 'nicht gefunden')"

# Abweichung vom Brief: "9.9.9" ist semver-foermig und nimmt deshalb den
# if-Zweig -- dort scheitert "git rev-list -n1 v9.9.9" (Tag existiert nicht)
# direkt an git selbst (Exit 128, "fatal: ambiguous argument"), BEVOR die
# Skript-eigene "nicht gefunden"-Meldung ueberhaupt erreicht wird. Die vom
# Brief behauptete Gleichbehandlung mit "kaputt" (Exit 1 + "nicht gefunden")
# gilt nur fuer den else-Zweig -- siehe Report.
echo "Fall 3b: Unbekannte, semver-foermige Version -> scheitert an git selbst (nicht 0)"
R=$(neues_repo)
ausgabe=$(cd "$R" && ZIEL="9.9.9" bash "$SKRIPT" 2>&1); exit=$?
pruefe "exit != 0" "1" "$([ "$exit" -ne 0 ] && echo 1 || echo 0)"

echo "Fall 4: SemVer-Tag ohne CalVer-Tag -> Exit 1, 'Keine CalVer'"
R=$(neues_repo)
git -C "$R" tag -a v1.2.3 -m v1.2.3
ausgabe=$(cd "$R" && ZIEL="1.2.3" bash "$SKRIPT" 2>&1); exit=$?
pruefe "exit"       "1" "$exit"
pruefe "Keine CalVer" "1" "$(echo "$ausgabe" | grep -c 'Keine CalVer')"

echo "Fall 5: Eingebetteter Zeilenumbruch faellt in den else-Zweig -> Exit 1"
R=$(neues_repo)
ausgabe=$(cd "$R" && ZIEL=$'1.2.3\nboese' bash "$SKRIPT" 2>&1); exit=$?
pruefe "exit"          "1" "$exit"
pruefe "nicht gefunden" "1" "$(echo "$ausgabe" | grep -c 'nicht gefunden')"

echo "Fall 6: \$GITHUB_OUTPUT wird mit calver= und commit= befuellt"
R=$(neues_repo)
git -C "$R" tag "2026.08.25-1"
SHA="$(git -C "$R" rev-parse HEAD)"
GHOUT=$(mktemp)
(cd "$R" && ZIEL="2026.08.25-1" GITHUB_OUTPUT="$GHOUT" bash "$SKRIPT" >/dev/null)
pruefe "GITHUB_OUTPUT calver" "1" "$(grep -c "^calver=2026.08.25-1\$" "$GHOUT")"
pruefe "GITHUB_OUTPUT commit" "1" "$(grep -c "^commit=$SHA\$" "$GHOUT")"

echo
if [ "$FEHLER" -eq 0 ]; then echo "Alle Faelle bestanden."; else echo "$FEHLER Fehlschlag/Fehlschlaege."; fi
exit "$FEHLER"
