// Start: node tests/logic.test.js — prüft Rechnungsnummern und Kunden-Import aus kontobuch.html.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let js = fs.readFileSync(path.join(__dirname, "..", "kontobuch.html"), "utf8").split("<script>")[1].split("</script>")[0];
js = js.split("/* ---------- events")[0].replace(/let view = [^\n]+/, 'let view = "overview";');
const mockPdfCalls = { addImage: [], text: [], addPage: 0 };
class MockJsPDF {
  constructor() {
    this.calls = mockPdfCalls;
    this.internal = { events: { subscribe() {} } };
  }
  addImage(...args) { mockPdfCalls.addImage.push(args); }
  getImageProperties(data) { return { width: 200, height: 100 }; }
  setTextColor() {}
  setFontSize() {}
  setDrawColor() {}
  setFont() {}
  line() {}
  text(...args) { mockPdfCalls.text.push(args); }
  splitTextToSize(text) { return String(text || "").split("\n"); }
  addPage() { mockPdfCalls.addPage++; }
  output(type) { return Buffer.from("%PDF-mock"); }
}
const mockWindow = { jspdf: { jsPDF: MockJsPDF } };

const app = new Function("localStorage", "location", "window", js + "; return { S, sett, nextInvoice, nextQuote, quoteState, matchPeriod, yearCloseReminder, nextCustNo, customersFromCsv, partyNames, lastCategory, euer, journal, receiptPreviewHtml, calcAsset, crc32, createZip, generateJournalCsv, generateAssetsCsv, generateEuerReport, generateReadmeReport, paperHtml, paperQuoteHtml, paperHeaderHtml, paperFooterHtml, invoicePdf, quotePdf };")(
  { getItem: () => null, setItem() {} }, { hash: "" }, mockWindow);
const { S, sett, nextInvoice, nextQuote, quoteState, matchPeriod, yearCloseReminder, nextCustNo, customersFromCsv, partyNames, lastCategory, euer, journal, receiptPreviewHtml, calcAsset, crc32, createZip, generateJournalCsv, generateAssetsCsv, generateEuerReport, generateReadmeReport, paperHtml, paperQuoteHtml, paperHeaderHtml, paperFooterHtml, invoicePdf, quotePdf } = app;



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
  { number: "RE-2026-001", status: "paid", paidDate: "2026-03-01", ku: true, items: [{ qty: 2, price: 100 }] },
  { number: "RE-2027-001", status: "paid", paidDate: "2027-01-02", ku: true, items: [{ qty: 1, price: 50 }] },
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

// Teil B: CRC-32 & ZIP-Archivierung (GoBD-Jahresabschluss)
const testBytes = Buffer.from("123456789");
assert.strictEqual(crc32(testBytes), 0xcbf43926);
assert.strictEqual(crc32(new Uint8Array(0)), 0);

const zipFiles = [
  { name: "README-Abschluss-2026.txt", data: "GoBD Archiv 2026" },
  { name: "Journal-2026.csv", data: "Datum;Art;Brutto\r\n2026-01-01;Einnahme;100" },
  { name: "Ausgangsrechnungen/", data: "" },
  { name: "Ausgangsrechnungen/Rechnung_RE-2026-001.pdf", data: Buffer.from("%PDF-1.4 test") },
  { name: "Eingangsbelege/Beleg_2026-01-01_Test.pdf", data: new Uint8Array([1, 2, 3, 4]) }
];
const zipBytes = createZip(zipFiles);
assert(zipBytes instanceof Uint8Array);
assert(zipBytes.length > 100);

// ZIP-Signaturen prüfen:
const dv = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
assert.strictEqual(dv.getUint32(0, true), 0x04034b50); // Local File Header: PK\x03\x04

// End of Central Directory Signature (letzte 22 Bytes)
const eocdSig = dv.getUint32(zipBytes.length - 22, true);
assert.strictEqual(eocdSig, 0x06054b50); // EOCD: PK\x05\x06
// Total entries in EOCD
assert.strictEqual(dv.getUint16(zipBytes.length - 22 + 10, true), 5);

