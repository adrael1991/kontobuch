# Kontobuch

Selbst gehostete, schlanke Buchhaltung für Kleinunternehmer (§ 19 UStG) und Regelbesteuerer: E-Rechnungen (ZUGFeRD 2.2 / Factur-X nach EN 16931), Angebote mit 1-Klick-Umwandlung, Ausgaben mit Belegen & E-Rechnungs-Erkennung, Anlagenverzeichnis & AfA, EÜR mit UStVA-Filter sowie GoBD-Jahresabschluss als ZIP.

- `kontobuch.html`: Die Single-Page App (Offline-fähig, reines Vanilla JS ohne Frameworks). Läuft als claude.ai-Artifact und auf dem eigenen Server.
- `server.py`: Schlanker HTTP/REST-Server (nur Python-Standardbibliothek), speichert Sammlungen und Belege in SQLite.
- `static/shim.js`: Verbindet die App nahtlos mit `server.py` statt mit claude.ai.
- `deploy/`: Installations- und Update-Skripte für Proxmox-LXC (Debian 12).
- `tests/`: Unittests für Buchhaltungslogik, Nummernkreise, AfA, ZIP-Archivierung und ZUGFeRD-Validierung.

---

## Funktionsübersicht

### 1. Ausgangsrechnungen & E-Rechnung (ZUGFeRD 2.2)
- **E-Rechnungsstandard EN 16931**: Generiert hybride PDF/A-3-konforme Rechnungen mit eingebetteter `factur-x.xml` (ZUGFeRD 2.2 Comfort / EN 16931).
- **DIN 5008 Layout**: Professionelle PDFs mit Absenderzeile, Faltmarken, Empfängerfeld, Positions- und Summentabelle sowie Bank-/Steuer-Fußzeile.
- **Nummernkreis mit Jahrespräfix**: Standard `RE-{JAHR}-` (z. B. `RE-2026-001`), setzt sich im neuen Jahr automatisch zurück oder kann manuell fortgeführt werden.
- **Rechtssichere Stornorechnungen**: Ein Klick erzeugt eine Stornorechnung mit fortlaufender Nummer und negativen Beträgen.

### 2. Angebote & Kostenvoranschläge
- Eigener Bereich **Angebote** mit Zähler für offene Angebote.
- Eigener Nummernkreis (`ANG-{JAHR}-`) und Gültigkeitsdauer (Standard: 30 Tage).
- Statusverwaltung: *Entwurf*, *Offen*, *Angenommen*, *Abgerechnet*, *Abgelehnt*, *Abgelaufen*.
- DIN 5008 PDF-Generierung für Angebote.
- **1-Klick-Umwandlung in Rechnung (`⚡ In Rechnung umwandeln`)**: Übernimmt Kunde, Positionen und Referenzvermerk. Beim Festschreiben der Rechnung wird das Angebot automatisch als *Abgerechnet* markiert.

### 3. Einnahmen & Ausgaben (Journal)
- **Split-View Beleg-Vorschau**: Belege (PDF, JPG, PNG) werden beim Erfassen und Bearbeiten direkt neben dem Formular in einer interaktiven Vorschau angezeigt.
- **Automatische E-Rechnungs-Erkennung**: Beim Upload von eingehenden Rechnungen werden Rechnungsnummer, Lieferant, Datum, Betrag und Steuersatz automatisch aus eingebetteten ZUGFeRD/Factur-X- oder XRechnung-XMLs ausgelesen.
- Filterbar nach Einnahmen/Ausgaben, Textsuche und Belegstatus.

### 4. Anlagenverzeichnis & monatsgenaue AfA (Anlage AVEÜR)
- Wirtschaftsgüter des Anlagevermögens ab 800 € netto (z. B. Plotter, Computer, Maschinen, Möbel).
- Lineare Abschreibung (§ 7 Abs. 1 EStG) auf den Monat genau berechnet (Kaufmonat zählt voll).
- Sofortabschreibung für geringwertige Wirtschaftsgüter (GWG nach § 6 Abs. 2 EStG).
- Schnellwahltasten für BMF-Richtwerte (3 J. EDV, 5 J. Geräte, 8 J. Maschinen/Plotter, 13 J. Möbel).
- Automatische Übernahme der Jahres-AfA in die EÜR (Kennzahl 130).
- CSV-Export des vollständigen Anlagenverzeichnisses nach amtlichem AVEÜR-Muster.

