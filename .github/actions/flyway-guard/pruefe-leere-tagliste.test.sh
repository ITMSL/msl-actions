#!/usr/bin/env bash
# Tests fuer pruefe-leere-tagliste.sh: eine leere lokale CalVer-Tag-Liste
# darf nur dann als "erster Release" durchgehen, wenn der Remote wirklich
# keine CalVer-Tags hat. Simuliert per lokalem bare-Remote statt echtem
# GitHub-Netzwerkzugriff.
set -uo pipefail
SKRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pruefe-leere-tagliste.sh"
FEHLER=0

# Baut ein Arbeitsverzeichnis mit "origin" auf ein bare Remote -- so wie
# actions/checkout es einrichtet, nur ohne echtes Netzwerk.
neues_arbeitsverzeichnis() {
  local remote work
  remote="$(mktemp -d)"; work="$(mktemp -d)"
  git init --quiet --bare "$remote" >/dev/null
  git -C "$work" init --quiet >/dev/null
  git -C "$work" config user.email t@t.de
  git -C "$work" config user.name t
  git -C "$work" remote add origin "$remote"
  git -C "$work" commit --quiet --allow-empty -m init >/dev/null
  echo "$work"
}

# Pusht einen Tag ueber einen zweiten Klon an den Remote, OHNE ihn im
# uebergebenen Arbeitsverzeichnis lokal sichtbar zu machen -- simuliert
# genau die Luecke, die fehlendes 'fetch-tags: true' hinterlaesst.
tag_am_remote_setzen_ohne_lokal_zu_fetchen() {
  local work="$1" tag="$2"
  local remote klon
  remote="$(git -C "$work" remote get-url origin)"
  klon="$(mktemp -d)"
  git clone --quiet "$remote" "$klon" >/dev/null
  git -C "$klon" config user.email t@t.de
  git -C "$klon" config user.name t
  git -C "$klon" commit --quiet --allow-empty -m weiter >/dev/null
  git -C "$klon" tag "$tag"
  git -C "$klon" push --quiet origin --tags >/dev/null
}

pruefe() { # pruefe <name> <erwarteter exitcode> <arbeitsverzeichnis>
  ( cd "$3" && bash "$SKRIPT" ) >/dev/null 2>&1; local e=$?
  if [ "$e" = "$2" ]; then echo "  ok   $1"
  else echo "  FAIL $1: Exit $e statt $2"; FEHLER=$((FEHLER+1)); fi
}

work="$(neues_arbeitsverzeichnis)"
pruefe "Remote ohne jeden Tag -> echter erster Release" 0 "$work"

work="$(neues_arbeitsverzeichnis)"
tag_am_remote_setzen_ohne_lokal_zu_fetchen "$work" "2026.08.02-1"
pruefe "Remote hat CalVer-Tag, lokal nicht gefetcht -> Checkout-Problem, hart scheitern" 1 "$work"

work="$(neues_arbeitsverzeichnis)"
tag_am_remote_setzen_ohne_lokal_zu_fetchen "$work" "irgendein-alter-tag"
pruefe "Remote hat nur Nicht-CalVer-Tag -> weiterhin echter erster CalVer-Release" 0 "$work"

# Reviewer-Fund C1: git ls-remote kann selbst fehlschlagen (Netz-Haenger,
# abgelaufenes Token, Rate-Limit) -- unter pipefail gewinnt sonst der
# Exitcode von grep (1, kein Treffer) ueber den der Pipe, und das Skript
# faellt lautlos in den "erster Release"-Zweig. Ein nicht erreichbarer
# Remote ist NICHT dasselbe wie ein Remote ohne Tags.
work="$(neues_arbeitsverzeichnis)"
git -C "$work" remote set-url origin "/nichts/da/kein-repo.git"
pruefe "Remote nicht erreichbar -> hart scheitern (kein stilles Durchwinken)" 1 "$work"

echo
if [ "$FEHLER" -eq 0 ]; then echo "Alle Faelle bestanden."; else echo "$FEHLER Fehlschlag/Fehlschlaege."; fi
exit "$FEHLER"
