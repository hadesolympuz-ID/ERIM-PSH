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
const { GoogleWorkspaceService } = require("../desktop/lib/google-workspace-service.cjs");

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

test("groups only Vendor splits per supplier while excluding Additional and Transport", () => withDatabase((database) => {
  database.replaceSupplierMasterCache({
    sourceVersion: "VENDOR-BOOKING-TEST",
    supplierTypes: [
      { supplierTypeId: "ST-VENDOR", typeCode: "VENDOR", typeName: "Vendor", status: "ACTIVE", active: true },
      { supplierTypeId: "ST-ADDITIONAL", typeCode: "ADDITIONAL_SERVICE", typeName: "Additional Service", status: "ACTIVE", active: true },
      { supplierTypeId: "ST-TRANSPORT", typeCode: "TRANSPORT", typeName: "Transport", status: "ACTIVE", active: true },
    ],
    suppliers: [{
      supplierId: "SUP-VENDOR-1", supplierTypeId: "ST-VENDOR", typeCode: "VENDOR",
      supplierName: "Bali Activity", status: "ACTIVE", active: true,
    }],
    recipients: [{
      recipientId: "REC-VENDOR-1", supplierId: "SUP-VENDOR-1", recipientType: "WHATSAPP",
      channel: "WHATSAPP", address: "+62 812-0000-0000", status: "ACTIVE", active: true,
    }],
    sops: [{
      sopId: "SOP-VENDOR-1", supplierId: "SUP-VENDOR-1",
      bookingChannels: ["WHATSAPP"], bodyTemplate: "Booking {{customer_code}}",
      status: "ACTIVE", active: true,
    }],
    products: [], contracts: [], rates: [],
  });
  database.saveVendorIntakeDraft({
    customerCode: "TEST/VENDOR-BOOKING",
    customerName: "Vendor Booking Guest",
    adultPax: 2,
    arrivalDate: "2026-09-01",
    departureDate: "2026-09-03",
    days: [{
      dayNumber: 1, serviceDate: "2026-09-01", startTime: "09:00",
      splits: [
        {
          serviceType: "VENDOR", activityText: "Rafting", supplierId: "SUP-VENDOR-1",
          vendorName: "Bali Activity", rateStatus: "PENDING_RATE",
        },
        {
          serviceType: "TRANSPORT", activityText: "Full Day Car",
          vendorName: "Transport Partner", rateStatus: "RATE_READY", unitRateIdr: 700000,
        },
      ],
    }, {
      dayNumber: 2, serviceDate: "2026-09-02", startTime: "08:00",
      splits: [{
        serviceType: "VENDOR", activityText: "Cycling", supplierId: "SUP-VENDOR-1",
        vendorName: "Bali Activity", rateStatus: "RATE_READY", unitRateIdr: 250000,
      }, {
        serviceType: "ADDITIONAL_SERVICE", activityText: "Floating Breakfast",
        vendorName: "Villa Partner", priceSource: "MANUAL", unitRateIdr: 150000,
        manualPriceReason: "Dynamic hotel add-on", manualRateSource: "WhatsApp quote",
        rateStatus: "RATE_READY",
      }],
    }],
  });

  const queue = database.listVendorBookingQueue();
  assert.equal(queue.length, 1);
  const activity = queue.find((row) => row.supplierId === "SUP-VENDOR-1");
  assert.equal(activity.serviceCount, 2);
  assert.equal(activity.pendingRateCount, 1);
  assert.ok(queue.every((row) => row.services.every((service) => service.serviceType === "VENDOR")));

  const selectedServiceId = activity.services[0].serviceId;
  const preview = database.getVendorBookingPreview({
    packageKey: activity.packageKey, serviceIds: [selectedServiceId], actionType: "NEW",
  });
  assert.equal(preview.serviceCount, 1);
  assert.deepEqual(preview.selectedServiceIds, [selectedServiceId]);
  assert.equal(preview.channel, "WHATSAPP");
  assert.equal(preview.recipients[0].address, "+62 812-0000-0000");
  assert.match(preview.body, /TEST\/VENDOR-BOOKING/);

  const generated = database.saveVendorBookingPreview({
    packageKey: activity.packageKey, serviceIds: [selectedServiceId], actionType: "NEW",
  });
  assert.equal(generated.communicationStatus, "GENERATED");
  assert.equal(generated.rateStatus, "PENDING_RATE");
  assert.equal(generated.services.length, 1);
  const sent = database.recordVendorBookingExternalAction({
    bookingId: generated.bookingId, externalReference: "WA 09:15 confirmed delivered",
  });
  assert.equal(sent.communicationStatus, "SENT");
  const partialQueue = database.listVendorBookingQueue()
    .find((row) => row.packageKey === activity.packageKey);
  assert.equal(partialQueue.workflowStatus, "PARTIALLY_GENERATED");
  assert.equal(
    partialQueue.services.find((row) => row.serviceId === selectedServiceId).workflowStatus,
    "SENT",
  );
  assert.equal(
    partialQueue.services.find((row) => row.serviceId !== selectedServiceId).workflowStatus,
    "NOT_GENERATED",
  );

  const canceled = database.saveVendorBookingPreview({
    packageKey: activity.packageKey, actionType: "CANCEL",
    cancellationReason: "Guest canceled the tour",
  });
  assert.notEqual(canceled.bookingId, sent.bookingId);
  assert.equal(canceled.actionType, "CANCEL");
  const repeatedPreparation = database.saveVendorBookingPreview({
    packageKey: activity.packageKey, actionType: "CANCEL",
    cancellationReason: "Guest canceled the tour",
  });
  assert.equal(repeatedPreparation.bookingId, canceled.bookingId);
  assert.equal(database.listVendorBookings().length, 2);
}));

