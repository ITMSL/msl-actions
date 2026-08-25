#!/usr/bin/env bash
# Tests fuer verifizieren.sh. SSH_CMD und CURL_CMD werden durch Stub-Skripte
# ersetzt; SSH-Stub liefert ueber eine Zaehler-Datei erst "starting", ab dem
# n-ten Aufruf das Erfolgs-JSON. SLEEP_S=0 haelt die Polling-Schleife schnell.
set -uo pipefail
SKRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/verifizieren.sh"
FEHLER=0

pruefe() { # pruefe <name> <erwartet> <ist>
  if [ "$2" = "$3" ]; then
    echo "  ok   $1"
  else
    echo "  FAIL $1: erwartet '$2', war '$3'"; FEHLER=$((FEHLER+1))
  fi
}

# ssh_stub_ab_versuch <erfolg-ab-n> <erfolg-json> <fehl-json>
# Liefert bis (ausschliesslich) Versuch n das fehl-json, ab n das erfolg-json.
ssh_stub_ab_versuch() {
  local ab="$1" erfolg="$2" fehl="$3"
  local s; s="$(mktemp)"
  local zaehler; zaehler="$(mktemp)"
  echo 0 > "$zaehler"
  cat > "$s" <<EOF
#!/usr/bin/env bash
n=\$(cat "$zaehler"); n=\$((n+1)); echo "\$n" > "$zaehler"
if [ "\$n" -ge $ab ]; then
  echo $(printf '%q' "$erfolg")
else
  echo $(printf '%q' "$fehl")
fi
EOF
  chmod +x "$s"
  echo "$s"
}

curl_stub() { # curl_stub <body>
  local s; s="$(mktemp)"
  printf '#!/usr/bin/env bash\necho %q\n' "$1" > "$s"
  chmod +x "$s"
  echo "$s"
}

FEHL_JSON='{"revision":"","health":"starting","app_health":""}'
ERFOLG_JSON='{"revision":"abc123","health":"running","app_health":"up"}'

echo "Fall 1: Erfolg im 2. Versuch -> Exit 0, Summary enthaelt 'Verifiziert live'"
STUB=$(ssh_stub_ab_versuch 2 "$ERFOLG_JSON" "$FEHL_JSON")
SUMMARY=$(mktemp)
ausgabe=$(STACK=demo CALVER=2026.08.25-1 SOLL=abc123 SSH_CMD="bash $STUB" \
  SLEEP_S=0 VERSUCHE=3 GITHUB_STEP_SUMMARY="$SUMMARY" bash "$SKRIPT" 2>&1); exit=$?
pruefe "exit"             "0" "$exit"
pruefe "Verifiziert live" "1" "$(grep -c 'Verifiziert live' "$SUMMARY")"

echo "Fall 2: Timeout -- Exit 1, Rollback-Hinweis mit ALT in der Summary"
STUB=$(ssh_stub_ab_versuch 99 "$ERFOLG_JSON" "$FEHL_JSON")
SUMMARY=$(mktemp)
ausgabe=$(STACK=demo CALVER=2026.08.25-1 SOLL=abc123 ALT=2026.08.20-3 \
  GITHUB_REPOSITORY=ITMSL/demo SSH_CMD="bash $STUB" SLEEP_S=0 VERSUCHE=3 \
  GITHUB_STEP_SUMMARY="$SUMMARY" bash "$SKRIPT" 2>&1); exit=$?
pruefe "exit"                    "1" "$exit"
pruefe "gh workflow run"         "1" "$(grep -c 'gh workflow run deploy.yml' "$SUMMARY")"
pruefe "gate_bestaetigung"       "1" "$(grep -c -- '-f gate_bestaetigung=' "$SUMMARY")"
pruefe "version aus ALT"         "1" "$(grep -c -- '-f version=2026.08.20-3' "$SUMMARY")"

echo "Fall 3: Timeout mit leerem ALT -- Summary nennt 'kein Rollback-Ziel ermittelbar'"
STUB=$(ssh_stub_ab_versuch 99 "$ERFOLG_JSON" "$FEHL_JSON")
SUMMARY=$(mktemp)
ausgabe=$(STACK=demo CALVER=2026.08.25-1 SOLL=abc123 ALT="" \
  GITHUB_REPOSITORY=ITMSL/demo SSH_CMD="bash $STUB" SLEEP_S=0 VERSUCHE=3 \
  GITHUB_STEP_SUMMARY="$SUMMARY" bash "$SKRIPT" 2>&1); exit=$?
pruefe "exit" "1" "$exit"
pruefe "kein Rollback-Ziel ermittelbar" "1" "$(grep -c 'kein Rollback-Ziel ermittelbar' "$SUMMARY")"

echo "Fall 4: Erfolg + PUBLIC_HEALTHZ_URL mit schemaVoraus -> Summary warnt"
STUB=$(ssh_stub_ab_versuch 1 "$ERFOLG_JSON" "$FEHL_JSON")
CURL=$(curl_stub '{"status":"ok","schemaVoraus":true}')
SUMMARY=$(mktemp)
ausgabe=$(STACK=demo CALVER=2026.08.25-1 SOLL=abc123 SSH_CMD="bash $STUB" \
  PUBLIC_HEALTHZ_URL=https://example.invalid/healthz CURL_CMD="bash $CURL" \
  SLEEP_S=0 VERSUCHE=3 GITHUB_STEP_SUMMARY="$SUMMARY" bash "$SKRIPT" 2>&1); exit=$?
pruefe "exit"                   "0" "$exit"
pruefe "Schema liegt vor"       "1" "$(grep -c 'Schema liegt vor der Anwendung' "$SUMMARY")"

echo "Fall 5: Erfolg + CURL liefert kein JSON -> Exit 0 (best-effort), keine Schema-Warnung"
STUB=$(ssh_stub_ab_versuch 1 "$ERFOLG_JSON" "$FEHL_JSON")
CURL=$(curl_stub 'kein json hier')
SUMMARY=$(mktemp)
ausgabe=$(STACK=demo CALVER=2026.08.25-1 SOLL=abc123 SSH_CMD="bash $STUB" \
  PUBLIC_HEALTHZ_URL=https://example.invalid/healthz CURL_CMD="bash $CURL" \
  SLEEP_S=0 VERSUCHE=3 GITHUB_STEP_SUMMARY="$SUMMARY" bash "$SKRIPT" 2>&1); exit=$?
pruefe "exit"             "0" "$exit"
pruefe "keine Schema-Warnung" "0" "$(grep -c 'Schema liegt vor' "$SUMMARY")"

echo
if [ "$FEHLER" -eq 0 ]; then echo "Alle Faelle bestanden."; else echo "$FEHLER Fehlschlag/Fehlschlaege."; fi
exit "$FEHLER"
