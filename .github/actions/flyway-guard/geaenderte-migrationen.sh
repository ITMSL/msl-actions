#!/usr/bin/env bash
# Listet die seit <basis> geaenderten Migrationsdateien (eine je Zeile) auf stdout.
# Wird von action.yml aufgerufen. Ein fehlgeschlagener git diff (unaufloesbare
# Basis, kaputter Checkout, fehlende Historie) ist ein FEHLER (Exit 1) und keine
# leere Liste -- sonst liefe der Rollback-Guard still gruen durch. Genau das war
# der Fall mit dem frueheren "|| true" (Audit 2026-10-25, msl-actions #2).
set -uo pipefail
basis="${1:?Diff-Basis (Tag oder Ref) fehlt}"

if ! git rev-parse --verify --quiet "${basis}^{commit}" >/dev/null; then
  echo "::error::Diff-Basis '$basis' ist kein aufloesbarer Commit -- Guard bricht ab statt 'keine Migrationen' anzunehmen." >&2
  exit 1
fi

# Nur stdout erfassen: git-Warnungen (z.B. mehrdeutiger Ref) duerfen nicht in der
# Dateiliste landen; die git-Meldung steht dank stderr-Durchreichung im Job-Log.
dateien="$(git diff --name-only "${basis}...HEAD" \
  -- '*/db/migration/*.sql' 'migrations/*.sql' '*/db/changelog/*.xml')"
rc=$?
if [ "$rc" -ne 0 ]; then
  echo "::error::git diff ${basis}...HEAD ist fehlgeschlagen (Exit $rc) -- Ursache siehe git-Meldung darueber." >&2
  exit 1
fi

printf '%s\n' "$dateien" | sed '/^$/d'
