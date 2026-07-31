const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  GoogleWorkspaceService,
  parseCustomerCode,
  sanitizeFilePart,
} = require("../desktop/lib/google-workspace-service.cjs");

test("keeps office Customer Code for Gmail and creates a Windows-safe file code", () => {
  assert.deepEqual(parseCustomerCode("nd/pshbali9152"), {
    customerCode: "ND/PSHBALI9152",
    salesCode: "ND",
    fileCode: "PSHBALI9152",
    fileNameCode: "ND-PSHBALI9152",
  });
  assert.deepEqual(parseCustomerCode("GA/PSHBALI8899"), {
    customerCode: "GA/PSHBALI8899",
    salesCode: "GA",
    fileCode: "PSHBALI8899",
    fileNameCode: "GA-PSHBALI8899",
  });
});

test("sanitizes every Windows-forbidden filename character", () => {
  assert.equal(
    sanitizeFilePart('ND/PSH:BALI*9152? "Family" <July>|Final'),
    "ND-PSH-BALI-9152- -Family- -July-Final",
  );
});

test("rejects itinerary upload when the official Drive folder is not configured", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "erim-psh-drive-"));
  const itineraryPath = path.join(directory, "itinerary.docx");
  fs.writeFileSync(itineraryPath, "dummy itinerary");
  const service = new GoogleWorkspaceService({
    database: {
      getPublicSettings: () => ({ driveFolderId: "" }),
    },
    authService: null,
    chooseFile: async () => itineraryPath,
  });
  try {
    await assert.rejects(
      () => service.selectAndUploadItinerary({
        customerCode: "AK/PSHBALI4804",
        customerName: "MUKESH THAKKAR",
      }),
      /official Itinerary Drive Folder ID/i,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("downloads the latest itinerary into the managed folder and records an append-only event", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "erim-psh-download-"));
  const events = [];
  const service = new GoogleWorkspaceService({
    database: {
      getPublicSettings: () => ({ employeeId: "EMP-RES-001" }),
    },
    authService: null,
    chooseFile: async () => null,
    downloadDirectory: directory,
  });
  service.authorizedRawFetch = async () => ({
    arrayBuffer: async () => Buffer.from("latest docx"),
  });
  service.recordItineraryEvent = async (event) => {
    events.push(event);
    return { ok: true };
  };

  try {
    const result = await service.downloadLatestItinerary({
      customerCode: "AK/PSHBALI4804",
      customerName: "Test Family",
      tourId: "TOUR-001",
      driveFileId: "DRIVE-001",
      driveFileName: "AK-PSHBALI4804 - Test Family.docx",
      currentRevision: 3,
    });
    assert.equal(fs.readFileSync(result.localPath, "utf8"), "latest docx");
    assert.match(result.fileName, /^AK-PSHBALI4804 - Test Family - REV 3 - \d{14}\.docx$/);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, "DOWNLOAD");
    assert.equal(events[0].revisionNumber, 3);
    assert.equal(events[0].customerCode, "AK/PSHBALI4804");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-checks Google Sheet master data and refreshes SQLite only when content changes", async () => {
  let syncState = null;
  let replaced = null;
  const database = {
    getPublicSettings: () => ({ spreadsheetId: "SHEET-TEST" }),
    getMasterDataSyncState: () => syncState,
    replaceMasterData: (input) => {
      replaced = input;
      syncState = {
        checksum: input.checksum,
        tocRows: input.toc.length,
        vendorRateRows: input.vendorRates.length,
      };
      return { toc: { total: input.toc.length }, vendorRates: { total: input.vendorRates.length } };
    },
  };
  const service = new GoogleWorkspaceService({
    database,
    authService: null,
    chooseFile: async () => null,
  });
  const records = {
    TOC_MASTER: [{
      toc_id: "TOC-1",
      toc_name: "Temple Entrance",
      adult_rate_idr: 100000,
      child_rate_idr: 50000,
      child_age: "3-11",
      notes: "",
      valid_to: "2026-12-16",
      source_sheet: "Entrance",
      source_row: 2,
      updated_at: "2026-07-27T00:00:00.000Z",
    }],
    VENDOR_RATE_MASTER: [{
      vendor_rate_id: "VR-1",
      service_name: "Dinner",
      vendor_name: "Vendor A",
      adult_rate_idr: 200000,
      child_rate_idr: 100000,
      notes: "",
      description: "",
      contract_validity: "",
      valid_to: "2026-12-16",
      source_sheet: "Plan Rates 2026",
      source_row: 2,
      updated_at: "2026-07-27T00:00:00.000Z",
    }],
    MASTER_DATA_STATE: [{
      master_key: "TOC_VENDOR_RATES",
      version: "TEST-V1",
      checksum: "",
      updated_at: "2026-07-27T00:00:00.000Z",
      transport_rate_rows: 0,
    }],
  };
  service.sheetRecords = async (sheetName) => records[sheetName];

  const first = await service.syncMasterDataCache();
  assert.equal(first.status, "SYNCED");
  assert.equal(first.tocRows, 1);
  assert.equal(first.vendorRateRows, 1);
  assert.equal(replaced.sourceVersion, "TEST-V1");
  assert.equal(replaced.toc[0].tocName, "Temple Entrance");
  assert.equal(replaced.vendorRates[0].vendorName, "Vendor A");

  replaced = null;
  const second = await service.syncMasterDataCache();
  assert.equal(second.status, "CURRENT");
  assert.equal(replaced, null);
});
