#!/usr/bin/env bash
# Loest die Eingabe-Version (SemVer oder CalVer) auf CalVer + Commit auf.
# Env: ZIEL. Output: calver=/commit= (stdout + $GITHUB_OUTPUT falls gesetzt).
# Laeuft im Checkout des Dienst-Repos (Tags muessen gefetcht sein).
set -euo pipefail

# Bewusst bash-natives Matching statt `echo | grep -qE`: dort verankern ^ und $
# nur zeilenweise, ein eingebetteter Zeilenumbruch in der Eingabe wuerde die
# Pruefung umgehen.
if [[ "$ZIEL" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  # Existenz VOR rev-list pruefen (M4/Audit-Nachtrag 2026-08-26): ohne den
  # Guard stirbt eine semver-foermige Nicht-Version an gits eigenem
  # "fatal: ambiguous argument" (Exit 128) statt an der Klartext-Meldung --
  # fail-closed war es schon, aber der Bediener sah nur einen git-Fatal.
  git rev-parse --verify --quiet "refs/tags/v$ZIEL" > /dev/null \
    || { echo "Zielversion '$ZIEL' nicht gefunden -- Tippfehler?"; exit 1; }
  commit="$(git rev-list -n1 "v$ZIEL")"
  # "|| true" ist Pflicht: unter pipefail reisst ein leerer grep-Treffer
  # (kein CalVer-Tag auf diesem Commit) die Zuweisung sofort mit.
  calver="$(git tag --points-at "$commit" \
            | grep -E '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[0-9]+$' | head -1 || true)"
else
  git rev-parse --verify --quiet "$ZIEL^{commit}" > /dev/null \
    || { echo "Zielversion '$ZIEL' nicht gefunden -- Tippfehler?"; exit 1; }
  commit="$(git rev-list -n1 "$ZIEL")"
  calver="$ZIEL"
fi
[ -n "$calver" ] || { echo "Keine CalVer zu '$ZIEL' gefunden"; exit 1; }
ausgabe="calver=${calver}
commit=${commit}"
echo "$ausgabe"
[ -n "${GITHUB_OUTPUT:-}" ] && echo "$ausgabe" >> "$GITHUB_OUTPUT"
exit 0