// Journal CSV
const jCsv = generateJournalCsv(2026);
assert(jCsv.startsWith("\ufeff"), "BOM fehlt in Journal CSV");
assert(jCsv.includes("Kennzahl EÜR"));
assert(jCsv.includes("Rechnung RE-2026-001"));

// Anlagenverzeichnis CSV
const aCsv = generateAssetsCsv(2026);
assert(aCsv.startsWith("\ufeff"), "BOM fehlt in Anlagenverzeichnis CSV");
assert(aCsv.includes("Buchwert 01.01.2026"));
assert(aCsv.includes("Roland Plotter"));

// EÜR-Bericht
const eRep = generateEuerReport(2026);
assert(eRep.includes("EINNAHMENÜBERSCHUSSRECHNUNG (EÜR) 2026"));
assert(eRep.includes("BETRIEBSEINNAHMEN"));
assert(eRep.includes("BETRIEBSAUSGABEN"));
assert(eRep.includes("GEWINN") || eRep.includes("VERLUST"));

// README-Bericht
const rRep = generateReadmeReport(2026, { invoicesCount: 1, quotesCount: 2, entriesCount: 3, receiptsTotal: 2, receiptsSaved: 2 });
assert(rRep.includes("GoBD-JAHRESABSCHLUSS"));
assert(rRep.includes("§ 147 AO"));
assert(rRep.includes("Ausgangsrechnungen:   1 Dokument(e)"));
assert(rRep.includes("Angebote:             2 Dokument(e)"));

// Angebote: Angebotsnummern-Generierung
S.settings = { quotePrefix: "ANG-{JAHR}-", nextQuoteNo: 1, quoteCounterYear: 2026 };
S.quotes = [];
assert.strictEqual(nextQuote(2026).number, "ANG-2026-001");
S.quotes = [{ number: "ANG-2026-001" }, { number: "ANG-2026-002" }];
assert.strictEqual(nextQuote(2026).number, "ANG-2026-003");
// Neues Jahr beginnt wieder bei 1
assert.strictEqual(nextQuote(2027).number, "ANG-2027-001");

// Angebots-Statuslogik
assert.strictEqual(quoteState({ status: "draft" }), "draft");
assert.strictEqual(quoteState({ status: "open", validUntil: "2099-12-31" }), "open");
assert.strictEqual(quoteState({ status: "open", validUntil: "2020-01-01" }), "expired");
assert.strictEqual(quoteState({ status: "accepted" }), "accepted");
assert.strictEqual(quoteState({ status: "billed" }), "billed");
assert.strictEqual(quoteState({ status: "rejected" }), "rejected");

// Zeitraum-Filterung: matchPeriod
assert.strictEqual(matchPeriod("2026-02-15", "all"), true);
assert.strictEqual(matchPeriod("2026-02-15", "q1"), true);
assert.strictEqual(matchPeriod("2026-05-10", "q1"), false);
assert.strictEqual(matchPeriod("2026-05-10", "q2"), true);
assert.strictEqual(matchPeriod("2026-08-20", "q3"), true);
assert.strictEqual(matchPeriod("2026-11-01", "q4"), true);
assert.strictEqual(matchPeriod("2026-03-05", "03"), true);
assert.strictEqual(matchPeriod("2026-04-05", "03"), false);

// UStVA-Berechnung & Monats-/Quartalsfilter für Regelbesteuerer
S.settings = { kleinunternehmer: false };
S.invoices = [
  // Q1: Januar 2026 - Netto 1000 €, 19% USt = 190 €
  { id: "inv1", number: "RE-2026-001", status: "paid", paidDate: "2026-01-15", ku: false, items: [{ qty: 1, price: 1000, vat: 19 }] },
  // Q1: Februar 2026 - Netto 500 €, 7% USt = 35 €
  { id: "inv2", number: "RE-2026-002", status: "paid", paidDate: "2026-02-20", ku: false, items: [{ qty: 1, price: 500, vat: 7 }] },
  // Q2: April 2026 - Netto 2000 €, 19% USt = 380 €
  { id: "inv3", number: "RE-2026-003", status: "paid", paidDate: "2026-04-10", ku: false, items: [{ qty: 1, price: 2000, vat: 19 }] }
];
S.entries = [
  // Q1: Januar 2026 - Ausgabe 200 € netto + 38 € Vorsteuer (19%) = 238 € brutto
  { id: "e1", kind: "out", date: "2026-01-20", gross: 238, category: "material", ku: false, vatRate: 19 },
  // Q2: Mai 2026 - Ausgabe 100 € netto + 19 € Vorsteuer
  { id: "e2", kind: "out", date: "2026-05-15", gross: 119, category: "software", ku: false, vatRate: 19 }
];
S.fixedAssets = [];

