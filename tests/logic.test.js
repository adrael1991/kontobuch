// Start: node tests/logic.test.js — prüft Rechnungsnummern und Kunden-Import aus kontobuch.html.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let js = fs.readFileSync(path.join(__dirname, "..", "kontobuch.html"), "utf8").split("<script>")[1].split("</script>")[0];
js = js.split("/* ---------- events")[0].replace(/let view = [^\n]+/, 'let view = "overview";');
const app = new Function("localStorage", "location", js + "; return { S, nextInvoice, nextCustNo, customersFromCsv, partyNames, lastCategory, euer, receiptPreviewHtml };")(
  { getItem: () => null, setItem() {} }, { hash: "" });
const { S, nextInvoice, nextCustNo, customersFromCsv, partyNames, lastCategory, euer, receiptPreviewHtml } = app;

// Fester Präfix: Nummer läuft weiter, belegte Nummern werden übersprungen.
S.settings = { invoicePrefix: "RE-2026-", nextInvoiceNo: 41 };
S.invoices = [{ number: "RE-2026-041" }];
assert.strictEqual(nextInvoice(2026).number, "RE-2026-042");

// {JAHR}: im eingestellten Jahr gilt die eingestellte Nummer, im neuen Jahr beginnt es bei 1.
S.settings = { invoicePrefix: "RE-{JAHR}-", nextInvoiceNo: 7, counterYear: 2026 };
S.invoices = [];
assert.strictEqual(nextInvoice(2026).number, "RE-2026-007");
assert.strictEqual(nextInvoice(2027).number, "RE-2027-001");
S.invoices = [{ number: "RE-2027-001" }, { number: "RE-2026-006" }];
assert.strictEqual(nextInvoice(2027).number, "RE-2027-002");

// Kundennummern schließen an, auch mit führenden Nullen.
assert.strictEqual(nextCustNo([]), "1001");
assert.strictEqual(nextCustNo(["015", "020", "009"]), "021");

// Papierkram-Export (ausgedachte Daten): nur Kunden, Dubletten übersprungen, Felder zugeordnet.
const head = "Name;Kontaktart;Kunden-/Lieferantennr.;Straße (Post);PLZ (Post);Stadt (Post);Land (Post);Straße (Haus);PLZ (Haus);Stadt (Haus);Land;Website;E-Mail;Telefon;Fax;UStID;Notiz;Anrede (Standardempfänger);Titel (Standardempfänger);Vorname (Standardempfänger);Nachname (Standardempfänger)";
const csv = "﻿" + [head,
  'Beispiel GmbH;Kunde;KdNr. 003;Hauptstr. 1;12345;Musterstadt;Deutschland;"";"";"";Deutschland;beispiel.example;info@beispiel.example;0123 45;"";DE123;"Notiz mit ; Semikolon";Frau;"";Erika;Muster',
  'Lieferant AG;Lieferant;LifNr. 001;"";"";"";Deutschland;"";"";"";Deutschland;"";"";"";"";"";"";"";"";"";""',
  'Schon Da KG;Kunde;KdNr. 004;"";"";"";Deutschland;"";"";"";Deutschland;"";"";"";"";"";"";"";"";"";""',
  'Ohne Nummer;Kunde;"";"";"";"";Österreich;Weg 2;"1010";Wien;"";"";"";"";"";"";"";"";"";"";""',
].join("\r\n") + "\r\n";
const res = customersFromCsv(csv, [{ name: "schon da kg", customerNo: "099" }]);
assert.deepStrictEqual([res.add.length, res.skipped, res.ignored], [2, 1, 1]);
assert.deepStrictEqual(res.suppliers, ["Lieferant AG"]);
assert.deepStrictEqual(res.add[0], {
  customerNo: "003", name: "Beispiel GmbH", contact: "Frau Erika Muster", street: "Hauptstr. 1", zip: "12345", city: "Musterstadt",
  country: "", email: "info@beispiel.example", phone: "0123 45", vatId: "DE123", note: "Notiz mit ; Semikolon\nbeispiel.example",
});
assert.deepStrictEqual([res.add[1].customerNo, res.add[1].street, res.add[1].city, res.add[1].country], ["100", "Weg 2", "Wien", "Österreich"]);

// Partner-Feld: Vorschläge ohne Dubletten, Kategorie der letzten Buchung.
S.settings = { suppliers: ["Strato GmbH", "adobe"] };
S.customers = [{ name: "Beispiel GmbH" }];
S.entries = [
  { kind: "out", party: "Adobe", date: "2026-01-05", category: "sonstige" },
  { kind: "out", party: "adobe", date: "2026-03-05", category: "software" },
  { kind: "in", party: "Bar-Kunde", date: "2026-02-01", category: "umsatz" },
];
assert.deepStrictEqual(partyNames("out"), ["Adobe", "Strato GmbH"]);
assert.deepStrictEqual(partyNames("in"), ["Bar-Kunde", "Beispiel GmbH"]);
assert.strictEqual(lastCategory("out", " ADOBE "), "software");
assert.strictEqual(lastCategory("out", "Strato GmbH"), undefined);

// EÜR nach Kennzahlen: gleiche Felder zusammengefasst, Bewirtung zu 70 %, Zufluss im Zahlungsjahr.
S.invoices = [
  { status: "paid", paidDate: "2026-03-01", ku: true, items: [{ qty: 2, price: 100 }] },
  { status: "paid", paidDate: "2027-01-02", ku: true, items: [{ qty: 1, price: 50 }] },
];
S.entries = [
  { kind: "out", date: "2026-02-01", gross: 10, category: "bank", ku: true },
  { kind: "out", date: "2026-02-02", gross: 5.5, category: "sonstige", ku: true },
  { kind: "out", date: "2026-02-03", gross: 100, category: "bewirtung", ku: true },
  { kind: "out", date: "2026-12-31", gross: 188.26, category: "afa", ku: true },
  { kind: "in", date: "2026-05-01", gross: 30, category: "sonstige_in", ku: true },
];
const e = euer(2026);
assert.deepStrictEqual(e.inc.map(l => [l.kz, l.amount]), [["111", 230]]);
assert.deepStrictEqual(e.out.map(l => [l.kz, l.amount]), [["130", 188.26], ["183", 15.5], ["175", 70]]);
assert.deepStrictEqual([e.nonDeductible, e.incTotal, e.outTotal, e.profit], [30, 230, 273.76, -43.76]);

// Beleg-Vorschau HTML
const emptyHtml = receiptPreviewHtml(null, null);
assert.ok(emptyHtml.includes("Noch kein Beleg ausgewählt"));

const pdfHtml = receiptPreviewHtml("/_blob/abc123pdf", "rechnung.pdf");
assert.ok(pdfHtml.includes("<iframe class=\"preview-frame\""));
assert.ok(pdfHtml.includes("rechnung.pdf"));
assert.ok(pdfHtml.includes("In neuem Tab öffnen ↗"));

const imgHtml = receiptPreviewHtml("/_blob/img456", "beleg.jpg");
assert.ok(imgHtml.includes("<img class=\"preview-img\""));
assert.ok(imgHtml.includes("beleg.jpg"));

console.log("OK");
