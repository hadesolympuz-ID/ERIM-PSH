const crypto = require("node:crypto");
const Database = require("better-sqlite3");

const MODULES = [
  "RESERVATION",
  "VENDOR",
  "TRANSPORT",
  "OPS_ACCOUNTING",
  "GENERAL_CASHIER",
  "MANAGER_ADMIN",
];

class LocalDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
    this.seedDefaults();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_drafts (
        draft_id TEXT PRIMARY KEY,
        official_entity_id TEXT,
        tour_id TEXT,
        customer_code TEXT NOT NULL,
        module TEXT NOT NULL CHECK(module IN (${MODULES.map((x) => `'${x}'`).join(",")})),
        work_type TEXT NOT NULL,
        title TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        local_status TEXT NOT NULL,
        owner_employee_id TEXT NOT NULL,
        base_publication_id TEXT,
        base_record_version INTEGER,
        local_revision INTEGER NOT NULL DEFAULT 1,
        idempotency_key TEXT NOT NULL UNIQUE,
        sync_status TEXT NOT NULL,
        cancel_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_local_drafts_code
        ON local_drafts(customer_code);
      CREATE INDEX IF NOT EXISTS idx_local_drafts_module_status
        ON local_drafts(module, local_status);

      CREATE TABLE IF NOT EXISTS local_source_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL,
        source_publication_id TEXT,
        source_record_version INTEGER,
        source_payload_json TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        pulled_at TEXT NOT NULL,
        FOREIGN KEY(draft_id) REFERENCES local_drafts(draft_id)
      );

      CREATE TABLE IF NOT EXISTS local_generated_files (
        local_file_id TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_hash TEXT,
        upload_status TEXT NOT NULL,
        official_drive_file_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(draft_id) REFERENCES local_drafts(draft_id)
      );

      CREATE TABLE IF NOT EXISTS local_sync_queue (
        sync_job_id TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        operation TEXT NOT NULL,
        request_json TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        last_attempt_at TEXT,
        last_error_code TEXT,
        last_error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(draft_id) REFERENCES local_drafts(draft_id)
      );

      CREATE INDEX IF NOT EXISTS idx_sync_queue_status
        ON local_sync_queue(status, next_attempt_at);

      CREATE TABLE IF NOT EXISTS local_sync_results (
        sync_result_id TEXT PRIMARY KEY,
        sync_job_id TEXT NOT NULL,
        publication_id TEXT,
        official_entity_id TEXT,
        published_record_version INTEGER,
        response_json TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        FOREIGN KEY(sync_job_id) REFERENCES local_sync_queue(sync_job_id)
      );

      CREATE TABLE IF NOT EXISTS local_activity_log (
        activity_id TEXT PRIMARY KEY,
        event_at TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details_json TEXT NOT NULL
      );
    `);
  }

  seedDefaults() {
    const defaults = {
      employee_id: "DEV-USER",
      employee_name: "Development User",
      department: "RESERVATION",
      api_base_url: "",
      spreadsheet_id: "",
      drive_folder_id: "",
      environment: "DEV",
    };
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO app_settings(setting_key, setting_value, updated_at)
      VALUES (?, ?, ?)
    `);
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      for (const [key, value] of Object.entries(defaults)) insert.run(key, value, now);
    });
    tx();
  }

  close() {
    this.db.close();
  }

  id(prefix) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  settings() {
    return Object.fromEntries(
      this.db.prepare("SELECT setting_key, setting_value FROM app_settings").all()
        .map((row) => [row.setting_key, row.setting_value]),
    );
  }

  getPublicSettings() {
    const values = this.settings();
    return {
      employeeId: values.employee_id,
      employeeName: values.employee_name,
      department: values.department,
      apiBaseUrl: values.api_base_url,
      googleClientId: values.google_client_id,
      googleClientSecret: values.google_client_secret,
      spreadsheetId: values.spreadsheet_id,
      driveFolderId: values.drive_folder_id,
      environment: values.environment,
    };
  }

  saveSettings(values) {
    const allowed = {
      employeeId: "employee_id",
      employeeName: "employee_name",
      department: "department",
      apiBaseUrl: "api_base_url",
      googleClientId: "google_client_id",
      googleClientSecret: "google_client_secret",
      spreadsheetId: "spreadsheet_id",
      driveFolderId: "drive_folder_id",
      environment: "environment",
    };
    if (values.department && !MODULES.includes(values.department)) {
      throw new Error("Unknown department.");
    }
    const statement = this.db.prepare(`
      INSERT INTO app_settings(setting_key, setting_value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_at = excluded.updated_at
    `);
    const now = this.now();
    this.db.transaction(() => {
      for (const [input, key] of Object.entries(allowed)) {
        if (values[input] !== undefined) statement.run(key, String(values[input]), now);
      }
    })();
    this.log("SETTINGS_UPDATED", "APP_SETTINGS", null, { keys: Object.keys(values) });
    return this.getPublicSettings();
  }

  getDashboard() {
    const counts = this.db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN local_status = 'LOCAL_DRAFT' THEN 1 ELSE 0 END) AS drafts,
        SUM(CASE WHEN local_status = 'READY_TO_POST' THEN 1 ELSE 0 END) AS ready,
        SUM(CASE WHEN sync_status IN ('PENDING_SYNC','CONFLICT','FAILED') THEN 1 ELSE 0 END) AS attention,
        SUM(CASE WHEN sync_status = 'SYNCED' THEN 1 ELSE 0 END) AS synced
      FROM local_drafts
      WHERE local_status != 'CANCELED'
    `).get();
    return Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value || 0)]));
  }

  listDrafts(filters = {}) {
    const where = [];
    const params = {};
    if (filters.module) {
      where.push("module = @module");
      params.module = filters.module;
    }
    if (filters.status) {
      where.push("local_status = @status");
      params.status = filters.status;
    }
    if (filters.search) {
      where.push("(customer_code LIKE @search OR title LIKE @search)");
      params.search = `%${filters.search}%`;
    }
    return this.db.prepare(`
      SELECT draft_id, official_entity_id, tour_id, customer_code, module,
        work_type, title, local_status, owner_employee_id, base_publication_id,
        base_record_version, local_revision, sync_status, created_at, updated_at
      FROM local_drafts
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY updated_at DESC
    `).all(params);
  }

  getDraft(id) {
    const row = this.db.prepare("SELECT * FROM local_drafts WHERE draft_id = ?").get(id);
    if (!row) return null;
    return { ...row, payload: JSON.parse(row.payload_json) };
  }

  saveDraft(input) {
    const settings = this.settings();
    const draftId = input.draftId || this.id("DRF");
    const existing = this.getDraft(draftId);
    if (existing && ["READY_TO_POST", "POSTING", "SYNCED"].includes(existing.local_status)) {
      throw new Error("Create a controlled revision instead of editing a posted draft.");
    }
    if (!input.customerCode?.trim() || !input.title?.trim()) {
      throw new Error("Customer Code and title are required.");
    }
    if (!MODULES.includes(input.module)) throw new Error("Unknown module.");
    const now = this.now();
    const payload = input.payload && typeof input.payload === "object" ? input.payload : {};

    this.db.prepare(`
      INSERT INTO local_drafts (
        draft_id, official_entity_id, tour_id, customer_code, module, work_type,
        title, payload_json, local_status, owner_employee_id,
        base_publication_id, base_record_version, local_revision,
        idempotency_key, sync_status, created_at, updated_at
      ) VALUES (
        @draftId, @officialEntityId, @tourId, @customerCode, @module, @workType,
        @title, @payloadJson, 'LOCAL_DRAFT', @ownerEmployeeId,
        @basePublicationId, @baseRecordVersion, @localRevision,
        @idempotencyKey, 'LOCAL_ONLY', @createdAt, @updatedAt
      )
      ON CONFLICT(draft_id) DO UPDATE SET
        customer_code = excluded.customer_code,
        module = excluded.module,
        work_type = excluded.work_type,
        title = excluded.title,
        payload_json = excluded.payload_json,
        owner_employee_id = excluded.owner_employee_id,
        base_publication_id = excluded.base_publication_id,
        base_record_version = excluded.base_record_version,
        local_revision = local_drafts.local_revision + 1,
        updated_at = excluded.updated_at
    `).run({
      draftId,
      officialEntityId: input.officialEntityId || null,
      tourId: input.tourId || null,
      customerCode: input.customerCode.trim().toUpperCase(),
      module: input.module,
      workType: input.workType || "GENERAL",
      title: input.title.trim(),
      payloadJson: JSON.stringify(payload),
      ownerEmployeeId: settings.employee_id || "UNKNOWN",
      basePublicationId: input.basePublicationId || null,
      baseRecordVersion: Number.isInteger(input.baseRecordVersion) ? input.baseRecordVersion : null,
      localRevision: existing?.local_revision || 1,
      idempotencyKey: existing?.idempotency_key || crypto.randomUUID(),
      createdAt: existing?.created_at || now,
      updatedAt: now,
    });
    this.log(existing ? "DRAFT_UPDATED" : "DRAFT_CREATED", "LOCAL_DRAFT", draftId, {
      module: input.module,
      customerCode: input.customerCode,
    });
    return this.getDraft(draftId);
  }

  markReady(id) {
    const draft = this.getDraft(id);
    if (!draft) throw new Error("Draft not found.");
    const payload = draft.payload || {};
    if (!draft.customer_code || !draft.title || Object.keys(payload).length === 0) {
      throw new Error("Complete Customer Code, title, and details before marking ready.");
    }
    this.db.prepare(`
      UPDATE local_drafts
      SET local_status = 'READY_TO_POST', sync_status = 'READY_TO_QUEUE', updated_at = ?
      WHERE draft_id = ?
    `).run(this.now(), id);
    this.log("DRAFT_MARKED_READY", "LOCAL_DRAFT", id, {});
    return this.getDraft(id);
  }

  cancelDraft(id, reason) {
    if (!String(reason || "").trim()) throw new Error("Cancellation reason is required.");
    this.db.prepare(`
      UPDATE local_drafts
      SET local_status = 'CANCELED', sync_status = 'CANCELED',
        cancel_reason = ?, updated_at = ?
      WHERE draft_id = ? AND sync_status != 'SYNCED'
    `).run(String(reason).trim(), this.now(), id);
    this.log("DRAFT_CANCELED", "LOCAL_DRAFT", id, { reason });
    return this.getDraft(id);
  }

  queueDraft(id) {
    const draft = this.getDraft(id);
    if (!draft) throw new Error("Draft not found.");
    if (draft.local_status !== "READY_TO_POST") throw new Error("Draft must be marked ready first.");
    const syncJobId = this.id("SYN");
    const now = this.now();
    const request = {
      action: "publication.publish",
      apiVersion: "v1",
      idempotencyKey: draft.idempotency_key,
      clientMode: "DESKTOP",
      draft: {
        draftId: draft.draft_id,
        officialEntityId: draft.official_entity_id,
        tourId: draft.tour_id,
        customerCode: draft.customer_code,
        department: draft.module,
        publicationType: draft.work_type,
        sourcePublicationId: draft.base_publication_id,
        sourceRecordVersion: draft.base_record_version,
        localRevision: draft.local_revision,
        payload: draft.payload,
      },
    };
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT OR IGNORE INTO local_sync_queue (
          sync_job_id, draft_id, idempotency_key, operation, request_json,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, 'PUBLICATION_PUBLISH', ?, 'PENDING_SYNC', ?, ?)
      `).run(syncJobId, id, draft.idempotency_key, JSON.stringify(request), now, now);
      this.db.prepare(`
        UPDATE local_drafts
        SET sync_status = 'PENDING_SYNC', updated_at = ?
        WHERE draft_id = ?
      `).run(now, id);
    })();
    this.log("SYNC_QUEUED", "LOCAL_DRAFT", id, { syncJobId });
    return this.listSyncQueue();
  }

  listSyncQueue() {
    return this.db.prepare(`
      SELECT q.*, d.customer_code, d.module, d.title
      FROM local_sync_queue q
      JOIN local_drafts d ON d.draft_id = q.draft_id
      ORDER BY q.created_at DESC
    `).all();
  }

  pendingSyncJobs() {
    return this.db.prepare(`
      SELECT * FROM local_sync_queue
      WHERE status IN ('PENDING_SYNC', 'FAILED')
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY created_at ASC
    `).all(this.now());
  }

  markSyncPosting(jobId) {
    this.db.prepare(`
      UPDATE local_sync_queue
      SET status = 'POSTING', attempts = attempts + 1,
        last_attempt_at = ?, updated_at = ?
      WHERE sync_job_id = ?
    `).run(this.now(), this.now(), jobId);
  }

  markSyncFailed(jobId, code, message) {
    const next = new Date(Date.now() + 60_000).toISOString();
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE local_sync_queue
        SET status = 'FAILED', next_attempt_at = ?, last_error_code = ?,
          last_error_message = ?, updated_at = ?
        WHERE sync_job_id = ?
      `).run(next, code, message, this.now(), jobId);
      this.db.prepare(`
        UPDATE local_drafts SET sync_status = 'FAILED', updated_at = ?
        WHERE draft_id = (SELECT draft_id FROM local_sync_queue WHERE sync_job_id = ?)
      `).run(this.now(), jobId);
    })();
  }

  markSyncConflict(jobId, response) {
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE local_sync_queue
        SET status = 'CONFLICT', last_error_code = 'VERSION_CONFLICT',
          last_error_message = ?, updated_at = ?
        WHERE sync_job_id = ?
      `).run(response.message || "Published version changed.", this.now(), jobId);
      this.db.prepare(`
        UPDATE local_drafts SET sync_status = 'CONFLICT', updated_at = ?
        WHERE draft_id = (SELECT draft_id FROM local_sync_queue WHERE sync_job_id = ?)
      `).run(this.now(), jobId);
    })();
  }

  markSyncComplete(jobId, response) {
    const now = this.now();
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE local_sync_queue
        SET status = 'SYNCED', last_error_code = NULL, last_error_message = NULL,
          updated_at = ?
        WHERE sync_job_id = ?
      `).run(now, jobId);
      this.db.prepare(`
        UPDATE local_drafts
        SET local_status = 'SYNCED', sync_status = 'SYNCED',
          official_entity_id = ?, updated_at = ?
        WHERE draft_id = (SELECT draft_id FROM local_sync_queue WHERE sync_job_id = ?)
      `).run(response.officialEntityId || null, now, jobId);
      this.db.prepare(`
        INSERT INTO local_sync_results (
          sync_result_id, sync_job_id, publication_id, official_entity_id,
          published_record_version, response_json, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        this.id("RES"),
        jobId,
        response.publicationId || null,
        response.officialEntityId || null,
        response.publishedRecordVersion || null,
        JSON.stringify(response),
        now,
      );
    })();
  }

  log(action, entityType, entityId, details) {
    this.db.prepare(`
      INSERT INTO local_activity_log (
        activity_id, event_at, action, entity_type, entity_id, details_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(this.id("ACT"), this.now(), action, entityType, entityId, JSON.stringify(details || {}));
  }
}

module.exports = { LocalDatabase, MODULES };
