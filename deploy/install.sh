#!/bin/sh
# Einmalig im LXC-Container als root ausführen, nachdem das Repo nach /opt/kontobuch geklont wurde.
set -eu
apt-get update
apt-get install -y python3 sqlite3
id kontobuch >/dev/null 2>&1 || useradd --system --home-dir /var/lib/kontobuch --create-home --shell /usr/sbin/nologin kontobuch
cp /opt/kontobuch/deploy/kontobuch.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now kontobuch
echo "Fertig: http://$(hostname -I | cut -d' ' -f1):8080"
