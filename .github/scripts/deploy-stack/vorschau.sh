#!/usr/bin/env bash
# Holt den Ist-Stand vom Server und schreibt die Deploy-Vorschau (inkl.
# Rollback-Erkennung) in die Job-Summary.
# Env: STACK, ZIEL, CALVER, SSH_CMD. Output: alt= (stdout + $GITHUB_OUTPUT).
set -euo pipefail
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

ist="$($SSH_CMD "get $STACK")"
echo "$ist"
alt="$(echo "$ist" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version",""))')"
echo "alt=$alt"
[ -n "${GITHUB_OUTPUT:-}" ] && echo "alt=$alt" >> "$GITHUB_OUTPUT"
{
  echo "## Deploy $STACK"
  echo ""
  echo "| | Version |"
  echo "|---|---|"
  echo "| aktuell | \`$alt\` |"
  echo "| Ziel | \`$CALVER\` (Eingabe: \`$ZIEL\`) |"
  echo ""
  if [ -n "$alt" ] && [ "$alt" != "$CALVER" ] && [ "$(printf '%s\n%s\n' "$alt" "$CALVER" | sort -V | head -1)" = "$CALVER" ]; then
    echo "**Rueckwaertsschritt — das ist ein Rollback.**"
    echo ""
    # "$alt..$CALVER" ist bei einem Rueckwaertsschritt per Definition leer --
    # Richtung umdrehen: das sind die Commits, die dieser Rollback zuruecknimmt.
    echo "### Zurueckgenommene Aenderungen"
    git log --oneline "$CALVER..$alt" 2>/dev/null || echo "(Bereich nicht ermittelbar)"
  else
    echo "### Aenderungen"
    git log --oneline "$alt..$CALVER" 2>/dev/null || echo "(Bereich nicht ermittelbar)"
  fi
} >> "$SUMMARY"
exit 0
