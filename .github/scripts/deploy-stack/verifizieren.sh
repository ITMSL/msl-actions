#!/usr/bin/env bash
# Pollt den Server bis Revision+Health+App-Health stimmen; schreibt bei
# Erfolg den Beleg, bei Timeout den Rollback-Hinweis in die Summary.
# Env: STACK, CALVER, SOLL, ALT, PUBLIC_HEALTHZ_URL, GITHUB_REPOSITORY,
#      SSH_CMD, CURL_CMD (Default curl), VERSUCHE (Default 18), SLEEP_S (Default 5).
set -euo pipefail
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
CURL_CMD="${CURL_CMD:-curl}"
VERSUCHE="${VERSUCHE:-18}"
SLEEP_S="${SLEEP_S:-5}"

for i in $(seq 1 "$VERSUCHE"); do
  sleep "$SLEEP_S"
  ist="$($SSH_CMD "verify $STACK")"
  rev="$(echo "$ist" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("revision",""))')"
  zst="$(echo "$ist" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("health",""))')"
  app="$(echo "$ist" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("app_health",""))')"
  # Drei Bedingungen: richtiger Commit, Container laeuft, Anwendung antwortet.
  if [ "$rev" = "$SOLL" ] && [ "$zst" = "running" ] && [ "$app" = "up" ]; then
    echo "Verifiziert: revision=$rev health=$zst app=$app"
    echo "**Verifiziert live:** \`$CALVER\` (revision \`$rev\`)" >> "$SUMMARY"
    # Best-effort, nie fatal: nur Dienste mit oeffentlicher /healthz-URL
    # liefern hier einen Koerper. Ein Fehlschlag darf einen erfolgreichen
    # Deploy nicht rot machen.
    if [ -n "${PUBLIC_HEALTHZ_URL:-}" ]; then
      body="$($CURL_CMD -sf "$PUBLIC_HEALTHZ_URL" 2>/dev/null || true)"
      voraus="$(printf '%s' "$body" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("ja" if d.get("schemaVoraus") else "nein")' 2>/dev/null || echo unbekannt)"
      if [ "$voraus" = "ja" ]; then
        {
          echo ""
          echo "**Achtung: Datenbank-Schema liegt vor der Anwendung** (\`schemaVoraus\`) — \`$body\`"
        } >> "$SUMMARY"
      fi
    fi
    exit 0
  fi
  echo "Versuch $i: revision=$rev (soll $SOLL) health=$zst"
done
{
  echo ""
  echo "**Verifikation fehlgeschlagen.** Rollback:"
  echo '```'
  if [ -n "${ALT:-}" ]; then
    echo "gh workflow run deploy.yml --repo ${GITHUB_REPOSITORY} -f version=${ALT} -f gate_bestaetigung=\"Rollback von ${CALVER} — Gate-Beleg des letzten Laufs nachtragen\""
  else
    echo "(kein Rollback-Ziel ermittelbar -- 'alt' war leer, siehe Vorschau-Schritt oben)"
  fi
  echo '```'
} >> "$SUMMARY"
exit 1