test("uses a stable send ledger, preserves pending sync, and builds the shared Vendor read model", () => withDatabase((database) => {
  database.replaceSupplierMasterCache({
    sourceVersion: "SAFE-SEND-TEST",
    supplierTypes: [
      { supplierTypeId: "ST-VENDOR", typeCode: "VENDOR", typeName: "Vendor", status: "ACTIVE", active: true },
      { supplierTypeId: "ST-TRANSPORT", typeCode: "TRANSPORT", typeName: "Transport", status: "ACTIVE", active: true },
    ],
    suppliers: [{
      supplierId: "SUP-EMAIL", supplierTypeId: "ST-VENDOR", typeCode: "VENDOR",
      supplierName: "Email Supplier", status: "ACTIVE", active: true,
    }],
    recipients: [{
      recipientId: "REC-EMAIL", supplierId: "SUP-EMAIL", recipientType: "TO",
      channel: "EMAIL", address: "booking@example.test", status: "ACTIVE", active: true,
    }],
    sops: [{
      sopId: "SOP-EMAIL", supplierId: "SUP-EMAIL", bookingChannels: ["EMAIL"],
      status: "ACTIVE", active: true,
    }],
    products: [], contacts: [], contracts: [], rates: [],
  });
  const intake = database.saveVendorIntakeDraft({
    customerCode: "TEST/SAFE-SEND",
    customerName: "Safe Send Guest",
    clientTag: "HONEYMOONERS",
    adultPax: 2,
    childPax: 1,
    arrivalDate: "2026-08-01",
    departureDate: "2026-08-02",
    sourceRevisionId: "REV-SAFE-1",
    days: [{
      dayNumber: 1,
      serviceDate: "2026-08-01",
      dayTitle: "Arrival and activity",
      startTime: "",
      splits: [{
        serviceType: "VENDOR", activityText: "Cooking Class",
        supplierId: "SUP-EMAIL", vendorName: "Email Supplier",
        rateStatus: "PENDING_RATE",
      }, {
        serviceType: "TRANSPORT", activityText: "Airport Transfer",
        vendorName: "Transport Partner", rateStatus: "RATE_READY", unitRateIdr: 350000,
      }],
    }],
  });
  const packageItem = database.listVendorBookingQueue()[0];
  const preview = database.getVendorBookingPreview({ packageKey: packageItem.packageKey });
  assert.equal(preview.templateVersion, "STANDARD_V1");
  assert.equal(preview.destinationReady, true);
  assert.match(preview.body, /Safe Send Guest/);
  assert.equal(
    preview.subject,
    "Booking TEST/SAFE-SEND - Safe Send Guest - HONEYMOONERS - Email Supplier",
  );
  const generated = database.saveVendorBookingPreview({ packageKey: packageItem.packageKey });
  const attempt = database.prepareVendorBookingSendAttempt({
    bookingId: generated.bookingId,
    actorEmail: "vendor@example.test",
  });
  assert.match(attempt.sendAttemptId, /^VSEND-/);
  assert.equal(attempt.snapshot.sourceRevisionId, "REV-SAFE-1");
  assert.throws(
    () => database.prepareVendorBookingSendAttempt({ bookingId: generated.bookingId }),
    /reconcile that attempt/i,
  );

  database.recordVendorSendGmailAccepted(attempt.sendAttemptId, {
    gmailMessageId: "MSG-SAFE-1",
    gmailThreadId: "THREAD-SAFE-1",
  });
  assert.equal(database.getVendorBooking(generated.bookingId).communicationStatus, "SENT_PENDING_SYNC");
  database.recordVendorSendSyncResult(attempt.sendAttemptId, {
    ok: false, error: new Error("Apps Script temporarily unavailable"),
  });
  assert.equal(database.getVendorBooking(generated.bookingId).communicationStatus, "SENT_PENDING_SYNC");
  assert.equal(database.listVendorPendingSendSync().length, 1);
  database.recordVendorSendSyncResult(attempt.sendAttemptId, {
    ok: true, officialEvidenceId: "COMM-SAFE-1",
  });
  assert.equal(database.getVendorBooking(generated.bookingId).communicationStatus, "SENT");
  assert.equal(database.listVendorPendingSendSync().length, 0);

  const itinerary = database.getVendorItineraryCheck(intake.customerCode);
  assert.equal(itinerary.readOnly, true);
  assert.equal(itinerary.days[0].services.length, 2);
  assert.equal(
    itinerary.days[0].services.find((service) => service.serviceType === "TRANSPORT").ownerDepartment,
    "TRANSPORT",
  );
  assert.equal(
    itinerary.days[0].services.find((service) => service.serviceType === "VENDOR").gmailThreadId,
    "THREAD-SAFE-1",
  );
  database.recordVendorReplyDetected({
    bookingId: generated.bookingId,
    gmailMessageId: "MSG-REPLY-1",
    receivedAt: "2026-07-29T10:00:00.000Z",
  });
  const model = database.getVendorOperationalModel();
  assert.equal(model.bookingRegister[0].communicationStatus, "SENT");
  assert.equal(model.dashboard.replied.length, 1);
  assert.equal(model.dashboard.replied[0].replyReviewStatus, "REVIEW_REQUIRED");
  assert.equal(model.workInbox[0].sourceRevisionId, "REV-SAFE-1");

  const resend = database.prepareVendorBookingSendAttempt({
    bookingId: generated.bookingId,
    actorEmail: "vendor@example.test",
    resendOfAttemptId: attempt.sendAttemptId,
    resendReason: "Original supplier mailbox unavailable",
    recipients: [{ recipientType: "TO", address: "alternate@example.test" }],
  });
  assert.equal(resend.resendOfAttemptId, attempt.sendAttemptId);
  assert.equal(resend.resendReason, "Original supplier mailbox unavailable");
  assert.equal(resend.snapshot.recipients[0].address, "alternate@example.test");
  database.recordVendorSendGmailAccepted(resend.sendAttemptId, {
    gmailMessageId: "MSG-SAFE-2",
    gmailThreadId: "THREAD-SAFE-2",
  });
  database.recordVendorSendSyncResult(resend.sendAttemptId, {
    ok: true, officialEvidenceId: "COMM-SAFE-2",
  });
  const attempts = database.listVendorSendAttempts(generated.bookingId);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].gmailThreadId, "THREAD-SAFE-2");
  assert.equal(database.getVendorBooking(generated.bookingId).communicationStatus, "SENT");
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

test("keeps published suppliers and products selectable when no valid rate exists", () => withDatabase((database) => {
  database.replaceSupplierMasterCache({
    sourceVersion: "NO-RATE-CATALOG",
    supplierTypes: [{
      supplierTypeId: "ST-TRANSPORT", typeCode: "TRANSPORT", typeName: "Transport",
      displayOrder: 30, status: "ACTIVE", active: true,
    }],
    suppliers: [{
      supplierId: "SUP-NO-RATE", supplierTypeId: "ST-TRANSPORT",
      typeCode: "TRANSPORT", supplierName: "No Rate Transport", status: "ACTIVE", active: true,
    }],
    products: [{
      productId: "PROD-NO-RATE", supplierId: "SUP-NO-RATE",
      productName: "Future Vehicle", status: "ACTIVE", active: true,
    }],
    contracts: [],
    rates: [],
  });

  const suggestions = database.getLocalVendorSuggestions("2026-08-01");
  assert.equal(suggestions.suppliers[0].supplierId, "SUP-NO-RATE");
  assert.equal(suggestions.products[0].productId, "PROD-NO-RATE");
  assert.equal(suggestions.rates.length, 0);
}));

test("tracks confirmed Supplier Publish Session percentage independently from failures", () => withDatabase((database) => {
  const session = database.createSupplierPublishSession([{
    draftId: "SUPPLIER-SUP-1",
    entityKind: "SUPPLIER",
    entityId: "SUP-1",
    typeCode: "TRANSPORT",
    stage: "SUPPLIER",
    itemLabel: "Supplier One",
  }, {
    draftId: "PRODUCT-PROD-1",
    entityKind: "PRODUCT",
    entityId: "PROD-1",
    typeCode: "TRANSPORT",
    stage: "PRODUCT",
    itemLabel: "Product One",
  }]);
  assert.equal(session.progressPercent, 0);

  const halfway = database.updateSupplierPublishSessionItem(
    session.sessionId, "SUPPLIER-SUP-1", "SYNCED",
  );
  assert.equal(halfway.confirmedItems, 1);
  assert.equal(halfway.progressPercent, 50);

  const finished = database.updateSupplierPublishSessionItem(
    session.sessionId,
    "PRODUCT-PROD-1",
    "FAILED",
    { errorCode: "TEST_FAILURE", errorMessage: "Readback missing." },
  );
  assert.equal(finished.status, "COMPLETED_WITH_ISSUES");
  assert.equal(finished.progressPercent, 50);
  assert.equal(finished.failedItems, 1);
  assert.equal(database.listSupplierPublishSessions()[0].sessionId, session.sessionId);
}));

test("publishes a selected Supplier chain in dependency stages with confirmed progress", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "erim-psh-publish-session-"));
  const database = new LocalDatabase(path.join(directory, "test.sqlite"));
  try {
    database.saveSettings({
      employeeId: "RATE-MAKER",
      employeeName: "Rate Maker",
      department: "VENDOR",
      environment: "DEV",
    });
    database.replaceSupplierMasterCache({
      supplierTypes: [{
        supplierTypeId: "ST-TRANSPORT", typeCode: "TRANSPORT", typeName: "Transport",
        status: "ACTIVE", active: true,
      }],
    });
    const supplier = database.saveSupplierMasterDraft("SUPPLIER", {
      supplierId: "SUP-STAGED", typeCode: "TRANSPORT",
      supplierName: "Staged Transport", status: "ACTIVE",
    }).draft;
    const product = database.saveSupplierMasterDraft("PRODUCT", {
      productId: "PROD-STAGED", supplierId: "SUP-STAGED",
      productName: "Staged Vehicle", status: "ACTIVE",
    }).draft;
    const contract = database.saveSupplierMasterDraft("CONTRACT", {
      contractId: "CTR-STAGED", supplierId: "SUP-STAGED", contractNumber: "CTR/TEST",
      validFrom: "2026-01-01", validTo: "2026-12-31",
      rates: [{
        contractRateId: "RATE-STAGED", productId: "PROD-STAGED",
        priceBasis: "PER_VEHICLE", amount: 500000,
      }],
    }).draft;
    const approval = database.requestSupplierRateApproval({
      draftId: contract.draftId,
      reason: "Publish tested transport rate",
      evidenceReference: "TEST-CONTRACT-CTR-STAGED",
      makerEmail: "maker@example.test",
    });
    database.saveSettings({
      employeeId: "RATE-CHECKER",
      employeeName: "Rate Checker",
      department: "MANAGER_ADMIN",
      environment: "DEV",
    });
    database.reviewSupplierRateApproval({
      approvalId: approval.approvalId,
      decision: "APPROVE",
      reason: "Test approval",
      reviewerEmail: "checker@example.test",
    });
    const progress = [];
    const calls = [];
    const service = new GoogleWorkspaceService({
      database,
      authService: { status: () => ({ connected: true }) },
      onSupplierPublishProgress: (session) => progress.push(session.progressPercent),
    });
    service.callAppsScript = async (route, payload) => {
      if (route === "supplier.master.list") return database.getSupplierMasterCatalog();
      calls.push(payload.changes.map((row) => row.entityKind));
      return {
        results: payload.changes.map((row) => ({
          draftId: row.draftId, entityId: row.entityId, status: "SYNCED",
        })),
        catalog: database.getSupplierMasterCatalog(),
      };
    };

    const result = await service.publishSupplierMasterDrafts({
      draftIds: [supplier.draftId, product.draftId, contract.draftId],
    });
    assert.deepEqual(calls, [["SUPPLIER"], ["PRODUCT"], ["CONTRACT"]]);
    assert.equal(result.session.status, "COMPLETED");
    assert.equal(result.session.progressPercent, 100);
    assert.equal(result.summary.synced, 3);
    assert.ok(progress.includes(0));
    assert.equal(progress.at(-1), 100);
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

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
      {
        productId: "PROD-ALPHARD", supplierId: "SUP-TRANSPORT-A",
        productCode: "ALPHARD-TRF", productName: "Toyota Alphard Transfer",
        status: "ACTIVE", active: true,
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

  const bulk = database.duplicateSupplierProduct({
    sourceProductIds: ["PROD-HIACE", "PROD-ALPHARD"],
    targetSupplierIds: ["SUP-TRANSPORT-B", "SUP-TRANSPORT-C"],
    includeContracts: false,
    includeRates: false,
  });
  assert.equal(bulk.created.length, 2);
  assert.equal(bulk.conflicts.length, 2);
  assert.equal(bulk.failed.length, 0);
  assert.deepEqual(
    new Set(bulk.created.map((row) => row.sourceProductId)),
    new Set(["PROD-ALPHARD"]),
  );
  assert.deepEqual(
    new Set(bulk.created.map((row) => row.supplierId)),
    new Set(["SUP-TRANSPORT-B", "SUP-TRANSPORT-C"]),
  );
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

test("stores manual PER_PAX rates by pax category and enforces fixed or whole quantities", () => withDatabase((database) => {
  const manualPax = {
    customerCode: "MANUAL/PAX",
    customerName: "Manual Pax Test",
    adultPax: 2,
    childPax: 1,
    infantPax: 1,
    days: [{
      dayNumber: 1,
      startTime: "09:00",
      splits: [{
        serviceType: "VENDOR",
        activityText: "Category rate service",
        vendorName: "Manual Supplier",
        priceBasis: "PER_PAX",
        quantity: 1,
        adultRateIdr: 200000,
        childRateIdr: 100000,
        infantRateIdr: 0,
        priceSource: "MANUAL",
        rateStatus: "RATE_READY",
        manualPriceReason: "Direct quotation",
        manualRateSource: "EMAIL",
      }],
    }],
  };
  const saved = database.saveVendorIntakeDraft(manualPax);
  assert.equal(saved.days[0].splits[0].adultRateIdr, 200000);
  assert.equal(saved.days[0].splits[0].childRateIdr, 100000);
  assert.equal(saved.days[0].splits[0].infantRateIdr, 0);
  assert.ok(database.db.prepare("PRAGMA table_info(vendor_service_splits)").all()
    .some((column) => column.name === "infant_rate_idr"));

  const missingInfant = structuredClone(manualPax);
  missingInfant.days[0].splits[0].infantRateIdr = null;
  assert.throws(() => database.saveVendorIntakeDraft(missingInfant), /manual PER_PAX rate is incomplete/i);

  const perService = structuredClone(manualPax);
  perService.customerCode = "MANUAL/PER-SERVICE";
  Object.assign(perService.days[0].splits[0], {
    priceBasis: "PER_SERVICE",
    quantity: 2,
    unitRateIdr: 500000,
  });
  assert.throws(() => database.saveVendorIntakeDraft(perService), /PER_SERVICE quantity is fixed at 1/i);

  const perItem = structuredClone(manualPax);
  perItem.customerCode = "MANUAL/PER-ITEM";
  Object.assign(perItem.days[0].splits[0], {
    priceBasis: "PER_ITEM",
    quantity: 1.5,
    unitRateIdr: 500000,
  });
  assert.throws(() => database.saveVendorIntakeDraft(perItem), /quantity must be a whole number/i);
}));
