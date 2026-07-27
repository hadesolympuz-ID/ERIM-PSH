const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
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
  assert.match(saved.hotels[0].hotelStayId, /^HST-/);
  assert.match(saved.days[0].tourDayId, /^TDAY-/);
  assert.match(saved.days[0].splits[0].serviceId, /^SVC-/);

  const updated = database.saveVendorIntakeDraft({
    ...saved,
    customerName: "MUKESH THAKKAR UPDATED",
    hotels: saved.hotels.slice(0, 2),
    days: [{
      ...saved.days[0],
      daywiseText: "Updated arrival.",
      splits: saved.days[0].splits.slice(0, 1),
    }],
  });
  assert.equal(updated.vendorDraftId, saved.vendorDraftId);
  assert.equal(updated.hotels.length, 2);
  assert.equal(updated.days[0].daywiseText, "Updated arrival.");
  assert.equal(updated.days[0].splits.length, 1);
  assert.equal(database.listVendorIntakeDrafts().length, 1);
}));

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
}));
