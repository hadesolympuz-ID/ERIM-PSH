const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const SQLite = require("better-sqlite3");
const { LocalDatabase } = require("../desktop/lib/database.cjs");
const { SyncService } = require("../desktop/lib/sync-service.cjs");
const { BackendHealthService } = require("../desktop/lib/backend-health-service.cjs");
const { GoogleAuthService } = require("../desktop/lib/google-auth-service.cjs");

function withDatabase(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "erim-psh-"));
  const database = new LocalDatabase(path.join(directory, "test.sqlite"));
  try {
    return run(database);
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("migrates legacy Vehicle and Additional Services split types without losing drafts", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "erim-psh-legacy-split-"));
  const filePath = path.join(directory, "test.sqlite");
  const legacy = new SQLite(filePath);
  legacy.exec(`
    CREATE TABLE vendor_service_splits (
      service_id TEXT PRIMARY KEY,
      tour_day_id TEXT NOT NULL,
      split_sequence INTEGER NOT NULL,
      service_type TEXT NOT NULL CHECK(service_type IN ('VENDOR','TOC','VEHICLE','ADDITIONAL_SERVICES')),
      activity_text TEXT NOT NULL DEFAULT '',
      vendor_id TEXT,
      vendor_name TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT'
    );
    INSERT INTO vendor_service_splits VALUES
      ('SVC-VEHICLE', 'DAY-1', 1, 'VEHICLE', 'Transfer', '', 'Legacy Transport', 'DRAFT'),
      ('SVC-ADDITIONAL', 'DAY-1', 2, 'ADDITIONAL_SERVICES', 'Handling', '', '', 'DRAFT');
  `);
  legacy.close();
  const database = new LocalDatabase(filePath);
  try {
    const rows = database.db.prepare(`
      SELECT service_id, service_type, rate_status
      FROM vendor_service_splits ORDER BY split_sequence
    `).all();
    assert.deepEqual(rows, [
      { service_id: "SVC-VEHICLE", service_type: "TRANSPORT", rate_status: "PENDING_RATE" },
      { service_id: "SVC-ADDITIONAL", service_type: "ADDITIONAL_SERVICE", rate_status: "PENDING_RATE" },
    ]);
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("creates, updates, and marks a valid draft ready", () => withDatabase((database) => {
  const created = database.saveDraft({
    customerCode: "psh-0001",
    module: "RESERVATION",
    workType: "NEW_CONFIRMATION",
    title: "Initial itinerary",
    payload: { details: "Prepare and publish itinerary." },
  });
  assert.equal(created.customer_code, "PSH-0001");
  assert.equal(created.local_status, "LOCAL_DRAFT");

  const updated = database.saveDraft({
    draftId: created.draft_id,
    customerCode: "PSH-0001",
    module: "RESERVATION",
    workType: "NEW_CONFIRMATION",
    title: "Initial itinerary updated",
    payload: { details: "Complete itinerary details." },
  });
  assert.equal(updated.local_revision, 2);

  const ready = database.markReady(created.draft_id);
  assert.equal(ready.local_status, "READY_TO_POST");
  assert.equal(ready.sync_status, "READY_TO_QUEUE");
}));

test("queues only ready drafts and preserves one idempotency key", () => withDatabase((database) => {
  const draft = database.saveDraft({
    customerCode: "PSH-0002",
    module: "VENDOR",
    workType: "DAYWISE_BOOKING",
    title: "Supplier booking",
    payload: { details: "Prepare supplier booking." },
  });
  assert.throws(() => database.queueDraft(draft.draft_id), /marked ready/i);
  database.markReady(draft.draft_id);
  database.queueDraft(draft.draft_id);
  database.queueDraft(draft.draft_id);
  const queue = database.listSyncQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].idempotency_key, draft.idempotency_key);
}));

