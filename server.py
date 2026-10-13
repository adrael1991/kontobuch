#!/usr/bin/env python3
"""Kontobuch-Server: liefert kontobuch.html aus und speichert die Daten in SQLite.

Nur Python-Standardbibliothek. Gedacht für einen LXC-Container im Heimnetz.
"""
import json
import os
import re
import sqlite3
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get("KONTOBUCH_DATA", ROOT / "data"))
PORT = int(os.environ.get("KONTOBUCH_PORT", "8080"))
COLLS = {"book", "customers", "invoices", "entries", "fixedAssets"}
ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
FILE_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/xml": ".xml",
    "text/xml": ".xml",
}
EXT_TYPES = {v: k for k, v in FILE_TYPES.items()}
STATIC = {"shim.js": "text/javascript", "jspdf.umd.min.js": "text/javascript"}
MAX_JSON = 1 << 20
MAX_FILE = 20 << 20

HEAD = """<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>"""
CDN_JSPDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"


def page():
    # Dieselbe Datei wie das Artifact; nur Laufzeit-Shim und lokales jsPDF statt CDN.
    html = (ROOT / "kontobuch.html").read_text(encoding="utf-8")
    html = html.replace(f'<script src="{CDN_JSPDF}"></script>',
                        '<script src="/static/shim.js"></script><script src="/static/jspdf.umd.min.js"></script>')
    return HEAD + html + "</body></html>"


def connect():
    (DATA / "belege").mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DATA / "kontobuch.db", check_same_thread=False)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("CREATE TABLE IF NOT EXISTS docs (coll TEXT, id TEXT, data TEXT NOT NULL, PRIMARY KEY (coll, id))")
    return con


def find_file(fid):
    return next((p for p in (DATA / "belege").glob(fid + ".*") if p.suffix in EXT_TYPES), None)


class Handler(BaseHTTPRequestHandler):
    con = None

    def reply(self, code, body=b"", ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def parts(self):
        return self.path.split("?")[0].strip("/").split("/")

    def body(self, limit):
        n = int(self.headers.get("Content-Length") or 0)
        if n > limit:
            raise ValueError("Anfrage zu groß")
        return self.rfile.read(n)

    def doc_path(self):
        p = self.parts()
        if len(p) == 3 and p[0] == "api" and p[1] in COLLS and ID.match(p[2]):
            return p[1], p[2]
        return None

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ValueError, json.JSONDecodeError) as e:
            self.reply(400, str(e), "text/plain; charset=utf-8")

    def do_GET(self):
        p = self.parts()
        if p == [""]:
            return self.reply(200, page(), "text/html; charset=utf-8")
        if len(p) == 2 and p[0] == "static" and p[1] in STATIC:
            return self.reply(200, (ROOT / "static" / p[1]).read_bytes(), STATIC[p[1]])
        if len(p) == 2 and p[0] == "api" and p[1] in COLLS:
            rows = self.con.execute("SELECT id, data FROM docs WHERE coll = ?", (p[1],)).fetchall()
            return self.reply(200, [{"id": i, "data": json.loads(d)} for i, d in rows])
        if len(p) == 2 and p[0] == "_blob" and ID.match(p[1]) and (f := find_file(p[1])):
            return self.reply(200, f.read_bytes(), EXT_TYPES[f.suffix])
        self.reply(404, "Nicht gefunden", "text/plain; charset=utf-8")

    def do_PUT(self):
        if not (dp := self.doc_path()):
            return self.reply(404, "Nicht gefunden", "text/plain; charset=utf-8")
        data = json.loads(self.body(MAX_JSON))
        if not isinstance(data, dict):
            raise ValueError("Dokument muss ein JSON-Objekt sein")
        with self.con:
            self.con.execute("INSERT OR REPLACE INTO docs VALUES (?, ?, ?)", (*dp, json.dumps(data)))
        self.reply(204)

    def do_DELETE(self):
        p = self.parts()
        if len(p) == 3 and p[:2] == ["api", "files"] and ID.match(p[2]):
            if f := find_file(p[2]):
                f.unlink()
            return self.reply(204)
        if not (dp := self.doc_path()):
            return self.reply(404, "Nicht gefunden", "text/plain; charset=utf-8")
        with self.con:
            self.con.execute("DELETE FROM docs WHERE coll = ? AND id = ?", dp)
        self.reply(204)

    def do_POST(self):
        if self.parts() != ["api", "files"]:
            return self.reply(404, "Nicht gefunden", "text/plain; charset=utf-8")
        ext = FILE_TYPES.get(self.headers.get("Content-Type", ""))
        if not ext:
            return self.reply(415, "Nur PDF, JPG, PNG oder WebP", "text/plain; charset=utf-8")
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_FILE:
            return self.reply(413, "Datei größer als 20 MB", "text/plain; charset=utf-8")
        fid = uuid.uuid4().hex
        (DATA / "belege" / (fid + ext)).write_bytes(self.rfile.read(n))
        self.reply(201, {"id": fid, "url": "/_blob/" + fid, "sizeBytes": n, "contentType": self.headers["Content-Type"]})


def make_server(port=PORT):
    # shortcut: ein Thread, eine DB-Verbindung; reicht für eine Person im Heimnetz.
    Handler.con = connect()
    return HTTPServer(("0.0.0.0", port), Handler)


if __name__ == "__main__":
    print(f"Kontobuch läuft auf Port {PORT}, Daten in {DATA}")
    make_server().serve_forever()