### 5. Einnahmenüberschussrechnung (EÜR) & UStVA
- Berechnung streng nach dem Zufluss-/Abflussprinzip (§ 4 Abs. 3 EStG).
- **Zeitraumfilter**: Ganzes Jahr, Quartale (Q1–Q4) oder Einzelmonate (Januar–Dezember).
- Automatische Berücksichtigung der 30 % nicht abziehbaren Bewirtungskosten (Kz. 165).
- **UStVA-Box für Regelbesteuerer**: Exakte Berechnung der offiziellen ELSTER-Kennzahlen:
  - **Kz. 81**: 19 % steuerpflichtiger Nettoumsatz & Steuer
  - **Kz. 86**: 7 % steuerpflichtiger Nettoumsatz & Steuer
  - **Kz. 66**: Abziehbare Vorsteuer
  - **Kz. 83**: Verbleibende Zahllast / Erstattungsüberhang
- Monatsabschluss-Kachel auf dem Dashboard mit Zahlen für den Vormonat (zur Abgabe bis zum 10.) und den laufenden Monat.

### 6. GoBD-Jahresabschluss & Datensicherung (§ 147 AO)
- **Komplett-Export als ZIP (`Kontobuch-Abschluss-[JAHR].zip`)**:
  - `README-Abschluss-[JAHR].txt`: Dokumentation und Inhaltsverzeichnis nach GoBD.
  - `Journal-[JAHR].csv`: Vollständiges Buchungsjournal mit ELSTER-Kennzahlen (UTF-8 mit BOM).
  - `Anlagenverzeichnis-[JAHR].csv`: Verzeichnis aller Anlagegüter mit Buchwerten und AfA.
  - `EÜR-Bericht-[JAHR].txt`: Formatierte EÜR-Steuerauswertung für Finanzamt und Steuerberatung.
  - `Datenbestand-[JAHR].json`: Vollständiger JSON-Snapshot aller Daten des Geschäftsjahres.
  - `Ausgangsrechnungen/`: Alle Rechnungen als PDF/A-3 mit ZUGFeRD-XML.
  - `Angebote/`: Alle Angebote des Jahres als PDFs.
  - `Eingangsbelege/`: Sämtliche hochgeladenen Originalbelege.
- **Automatische Jahreswechsel-Erinnerung**: Informiert beim Jahreswechsel auf dem Dashboard über ausstehende Abschlüsse des Vorjahres mit 1-Klick-Export.

### 7. Kundenstamm
- Verwaltung von Adress-, Kontakt-, Steuer- und Bankdaten.
- Automatische fortlaufende Kundennummern.
- CSV-Import mit automatischer Spaltenerkennung (u. a. für Daten aus Papierkram).

---

## Installation im Proxmox-LXC

1. **Container anlegen:** In Proxmox *Create CT* mit dem Template Debian 12. 1 CPU, 512 MB RAM und 8 GB Disk reichen. Netzwerk per DHCP oder mit fester IP.
2. **Repo klonen:** In der Konsole des Containers als root:
   ```sh
   apt-get update && apt-get install -y git
   git config --global credential.helper store
   git clone https://github.com/adrael1991/kontobuch /opt/kontobuch
   ```
   Das Repo ist privat. Als Benutzername gibst du `adrael1991` ein, als Passwort einen GitHub-Token (GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens, nur Lesezugriff auf `kontobuch`, Recht *Contents: Read-only*). Git merkt sich den Token für spätere Updates.
3. **Installieren:**
   ```sh
   sh /opt/kontobuch/deploy/install.sh
   ```
   Am Ende steht die Adresse, z. B. `http://192.168.1.50:8080`.
4. **Daten übernehmen:** Im bisherigen Kontobuch unter *Einstellungen → Backup herunterladen*, dann auf dem Server unter *Einstellungen → Backup einspielen*.

---

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

---

## Daten und Sicherung

Alles liegt in `/var/lib/kontobuch`: `kontobuch.db` und der Ordner `belege/`. Nimm den Container in die täglichen Proxmox-Backups auf (*Datacenter → Backup*) und halte eine Kopie auf einer externen Platte. Rechnungen und Belege müssen 8 bis 10 Jahre aufbewahrt werden (§ 147 AO).

> **Hinweis zur Sicherheit:** Es gibt keinen Login. Jeder im Heimnetz kann die App öffnen. Gib Port 8080 nicht ins öffentliche Internet frei (nur via VPN/Tailscale bei Fernzugriff).

---

## Entwicklung & Tests

```sh
python3 server.py                    # Server lokal starten (http://localhost:8080, Daten in ./data)
python3 -m unittest discover tests   # Python-Server-Tests
node tests/logic.test.js             # Buchungslogik, AfA, Nummernkreise, ZIP & Filter
node tests/zugferd.test.js           # E-Rechnung: ZUGFeRD 2.2 / Factur-X (EN 16931) XML & PDF
```