test("rejects editing a ready draft and requires a controlled revision", () => withDatabase((database) => {
  const draft = database.saveDraft({
    customerCode: "PSH-0003",
    module: "TRANSPORT",
    workType: "DRIVER_ASSIGNMENT",
    title: "Driver allocation",
    payload: { details: "Assign driver and vehicle." },
  });
  database.markReady(draft.draft_id);
  assert.throws(() => database.saveDraft({
    draftId: draft.draft_id,
    customerCode: draft.customer_code,
    module: draft.module,
    workType: draft.work_type,
    title: draft.title,
    payload: draft.payload,
  }), /controlled revision/i);
}));

test("publishes end-to-end in DEV dummy mode without Google auth", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "erim-psh-"));
  const database = new LocalDatabase(path.join(directory, "test.sqlite"));
  try {
    const draft = database.saveDraft({
      customerCode: "PSH-0004",
      module: "RESERVATION",
      workType: "NEW_CONFIRMATION",
      title: "Dummy publication",
      payload: { details: "Exercise the complete local publication flow." },
    });
    database.markReady(draft.draft_id);
    database.queueDraft(draft.draft_id);
    const result = await new SyncService(database, null).runPending();
    const published = database.getDraft(draft.draft_id);
    assert.equal(result.ok, true);
    assert.equal(result.mode, "LOCAL_DUMMY");
    assert.equal(published.local_status, "SYNCED");
    assert.match(published.official_entity_id, /^DEV-/);
    assert.equal(database.listSyncQueue()[0].status, "SYNCED");
    assert.equal(database.listSyncQueue()[0].sync_mode, "LOCAL_DUMMY");
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("ADMIN_DEV publishes through Apps Script instead of the local dummy engine", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "erim-psh-"));
  const database = new LocalDatabase(path.join(directory, "test.sqlite"));
  const originalFetch = global.fetch;
  try {
    database.saveSettings({
      environment: "ADMIN_DEV",
      apiBaseUrl: "https://script.google.com/macros/s/dev/exec",
    });
    const draft = database.saveDraft({
      customerCode: "AK/PSHBALI4804",
      module: "RESERVATION",
      workType: "NEW_CONFIRMATION",
      title: "Online publication",
      payload: { customerName: "MUKESH THAKKAR" },
    });
    database.markReady(draft.draft_id);
    database.queueDraft(draft.draft_id);
    let postedPayload;
    global.fetch = async (_url, options) => {
      postedPayload = JSON.parse(options.body);
      return {
        json: async () => ({
          ok: true,
          data: {
            publicationId: "PUB-ONLINE",
            officialEntityId: "TOUR-ONLINE",
            tourId: "TOUR-ONLINE",
            publishedRecordVersion: 1,
            publishedAt: new Date().toISOString(),
          },
        }),
      };
    };
    const authService = { accessToken: async () => "online-access-token" };
    const result = await new SyncService(database, authService).runPending();
    const queue = database.listSyncQueue();
    assert.equal(result.ok, true);
    assert.equal(result.results[0].data.mode, "ONLINE_APPS_SCRIPT");
    assert.equal(queue[0].status, "SYNCED");
    assert.equal(queue[0].sync_mode, "ONLINE_APPS_SCRIPT");
    assert.equal(postedPayload.draft.customerCode, "AK/PSHBALI4804");
    assert.equal(postedPayload.auth.accessToken, "online-access-token");
  } finally {
    global.fetch = originalFetch;
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("requeues legacy ADMIN_DEV publications completed by the dummy engine", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "erim-psh-"));
  const database = new LocalDatabase(path.join(directory, "test.sqlite"));
  try {
    const draft = database.saveDraft({
      customerCode: "AK/PSHBALI4804",
      module: "RESERVATION",
      workType: "NEW_CONFIRMATION",
      title: "Legacy dummy publication",
      payload: { customerName: "MUKESH THAKKAR" },
    });
    database.markReady(draft.draft_id);
    database.queueDraft(draft.draft_id);
    await new SyncService(database, null).runPending();
    database.saveSettings({ environment: "ADMIN_DEV" });

    assert.equal(database.requeueAdminDevDummyPublications(), 1);
    const queue = database.listSyncQueue();
    const requeuedDraft = database.getDraft(draft.draft_id);
    assert.equal(queue[0].status, "PENDING_SYNC");
    assert.equal(queue[0].sync_mode, null);
    assert.equal(requeuedDraft.local_status, "READY_TO_POST");
    assert.equal(requeuedDraft.sync_status, "PENDING_SYNC");
    assert.equal(requeuedDraft.official_entity_id, null);
    assert.equal(database.requeueAdminDevDummyPublications(), 0);
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("reports local database health and disables dummy publishing in ADMIN_DEV", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "erim-psh-"));
  const database = new LocalDatabase(path.join(directory, "test.sqlite"));
  try {
    database.saveSettings({ environment: "ADMIN_DEV" });
    const service = new BackendHealthService({
      database,
      authService: { status: () => ({ connected: false }) },
      appVersion: "1.0.0",
      isPackaged: false,
    });
    const local = await service.localDatabase();
    const dummy = await service.dummyPublisher(database.getPublicSettings());
    assert.equal(local.status, "HEALTHY");
    assert.equal(dummy.status, "UNAVAILABLE");
    assert.match(dummy.detail, /Apps Script/);
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("persists and reloads Google session through secure storage adapter", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "erim-psh-auth-"));
  const sessionFile = path.join(directory, "google-session.secure");
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value, "utf8"),
    decryptString: (value) => value.toString("utf8"),
  };
  try {
    const diagnosticFile = path.join(directory, "auth.log");
    const first = new GoogleAuthService({ database: null, openExternal: null, safeStorage, sessionFile, diagnosticFile });
    first.session = {
      accessToken: "dummy-access",
      refreshToken: "dummy-refresh",
      email: "dev@example.com",
      expiresAt: Date.now() + 60_000,
    };
    first.saveSession();
    const restored = new GoogleAuthService({ database: null, openExternal: null, safeStorage, sessionFile, diagnosticFile });
    assert.equal(restored.status().connected, true);
    assert.equal(restored.status().email, "dev@example.com");
    restored.logout();
    assert.equal(fs.existsSync(sessionFile), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("tracks Reservation follow-up aging, reason, and resolution", () => withDatabase((database) => {
  const followup = database.startReservationFollowup({
    customerCode: "psh-0100",
    sourceType: "NEW_ITINERARY",
    sourceReferenceId: "DRIVE-1",
  });
  assert.equal(followup.customer_code, "PSH-0100");
  assert.equal(followup.status, "PENDING");
  assert.throws(
    () => database.updateReservationFollowup(followup.followup_id, { pendingReason: "" }),
    /reason is required/i,
  );
  const updated = database.updateReservationFollowup(followup.followup_id, {
    pendingReason: "Waiting for Vendor Booking confirmation.",
    waitingForDepartment: "VENDOR",
  });
  assert.equal(updated.waiting_for_department, "VENDOR");
  assert.match(updated.pending_reason, /Vendor Booking/);
  assert.equal(database.listReservationFollowups().length, 1);
  const resolved = database.resolveReservationFollowup(followup.followup_id);
  assert.equal(resolved.status, "RESOLVED");
  assert.ok(resolved.resolved_at);
}));

test("persists Vendor intake with unlimited hotel rows, daywise text, and micro splits", () => withDatabase((database) => {
  const saved = database.saveVendorIntakeDraft({
    customerCode: "ak/pshbali4804",
    customerName: "MUKESH THAKKAR",
    adultPax: 4,
    childPax: 2,
    infantPax: 1,
    tourId: "TOUR-1",
    sourcePublicationId: "PUB-1",
    sourceRecordVersion: 3,
    driveFileId: "DRIVE-1",
    documentHtml: "<p>Itinerary</p>",
    arrivalDate: "2026-07-22",
    arrivalFlight: "MH853",
    arrivalTime: "18:30",
    departureDate: "2026-08-01",
    departureFlight: "MH850",
    departureTime: "16:25",
    hotels: Array.from({ length: 7 }, (_, index) => ({
      hotelName: `Hotel ${index + 1}`,
      checkInDate: "2026-07-22",
      checkOutDate: "2026-07-23",
    })),
    days: [{
      dayNumber: 1,
      serviceDate: "2026-07-22",
      dayTitle: "Arrival in Bali",
      startTime: "18:30",
      finishTime: "20:00",
      daywiseText: "Arrival and transfer to hotel.",
      splits: [
        { serviceType: "VEHICLE", activityText: "Airport transfer", vendorName: "Transport A" },
        { serviceType: "VENDOR", activityText: "Welcome dinner", vendorName: "Restaurant B" },
      ],
    }],
  });
  assert.equal(saved.customerCode, "AK/PSHBALI4804");
  assert.equal(saved.adultPax, 4);
  assert.equal(saved.childPax, 2);
  assert.equal(saved.infantPax, 1);
  assert.equal(saved.hotels.length, 7);
  assert.equal(saved.days[0].splits.length, 2);
  assert.equal(saved.days[0].dayTitle, "Arrival in Bali");
  assert.equal(saved.days[0].startTime, "18:30");
  assert.equal(saved.days[0].finishTime, "20:00");
  assert.match(saved.hotels[0].hotelStayId, /^HST-/);
  assert.match(saved.days[0].tourDayId, /^TDAY-/);
  assert.match(saved.days[0].splits[0].serviceId, /^SVC-/);
  assert.equal(saved.days[0].splits[0].serviceType, "TRANSPORT");

  const updated = database.saveVendorIntakeDraft({
    ...saved,
    customerName: "MUKESH THAKKAR UPDATED",
    hotels: saved.hotels.slice(0, 2),
    days: [{
      ...saved.days[0],
      dayTitle: "Arrival and Ubud transfer",
      startTime: "19:00",
      finishTime: "",
      daywiseText: "Updated arrival.",
      splits: saved.days[0].splits.slice(0, 1),
    }],
  });
  assert.equal(updated.vendorDraftId, saved.vendorDraftId);
  assert.equal(updated.hotels.length, 2);
  assert.equal(updated.days[0].daywiseText, "Updated arrival.");
  assert.equal(updated.days[0].dayTitle, "Arrival and Ubud transfer");
  assert.equal(updated.days[0].startTime, "19:00");
  assert.equal(updated.days[0].finishTime, "");
  assert.equal(updated.days[0].splits.length, 1);
  assert.equal(database.listVendorIntakeDrafts().length, 1);
}));

test("replaces the local TOC and Vendor cache from online master data", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "erim-psh-rates-"));
  const database = new LocalDatabase(path.join(directory, "test.sqlite"));
  try {
    database.replaceMasterData({
      sourceVersion: "TEST-RATES-V1",
      checksum: "test-checksum-v1",
      sourceUpdatedAt: "2026-07-27T00:00:00.000Z",
      transportRateRows: 0,
      toc: [{
      tocId: "TOC-TEST-1",
      tocName: "Test Temple Entrance",
      adultRateIdr: 100000,
      childRateIdr: 50000,
      childAge: "3-11",
      validTo: "2026-12-16",
      sourceSheet: "TEST",
      sourceRow: 2,
    }],
      vendorRates: [{
      vendorRateId: "VR-TEST-1",
      serviceName: "Test Dinner",
      vendorName: "Test Vendor",
      adultRateIdr: 200000,
      childRateIdr: 100000,
      validTo: "2026-12-16",
      sourceSheet: "TEST",
      sourceRow: 2,
    }],
    });
    const summary = database.getLocalMasterDataSummary();
    assert.equal(summary.toc.total, 1);
    assert.equal(summary.vendorRates.total, 1);
    assert.equal(summary.toc.latestValidTo, "2026-12-16");
    assert.equal(summary.vendorRates.latestValidTo, "2026-12-16");
    assert.equal(summary.transportRates.total, 0);
    assert.equal(summary.transportRates.status, "PENDING_SOURCE_DATA");
    assert.equal(database.getMasterDataSyncState().checksum, "test-checksum-v1");

    const active = database.getLocalVendorSuggestions("2026-12-16");
    assert.deepEqual(active.tocNames, ["Test Temple Entrance"]);
    assert.deepEqual(active.vendorNames, ["Additional", "Test Vendor"]);
    assert.deepEqual(active.vendorServices, ["Garland", "Test Dinner", "Water"]);
    assert.equal(active.transportRates.length, 2);
    assert.equal(active.luggageVanRates.length, 2);
    assert.ok(active.vendorRates.some((rate) =>
      rate.vendorName === "Additional" && rate.serviceName === "Garland"
    ));
    assert.ok(active.vendorRates.some((rate) =>
      rate.vendorName === "Additional" && rate.serviceName === "Water"
    ));
    assert.equal(active.validTo, "2026-12-16");

    const expired = database.getLocalVendorSuggestions("2026-12-17");
    assert.deepEqual(expired.tocNames, []);
    assert.deepEqual(expired.vendorNames, ["Additional"]);
    assert.deepEqual(expired.vendorServices, ["Garland", "Water"]);
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects invalid pax, duplicate day numbers, and unsupported Vendor split types", () => withDatabase((database) => {
  const base = {
    customerCode: "GA/PSHBALI1325",
    customerName: "GANESH BISWAL",
  };
  assert.throws(() => database.saveVendorIntakeDraft({
    ...base,
    adultPax: -1,
    days: [],
  }), /whole numbers starting from 0/i);
  assert.throws(() => database.saveVendorIntakeDraft({
    ...base,
    childPax: 1.5,
    days: [],
  }), /whole numbers starting from 0/i);
  assert.throws(() => database.saveVendorIntakeDraft({
    ...base,
    days: [{ dayNumber: 1, splits: [] }, { dayNumber: 1, splits: [] }],
  }), /unique positive day number/i);
  assert.throws(() => database.saveVendorIntakeDraft({
    ...base,
    days: [{ dayNumber: 1, splits: [{ serviceType: "EMAIL" }] }],
  }), /Split type/i);
  assert.throws(() => database.saveVendorIntakeDraft({
    ...base,
    days: [{ dayNumber: 1, startTime: "25:00", splits: [] }],
  }), /Start Time.*HH:MM/i);
}));