// UStVA für Januar 2026 ("01"):
const uJan = euer(2026, "01");
assert.strictEqual(uJan.ust19Base, 1000);
assert.strictEqual(uJan.ust7Base, 0);
assert.strictEqual(uJan.ust, 190);
assert.strictEqual(uJan.vorsteuer, 38);
assert.strictEqual(uJan.ustZahllast, 152); // 190 - 38

// UStVA für 1. Quartal 2026 ("q1"):
const uQ1 = euer(2026, "q1");
assert.strictEqual(uQ1.ust19Base, 1000);
assert.strictEqual(uQ1.ust7Base, 500);
assert.strictEqual(uQ1.ust, 225); // 190 + 35
assert.strictEqual(uQ1.vorsteuer, 38);
assert.strictEqual(uQ1.ustZahllast, 187); // 225 - 38

// Jahreswechsel-Erinnerung
const cy = new Date().getFullYear();
const prevY = cy - 1;
S.settings = { dismissedReminders: {} };
S.invoices = [{ id: "prevInv", status: "paid", paidDate: `${prevY}-05-01`, items: [{ qty: 1, price: 100 }] }];
const reminderHtml = yearCloseReminder();
assert(reminderHtml.includes("Jahresabschluss & Datensicherung"), "Reminder HTML should show when previous year has data");
assert(reminderHtml.includes("export-year-zip-explicit"), "Reminder should have export button");

// Nach Ausblenden / Dismissed -> kein Banner mehr
S.settings = { dismissedReminders: { [prevY]: true } };
assert.strictEqual(yearCloseReminder(), "");

// Erscheinungsbild: Default-Einstellungen
S.settings = {};
const defSett = sett();
assert.strictEqual(defSett.hideTextHeader, false);
assert.strictEqual(defSett.hideTextFooter, false);
assert.strictEqual(defSett.logoData, "");
assert.strictEqual(defSett.stationeryData, "");

// Test-Rechnung und Test-Angebot
const testInv = {
  number: "RE-2026-001",
  date: "2026-04-10",
  dueDate: "2026-04-24",
  recipient: "Max Mustermann\nMusterstr. 5\n12345 Berlin",
  items: [{ desc: "Design Leistung", qty: 2, price: 100, vat: 19, unit: "Std." }],
  ku: false,
  seller: {
    name: "Creative Schmitti",
    owner: "Kevin Schmitt",
    street: "Designweg 1",
    zip: "63739",
    city: "Aschaffenburg",
    email: "info@creative-schmitti.de",
    phone: "012345",
    web: "creative-schmitti.de",
    iban: "DE1234567890",
    bic: "GENODE",
    bank: "Volksbank",
    taxNo: "123/456",
    vatId: "DE987654321"
  }
};

const testQuote = {
  number: "ANG-2026-001",
  date: "2026-04-10",
  validUntil: "2026-05-10",
  recipient: "Max Mustermann\nMusterstr. 5\n12345 Berlin",
  items: [{ desc: "Angebotene Leistung", qty: 1, price: 250, vat: 19, unit: "Pauschal" }],
  ku: false,
  seller: testInv.seller
};

// 1. Standard-Vorschau ohne Logo und ohne Briefpapier
const standardHtml = paperHtml(testInv);
assert(standardHtml.includes("<b>Creative Schmitti</b>"), "Default preview includes seller company name");
assert(standardHtml.includes("IBAN DE1234567890"), "Default preview includes bank info in footer");
assert(!standardHtml.includes("paper-logo"), "Default preview has no logo img");
assert(!standardHtml.includes("background-image"), "Default preview has no background-image");

