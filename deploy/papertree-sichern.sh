#!/bin/bash
# Sichert die PaperTree-Daten: den Ordnerbaum samt Symbolen und Logos.
#
# Das ist alles, was PaperTree selbst besitzt – Dokumente liegen in Paperless
# und werden von dessen eigener Sicherung erfasst. Ohne diese Datei wäre der
# Baum allein im Docker-Volume, und das erfasst keine Paperless-Sicherung.
#
# Die Datenbank wird nicht einfach kopiert: SQLite schreibt im WAL-Modus,
# eine Kopie mitten im Betrieb wäre womöglich unvollständig. Stattdessen
# erzeugt die Online-Backup-Schnittstelle von SQLite eine in sich stimmige
# Kopie, auch während geschrieben wird.
#
# Aufruf ohne Argument: Ziel ist /srv/nas/paperless/Backup/papertree
set -euo pipefail

CONTAINER="${PAPERTREE_CONTAINER:-papertree}"
ZIEL="${1:-/srv/nas/paperless/Backup/papertree}"
BEHALTEN_TAGE="${PAPERTREE_BACKUP_TAGE:-30}"
STAMP="$(date +%Y-%m-%d)"
ARCHIV="$ZIEL/papertree-$STAMP.tar.gz"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "Container $CONTAINER läuft nicht – PaperTree wird nicht gesichert." >&2
    exit 1
fi

mkdir -p "$ZIEL"

echo "[$(date -Is)] PaperTree: stimmige Kopie der Datenbank"
docker exec -i "$CONTAINER" python3 - <<'PYTHON'
import os
import shutil
import sqlite3

ORDNER = "/tmp/papertree-sicherung"
shutil.rmtree(ORDNER, ignore_errors=True)
os.makedirs(ORDNER)

quelle = sqlite3.connect("/data/papertree.sqlite3")
ziel = sqlite3.connect(os.path.join(ORDNER, "papertree.sqlite3"))
with ziel:
    quelle.backup(ziel)
ziel.close()
quelle.close()

# Kurz gegenlesen: eine Sicherung, die sich nicht öffnen lässt, ist keine.
pruef = sqlite3.connect(os.path.join(ORDNER, "papertree.sqlite3"))
ordner = pruef.execute("SELECT COUNT(*) FROM ordner").fetchone()[0]
symbole = pruef.execute("SELECT COUNT(*) FROM tag_symbol").fetchone()[0]
logos = pruef.execute("SELECT COUNT(*) FROM korrespondent_logo").fetchone()[0]
stand = pruef.execute("SELECT stand FROM schema_stand").fetchone()[0]
pruef.close()
print("   Ordner %d, Tag-Symbole %d, Logos %d, Schemastand %d"
      % (ordner, symbole, logos, stand))
PYTHON

echo "[$(date -Is)] PaperTree: Archiv schreiben"
# Die Logos kommen direkt aus /data dazu; fehlt der Ordner noch, wird er
# angelegt, damit tar nicht über ein fehlendes Verzeichnis stolpert.
docker exec "$CONTAINER" mkdir -p /data/logos
docker exec "$CONTAINER" tar -czf - \
    -C /tmp/papertree-sicherung papertree.sqlite3 \
    -C /data logos > "$ARCHIV"

docker exec "$CONTAINER" rm -rf /tmp/papertree-sicherung

# Das Archiv gegenlesen, statt nur auf den Rückgabewert zu vertrauen.
if ! tar -tzf "$ARCHIV" >/dev/null 2>&1; then
    echo "Archiv $ARCHIV ist nicht lesbar – Sicherung fehlgeschlagen." >&2
    rm -f "$ARCHIV"
    exit 1
fi

find "$ZIEL" -name "papertree-*.tar.gz" -mtime "+$BEHALTEN_TAGE" -delete

echo "[$(date -Is)] PaperTree gesichert: $ARCHIV ($(du -h "$ARCHIV" | cut -f1))"
tar -tzf "$ARCHIV" | sed 's/^/   /'
