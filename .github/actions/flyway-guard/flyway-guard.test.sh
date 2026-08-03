#!/usr/bin/env bash
set -uo pipefail
SKRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/flyway-guard.sh"
D="$(mktemp -d)"; FEHLER=0

pruefe() { # pruefe <name> <erwarteter exitcode> <datei>
  bash "$SKRIPT" "$3" >/dev/null 2>&1; local e=$?
  if [ "$e" = "$2" ]; then echo "  ok   $1"
  else echo "  FAIL $1: Exit $e statt $2"; FEHLER=$((FEHLER+1)); fi
}

printf 'ALTER TABLE t ADD COLUMN c text;\n'            > "$D/V1__add.sql"
printf 'ALTER TABLE t DROP COLUMN c;\n'                > "$D/V2__drop.sql"
printf -- '-- rollback-unsafe: Spalte war nie befuellt\nALTER TABLE t DROP COLUMN c;\n' > "$D/V3__drop_ok.sql"
printf 'ALTER TABLE t ALTER COLUMN c SET NOT NULL;\n'  > "$D/V4__notnull.sql"
printf 'ALTER TABLE t RENAME COLUMN a TO b;\n'         > "$D/V5__rename.sql"
printf 'CREATE INDEX i ON t(c);\n'                     > "$D/V6__index.sql"
# Auf einer leeren Tabelle laesst Postgres ADD COLUMN ... NOT NULL ohne
# DEFAULT anstandslos durch (kein bestehender NULL-Wert verletzt die
# Constraint) -- die Migration SIEHT additiv aus, ist es aber nicht: die
# aeltere App-Version, die den Rollback ausrollt, kennt die Spalte nicht und
# ihre INSERTs scheitern an der Constraint.
printf 'ALTER TABLE tour ADD COLUMN fahrer_id BIGINT NOT NULL;\n' > "$D/V7__addcolumn_notnull_ohne_default.sql"
printf 'ALTER TABLE tour ADD COLUMN fahrer_id BIGINT NOT NULL DEFAULT 0;\n' > "$D/V8__addcolumn_notnull_mit_default.sql"
# Mehrspaltiges ADD COLUMN in einer Anweisung: ein DEFAULT irgendwo in der
# Zeile darf nicht alle Spalten entschuldigen -- Spalte b hat hier keins.
printf "ALTER TABLE tour ADD COLUMN a text NOT NULL DEFAULT '', ADD COLUMN b text NOT NULL;\n" > "$D/V9__addcolumn_mehrspaltig.sql"
# DEFAULT auf der Folgezeile derselben Anweisung ist rollback-sicher und
# darf keinen Fehlalarm ausloesen.
printf 'ALTER TABLE tour ADD COLUMN c BIGINT NOT NULL\n  DEFAULT 0;\n' > "$D/V10__addcolumn_default_folgezeile.sql"
# Reviewer-Fund C2: das Komma in einem Typ-Parameter wie NUMERIC(10,2) ist
# kein Spaltentrenner. Ein naiver Komma-Split reisst "ADD COLUMN" und
# "NOT NULL" in zwei Fragmente -- keins erfuellt beide Bedingungen, die
# Zeile rutscht durch. Preis-/Mengenspalten mit NUMERIC(p,s)/DECIMAL(p,s)
# sind gerade in einem Preisrechner-Umfeld ein gaengiges Muster.
printf 'ALTER TABLE tour ADD COLUMN preis NUMERIC(10,2) NOT NULL;\n' > "$D/V11__addcolumn_numeric_klammerkomma.sql"

# Dienst mit eigenem Migrationslaeufer: SQLite-Migrationen ohne V-Praefix,
# gleiche ALTER-TABLE-Syntax.
printf 'ALTER TABLE service_state ADD COLUMN live_version TEXT;\n' > "$D/012_sqlite_add.sql"
printf 'ALTER TABLE service_state DROP COLUMN live_version;\n'     > "$D/013_sqlite_drop.sql"

