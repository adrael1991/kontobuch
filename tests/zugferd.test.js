// Start: node tests/zugferd.test.js — prüft ZUGFeRD 2.2 / Factur-X XML-Generierung, PDF-Einbettung und E-Rechnungs-Import direkt aus kontobuch.html.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { jsPDF } = require("../static/jspdf.umd.min.js");

// Extract script from kontobuch.html
let html = fs.readFileSync(path.join(__dirname, "..", "kontobuch.html"), "utf8");
let js = html.split("<script>")[1].split("</script>")[0];
js = js.split("/* ---------- events")[0].replace(/let view = [^\n]+/, 'let view = "overview";');

const dummyStorage = { getItem: () => null, setItem() {} };
const dummyLocation = { hash: "" };
const app = new Function("localStorage", "location", "window", js + "; return { S, sett, calcInv, nextInvoice, generateFacturXXml, attachFacturX, parseEInvoiceXml, extractEInvoiceFromPdf };")(
  dummyStorage, dummyLocation, { jspdf: { jsPDF } });

const { S, generateFacturXXml, attachFacturX, parseEInvoiceXml, extractEInvoiceFromPdf } = app;

// 1. Kleinunternehmer Rechnung XML Test
const invKu = {
  number: "RE-2027-001",
  date: "2027-01-15",
  dueDate: "2027-01-29",
  ku: true,
  customerNo: "1001",
  recipient: "Design Kunde GmbH\nFrau Schmidt\nMusterweg 10\n10115 Berlin\nDeutschland",
  notes: "Zahlbar rein netto innerhalb 14 Tagen.",
  items: [
    { desc: "Logo-Entwurf", qty: 1, unit: "Pauschal", price: 450, vat: 0 },
    { desc: "Beratung", qty: 2.5, unit: "Std.", price: 80, vat: 0 }
  ],
  seller: {
    name: "Creative Schmitti",
    owner: "Kevin Schmitt",
    street: "Musterstraße 1",
    zip: "63853",
    city: "Mömlingen",
    taxNo: "204/123/45678",
    vatId: "",
    iban: "DE89 3705 0198 1234 5678 90",
    bic: "BYLADEM1MOM"
  }
};

const xmlKu = generateFacturXXml(invKu);

assert(xmlKu.includes("<ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931</ram:ID>"), "Muss Factur-X EN 16931 Profil enthalten");
assert(xmlKu.includes("<ram:TypeCode>380</ram:TypeCode>"), "TypeCode für Handelsrechnung muss 380 sein");
assert(xmlKu.includes("<ram:ID>RE-2027-001</ram:ID>"), "Rechnungsnummer muss stimmen");
assert(xmlKu.includes("<udt:DateTimeString format=\"102\">20270115</udt:DateTimeString>"), "Rechnungsdatum muss im Format 102 sein");
assert(xmlKu.includes("<ram:CategoryCode>O</ram:CategoryCode>"), "Kleinunternehmer Kategorie muss O sein");
assert(xmlKu.includes("<ram:ExemptionReasonCode>VATEX-EU-19</ram:ExemptionReasonCode>"), "Befreiungsgrund VATEX-EU-19 muss gesetzt sein");
assert(xmlKu.includes("<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>"), "Steuersatz bei KU muss 0.00 sein");
assert(xmlKu.includes("<ram:LineTotalAmount>650.00</ram:LineTotalAmount>"), "Nettosumme muss 650.00 sein");
assert(xmlKu.includes("<ram:TaxTotalAmount currencyID=\"EUR\">0.00</ram:TaxTotalAmount>"), "Steuer muss 0.00 sein");
assert(xmlKu.includes("<ram:GrandTotalAmount>650.00</ram:GrandTotalAmount>"), "Bruttosumme muss 650.00 sein");
assert(xmlKu.includes("<ram:DuePayableAmount>650.00</ram:DuePayableAmount>"), "Zahlbetrag muss 650.00 sein");
assert(xmlKu.includes("unitCode=\"C62\""), "Pauschal Einheit muss C62 sein");
assert(xmlKu.includes("unitCode=\"HUR\""), "Std. Einheit muss HUR sein");
assert(xmlKu.includes("<ram:IBANID>DE89370501981234567890</ram:IBANID>"), "IBAN muss ohne Leerzeichen sein");
assert(xmlKu.includes("<ram:AccountName>Kevin Schmitt</ram:AccountName>"), "Kontoinhaber Kevin Schmitt muss als AccountName für Bank-Empfängerüberprüfung enthalten sein");
assert(xmlKu.includes("<ram:ID schemeID=\"FC\">204/123/45678</ram:ID>"), "Steuernummer muss als FC registriert sein");
assert(xmlKu.includes("<ram:Name>Design Kunde GmbH</ram:Name>"), "Kundenname muss extrahiert sein");
assert(xmlKu.includes("<ram:PostcodeCode>10115</ram:PostcodeCode>"), "PLZ muss extrahiert sein");
assert(xmlKu.includes("<ram:CityName>Berlin</ram:CityName>"), "Ort muss extrahiert sein");

