"""Start: python3 -m unittest discover tests"""
import base64
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

os.environ["KONTOBUCH_DATA"] = tempfile.mkdtemp()
import server  # noqa: E402


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = server.make_server(0)
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def req(self, method, path, body=None, ctype="application/json", headers=None):
        data = json.dumps(body).encode() if isinstance(body, (dict, list)) else body
        hdrs = {"Content-Type": ctype}
        if headers:
            hdrs.update(headers)
        r = urllib.request.Request(self.base + path, data=data, method=method, headers=hdrs)
        try:
            with urllib.request.urlopen(r) as res:
                return res.status, res.read(), dict(res.headers)
        except urllib.error.HTTPError as e:
            return e.code, e.read(), dict(e.headers)

    def test_page_uses_local_runtime_and_security_headers(self):
        status, html, hdrs = self.req("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"/static/shim.js", html)
        self.assertNotIn(b"cdnjs.cloudflare.com/ajax/libs/jspdf", html)
        self.assertEqual(hdrs.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(hdrs.get("X-Frame-Options"), "SAMEORIGIN")
        self.assertEqual(hdrs.get("Referrer-Policy"), "no-referrer")

    def test_doc_roundtrip(self):
        self.assertEqual(self.req("PUT", "/api/invoices/r1", {"number": "RE-1", "gross": 842.5})[0], 204)
        status, body, _ = self.req("GET", "/api/invoices")
        self.assertEqual(json.loads(body), [{"id": "r1", "data": {"number": "RE-1", "gross": 842.5}}])
        self.assertEqual(self.req("DELETE", "/api/invoices/r1")[0], 204)
        self.assertEqual(json.loads(self.req("GET", "/api/invoices")[1]), [])

    def test_rejects_bad_input(self):
        self.assertEqual(self.req("PUT", "/api/hacks/x", {"a": 1})[0], 404)
        self.assertEqual(self.req("PUT", "/api/entries/..%2Fx", {"a": 1})[0], 404)
        self.assertEqual(self.req("PUT", "/api/entries/x", b"not json")[0], 400)
        self.assertEqual(self.req("PUT", "/api/entries/x", [1, 2])[0], 400)
        self.assertEqual(self.req("POST", "/api/files", b"<html>", "text/html")[0], 415)

    def test_receipt_upload(self):
        status, body, _ = self.req("POST", "/api/files", b"%PDF-1.4 test", "application/pdf")
        self.assertEqual(status, 201)
        fid = json.loads(body)["id"]
        self.assertEqual(self.req("GET", "/_blob/" + fid)[:2], (200, b"%PDF-1.4 test"))
        self.assertEqual(self.req("DELETE", "/api/files/" + fid)[0], 204)
        self.assertEqual(self.req("GET", "/_blob/" + fid)[0], 404)

        # XML-Beleg (z. B. reine XRechnung)
        status_xml, body_xml, _ = self.req("POST", "/api/files", b"<rsm:CrossIndustryInvoice/>", "application/xml")
        self.assertEqual(status_xml, 201)
        fid_xml = json.loads(body_xml)["id"]
        self.assertEqual(self.req("GET", "/_blob/" + fid_xml)[:2], (200, b"<rsm:CrossIndustryInvoice/>"))
        self.assertEqual(self.req("DELETE", "/api/files/" + fid_xml)[0], 204)

    def test_optional_basic_auth(self):
        try:
            os.environ["KONTOBUCH_PASSWORD"] = "geheim123"
            # Ohne Header -> 401
            status, _, hdrs = self.req("GET", "/api/invoices")
            self.assertEqual(status, 401)
            self.assertIn("Basic", hdrs.get("WWW-Authenticate", ""))

            # Falsches Passwort -> 401
            bad_tok = base64.b64encode(b"egal:falsch").decode()
            self.assertEqual(self.req("GET", "/api/invoices", headers={"Authorization": f"Basic {bad_tok}"})[0], 401)

            # Richtiges Passwort (beliebiger Benutzername bei KONTOBUCH_PASSWORD) -> 200
            ok_tok = base64.b64encode(b"kevin:geheim123").decode()
            self.assertEqual(self.req("GET", "/api/invoices", headers={"Authorization": f"Basic {ok_tok}"})[0], 200)

            # Spezifischer User:Pass über KONTOBUCH_AUTH
            os.environ["KONTOBUCH_AUTH"] = "kevin:topsecret"
            wrong_user = base64.b64encode(b"admin:topsecret").decode()
            self.assertEqual(self.req("GET", "/api/invoices", headers={"Authorization": f"Basic {wrong_user}"})[0], 401)
            right_user = base64.b64encode(b"kevin:topsecret").decode()
            self.assertEqual(self.req("GET", "/api/invoices", headers={"Authorization": f"Basic {right_user}"})[0], 200)
        finally:
            os.environ.pop("KONTOBUCH_PASSWORD", None)
            os.environ.pop("KONTOBUCH_AUTH", None)

    def test_static_assets_and_favicon(self):
        status, icon, hdrs = self.req("GET", "/favicon.ico")
        self.assertEqual(status, 200)
        self.assertEqual(hdrs.get("Content-Type"), "image/png")

        status, svg, hdrs = self.req("GET", "/static/logo/kontobuch_signet.svg")
        self.assertEqual(status, 200)
        self.assertEqual(hdrs.get("Content-Type"), "image/svg+xml")

        status, png, hdrs = self.req("GET", "/static/logo/kontobuch_signet_512.png")
        self.assertEqual(status, 200)
        self.assertEqual(hdrs.get("Content-Type"), "image/png")

        status, font, hdrs = self.req("GET", "/static/fonts/Montserrat-Bold.ttf")
        self.assertEqual(status, 200)
        self.assertEqual(hdrs.get("Content-Type"), "font/ttf")
        self.assertGreater(len(font), 50000)


if __name__ == "__main__":
    unittest.main()

