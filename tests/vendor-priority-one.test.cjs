const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { LocalDatabase } = require("../desktop/lib/database.cjs");
const { GoogleWorkspaceService } = require("../desktop/lib/google-workspace-service.cjs");

async function withDatabase(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "erim-vendor-p1-"));
  const database = new LocalDatabase(path.join(directory, "test.sqlite"));
  try {
    return await run(database);
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function seedVendorCatalog(database, { channel = "PORTAL" } = {}) {
  database.replaceSupplierMasterCache({
    sourceVersion: "VENDOR-P1",
    supplierTypes: [{
      supplierTypeId: "ST-VENDOR", typeCode: "VENDOR", typeName: "Vendor",
      status: "ACTIVE", active: true,
    }],
    suppliers: [{
      supplierId: "SUP-EKA", supplierTypeId: "ST-VENDOR", typeCode: "VENDOR",
      supplierName: "Eka Jaya Fastboat", status: "ACTIVE", active: true,
    }, {
      supplierId: "SUP-WIJAYA", supplierTypeId: "ST-VENDOR", typeCode: "VENDOR",
      supplierName: "Wijaya Perkasa", status: "ACTIVE", active: true,
    }],
    sops: [{
      sopId: "SOP-EKA", supplierId: "SUP-EKA", bookingChannels: [channel],
      portalUrl: "https://portal.example.test/eka",
      portalPaymentRule: "EKA_JAYA_15_DAY", status: "ACTIVE", active: true,
    }, {
      sopId: "SOP-WIJAYA", supplierId: "SUP-WIJAYA", bookingChannels: ["PORTAL"],
      portalUrl: "https://portal.example.test/wijaya", status: "ACTIVE", active: true,
    }],
    recipients: channel === "EMAIL" ? [{
      recipientId: "REC-EKA", supplierId: "SUP-EKA", recipientType: "TO",
      channel: "EMAIL", address: "booking@example.test", status: "ACTIVE", active: true,
    }] : [],
    products: [{
      productId: "PROD-EKA-OUT", supplierId: "SUP-EKA",
      productName: "Bali to Gili T", status: "ACTIVE", active: true,
    }, {
      productId: "PROD-EKA-RETURN", supplierId: "SUP-EKA",
      productName: "Gili T to Bali", status: "ACTIVE", active: true,
    }, {
      productId: "PROD-WIJAYA-OUT", supplierId: "SUP-WIJAYA",
      productName: "Bali to Gili T", status: "ACTIVE", active: true,
    }],
    contacts: [], contracts: [], rates: [],
  });
}

test("Portal preview groups only one stable supplier, sorts chronologically, and applies Eka Jaya boundary", () =>
  withDatabase((database) => {
    seedVendorCatalog(database);
    database.saveVendorIntakeDraft({
      customerCode: "ND/PORTAL-1",
      customerName: "Portal Guest",
      arrivalDate: "2026-08-10",
      departureDate: "2026-08-13",
      hotels: [{
        hotelName: "Gili Resort", checkInDate: "2026-08-10", checkOutDate: "2026-08-13",
      }],
      days: [{
        dayNumber: 4, serviceDate: "2026-08-12", dayTitle: "Return to Bali",
        startTime: "10:00", finishTime: "12:00",
        splits: [{
          serviceType: "VENDOR", supplierId: "SUP-EKA", productId: "PROD-EKA-RETURN",
          vendorName: "Eka Jaya Fastboat", activityText: "Return", rateStatus: "PENDING_RATE",
        }],
      }, {
        dayNumber: 3, serviceDate: "2026-08-10", dayTitle: "Fastboat to Gili",
        startTime: "08:00", finishTime: "10:00",
        splits: [{
          serviceType: "VENDOR", supplierId: "SUP-EKA", productId: "PROD-EKA-OUT",
          vendorName: "Eka Jaya Fastboat", activityText: "Outbound", rateStatus: "PENDING_RATE",
        }, {
          serviceType: "VENDOR", supplierId: "SUP-WIJAYA", productId: "PROD-WIJAYA-OUT",
          vendorName: "Wijaya Perkasa", activityText: "Different supplier", rateStatus: "PENDING_RATE",
        }],
      }],
    });
    const queue = database.listVendorBookingQueue();
    assert.equal(queue.length, 2);
    const eka = queue.find((item) => item.supplierId === "SUP-EKA");
    const preview = database.getVendorBookingPreview({
      packageKey: eka.packageKey,
      channel: "PORTAL",
      bookingDate: "2026-07-26",
    });
    assert.deepEqual(preview.services.map((service) => service.serviceDate), [
      "2026-08-10", "2026-08-12",
    ]);
    assert.equal(preview.portalTransaction.leadDays, 15);
    assert.equal(preview.portalTransaction.paymentInstruction, "USE DEPOSIT");
    assert.match(preview.body, /Header: Fastboat to Gili/);
    assert.match(preview.body, /Hotel: Gili Resort/);
    assert.match(preview.body, /Start: 08:00/);
    assert.equal(new Set(preview.portalTransaction.serviceIds).size, 2);

    const fourteenDays = database.getVendorBookingPreview({
      packageKey: eka.packageKey,
      channel: "PORTAL",
      bookingDate: "2026-07-27",
    });
    assert.equal(fourteenDays.portalTransaction.leadDays, 14);
    assert.equal(fourteenDays.portalTransaction.paymentInstruction, "USE DEPOSIT");

    const prepaid = database.getVendorBookingPreview({
      packageKey: eka.packageKey,
      channel: "PORTAL",
      bookingDate: "2026-07-25",
    });
    assert.equal(prepaid.portalTransaction.leadDays, 16);
    assert.equal(prepaid.portalTransaction.paymentInstruction, "USE PREPAID");
  }));

test("backend rejects an empty TO before inserting a Send Attempt", () =>
  withDatabase((database) => {
    seedVendorCatalog(database, { channel: "EMAIL" });
    database.saveVendorIntakeDraft({
      customerCode: "ND/EMAIL-TO",
      customerName: "Email Guest",
      arrivalDate: "2026-08-10",
      departureDate: "2026-08-10",
      days: [{
        dayNumber: 1, serviceDate: "2026-08-10",
        splits: [{
          serviceType: "VENDOR", supplierId: "SUP-EKA", productId: "PROD-EKA-OUT",
          vendorName: "Eka Jaya Fastboat", activityText: "Fastboat", rateStatus: "PENDING_RATE",
        }],
      }],
    });
    const packageItem = database.listVendorBookingQueue()
      .find((item) => item.supplierId === "SUP-EKA");
    const booking = database.saveVendorBookingPreview({
      packageKey: packageItem.packageKey,
      channel: "EMAIL",
    });
    assert.throws(() => database.prepareVendorBookingSendAttempt({
      bookingId: booking.bookingId,
      recipients: [],
    }), /TO email address/i);
    assert.equal(database.listVendorSendAttempts(booking.bookingId).length, 0);
    assert.equal(database.getVendorBooking(booking.bookingId).lastSendAttemptId, "");
  }));

test("Day 0 and manual Total Pax persist independently", () =>
  withDatabase((database) => {
    const saved = database.saveVendorIntakeDraft({
      customerCode: "ND/DAY-ZERO",
      customerName: "Midnight Arrival",
      totalPax: 4,
      adultPax: 2,
      childPax: 1,
      infantPax: 1,
      arrivalDate: "2026-08-10",
      departureDate: "2026-08-11",
      arrivalTime: "00:10",
      days: [{
        dayNumber: 0, serviceDate: "2026-08-09", dayTitle: "Pre-arrival transport",
        startTime: "23:59", splits: [],
      }, {
        dayNumber: 1, serviceDate: "2026-08-10", dayTitle: "Arrival", splits: [],
      }],
    });
    assert.equal(saved.totalPax, 4);
    assert.deepEqual(saved.days.map((day) => day.dayNumber), [0, 1]);
    assert.equal(saved.days[0].startTime, "23:59");
  }));

test("Cancel Generate returns only one service and rebuilds the remaining snapshot", () =>
  withDatabase((database) => {
    seedVendorCatalog(database, { channel: "EMAIL" });
    database.saveVendorIntakeDraft({
      customerCode: "ND/CANCEL-ONE",
      customerName: "Controlled Revision",
      arrivalDate: "2026-08-10",
      departureDate: "2026-08-11",
      days: [{
        dayNumber: 1, serviceDate: "2026-08-10",
        splits: [{
          serviceType: "VENDOR", supplierId: "SUP-EKA", productId: "PROD-EKA-OUT",
          vendorName: "Eka Jaya Fastboat", activityText: "Outbound", rateStatus: "PENDING_RATE",
        }],
      }, {
        dayNumber: 2, serviceDate: "2026-08-11",
        splits: [{
          serviceType: "VENDOR", supplierId: "SUP-EKA", productId: "PROD-EKA-RETURN",
          vendorName: "Eka Jaya Fastboat", activityText: "Return", rateStatus: "PENDING_RATE",
        }],
      }],
    });
    const packageItem = database.listVendorBookingQueue()[0];
    const booking = database.saveVendorBookingPreview({
      packageKey: packageItem.packageKey, channel: "EMAIL",
    });
    const [canceled, remaining] = booking.services;
    const beforeHash = booking.currentSnapshotHash;
    const result = database.cancelVendorGeneratedService({
      bookingId: booking.bookingId,
      serviceId: canceled.serviceId,
      reason: "Correct passenger detail",
    });
    assert.equal(result.remainingServiceCount, 1);
    assert.deepEqual(result.booking.services.map((service) => service.serviceId), [remaining.serviceId]);
    assert.notEqual(result.booking.currentSnapshotHash, beforeHash);
    const queue = database.listVendorBookingQueue()[0];
    assert.equal(queue.services.find((service) => service.serviceId === canceled.serviceId).workflowStatus, "NOT_GENERATED");
    assert.equal(queue.services.find((service) => service.serviceId === remaining.serviceId).workflowStatus, "GENERATED");
    const event = database.db.prepare(`
      SELECT event_type, reason FROM local_vendor_generation_events WHERE booking_id = ?
    `).get(booking.bookingId);
    assert.deepEqual(event, {
      event_type: "GENERATE_ITEM_CANCELED", reason: "Correct passenger detail",
    });
    const report = database.getVendorBookingDeliveryReport();
    assert.equal(report.length, 1);
    assert.equal(report[0].serviceId, remaining.serviceId);
    assert.equal(report[0].communicationStatus, "GENERATED");
  }));

test("Gmail preflight verifies the exact staff profile and reports central readiness separately", async () =>
  withDatabase(async (database) => {
    database.saveSettings({ apiBaseUrl: "https://api.example.test/exec" });
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (String(url).includes("gmail.googleapis.com")) {
        return new Response(JSON.stringify({ emailAddress: "staff@example.test" }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    };
    try {
      const service = new GoogleWorkspaceService({
        database,
        authService: {
          status: () => ({
            connected: true, email: "staff@example.test", expiresAt: Date.now() + 3_600_000,
          }),
          accessToken: async () => "test-token",
        },
      });
      const result = await service.vendorGmailPreflight({ checkCentral: true });
      assert.equal(result.state, "GMAIL_READY");
      assert.equal(result.ready, true);
      assert.equal(result.senderEmail, "staff@example.test");
      assert.equal(result.centralReady, true);
    } finally {
      global.fetch = originalFetch;
    }
  }));

test("local Contract Rate approval enforces maker-checker and resets when payload changes", () =>
  withDatabase((database) => {
    database.saveSettings({
      employeeId: "MAKER-1", employeeName: "Maker", department: "VENDOR", environment: "DEV",
    });
    const saved = database.saveSupplierMasterDraft("CONTRACT", {
      contractId: "CTR-LOCAL", supplierId: "SUP-EKA", contractNumber: "LOCAL/1",
      validFrom: "2026-01-01", validTo: "2026-12-31",
      rates: [{
        contractRateId: "RATE-LOCAL", productId: "PROD-EKA-OUT",
        priceBasis: "PER_SERVICE", amount: 500000,
      }],
    }).draft;
    const requested = database.requestSupplierRateApproval({
      draftId: saved.draftId,
      reason: "New supplier quote",
      evidenceReference: "EMAIL-THREAD-LOCAL-1",
    });
    database.saveSettings({
      employeeId: "CHECKER-1", employeeName: "Checker",
      department: "MANAGER_ADMIN", environment: "DEV",
    });
    const approved = database.reviewSupplierRateApproval({
      approvalId: requested.approvalId, decision: "APPROVE", reason: "Evidence checked",
    });
    assert.equal(approved.status, "APPROVED_TO_SYNC");

    database.saveSupplierMasterDraft("CONTRACT", {
      ...saved.payload,
      rates: saved.payload.rates.map((rate) => ({ ...rate, amount: 550000 })),
    });
    const changed = database.listSupplierMasterDrafts()
      .find((draft) => draft.draftId === saved.draftId);
    assert.equal(changed.rateApproval.status, "LOCAL_ONLY");
  }));