test("keeps Additional Service bookable while its manual rate is pending", () => withDatabase((database) => {
  const saved = database.saveVendorIntakeDraft({
    customerCode: "DEV/PENDING-RATE",
    customerName: "Pending Rate Test",
    days: [{
      dayNumber: 1,
      startTime: "09:00",
      splits: [{
        serviceType: "ADDITIONAL_SERVICE",
        activityText: "Special handling",
        vendorName: "",
        unitRateIdr: null,
        priceBasis: "PER_SERVICE",
        quantity: 1,
        rateStatus: "PENDING_RATE",
        status: "DRAFT",
      }],
    }],
  });
  const split = saved.days[0].splits[0];
  assert.equal(split.serviceType, "ADDITIONAL_SERVICE");
  assert.equal(split.rateStatus, "PENDING_RATE");
  assert.equal(split.unitRateIdr, null);
  assert.equal(split.status, "DRAFT");
}));

test("uses dynamic Supplier Types and only exposes contract rates valid on the service date", () => withDatabase((database) => {
  database.replaceSupplierMasterCache({
    sourceVersion: "SUPPLIER-MASTER-TEST",
    supplierTypes: [{
      supplierTypeId: "ST-RESTAURANT", typeCode: "RESTAURANT", typeName: "Restaurant",
      displayOrder: 60, status: "ACTIVE", active: true,
    }],
    suppliers: [{
      supplierId: "SUP-REST-1", supplierTypeId: "ST-RESTAURANT",
      typeCode: "RESTAURANT", supplierName: "Test Restaurant", status: "ACTIVE", active: true,
    }],
    products: [{
      productId: "PROD-DINNER", supplierId: "SUP-REST-1", productName: "Set Dinner",
      inclusion: "Dinner", exclusion: "Drinks", status: "ACTIVE", active: true,
    }],
    contracts: [{
      contractId: "CTR-2026", supplierId: "SUP-REST-1", contractNumber: "REST/2026",
      validFrom: "2026-01-01", validTo: "2026-12-31", currency: "IDR",
      status: "ACTIVE", active: true,
    }],
    rates: [{
      contractRateId: "RATE-DINNER", contractId: "CTR-2026", productId: "PROD-DINNER",
      priceBasis: "PER_PAX", amount: 250000, currency: "IDR", status: "ACTIVE", active: true,
    }],
  });

  const active = database.getSupplierSuggestions("2026-08-01");
  assert.equal(active.supplierTypes[0].typeCode, "RESTAURANT");
  assert.equal(active.rates[0].unitRateIdr, 250000);
  assert.equal(active.rates[0].inclusion, "Dinner");
  assert.equal(database.getSupplierSuggestions("2027-01-01").rates.length, 0);

  const saved = database.saveVendorIntakeDraft({
    customerCode: "DYNAMIC/TYPE",
    customerName: "Dynamic Type Test",
    days: [{
      dayNumber: 1,
      startTime: "09:00",
      splits: [{
        serviceType: "RESTAURANT",
        activityText: "Set Dinner",
        supplierId: "SUP-REST-1",
        productId: "PROD-DINNER",
        contractId: "CTR-2026",
        contractRateId: "RATE-DINNER",
        unitRateIdr: 250000,
        priceSource: "CONTRACT",
        rateStatus: "RATE_READY",
      }],
    }],
  });
  assert.equal(saved.days[0].splits[0].serviceType, "RESTAURANT");
}));