// 2. Vorschau mit Logo
const withLogoInv = { ...testInv, seller: { ...testInv.seller, logoData: "data:image/png;base64,samplelogo123" } };
const logoHtml = paperHtml(withLogoInv);
assert(logoHtml.includes('<img class="paper-logo" src="data:image/png;base64,samplelogo123"'), "Logo preview contains logo img tag");
assert(logoHtml.includes("<b>Creative Schmitti</b>"), "Logo preview preserves header text when not hidden");

// 3. Vorschau mit Briefpapier (DIN A4 Hintergrund)
const withStationeryInv = { ...testInv, seller: { ...testInv.seller, stationeryData: "data:image/jpeg;base64,samplebg456" } };
const bgHtml = paperHtml(withStationeryInv);
assert(bgHtml.includes("background-image: url('data:image/jpeg;base64,samplebg456')"), "Paper preview contains stationery background");

// 4. Vorschau mit ausgeblendeter Standard-Kopfzeile
const hideHeaderInv = { ...testInv, seller: { ...testInv.seller, hideTextHeader: true, logoData: "data:image/png;base64,samplelogo123" } };
const hideHeaderHtml = paperHtml(hideHeaderInv);
assert(!hideHeaderHtml.includes("<b>Creative Schmitti</b>"), "Header text suppressed when hideTextHeader is true");
assert(hideHeaderHtml.includes("paper-logo"), "Logo remains visible when hideTextHeader is true");

// 5. Vorschau mit ausgeblendeter Standard-Fußzeile
const hideFooterInv = { ...testInv, seller: { ...testInv.seller, hideTextFooter: true } };
const hideFooterHtml = paperHtml(hideFooterInv);
assert(!hideFooterHtml.includes("IBAN DE1234567890"), "Footer bank details suppressed when hideTextFooter is true");
assert(!hideFooterHtml.includes('class="foot"'), "Foot element completely omitted when hideTextFooter is true");

// 6. Angebots-Vorschau (paperQuoteHtml)
const quoteHtml = paperQuoteHtml({ ...testQuote, seller: { ...testQuote.seller, logoData: "data:image/png;base64,quoteLogo" } });
assert(quoteHtml.includes("paper-logo"), "Quote preview supports logo");
assert(quoteHtml.includes("Angebotsnr."), "Quote preview has quote header");

// 7. PDF-Generierung (invoicePdf & quotePdf)
mockPdfCalls.addImage = [];
invoicePdf({
  ...testInv,
  seller: {
    ...testInv.seller,
    logoData: "data:image/png;base64,logoData",
    stationeryData: "data:image/jpeg;base64,bgData",
    hideTextHeader: true,
    hideTextFooter: true
  }
});
// Verify stationery was added at 0, 0, 210, 297
const bgCall = mockPdfCalls.addImage.find(call => call[0] === "data:image/jpeg;base64,bgData");
assert.ok(bgCall, "doc.addImage was called for stationery background");
assert.deepStrictEqual([bgCall[1], bgCall[2], bgCall[3], bgCall[4]], [0, 0, 210, 297]);

// Verify logo was added with aspect ratio (width 200, height 100 -> ratio 2 -> maxW 50, h 25 > maxH 22 -> h 22, w 44)
const logoCall = mockPdfCalls.addImage.find(call => call[0] === "data:image/png;base64,logoData");
assert.ok(logoCall, "doc.addImage was called for logo");
assert.strictEqual(logoCall[3], 44); // width: maxH * 2 = 22 * 2 = 44 mm
assert.strictEqual(logoCall[4], 22); // height: maxH = 22 mm

// 8. Quote PDF
mockPdfCalls.addImage = [];
quotePdf({
  ...testQuote,
  seller: {
    ...testQuote.seller,
    stationeryData: "data:image/jpeg;base64,quoteBg"
  }
});
assert.ok(mockPdfCalls.addImage.some(call => call[0] === "data:image/jpeg;base64,quoteBg"), "quotePdf draws stationery");

console.log("OK");


