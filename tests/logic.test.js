// Start: node tests/logic.test.js — prüft Rechnungsnummern und Kunden-Import aus kontobuch.html.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let js = fs.readFileSync(path.join(__dirname, "..", "kontobuch.html"), "utf8").split("<script>")[1].split("</script>")[0];
js = js.split("/* ---------- events")[0].replace(/let view = [^\n]+/, 'let view = "overview";');
const app = new Function("localStorage", "location", js + "; return { S, nextInvoice, nextCustNo, customersFromCsv, partyNames, lastCategory };")(
  { getItem: () => null, setItem() {} }, { hash: "" });
const { S, nextInvoice, nextCustNo, customersFromCsv, partyNames, lastCategory } = app;

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

console.log("OK");
