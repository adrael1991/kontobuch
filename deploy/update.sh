#!/bin/sh
# Sichert die Datenbank, holt die neueste Version von GitHub und startet neu.
set -eu
backup="/var/lib/kontobuch/backup-$(date +%Y-%m-%d-%H%M).db"
sqlite3 /var/lib/kontobuch/kontobuch.db ".backup '$backup'"
echo "Datenbank gesichert: $backup"
git -C /opt/kontobuch pull --ff-only
cp /opt/kontobuch/deploy/kontobuch.service /etc/systemd/system/
systemctl daemon-reload
systemctl restart kontobuch
echo "Aktualisiert auf $(git -C /opt/kontobuch log -1 --format='%h %s')"
