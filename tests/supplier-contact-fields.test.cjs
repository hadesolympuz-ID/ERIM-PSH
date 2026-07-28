const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const renderer = fs.readFileSync(path.join(root, "desktop", "renderer", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "desktop", "renderer", "styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "desktop", "renderer", "index.html"), "utf8");
const appsScript = fs.readFileSync(path.join(root, "apps-script", "Code.gs"), "utf8");

function rendererPhoneHelpers() {
  const normalize = renderer.match(
    /function normalizeInternationalPhone\(value\) \{[\s\S]*?\n\}/,
  )[0];
  const validate = renderer.match(
    /function isValidInternationalPhone\(value\) \{[\s\S]*?\n\}/,
  )[0];
  const transport = renderer.match(
    /function supplierPhoneForTransport\(value\) \{[\s\S]*?\n\}/,
  )[0];
  return vm.runInNewContext(
    `${normalize}\n${validate}\n${transport}\n({ normalizeInternationalPhone, isValidInternationalPhone, supplierPhoneForTransport })`,
  );
}

test("international phone helper preserves formatted +62 numbers and adds a missing prefix", () => {
  const helpers = rendererPhoneHelpers();
  assert.equal(
    helpers.normalizeInternationalPhone("+62 812-3916-9392"),
    "+62 812-3916-9392",
  );
  assert.equal(helpers.normalizeInternationalPhone("62 812 3916 9392"), "+62 812 3916 9392");
  assert.equal(helpers.normalizeInternationalPhone("0062 812 3916"), "+62 812 3916");
  assert.equal(helpers.isValidInternationalPhone("+62 812-3916-9392"), true);
  assert.equal(helpers.isValidInternationalPhone("+#ERROR!"), false);
  assert.equal(helpers.supplierPhoneForTransport("+62 812-3916-9392"), "'+62 812-3916-9392");
});

test("supplier contact and recipient cards expose phone-friendly fields and responsive layout", () => {
  assert.match(renderer, /data-supplier-contact="whatsapp" type="tel" inputmode="tel"/);
  assert.match(renderer, /data-supplier-recipient="address" inputmode=/);
  assert.match(renderer, /supplier-repeatable-heading/);
  assert.match(styles, /container-type:\s*inline-size/);
  assert.match(styles, /@container \(max-width: 390px\)/);
});

test("Apps Script stores formula-like text safely and repairs existing phone formula cells", () => {
  assert.match(appsScript, /function safeSheetValue_\(value\)/);
  assert.match(appsScript, /\^\[=\+\\-@\]/);
  assert.match(appsScript, /repairSupplierTextFields_\(\)/);
  assert.match(appsScript, /SUPPLIER_CONTACTS: \["phone", "whatsapp"\]/);
  assert.match(appsScript, /safeSheetValue_\(fieldValue\)/);
  assert.match(appsScript, /normalizeSupplierPhone_\(row\.whatsapp, "WhatsApp"\)/);
});

test("Supplier Master exposes local staging, batch publish, and protected maintenance controls", () => {
  assert.match(html, /id="review-supplier-drafts"/);
  assert.match(html, /id="publish-supplier-drafts"/);
  assert.match(html, /Save supplier locally/);
  assert.match(html, /System Maintenance/);
  assert.match(html, /Type <strong>INITIALIZE<\/strong> to unlock/);
  assert.match(renderer, /publishSupplierDrafts/);
  assert.match(appsScript, /supplier\.master\.batch\.publish/);
  assert.match(appsScript, /assertSupplierMasterBaseVersion_/);
});

test("Supplier Import Export exposes one-type selection and responsive non-overlapping panels", () => {
  assert.match(html, /data-manager-action="supplier-excel"/);
  assert.match(html, /id="supplier-excel-view"/);
  assert.match(html, /Save valid data locally/);
  assert.match(html, /Select all filtered/);
  assert.match(html, /Hotel will use a separate submenu/);
  assert.match(renderer, /supplierExcelInitialTypes/);
  assert.match(renderer, /window\.erim\.supplierExcel\.analyzeImport/);
  assert.match(renderer, /window\.erim\.supplierExcel\.stageImport/);
  assert.match(styles, /\.supplier-excel-layout\s*\{[\s\S]*minmax\(0,1fr\)/);
  assert.match(styles, /@media \(max-width: 1180px\)[\s\S]*\.supplier-excel-layout\s*\{\s*grid-template-columns:\s*1fr/);
});

test("Supplier archive uses an in-app reason dialog instead of unsupported window.prompt", () => {
  assert.match(html, /id="supplier-archive-dialog"/);
  assert.match(html, /id="supplier-archive-reason"/);
  assert.match(html, /Queue archive locally/);
  assert.match(renderer, /function submitSupplierArchive/);
  assert.match(renderer, /archiveImpactText/);
  assert.doesNotMatch(renderer, /window\.prompt/);
});
