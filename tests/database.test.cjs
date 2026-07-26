const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { LocalDatabase } = require("../desktop/lib/database.cjs");
const { SyncService } = require("../desktop/lib/sync-service.cjs");

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
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
