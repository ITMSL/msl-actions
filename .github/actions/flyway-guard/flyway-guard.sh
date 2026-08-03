#!/usr/bin/env bash
# Prueft Flyway- (SQL) und Liquibase-Migrationen (XML) auf Statements/Elemente,
# die einen Image-Rollback unmoeglich machen. Absicht ist nicht, sie zu
# verbieten -- sondern sie zu einer sichtbaren Entscheidung zu machen: mit
# Marker geht alles durch.
#
# Das SQL-Muster laeuft bewusst auch gegen .xml-Dateien: Liquibase-Changelogs
# koennen rohes SQL in <sql>-Tags einbetten (z.B. ein <sql>DROP TABLE
# IF EXISTS ...</sql> in einem Changelog) -- nur die nativen Liquibase-Tags
# zu pruefen wuerde diesen Fall verfehlen.
#
# Geloeschte Migrationsdateien sind IMMER ein Fehler, ohne Marker-Ausweg: seit
# quarkus.flyway.ignore-migration-patterns=*:future ist eine geloeschte
# Migration zur Laufzeit nicht mehr von einem legitimen Rollback (DB kennt eine
# Version, die die App nicht kennt) zu unterscheiden -- der Guard ist die
# einzige verbliebene Stelle, an der sich das trennen laesst.
set -uo pipefail
MUSTER_SQL='DROP[[:space:]]+COLUMN|DROP[[:space:]]+TABLE|RENAME[[:space:]]+(COLUMN|TO)|SET[[:space:]]+NOT[[:space:]]+NULL'
MUSTER_LIQUIBASE_TAGS='<dropColumn|<dropTable|<renameColumn|nullable="false"'
FEHLER=0

# Zerlegt eine Anweisung an Kommata, aber nur auf Klammertiefe 0 -- das Komma
# in einem Typ-Parameter wie NUMERIC(10,2)/DECIMAL(p,s) trennt keine Spalten,
# sondern gehoert zu einer einzigen Spaltendefinition. Ein naiver Split haette
# "ADD COLUMN" und "NOT NULL" in zwei Fragmente gerissen, von denen keins
# beide Bedingungen erfuellt -- Reviewer-Fund C2.
zerlege_top_level_kommata() {
  local eingabe="$1" tiefe=0 aktuelles="" zeichen i
  for (( i=0; i<${#eingabe}; i++ )); do
    zeichen="${eingabe:i:1}"
    case "$zeichen" in
      '(') tiefe=$((tiefe+1)); aktuelles+="$zeichen" ;;
      ')') [ "$tiefe" -gt 0 ] && tiefe=$((tiefe-1)); aktuelles+="$zeichen" ;;
      ',') if [ "$tiefe" -eq 0 ]; then printf '%s\n' "$aktuelles"; aktuelles=""; else aktuelles+="$zeichen"; fi ;;
      *) aktuelles+="$zeichen" ;;
    esac
  done
  printf '%s\n' "$aktuelles"
}

for datei in "$@"; do
  if [ ! -f "$datei" ]; then
    echo "Geloescht: $datei"
    echo "    Migrationsdateien duerfen nicht geloescht werden -- kein Marker moeglich."
    FEHLER=1
    continue
  fi

  case "$datei" in
    *.xml) muster="${MUSTER_SQL}|${MUSTER_LIQUIBASE_TAGS}" ;;
    *)     muster="$MUSTER_SQL" ;;
  esac

  if grep -qiE '^(--|<!--)[[:space:]]*rollback-unsafe:' "$datei"; then
    echo "übersprungen (Marker vorhanden): $datei"
    continue
  fi
  if treffer="$(grep -inE "$muster" "$datei")"; then
    echo "Rollback-unsicher: $datei"
    echo "$treffer" | sed 's/^/    /'
    FEHLER=1
  fi

  # ADD COLUMN ... NOT NULL ohne DEFAULT ist auf einer leeren Tabelle fuer
  # Postgres additiv -- kein bestehender Wert verletzt die Constraint, das
  # Statement laeuft durch. Zur Laufzeit ist es das nicht: die zurueckgerollte
  # Vorversion kennt die Spalte nicht, ihre INSERTs scheitern daran. Das oben
  # stehende MUSTER_SQL prueft nur SET NOT NULL (nachtraeglich verschaerft),
  # nicht ADD COLUMN (direkt so angelegt) -- beide Formen sind gleich riskant.
  #
  # Zeilenweise reicht nicht: ein mehrspaltiges "ADD COLUMN a ... DEFAULT '',
  # ADD COLUMN b ... NOT NULL" haette das DEFAULT von Spalte a faelschlich
  # auch fuer Spalte b gelten lassen; und ein DEFAULT auf der Folgezeile
  # derselben Anweisung waere ein Fehlalarm gewesen. Deshalb erst zu
  # Anweisungen zusammenfassen (Semikolon-getrennt, eingebettete
  # Zeilenumbrueche zu Leerzeichen), dann jede Anweisung an Kommata in
  # Fragmente zerlegen und jedes Fragment einzeln pruefen.
  anweisungen="$(awk 'BEGIN{RS=";"} {gsub(/\n/," "); if (NF) print}' "$datei")"
  while IFS= read -r anweisung; do
    [ -z "$anweisung" ] && continue
    while IFS= read -r frag; do
      if echo "$frag" | grep -qiE 'ADD[[:space:]]+COLUMN' \
        && echo "$frag" | grep -qiE 'NOT[[:space:]]+NULL' \
        && ! echo "$frag" | grep -qiE 'DEFAULT'; then
        echo "Rollback-unsicher: $datei"
        echo "$frag" | sed -E 's/^[[:space:]]*/    /'
        FEHLER=1
      fi
    done < <(zerlege_top_level_kommata "$anweisung")
  done <<<"$anweisungen"
done

if [ "$FEHLER" -ne 0 ]; then
  cat >&2 <<'HINWEIS'

Diese Statements/Elemente verhindern einen Rollback auf die Vorversion, oder
eine Migrationsdatei wurde geloescht (dafuer gibt es keinen Marker-Ausweg).
Statements/Elemente: entweder aufteilen (hinzufuegen jetzt, abraeumen im
naechsten Release) oder bewusst freigeben mit einer ersten Zeile:
    -- rollback-unsafe: <Begruendung>        (SQL)
    <!-- rollback-unsafe: <Begruendung> -->  (XML)
HINWEIS
fi
exit "$FEHLER"
