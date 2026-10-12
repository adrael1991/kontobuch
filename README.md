# Kontobuch

Buchhaltung für Kleinunternehmer (§ 19 UStG): Rechnungen mit PDF, Ausgaben mit Belegen, Kunden, EÜR.

- `kontobuch.html`: die App. Läuft als claude.ai-Artifact und auf dem eigenen Server.
- `server.py`: kleiner Server (nur Python-Standardbibliothek), speichert alles in SQLite.
- `static/shim.js`: verbindet die App mit `server.py` statt mit claude.ai.
- `deploy/`: Installation und Updates im Proxmox-LXC.

## Installation im Proxmox-LXC

1. **Container anlegen:** In Proxmox *Create CT* mit dem Template Debian 12. 1 CPU, 512 MB RAM und 8 GB Disk reichen. Netzwerk per DHCP oder mit fester IP.
2. **Repo klonen:** In der Konsole des Containers als root:
   ```sh
   apt-get update && apt-get install -y git
   git config --global credential.helper store
   git clone https://github.com/adrael1991/kontobuch /opt/kontobuch
   ```
   Das Repo ist privat. Als Benutzername gibst du `adrael1991` ein, als Passwort einen GitHub-Token (GitHub → Settings → Developer settings → Fine-grained tokens, nur Lesezugriff auf `kontobuch`, Recht *Contents: Read-only*). Git merkt sich den Token für spätere Updates.
3. **Installieren:**
   ```sh
   sh /opt/kontobuch/deploy/install.sh
   ```
   Am Ende steht die Adresse, z. B. `http://192.168.1.50:8080`.
4. **Daten übernehmen:** Im claude.ai-Kontobuch unter *Einstellungen → Backup herunterladen*, dann auf dem Server unter *Einstellungen → Backup einspielen*. Belegdateien sind nicht im Backup enthalten, die lädst du neu hoch.

## Update

```sh
sh /opt/kontobuch/deploy/update.sh
```
Das Skript sichert vorher die Datenbank nach `/var/lib/kontobuch/backup-DATUM.db`.

**Zurück auf eine ältere Version:**
```sh
git -C /opt/kontobuch log --oneline          # Version aussuchen
git -C /opt/kontobuch checkout <commit>
systemctl restart kontobuch
```
Wieder auf den neuesten Stand: `git -C /opt/kontobuch checkout main`, dann `update.sh`.

**Datenbank aus einer Sicherung zurückholen:**
```sh
systemctl stop kontobuch
cd /var/lib/kontobuch
rm -f kontobuch.db-wal kontobuch.db-shm
cp backup-DATUM.db kontobuch.db && chown kontobuch: kontobuch.db
systemctl start kontobuch
```

## Daten und Sicherung

Alles liegt in `/var/lib/kontobuch`: `kontobuch.db` und der Ordner `belege/`. Nimm den Container in die Proxmox-Backups auf (*Datacenter → Backup*) und halte eine Kopie außerhalb des Servers. Rechnungen und Belege müssen 8 bis 10 Jahre aufbewahrt werden.

Es gibt keinen Login. Jeder im Heimnetz kann die App öffnen. Gib Port 8080 nicht ins Internet frei.

## Entwicklung

```sh
python3 server.py                    # http://localhost:8080, Daten in ./data
python3 -m unittest discover tests   # Server-Tests
node tests/logic.test.js             # Rechnungsnummern, Kunden-Import
```
