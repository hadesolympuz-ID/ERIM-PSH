const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCustomerCode, sanitizeFilePart } = require("../desktop/lib/google-workspace-service.cjs");

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
