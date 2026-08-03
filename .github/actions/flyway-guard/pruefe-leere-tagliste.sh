#!/usr/bin/env bash
# Wird von action.yml nur aufgerufen, wenn die lokale CalVer-Tag-Liste leer
# ist (Direktpush, kein PR). Fragt den Remote direkt per git ls-remote ab --
# unabhaengig vom lokalen Fetch-Zustand -- um "wirklich erster Release" von
# einem Checkout-Problem (z.B. fehlendem 'fetch-tags: true' im aufrufenden
# Workflow) zu unterscheiden. Sonst wuerde ein Checkout-Problem als "erster
# Release" durchgewunken und der Flyway-Rollback-Guard waere still und
# unauffaellig wirkungslos -- genau der Fehler, der hier behoben wird.
set -uo pipefail

# git ls-remote separat pruefen, NICHT ueber die kombinierte Pipe mit grep:
# unter pipefail gewinnt sonst der Exitcode von grep (1, kein Treffer) ueber
# den von ls-remote -- ein fehlgeschlagener Remote-Zugriff (Netz-Haenger,
# abgelaufenes Token, Rate-Limit; beide betroffenen Repos sind privat und
# brauchen dafuer die persistierten Checkout-Credentials) saehe dann genauso
# aus wie "Remote hat wirklich keine Tags" -- der Guard waere wieder lautlos
# wirkungslos, nur ueber einen anderen Pfad als vor diesem Skript.
remote_tags="$(git ls-remote --tags origin 2>&1)"
rc=$?
if [ "$rc" -ne 0 ]; then
  echo "::error::git ls-remote gegen 'origin' ist fehlgeschlagen (Exit $rc) -- kann nicht zwischen 'Remote hat wirklich keine Tags' und 'Remote nicht erreichbar' unterscheiden. Guard bricht sicherheitshalber ab statt faelschlich 'erster Release' anzunehmen." >&2
  echo "$remote_tags" >&2
  exit 1
fi

if echo "$remote_tags" | grep -qE 'refs/tags/[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[0-9]+'; then
  echo "::error::Lokal keine CalVer-Tags gefunden, der Remote hat aber welche -- vermutlich fehlt 'fetch-tags: true' im Checkout-Schritt des aufrufenden Workflows. Guard bricht ab statt faelschlich 'erster Release' anzunehmen." >&2
  exit 1
fi

echo "Kein vorheriger CalVer-Tag gefunden -- erster Release, Pruefung uebersprungen."
exit 0
