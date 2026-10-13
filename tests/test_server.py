"""Start: python3 -m unittest discover tests"""
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

    def req(self, method, path, body=None, ctype="application/json"):
        data = json.dumps(body).encode() if isinstance(body, (dict, list)) else body
        r = urllib.request.Request(self.base + path, data=data, method=method, headers={"Content-Type": ctype})
        try:
            with urllib.request.urlopen(r) as res:
                return res.status, res.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def test_page_uses_local_runtime(self):
        status, html = self.req("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"/static/shim.js", html)
        self.assertNotIn(b"cdnjs.cloudflare.com/ajax/libs/jspdf", html)

    def test_doc_roundtrip(self):
        self.assertEqual(self.req("PUT", "/api/invoices/r1", {"number": "RE-1", "gross": 842.5})[0], 204)
        status, body = self.req("GET", "/api/invoices")
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
        status, body = self.req("POST", "/api/files", b"%PDF-1.4 test", "application/pdf")
        self.assertEqual(status, 201)
        fid = json.loads(body)["id"]
        self.assertEqual(self.req("GET", "/_blob/" + fid), (200, b"%PDF-1.4 test"))
        self.assertEqual(self.req("DELETE", "/api/files/" + fid)[0], 204)
        self.assertEqual(self.req("GET", "/_blob/" + fid)[0], 404)

        # XML-Beleg (z. B. reine XRechnung)
        status_xml, body_xml = self.req("POST", "/api/files", b"<rsm:CrossIndustryInvoice/>", "application/xml")
        self.assertEqual(status_xml, 201)
        fid_xml = json.loads(body_xml)["id"]
        self.assertEqual(self.req("GET", "/_blob/" + fid_xml), (200, b"<rsm:CrossIndustryInvoice/>"))
        self.assertEqual(self.req("DELETE", "/api/files/" + fid_xml)[0], 204)


if __name__ == "__main__":
    unittest.main()
