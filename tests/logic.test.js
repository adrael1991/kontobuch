// Start: node tests/logic.test.js — prüft Rechnungsnummern und Kunden-Import aus kontobuch.html.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let js = fs.readFileSync(path.join(__dirname, "..", "kontobuch.html"), "utf8").split("<script>")[1].split("</script>")[0];
js = js.split("/* ---------- events")[0].replace(/let view = [^\n]+/, 'let view = "overview";');
const app = new Function("localStorage", "location", js + "; return { S, nextInvoice, nextCustNo, customersFromCsv, partyNames, lastCategory, euer, receiptPreviewHtml, calcAsset };")(
  { getItem: () => null, setItem() {} }, { hash: "" });
const { S, nextInvoice, nextCustNo, customersFromCsv, partyNames, lastCategory, euer, receiptPreviewHtml, calcAsset } = app;

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

// Anlagenverzeichnis: Lineare AfA (§ 7 Abs. 1 EStG)
// Plotter gekauft 15.04.2026 für 2.400 €, 5 Jahre Nutzungsdauer (480 €/Jahr)
const plotter = { id: "a1", name: "Roland Plotter", date: "2026-04-15", cost: 2400, nd: 5, method: "linear" };

// 2026: 9 Monate AfA (April bis Dez) = 480 * 9/12 = 360 €
const p26 = calcAsset(plotter, 2026);
assert.strictEqual(p26.bookStart, 0);
assert.strictEqual(p26.additions, 2400);
assert.strictEqual(p26.afa, 360);
assert.strictEqual(p26.bookEnd, 2040);

// 2027: volles Jahr AfA = 480 €
const p27 = calcAsset(plotter, 2027);
assert.strictEqual(p27.bookStart, 2040);
assert.strictEqual(p27.additions, 0);
assert.strictEqual(p27.afa, 480);
assert.strictEqual(p27.bookEnd, 1560);

// 2030: vorletztes Jahr = 480 €
const p30 = calcAsset(plotter, 2030);
assert.strictEqual(p30.bookStart, 600);
assert.strictEqual(p30.afa, 480);
assert.strictEqual(p30.bookEnd, 120);

// 2031: letztes Jahr (verbleibende 3 Monate Jan–März) = 120 €
const p31 = calcAsset(plotter, 2031);
assert.strictEqual(p31.bookStart, 120);
assert.strictEqual(p31.afa, 120);
assert.strictEqual(p31.bookEnd, 0);

// 2032: vollständig abgeschrieben
const p32 = calcAsset(plotter, 2032);
assert.strictEqual(p32.bookStart, 0);
assert.strictEqual(p32.afa, 0);
assert.strictEqual(p32.bookEnd, 0);

// GWG: Sofortabschreibung im Anschaffungsjahr
const gwg = { id: "a2", name: "Drucker", date: "2026-09-01", cost: 450, nd: 1, method: "gwg" };
const g26 = calcAsset(gwg, 2026);
assert.strictEqual(g26.bookStart, 0);
assert.strictEqual(g26.additions, 450);
assert.strictEqual(g26.afa, 450);
assert.strictEqual(g26.bookEnd, 0);

const g27 = calcAsset(gwg, 2027);
assert.strictEqual(g27.bookStart, 0);
assert.strictEqual(g27.afa, 0);
assert.strictEqual(g27.bookEnd, 0);

// Automatische Übernahme in EÜR (Kz. 130)
S.fixedAssets = [plotter, gwg];
const euerWithAssets = euer(2026);
// In 2026: 360 € (Plotter) + 450 € (GWG) + 188.26 € (aus vorherigen S.entries) = 998.26 €
const afaLine = euerWithAssets.out.find(l => l.kz === "130");
assert.strictEqual(afaLine.amount, 998.26);
assert.strictEqual(euerWithAssets.afaFromAssets, 810);

console.log("OK");