# Dienst mit Liquibase-XML-Changelogs (kein Flyway) -- native Tags ...
printf '<changeSet id="1" author="t"><addColumn tableName="t"><column name="c" type="text"/></addColumn></changeSet>\n' > "$D/v020-addcolumn.xml"
printf '<changeSet id="2" author="t"><dropColumn tableName="t" columnName="c"/></changeSet>\n' > "$D/v021-dropcolumn.xml"
printf '<!-- rollback-unsafe: Spalte war nie befuellt -->\n<changeSet id="3" author="t"><dropColumn tableName="t" columnName="c"/></changeSet>\n' > "$D/v022-dropcolumn-ok.xml"
printf '<changeSet id="4" author="t"><column name="c" type="text" nullable="false"/></changeSet>\n' > "$D/v023-notnull.xml"
printf '<changeSet id="5" author="t"><renameColumn tableName="t" oldColumnName="a" newColumnName="b"/></changeSet>\n' > "$D/v024-rename.xml"
# ... und rohes SQL in <sql>-Tags, wie in einem echten Fund aus der Praxis
# (ein Changelog mit <sql>DROP TABLE IF EXISTS ...;</sql>)
printf '<changeSet id="6" author="t"><sql>DROP TABLE IF EXISTS distance_cache;</sql></changeSet>\n' > "$D/v025-raw-sql-drop.xml"

pruefe "additive Migration erlaubt"        0 "$D/V1__add.sql"
pruefe "DROP COLUMN abgelehnt"             1 "$D/V2__drop.sql"
pruefe "DROP COLUMN mit Marker erlaubt"    0 "$D/V3__drop_ok.sql"
pruefe "NOT NULL ohne Default abgelehnt"   1 "$D/V4__notnull.sql"
pruefe "RENAME abgelehnt"                  1 "$D/V5__rename.sql"
pruefe "CREATE INDEX erlaubt"              0 "$D/V6__index.sql"
pruefe "ADD COLUMN NOT NULL ohne Default abgelehnt" 1 "$D/V7__addcolumn_notnull_ohne_default.sql"
pruefe "ADD COLUMN NOT NULL mit Default erlaubt"    0 "$D/V8__addcolumn_notnull_mit_default.sql"
pruefe "mehrspaltiges ADD COLUMN: Spalte ohne Default abgelehnt" 1 "$D/V9__addcolumn_mehrspaltig.sql"
pruefe "DEFAULT auf Folgezeile erlaubt (kein Fehlalarm)"         0 "$D/V10__addcolumn_default_folgezeile.sql"
pruefe "NUMERIC(10,2) mit Klammer-Komma trotzdem abgelehnt"      1 "$D/V11__addcolumn_numeric_klammerkomma.sql"
pruefe "SQLite ADD COLUMN (eigener Migrationslaeufer) erlaubt"  0 "$D/012_sqlite_add.sql"
pruefe "SQLite DROP COLUMN (eigener Migrationslaeufer) abgelehnt" 1 "$D/013_sqlite_drop.sql"
pruefe "Liquibase addColumn erlaubt"                0 "$D/v020-addcolumn.xml"
pruefe "Liquibase dropColumn abgelehnt"             1 "$D/v021-dropcolumn.xml"
pruefe "Liquibase dropColumn mit Marker erlaubt"    0 "$D/v022-dropcolumn-ok.xml"
pruefe "Liquibase nullable=false abgelehnt"         1 "$D/v023-notnull.xml"
pruefe "Liquibase renameColumn abgelehnt"           1 "$D/v024-rename.xml"
pruefe "Liquibase rohes <sql>DROP TABLE</sql> abgelehnt" 1 "$D/v025-raw-sql-drop.xml"
pruefe "geloeschte Migration abgelehnt (kein Marker moeglich)" 1 "$D/V99__existiert_nicht.sql"

echo
if [ "$FEHLER" -eq 0 ]; then echo "Alle Faelle bestanden."; else echo "$FEHLER Fehlschlag/Fehlschlaege."; fi
exit "$FEHLER"
