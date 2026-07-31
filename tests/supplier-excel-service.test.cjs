const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const { LocalDatabase } = require("../desktop/lib/database.cjs");
const { SupplierExcelService, WORKBOOK_SHEETS } = require("../desktop/lib/supplier-excel-service.cjs");

async function withService(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "erim-psh-excel-"));
  const workbookPath = path.join(directory, "import.xlsx");
  const database = new LocalDatabase(path.join(directory, "test.sqlite"));
  database.replaceSupplierMasterCache({
    supplierTypes: [{
      supplierTypeId: "STYPE-VENDOR", typeCode: "VENDOR", typeName: "Vendor",
      status: "ACTIVE", active: true, recordVersion: 1,
    }],
  });
  const service = new SupplierExcelService({
    database,
    templatePath: workbookPath,
    chooseFile: async () => workbookPath,
    saveFile: async ({ defaultPath }) => path.join(directory, defaultPath),
  });
  try {
    await run({ database, directory, service, workbookPath });
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function writeWorkbook(filePath, rows = {}, mutate) {
  const workbook = new ExcelJS.Workbook();
  for (const [sheetName, headers] of Object.entries(WORKBOOK_SHEETS)) {
    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow(headers);
    for (const row of rows[sheetName] || []) {
      sheet.addRow(headers.map((header) => row[header] ?? ""));
    }
  }
  if (mutate) mutate(workbook);
  await workbook.xlsx.writeFile(filePath);
}

test("validates and stages a create-only Supplier workbook into the pending queue", async () => {
  await withService(async ({ database, service, workbookPath }) => {
    await writeWorkbook(workbookPath, {
      SUPPLIERS: [{
        type_code: "VENDOR", supplier_code: "VND-NEW", supplier_name: "New Bali Vendor",
        destinations: "Bali, Ubud", status: "ACTIVE",
      }],
      PRODUCTS: [{
        supplier_code: "VND-NEW", product_code: "GARLAND", product_name: "Garland",
        category: "Additional Service", status: "ACTIVE",
      }],
      CONTRACTS: [{
        supplier_code: "VND-NEW", contract_number: "RATE-2026",
        valid_from: "2026-01-01", valid_to: "2026-12-31", currency: "IDR",
      }],
      CONTRACT_RATES: [{
        supplier_code: "VND-NEW", contract_number: "RATE-2026",
        product_code: "GARLAND", price_basis: "PER_UNIT", amount: 150000,
        currency: "IDR", valid_from: "2026-01-01", valid_to: "2026-12-31",
      }],
    });

    const analyzed = await service.analyzeImport({ typeCode: "VENDOR" });
    assert.equal(analyzed.batch.summary.total, 4);
    assert.equal(analyzed.batch.summary.ready, 4);
    assert.equal(analyzed.batch.summary.conflicts, 0);
    assert.equal(analyzed.batch.summary.invalid, 0);

    const staged = service.stageImport(analyzed.batch.batchId);
    assert.equal(staged.batch.status, "LOCAL_PENDING");
    assert.equal(staged.batch.summary.staged, 3);
    assert.equal(database.listSupplierMasterDrafts().length, 3);
    assert.equal(staged.catalog.suppliers[0].supplierCode, "VND-NEW");
    assert.equal(staged.catalog.products[0].productCode, "GARLAND");
    assert.equal(staged.catalog.rates[0].amount, 150000);
  });
});

test("reports conflicts without overwriting an existing supplier", async () => {
  await withService(async ({ database, service, workbookPath }) => {
    database.replaceSupplierMasterCache({
      supplierTypes: [{
        supplierTypeId: "STYPE-VENDOR", typeCode: "VENDOR", typeName: "Vendor",
        status: "ACTIVE", active: true, recordVersion: 1,
      }],
      suppliers: [{
        supplierId: "SUP-EXISTING", typeCode: "VENDOR", supplierCode: "VND-001",
        supplierName: "Existing Vendor", status: "ACTIVE", active: true, recordVersion: 1,
      }],
    });
    await writeWorkbook(workbookPath, {
      SUPPLIERS: [{
        type_code: "VENDOR", supplier_code: "VND-001", supplier_name: "Overwrite Attempt",
      }],
    });
    const result = await service.analyzeImport({ typeCode: "VENDOR" });
    assert.equal(result.batch.summary.ready, 0);
    assert.equal(result.batch.summary.conflicts, 1);
    assert.equal(result.batch.analysis.issues[0].conflictCode, "DUPLICATE_SUPPLIER_CODE");
    assert.equal(database.getSupplierMasterCatalog().suppliers[0].supplierName, "Existing Vendor");
  });
});

test("rejects a workbook when a required header is missing", async () => {
  await withService(async ({ service, workbookPath }) => {
    await writeWorkbook(workbookPath, {}, (workbook) => {
      workbook.getWorksheet("SUPPLIERS").getCell("D1").value = "wrong_supplier_name";
    });
    await assert.rejects(
      () => service.analyzeImport({ typeCode: "VENDOR" }),
      /SUPPLIERS is missing header\(s\): supplier_name/,
    );
  });
});

test("new contracts without a valid rate are marked invalid", async () => {
  await withService(async ({ service, workbookPath }) => {
    await writeWorkbook(workbookPath, {
      SUPPLIERS: [{
        type_code: "VENDOR", supplier_code: "VND-NORATE", supplier_name: "No Rate Vendor",
      }],
      CONTRACTS: [{
        supplier_code: "VND-NORATE", contract_number: "RATE-EMPTY",
        valid_from: "2026-01-01", valid_to: "2026-12-31",
      }],
    });
    const result = await service.analyzeImport({ typeCode: "VENDOR" });
    assert.equal(result.batch.summary.ready, 1);
    assert.equal(result.batch.summary.invalid, 1);
    assert.equal(result.batch.analysis.issues[0].conflictCode, "MISSING_CONTRACT_RATE");
  });
});
