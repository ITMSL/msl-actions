#!/usr/bin/env bash
# Setzt CalVer-/SemVer-Tags und legt das GitHub-Release an. Erwartet in der
# Umgebung: GH_TOKEN, GITHUB_REPOSITORY (von Actions gesetzt), CALVER, SEMVER,
# SEMVER_CHANGED, TARGET_SHA.
#
# In Funktionen gefasst und ueber BASH_SOURCE/$0 gegen direktes Ausfuehren
# abgesichert, damit release-tags.test.sh sie isoliert mit einem gh-Stub
# aufrufen kann, ohne echte Tags/Releases oder Netzzugriff zu brauchen.

# Tags via Git-Data-REST-API statt `git push origin <tag>`:
# Der receive-pack-Pfad lehnt GITHUB_TOKEN-Pushes ab, sobald sich die
# Workflow-Dateien des getaggten Commits von HEAD unterscheiden
# ("refusing to allow a GitHub App to create or update workflow ...").
# Das trifft gequeute Runs, deren Tag-Schritt erst laeuft, nachdem ein
# nachfolgender Merge einen Workflow geaendert hat (realer Vorfall:
# derkurier-testtwin Run 31819126945, 2026-08-14). Die REST-Ref-
# Erstellung zeigt nur auf einen existierenden Commit und unterliegt
# dieser Pruefung nicht.
tag_anlegen() {
  local name="$1" nachricht="$2"
  # Idempotenz fuer Re-Runs: existiert der Tag schon und zeigt auf
  # denselben Commit, ist nichts zu tun; zeigt er woanders hin, ist
  # das ein echter Konflikt und der Lauf muss rot werden.
  # Existenz ueber den EXIT-CODE von `gh api` pruefen, nicht ueber
  # den Output: bei 404 schreibt `gh api --jq` den rohen Fehler-
  # JSON-Body auf stdout statt still zu scheitern -- 2>/dev/null
  # faengt das nicht ab (kein stderr), ein reiner `-n`-Output-Check
  # haelt den 404-Fehler faelschlich fuer eine vorhandene SHA
  # (realer Vorfall: msl-e2e-testsuite Release-Run auf 0fb58b8,
  # 2026-08-24 -- reproduziert als Szenario in release-tags.test.sh).
  local vorhandener
  if vorhandener="$(gh api "repos/${GITHUB_REPOSITORY}/git/ref/tags/${name}" \
    --jq '.object.sha' 2>/dev/null)"; then
    # Annotierte Tags: Ref zeigt auf das Tag-Objekt -> dessen Ziel aufloesen.
    local ziel="$vorhandener"
    local objekt_typ
    if objekt_typ="$(gh api "repos/${GITHUB_REPOSITORY}/git/tags/${vorhandener}" \
      --jq '.object.sha' 2>/dev/null)"; then
      ziel="$objekt_typ"
    fi
    if [ "$ziel" = "$TARGET_SHA" ]; then
      echo "Tag ${name} existiert bereits auf ${TARGET_SHA} -- uebersprungen."
      return 0
    fi
    echo "FEHLER: Tag ${name} existiert und zeigt auf ${ziel} statt ${TARGET_SHA}." >&2
    return 1
  fi
  local tag_objekt
  tag_objekt="$(gh api "repos/${GITHUB_REPOSITORY}/git/tags" \
    -f tag="$name" -f message="$nachricht" \
    -f object="$TARGET_SHA" -f type=commit --jq '.sha')"
  gh api "repos/${GITHUB_REPOSITORY}/git/refs" \
    -f ref="refs/tags/${name}" -f sha="$tag_objekt" --jq '.ref'
}

# Idempotenz fuer Re-Runs (realer Vorfall: zwei Reruns am 2026-08-24 nach
# bereits erfolgtem Tag+Release, `gh release create` schlug mit
# already_exists fehl). Existenz ueber den EXIT-CODE pruefen, nicht
# ueber den Output -- gleiche Lehre wie bei tag_anlegen().
release_sicherstellen() {
  local calver="$1" titel="$2"
  local release_target
  if release_target="$(gh release view "$calver" --json targetCommitish --jq .targetCommitish 2>/dev/null)"; then
    if [ "$release_target" = "$TARGET_SHA" ]; then
      echo "Release ${calver} existiert bereits auf ${TARGET_SHA} -- uebersprungen."
      return 0
    fi
    echo "FEHLER: Release ${calver} existiert und zeigt auf ${release_target} statt ${TARGET_SHA}." >&2
    return 1
  fi
  gh release create "$calver" --title "$titel" --generate-notes --target "$TARGET_SHA"
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  set -euo pipefail
  tag_anlegen "$CALVER" "Release $CALVER"
  titel="$CALVER"
  if [ "$SEMVER_CHANGED" = "true" ]; then
    tag_anlegen "v$SEMVER" "Release v$SEMVER ($CALVER)"
    titel="v$SEMVER — $CALVER"
  fi
  release_sicherstellen "$CALVER" "$titel"
fi
