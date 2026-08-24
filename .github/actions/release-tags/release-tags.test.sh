#!/usr/bin/env bash
# Tests fuer release-tags.sh. Kein echtes Netz, keine echten Tags/Releases:
# release-tags.sh wird gesourct (der BASH_SOURCE/$0-Guard verhindert dabei
# den Hauptablauf), gh wird durch eine Stub-Funktion ersetzt, die ueber
# GH_STUB_*-Variablen gesteuert wird und jeden Aufruf in eine Logdatei
# schreibt (KEINE Shell-Variable -- tag_anlegen()/release_sicherstellen()
# werden teils per Command-Substitution `$(...)` aufgerufen, das laeuft in
# einer Subshell, deren Variablenaenderungen nicht zurueckwirken).
set -uo pipefail
HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKRIPT="$HIER/release-tags.sh"
FEHLER=0

pruefe() { # pruefe <name> <erwartet> <ist>
  if [ "$2" = "$3" ]; then
    echo "  ok   $1"
  else
    echo "  FAIL $1: erwartet '$2', war '$3'"; FEHLER=$((FEHLER+1))
  fi
}

# shellcheck source=release-tags.sh
source "$SKRIPT"

export GITHUB_REPOSITORY="ITMSL/test-repo"
export TARGET_SHA="1111111111111111111111111111111111aaaa"

GH_LOG_FILE="$(mktemp)"
zuruecksetzen() {
  : > "$GH_LOG_FILE"
  STUB_REF_EXISTS=false
  STUB_REF_SHA=""
  STUB_REF_DIRTY_STDOUT=false
  STUB_TAGOBJ_RESOLVES=false
  STUB_TAGOBJ_SHA=""
  STUB_RELEASE_EXISTS=false
  STUB_RELEASE_TARGET=""
  STUB_RELEASE_VIEW_DIRTY_STDOUT=false
}

# Stub fuer `gh`: bildet nur die vier Aufrufmuster nach, die release-tags.sh
# tatsaechlich nutzt (Ref-Lookup, Tag-Objekt-Aufloesung, Tag-/Ref-Anlage,
# Release-Lookup, Release-Anlage). Reihenfolge der case-Zweige ist wichtig:
# "ref/tags/" muss vor dem allgemeineren "tags/<sha>"-Zweig geprueft werden.
gh() {
  echo "CALL: $*" >> "$GH_LOG_FILE"
  case "$1" in
    api)
      local pfad="$2"
      case "$pfad" in
        */git/ref/tags/*)
          if [ "$STUB_REF_EXISTS" = "true" ]; then
            echo "$STUB_REF_SHA"
            return 0
          fi
          [ "$STUB_REF_DIRTY_STDOUT" = "true" ] && echo '{"message":"Not Found","documentation_url":"https://docs.github.com/rest/git/refs#get-a-reference","status":"404"}'
          return 1
          ;;
        */git/tags/*)
          if [ "$STUB_TAGOBJ_RESOLVES" = "true" ]; then
            echo "$STUB_TAGOBJ_SHA"
            return 0
          fi
          return 1
          ;;
        */git/tags)
          echo "neuesTagObjektSha"
          return 0
          ;;
        */git/refs)
          echo "refs/tags/erstellt"
          return 0
          ;;
      esac
      ;;
    release)
      case "$2" in
        view)
          if [ "$STUB_RELEASE_EXISTS" = "true" ]; then
            echo "$STUB_RELEASE_TARGET"
            return 0
          fi
          [ "$STUB_RELEASE_VIEW_DIRTY_STDOUT" = "true" ] && echo '{"message":"Not Found","status":"404"}'
          return 1
          ;;
        create)
          return 0
          ;;
      esac
      ;;
  esac
}

echo "Fall 1: Tag existiert nicht (sauberer 404, leerer Output) -> create-Pfad wird aufgerufen"
zuruecksetzen
ausgabe="$(tag_anlegen "2026.01.01-1" "Release 2026.01.01-1" 2>&1)"; exit=$?
pruefe "exit"          "0" "$exit"
pruefe "create git/tags aufgerufen"  "1" "$(grep -c 'CALL: api repos/ITMSL/test-repo/git/tags ' "$GH_LOG_FILE" || true)"
pruefe "create git/refs aufgerufen"  "1" "$(grep -c 'CALL: api repos/ITMSL/test-repo/git/refs ' "$GH_LOG_FILE" || true)"

echo "Fall 2: Tag existiert, aufgeloestes Ziel = TARGET_SHA -> uebersprungen, Exit 0, kein create"
zuruecksetzen
STUB_REF_EXISTS=true; STUB_REF_SHA="tagObjektSha"
STUB_TAGOBJ_RESOLVES=true; STUB_TAGOBJ_SHA="$TARGET_SHA"
ausgabe="$(tag_anlegen "2026.01.01-1" "Release 2026.01.01-1" 2>&1)"; exit=$?
pruefe "exit"                  "0" "$exit"
pruefe "Meldung uebersprungen" "1" "$(echo "$ausgabe" | grep -c 'existiert bereits')"
pruefe "kein create git/tags"  "0" "$(grep -c 'CALL: api repos/ITMSL/test-repo/git/tags ' "$GH_LOG_FILE" || true)"

