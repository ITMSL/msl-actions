#!/usr/bin/env bash
# Berechnet die technische Version (CalVer) und die offizielle Version (SemVer)
# aus der Git-Historie. Einzige Stelle im gesamten Fleet mit Versionslogik.
#
# CalVer ist lueckenlos: jeder Lauf bekommt eine. SemVer bewegt sich nur, wenn
# inhaltlich etwas passiert ist -- sonst zeigten zwei verschiedene Images auf
# denselben Tag und die Unveraenderlichkeit waere dahin, auf der der gesamte
# Rollback-Mechanismus ruht.
set -euo pipefail

# Frische Tags von origin, unmittelbar vor der Berechnung -- sonst zaehlt
# dieser Lauf nur die Tags vom Checkout-Zeitpunkt. Zwei Pushes kurz
# hintereinander wuerden dann dieselbe Tagesnummer berechnen: der zweite
# Image-Push ueberschreibt den ersten, waehrend der (bereits vorhandene)
# Tag weiter auf den ERSTEN Commit zeigt -- "ein Tag identifiziert eindeutig
# ein Image" waere durchbrochen. Kein origin (z.B. in diesem Testskript) ist
# kein Fehler, dann zaehlen die lokal gesetzten Tags weiter.
git fetch --tags --force origin >/dev/null 2>&1 || true

# Kalendertag in BERLINER Zeit, nicht UTC. Ein Release um 00:30 Berliner
# Zeit traegt sonst das Datum des Vortags (UTC ist noch 22:30) -- der Tag
# steht dann neben einem Vortags-Release, das inhaltlich ein anderer Tag ist
# (Grenzfall LogistikOptimierer, Nacht auf den 2026-09-11). Die Zone steht
# als POSIX-Regel und nicht als "Europe/Berlin": Namen brauchen tzdata, und
# ohne tzdata (z.B. Git-Bash unter Windows) faellt date STILL auf UTC
# zurueck. Die Regel (UTC+1, Sommerzeit letzter So. Maerz 02:00 bis letzter
# So. Oktober 03:00) gilt ueberall, wo GNU date laeuft.
# CALVER_JETZT_EPOCH (Epoch-Sekunden) friert den Zeitpunkt ein -- nur fuer
# die Tests, im Betrieb ungesetzt.
export TZ="CET-1CEST,M3.5.0,M10.5.0/3"
if [ -n "${CALVER_JETZT_EPOCH:-}" ]; then
  datum="$(date -d "@${CALVER_JETZT_EPOCH}" +%Y.%m.%d)"
else
  datum="$(date +%Y.%m.%d)"
fi

# Hoechste bereits vergebene Tagesnummer plus eins. Bewusst das Maximum statt
# der Anzahl: ein geloeschter Tag wuerde sonst eine Nummer erneut vergeben.
max="$(git tag -l "${datum}-*" \
  | sed "s/^${datum}-//" \
  | grep -E '^[0-9]+$' \
  | sort -n | tail -1 || true)"
calver="${datum}-$(( 10#${max:-0} + 1 ))"

prev="$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' | sort -V | tail -1 || true)"

if [ -z "$prev" ]; then
  # Startwert. Die Dienste laufen produktiv, eine 0.x waere unehrlich.
  semver="1.0.0"; changed="true"
else
  bereich="${prev}..HEAD"
  # git log laeuft standardmaessig ueber ALLE Commits, nicht nur first-parent.
  # Das ist Absicht: Dependabot-Merges tragen den konventionellen Praefix nur
  # in den enthaltenen Commits, der Merge-Betreff lautet "Merge pull request".
  betreffs="$(git log --format='%s' "$bereich" || true)"
  rumpfe="$(git log --format='%B' "$bereich" || true)"

  art="keine"
  if [ "${MAJOR_BUMP:-}" = "true" ] \
     || echo "$betreffs" | grep -qE '^[a-z]+(\([^)]*\))?!:' \
     || echo "$rumpfe"  | grep -qE '^BREAKING[ -]CHANGE'; then
    art="major"
  elif echo "$betreffs" | grep -qE '^feat(\([^)]*\))?:'; then
    art="minor"
  elif echo "$betreffs" | grep -qE '^fix(\([^)]*\))?:'; then
    art="patch"
  fi

  IFS=. read -r ma mi pa <<<"${prev#v}"
  case "$art" in
    major) semver="$(( 10#$ma + 1 )).0.0";        changed="true"  ;;
    minor) semver="${ma}.$(( 10#$mi + 1 )).0";    changed="true"  ;;
    patch) semver="${ma}.${mi}.$(( 10#$pa + 1 ))";changed="true"  ;;
    *)     semver="${prev#v}";            changed="false" ;;
  esac
fi

ausgabe="calver=${calver}
semver=${semver}
semver_changed=${changed}
prev_semver=${prev}"

echo "$ausgabe"
[ -n "${GITHUB_OUTPUT:-}" ] && echo "$ausgabe" >> "$GITHUB_OUTPUT"
exit 0