test("stages a complete Supplier Master chain locally before one batch publish", () => withDatabase((database) => {
  database.replaceSupplierMasterCache({
    supplierTypes: [{
      supplierTypeId: "STYPE-VENDOR", typeCode: "VENDOR", typeName: "Vendor",
      status: "ACTIVE", active: true, recordVersion: 1,
    }],
  });
  const supplier = database.saveSupplierMasterDraft("SUPPLIER", {
    typeCode: "VENDOR",
    supplierName: "Fast Local Supplier",
    contacts: [{ contactName: "Reservation", whatsapp: "+62 812-3916-9392" }],
    recipients: [{ recipientType: "TO", channel: "EMAIL", address: "res@example.com" }],
    sop: { bookingChannels: ["EMAIL", "WHATSAPP"] },
  });
  const supplierId = supplier.draft.entityId;
  const product = database.saveSupplierMasterDraft("PRODUCT", {
    supplierId,
    productName: "Full Day Tour",
    inclusion: "Guide",
  });
  const contract = database.saveSupplierMasterDraft("CONTRACT", {
    supplierId,
    contractNumber: "RATE/2026",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    rates: [{
      productId: product.draft.entityId,
      priceBasis: "PER_PAX",
      amount: 250000,
    }],
  });

  assert.equal(database.listSupplierMasterDrafts().length, 3);
  const catalog = contract.catalog;
  assert.equal(catalog.suppliers[0].supplierId, supplierId);
  assert.equal(catalog.contacts[0].whatsapp, "+62 812-3916-9392");
  assert.equal(catalog.products[0].supplierId, supplierId);
  assert.equal(catalog.rates[0].productId, product.draft.entityId);
  assert.equal(catalog.contracts[0].localDraftStatus, "READY_TO_PUBLISH");

  database.setSupplierMasterDraftStatus(supplier.draft.draftId, "SYNCED");
  assert.equal(database.listSupplierMasterDrafts().length, 2);
}));