// 2. Regelbesteuerung (mit 19 % USt)
const invVat = {
  number: "RE-2027-002",
  date: "2027-02-01",
  dueDate: "2027-02-15",
  ku: false,
  recipient: "Agentur Partner AG\nSpreeufer 4\n10178 Berlin",
  items: [
    { desc: "Werbetechnik Beschilderung", qty: 1, unit: "Stk.", price: 1000, vat: 19 }
  ],
  seller: {
    name: "MD Schilder",
    street: "Industriestr. 2",
    zip: "63741",
    city: "Aschaffenburg",
    taxNo: "204/123/99999",
    vatId: "DE123456789",
    iban: "DE89 3705 0198 9999 9999 99"
  }
};

const xmlVat = generateFacturXXml(invVat);
assert(xmlVat.includes("<ram:CategoryCode>S</ram:CategoryCode>"), "Kategorie bei Regelbesteuerung muss S sein");
assert(xmlVat.includes("<ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>"), "Steuersatz 19 %");
assert(xmlVat.includes("<ram:LineTotalAmount>1000.00</ram:LineTotalAmount>"), "Netto 1000.00");
assert(xmlVat.includes("<ram:TaxTotalAmount currencyID=\"EUR\">190.00</ram:TaxTotalAmount>"), "USt 190.00");
assert(xmlVat.includes("<ram:GrandTotalAmount>1190.00</ram:GrandTotalAmount>"), "Brutto 1190.00");
assert(xmlVat.includes("<ram:ID schemeID=\"VA\">DE123456789</ram:ID>"), "USt-IdNr muss als VA vorhanden sein");

// 3. Stornorechnung
const invStorno = {
  ...invKu,
  number: "RE-2027-003",
  storno: true,
  refNumber: "RE-2027-001",
  refDate: "2027-01-15",
  items: [{ desc: "Logo-Entwurf", qty: -1, unit: "Pauschal", price: 450, vat: 0 }]
};

const xmlStorno = generateFacturXXml(invStorno);
assert(xmlStorno.includes("<ram:TypeCode>381</ram:TypeCode>"), "TypeCode für Storno muss 381 sein");
assert(xmlStorno.includes("Storno zu Rechnung RE-2027-001"), "Hinweis auf Originalrechnung muss vorhanden sein");

// 4. PDF-Einbettung (ZUGFeRD PDF/A-3 Hybrid-PDF)
const doc = new jsPDF({ unit: "mm", format: "a4" });
doc.text("Rechnung RE-2027-001", 20, 20);
attachFacturX(doc, xmlKu);
const pdfData = doc.output();

assert(pdfData.includes("/AF ["), "PDF muss /AF Katalogeintrag haben");
assert(pdfData.includes("/Names << /EmbeddedFiles << /Names [ (factur-x.xml)"), "PDF muss EmbeddedFiles Names dict haben");
assert(pdfData.includes("<zf:DocumentFileName>factur-x.xml</zf:DocumentFileName>"), "XMP muss DocumentFileName factur-x.xml haben");
assert(pdfData.includes("<zf:ConformanceLevel>EN 16931</zf:ConformanceLevel>"), "XMP ConformanceLevel muss EN 16931 sein");
assert(pdfData.includes("<pdfaid:part>3</pdfaid:part>"), "PDF/A-3 Kennung muss vorhanden sein");
assert(pdfData.includes("RE-2027-001"), "Eingebettetes XML muss im PDF enthalten sein");

// 5. E-Rechnungs-Import (Erkennung von CII und UBL)
const sampleCII = `<rsm:CrossIndustryInvoice>
  <rsm:ExchangedDocument><ram:ID>BELEG-4455</ram:ID><udt:DateTimeString>20261112</udt:DateTimeString></rsm:ExchangedDocument>
  <ram:SellerTradeParty><ram:Name>Adobe Systems Software</ram:Name></ram:SellerTradeParty>
  <ram:ApplicableTradeTax><ram:RateApplicablePercent>19.00</ram:RateApplicablePercent></ram:ApplicableTradeTax>
  <ram:DuePayableAmount>71.39</ram:DuePayableAmount>
</rsm:CrossIndustryInvoice>`;
const parsedCII = parseEInvoiceXml(sampleCII);
assert.deepStrictEqual(parsedCII, {
  party: "Adobe Systems Software",
  date: "2026-11-12",
  ref: "BELEG-4455",
  gross: 71.39,
  vatRate: 19,
  format: "ZUGFeRD/CII"
});

const sampleUBL = `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>XR-98765</cbc:ID>
  <cbc:IssueDate>2026-10-05</cbc:IssueDate>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Strato AG</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:TaxTotal><cac:TaxSubtotal><cac:TaxCategory><cbc:Percent>19.00</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:PayableAmount>24.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
</Invoice>`;
const parsedUBL = parseEInvoiceXml(sampleUBL);
assert.deepStrictEqual(parsedUBL, {
  party: "Strato AG",
  date: "2026-10-05",
  ref: "XR-98765",
  gross: 24.0,
  vatRate: 19,
  format: "XRechnung/UBL"
});

// 6. Extraktion aus generiertem ZUGFeRD-PDF
const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
extractEInvoiceFromPdf(pdfBuffer).then(extracted => {
  assert(extracted, "E-Rechnung muss aus PDF extrahierbar sein");
  assert.strictEqual(extracted.party, "Creative Schmitti");
  assert.strictEqual(extracted.date, "2027-01-15");
  assert.strictEqual(extracted.ref, "RE-2027-001");
  assert.strictEqual(extracted.gross, 650.0);
  console.log("ALLE ZUGFeRD & E-RECHNUNGS-TESTS ERFOLGREICH BESTANDEN! (OK)");
});