echo "Fall 3: Tag existiert, zeigt woanders hin -> FEHLER auf stderr, Exit != 0"
zuruecksetzen
STUB_REF_EXISTS=true; STUB_REF_SHA="tagObjektSha"
STUB_TAGOBJ_RESOLVES=true; STUB_TAGOBJ_SHA="andererSha"
fehlerausgabe="$(tag_anlegen "2026.01.01-1" "Release 2026.01.01-1" 2>&1 1>/dev/null)"; exit=$?
pruefe "exit != 0"    "1" "$([ "$exit" -ne 0 ] && echo 1 || echo 0)"
pruefe "FEHLER-Text"  "1" "$(echo "$fehlerausgabe" | grep -c '^FEHLER: Tag 2026.01.01-1 existiert und zeigt auf andererSha statt')"

echo "Fall 4: Release existiert bereits auf TARGET_SHA -> release-create uebersprungen"
zuruecksetzen
STUB_RELEASE_EXISTS=true; STUB_RELEASE_TARGET="$TARGET_SHA"
ausgabe="$(release_sicherstellen "2026.01.01-1" "2026.01.01-1" 2>&1)"; exit=$?
pruefe "exit"                     "0" "$exit"
pruefe "Meldung uebersprungen"    "1" "$(echo "$ausgabe" | grep -c 'existiert bereits')"
pruefe "kein release create"      "0" "$(grep -c 'CALL: release create' "$GH_LOG_FILE" || true)"

echo "Fall 5: Release existiert mit anderem Target -> Exit != 0"
zuruecksetzen
STUB_RELEASE_EXISTS=true; STUB_RELEASE_TARGET="andererSha"
fehlerausgabe="$(release_sicherstellen "2026.01.01-1" "2026.01.01-1" 2>&1 1>/dev/null)"; exit=$?
pruefe "exit != 0"   "1" "$([ "$exit" -ne 0 ] && echo 1 || echo 0)"
pruefe "FEHLER-Text" "1" "$(echo "$fehlerausgabe" | grep -c '^FEHLER: Release 2026.01.01-1 existiert und zeigt auf andererSha statt')"

echo "Fall 6: Ref-Lookup liefert Fehlertext auf STDOUT + Exit 1 (heutiges gh-Verhalten, real der Ausloeser des 404-Bugs) -> muss als 'existiert nicht' behandelt werden, create-Pfad laeuft"
zuruecksetzen
STUB_REF_DIRTY_STDOUT=true
ausgabe="$(tag_anlegen "2026.01.01-1" "Release 2026.01.01-1" 2>&1)"; exit=$?
pruefe "exit"                        "0" "$exit"
pruefe "kein FEHLER-Text"            "0" "$(echo "$ausgabe" | grep -c '^FEHLER:')"
pruefe "create git/tags aufgerufen"  "1" "$(grep -c 'CALL: api repos/ITMSL/test-repo/git/tags ' "$GH_LOG_FILE" || true)"

echo "Fall 7: Release-Lookup liefert Fehlertext auf STDOUT + Exit 1 (gleiche Bug-Klasse wie Fall 6, jetzt fuer release_sicherstellen) -> release-create laeuft"
zuruecksetzen
STUB_RELEASE_VIEW_DIRTY_STDOUT=true
ausgabe="$(release_sicherstellen "2026.01.01-1" "2026.01.01-1" 2>&1)"; exit=$?
pruefe "exit"                  "0" "$exit"
pruefe "kein FEHLER-Text"      "0" "$(echo "$ausgabe" | grep -c '^FEHLER:')"
pruefe "release create aufgerufen" "1" "$(grep -c 'CALL: release create' "$GH_LOG_FILE" || true)"

echo "Fall 8 (End-to-End, kein Sourcing): Skript direkt ausgefuehrt legt Tag+Release neu an -- prueft den BASH_SOURCE/\$0-Guard und die Env-Var-Verdrahtung"
zuruecksetzen
export -f gh
export STUB_REF_EXISTS STUB_REF_SHA STUB_REF_DIRTY_STDOUT STUB_TAGOBJ_RESOLVES STUB_TAGOBJ_SHA \
  STUB_RELEASE_EXISTS STUB_RELEASE_TARGET STUB_RELEASE_VIEW_DIRTY_STDOUT
export GH_LOG_FILE
ausgabe="$(CALVER="2026.01.01-1" SEMVER="1.0.0" SEMVER_CHANGED="false" \
  GITHUB_REPOSITORY="$GITHUB_REPOSITORY" TARGET_SHA="$TARGET_SHA" GH_TOKEN="dummy" \
  bash "$SKRIPT" 2>&1)"; exit=$?
pruefe "exit"                       "0" "$exit"
pruefe "create git/refs aufgerufen" "1" "$(grep -c 'CALL: api repos/ITMSL/test-repo/git/refs ' "$GH_LOG_FILE" || true)"
pruefe "release create aufgerufen"  "1" "$(grep -c 'CALL: release create' "$GH_LOG_FILE" || true)"
unset -f gh

rm -f "$GH_LOG_FILE"

echo
if [ "$FEHLER" -eq 0 ]; then echo "Alle Faelle bestanden."; else echo "$FEHLER Fehlschlag/Fehlschlaege."; fi
exit "$FEHLER"