test("duplicates a Product with matching contract rates to multiple same-Type suppliers", () => withDatabase((database) => {
  database.replaceSupplierMasterCache({
    supplierTypes: [{
      supplierTypeId: "STYPE-TRANSPORT", typeCode: "TRANSPORT", typeName: "Transport",
      status: "ACTIVE", active: true,
    }],
    suppliers: [
      {
        supplierId: "SUP-TRANSPORT-A", typeCode: "TRANSPORT", supplierCode: "TRANS-A",
        supplierName: "Transport A", status: "ACTIVE", active: true,
      },
      {
        supplierId: "SUP-TRANSPORT-B", typeCode: "TRANSPORT", supplierCode: "TRANS-B",
        supplierName: "Transport B", status: "ACTIVE", active: true,
      },
      {
        supplierId: "SUP-TRANSPORT-C", typeCode: "TRANSPORT", supplierCode: "TRANS-C",
        supplierName: "Transport C", status: "ACTIVE", active: true,
      },
    ],
    products: [
      {
        productId: "PROD-HIACE", supplierId: "SUP-TRANSPORT-A", productCode: "HIACE-FD",
        productName: "Toyota Hiace Full Day", inclusion: "Driver and fuel",
        status: "ACTIVE", active: true,
      },
      {
        productId: "PROD-HIACE-C", supplierId: "SUP-TRANSPORT-C",
        productName: "Toyota Hiace Full Day", status: "ACTIVE", active: true,
      },
    ],
    contracts: [{
      contractId: "CTR-TRANS-A-2026", supplierId: "SUP-TRANSPORT-A",
      contractNumber: "TRANS-A/2026", contractName: "Transport A 2026",
      validFrom: "2026-01-01", validTo: "2026-12-31", currency: "IDR",
      driveFileId: "SOURCE-DRIVE-FILE", driveFileName: "source.pdf",
      driveFileUrl: "https://drive.google.com/source", status: "ACTIVE", active: true,
    }],
    rates: [{
      contractRateId: "RATE-HIACE-A", contractId: "CTR-TRANS-A-2026",
      productId: "PROD-HIACE", priceBasis: "PER_VEHICLE", amount: 850000,
      currency: "IDR", status: "ACTIVE", active: true,
    }],
  });

  const result = database.duplicateSupplierProduct({
    sourceProductId: "PROD-HIACE",
    targetSupplierIds: ["SUP-TRANSPORT-B", "SUP-TRANSPORT-C"],
    includeContracts: true,
    includeRates: true,
  });

  assert.equal(result.created.length, 1);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].supplierId, "SUP-TRANSPORT-C");
  const copy = result.catalog.products.find((row) =>
    row.supplierId === "SUP-TRANSPORT-B" && row.productName === "Toyota Hiace Full Day"
  );
  assert.ok(copy);
  assert.notEqual(copy.productId, "PROD-HIACE");
  assert.equal(copy.productCode, "");
  assert.equal(copy.inclusion, "Driver and fuel");
  const contract = result.catalog.contracts.find((row) =>
    row.supplierId === "SUP-TRANSPORT-B" && row.duplicatedFromContractId === "CTR-TRANS-A-2026"
  );
  assert.ok(contract);
  assert.equal(contract.driveFileId, "");
  assert.equal(contract.driveFileUrl, "");
  const rate = result.catalog.rates.find((row) =>
    row.contractId === contract.contractId && row.productId === copy.productId
  );
  assert.ok(rate);
  assert.equal(rate.amount, 850000);
  assert.notEqual(rate.contractRateId, "RATE-HIACE-A");
  assert.equal(result.drafts.filter((row) => row.entityKind === "PRODUCT").length, 1);
  assert.equal(result.drafts.filter((row) => row.entityKind === "CONTRACT").length, 1);
}));

test("requires reason and source for booking-only manual rates", () => withDatabase((database) => {
  const base = {
    customerCode: "MANUAL/RATE",
    customerName: "Manual Rate Test",
    days: [{
      dayNumber: 1,
      startTime: "09:00",
      splits: [{
        serviceType: "VENDOR",
        activityText: "Manual service",
        vendorName: "Manual Supplier",
        unitRateIdr: 100000,
        priceSource: "MANUAL",
        rateStatus: "RATE_READY",
      }],
    }],
  };
  assert.throws(() => database.saveVendorIntakeDraft(base), /manual rate reason/i);
  base.days[0].splits[0].manualPriceReason = "Contract expired";
  assert.throws(() => database.saveVendorIntakeDraft(base), /manual rate source/i);
  base.days[0].splits[0].manualRateSource = "EMAIL";
  const saved = database.saveVendorIntakeDraft(base);
  assert.equal(saved.days[0].splits[0].manualPriceReason, "Contract expired");
  assert.equal(saved.days[0].splits[0].manualRateSource, "EMAIL");
}));
