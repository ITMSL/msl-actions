#!/usr/bin/env bash
# Tests fuer next-version.sh. Jeder Fall baut ein eigenes Wegwerf-Repo.
set -uo pipefail
SKRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/next-version.sh"
HEUTE="$(date -u +%Y.%m.%d)"
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

commit() { git -C "$1" commit -q --allow-empty -m "$2"; }
wert()   { echo "$1" | grep "^$2=" | cut -d= -f2-; }

echo "Fall 1: ohne Tag startet bei 1.0.0"
R=$(neues_repo); A=$(cd "$R" && bash "$SKRIPT")
pruefe "semver"         "1.0.0"        "$(wert "$A" semver)"
pruefe "semver_changed" "true"         "$(wert "$A" semver_changed)"
pruefe "calver"         "$HEUTE-1"     "$(wert "$A" calver)"

echo "Fall 2: nur chore nach v1.0.0 -> kein Bump"
R=$(neues_repo); git -C "$R" tag -a v1.0.0 -m v1.0.0
commit "$R" "chore(deps): bump irgendwas von 1 auf 2"
A=$(cd "$R" && bash "$SKRIPT")
pruefe "semver"         "1.0.0" "$(wert "$A" semver)"
pruefe "semver_changed" "false" "$(wert "$A" semver_changed)"

echo "Fall 3: fix -> Patch"
R=$(neues_repo); git -C "$R" tag -a v1.0.0 -m v1.0.0
commit "$R" "fix(mail): Socket-Timeout setzen"
A=$(cd "$R" && bash "$SKRIPT")
pruefe "semver" "1.0.1" "$(wert "$A" semver)"

echo "Fall 4: feat schlaegt fix"
R=$(neues_repo); git -C "$R" tag -a v1.2.3 -m v1.2.3
commit "$R" "fix(a): kleinigkeit"
commit "$R" "feat(b): neue Faehigkeit"
A=$(cd "$R" && bash "$SKRIPT")
pruefe "semver"      "1.3.0"  "$(wert "$A" semver)"
pruefe "prev_semver" "v1.2.3" "$(wert "$A" prev_semver)"

echo "Fall 5: Ausrufezeichen -> Major"
R=$(neues_repo); git -C "$R" tag -a v1.2.3 -m v1.2.3
commit "$R" "feat(api)!: Vertrag geaendert"
A=$(cd "$R" && bash "$SKRIPT")
pruefe "semver" "2.0.0" "$(wert "$A" semver)"

echo "Fall 6: MAJOR_BUMP erzwingt Major trotz nur chore"
R=$(neues_repo); git -C "$R" tag -a v1.2.3 -m v1.2.3
commit "$R" "chore: nichts inhaltliches"
A=$(cd "$R" && MAJOR_BUMP=true bash "$SKRIPT")
pruefe "semver" "2.0.0" "$(wert "$A" semver)"

echo "Fall 7: zweiter Lauf am selben Tag zaehlt CalVer hoch"
R=$(neues_repo); git -C "$R" tag -a "$HEUTE-1" -m tag1
A=$(cd "$R" && bash "$SKRIPT")
pruefe "calver" "$HEUTE-2" "$(wert "$A" calver)"

echo "Fall 8: Luecke in der Nummerierung -> Maximum plus eins"
R=$(neues_repo); git -C "$R" tag -a "$HEUTE-1" -m t1; git -C "$R" tag -a "$HEUTE-5" -m t5
A=$(cd "$R" && bash "$SKRIPT")
pruefe "calver" "$HEUTE-6" "$(wert "$A" calver)"

echo "Fall 9: fix in einem Merge wird gefunden (nicht nur first-parent)"
R=$(neues_repo); git -C "$R" tag -a v1.0.0 -m v1.0.0
git -C "$R" checkout -q -b zweig
commit "$R" "fix(x): im Seitenzweig behoben"
git -C "$R" checkout -q -
git -C "$R" merge -q --no-ff zweig -m "Merge pull request #38 from ITMSL/zweig"
A=$(cd "$R" && bash "$SKRIPT")
pruefe "semver" "1.0.1" "$(wert "$A" semver)"

echo "Fall 10: BREAKING CHANGE im Rumpf ohne ! und ohne MAJOR_BUMP -> Major"
R=$(neues_repo); git -C "$R" tag -a v1.2.3 -m v1.2.3
git -C "$R" commit -q --allow-empty -m "feat(api): neuer Endpunkt" -m "BREAKING CHANGE: alter Endpunkt entfaellt"
A=$(cd "$R" && bash "$SKRIPT")
pruefe "semver" "2.0.0" "$(wert "$A" semver)"

echo "Fall 11: frischer Tag im Remote wird VOR der Berechnung geholt"
# Simuliert zwei kurz hintereinander laufende Pipelines auf demselben Ref:
# der Checkout dieses Laufs ist aelter als ein Tag, den eine andere,
# parallele Pipeline inzwischen bereits gepusht hat. Ohne "git fetch --tags"
# unmittelbar vor der Berechnung wuerde dieser Lauf denselben Tagesnummer
# nochmal vergeben -- Kollision zwischen Tag und Image.
REM="$(mktemp -d)"; git -C "$REM" init -q --bare
R=$(neues_repo)
git -C "$R" remote add origin "$REM"
git -C "$R" push -q origin HEAD:refs/heads/main
git -C "$R" tag -a "$HEUTE-1" -m "von anderer Pipeline gesetzt"
git -C "$R" push -q origin "$HEUTE-1"
git -C "$R" tag -d "$HEUTE-1" >/dev/null   # lokal wieder unsichtbar machen
A=$(cd "$R" && bash "$SKRIPT")
pruefe "calver" "$HEUTE-2" "$(wert "$A" calver)"

echo "Fall 12: fuehrende Null in CalVer-Tagesnummer crasht nicht"
R=$(neues_repo); git -C "$R" tag "$HEUTE-08"
A=$(cd "$R" && bash "$SKRIPT")
pruefe "calver" "$HEUTE-9" "$(wert "$A" calver)"

echo "Fall 13: fuehrende Null in SemVer-Komponente crasht nicht"
R=$(neues_repo); git -C "$R" tag -a v1.0.08 -m v1.0.08
commit "$R" "fix(x): kleinigkeit"
A=$(cd "$R" && bash "$SKRIPT")
pruefe "semver" "1.0.9" "$(wert "$A" semver)"

echo
if [ "$FEHLER" -eq 0 ]; then echo "Alle Faelle bestanden."; else echo "$FEHLER Fehlschlag/Fehlschlaege."; fi
exit "$FEHLER"
