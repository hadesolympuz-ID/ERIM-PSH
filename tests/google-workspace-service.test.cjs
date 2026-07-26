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
