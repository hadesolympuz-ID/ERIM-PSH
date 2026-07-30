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

const DEV_VENDOR_RATE_FIXTURES = [
  {
    serviceMasterId: "DEV-VR-ADDITIONAL-GARLAND",
    vendorName: "Additional",
    serviceName: "Garland",
    unitRateIdr: 50000,
    priceBasis: "PER_ITEM",
    validTo: "2099-12-31",
    priceSource: "DEV_DUMMY",
  },
  {
    serviceMasterId: "DEV-VR-ADDITIONAL-WATER",
    vendorName: "Additional",
    serviceName: "Water",
    unitRateIdr: 10000,
    priceBasis: "PER_BOTTLE",
    validTo: "2099-12-31",
    priceSource: "DEV_DUMMY",
  },
];

const DEV_TRANSPORT_RATE_FIXTURES = [
  {
    serviceMasterId: "DEV-TR-AIRPORT-TRANSFER",
    vendorName: "DEV Transport Partner",
    serviceName: "Airport Transfer",
    unitRateIdr: 350000,
    priceBasis: "PER_VEHICLE",
    validTo: "2099-12-31",
    priceSource: "DEV_DUMMY",
  },
  {
    serviceMasterId: "DEV-TR-FULL-DAY",
    vendorName: "DEV Transport Partner",
    serviceName: "Full Day Transport",
    unitRateIdr: 700000,
    priceBasis: "PER_VEHICLE",
    validTo: "2099-12-31",
    priceSource: "DEV_DUMMY",
  },
];

const DEV_LUGGAGE_VAN_RATE_FIXTURES = [
  {
    serviceMasterId: "DEV-LV-AIRPORT-HOTEL",
    vendorName: "DEV Luggage Van Partner",
    serviceName: "Airport - Hotel Luggage Van",
    unitRateIdr: 450000,
    priceBasis: "PER_VEHICLE",
    validTo: "2099-12-31",
    priceSource: "DEV_DUMMY",
  },
  {
    serviceMasterId: "DEV-LV-FULL-DAY",
    vendorName: "DEV Luggage Van Partner",
    serviceName: "Full Day Luggage Van",
    unitRateIdr: 800000,
    priceBasis: "PER_VEHICLE",
    validTo: "2099-12-31",
    priceSource: "DEV_DUMMY",
  },
];

function normalizeVendorSplitType(value) {
  const normalized = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "VEHICLE") return "TRANSPORT";
  if (normalized === "ADDITIONAL_SERVICES") return "ADDITIONAL_SERVICE";
  return normalized;
}

function operationalDateEpoch(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day) + Number(offsetDays || 0),
  );
}

function normalizedSortText(value) {
  return String(value || "").trim().toLocaleUpperCase("en");
}

function compareVendorServices(left, right, channel = "") {
  const portal = String(channel || "").toUpperCase() === "PORTAL";
  const fields = portal
    ? [
        [left.serviceDate || "9999-12-31", right.serviceDate || "9999-12-31"],
        [Number(left.dayNumber || 0), Number(right.dayNumber || 0)],
        [normalizedSortText(left.productName || left.activityText), normalizedSortText(right.productName || right.activityText)],
        [Number(left.splitSequence || 0), Number(right.splitSequence || 0)],
        [String(left.serviceId || ""), String(right.serviceId || "")],
      ]
    : [
        [Number(left.dayNumber || 0), Number(right.dayNumber || 0)],
        [left.serviceDate || "9999-12-31", right.serviceDate || "9999-12-31"],
        [Number(left.splitSequence || 0), Number(right.splitSequence || 0)],
        [normalizedSortText(left.productName || left.activityText), normalizedSortText(right.productName || right.activityText)],
        [String(left.serviceId || ""), String(right.serviceId || "")],
      ];
  for (const [a, b] of fields) {
    const result = typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b));
    if (result) return result;
  }
  return 0;
}

function calendarLeadDays(fromDate, toDate) {
  const start = Date.parse(`${String(fromDate || "")}T00:00:00Z`);
  const finish = Date.parse(`${String(toDate || "")}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(finish)) return null;
  return Math.floor((finish - start) / 86_400_000);
}

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
        sync_mode TEXT,
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

      CREATE TABLE IF NOT EXISTS reservation_followups (
        followup_id TEXT PRIMARY KEY,
        customer_code TEXT NOT NULL,
        tour_id TEXT,
        source_type TEXT NOT NULL,
        source_reference_id TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        pending_reason TEXT,
        waiting_for_department TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_reservation_followups_status_age
        ON reservation_followups(status, started_at);

      CREATE TABLE IF NOT EXISTS vendor_intake_drafts (
        vendor_draft_id TEXT PRIMARY KEY,
        customer_code TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL DEFAULT '',
        client_tag TEXT NOT NULL DEFAULT '',
        adult_pax INTEGER NOT NULL DEFAULT 0,
        child_pax INTEGER NOT NULL DEFAULT 0,
        infant_pax INTEGER NOT NULL DEFAULT 0,
        tour_id TEXT,
        source_publication_id TEXT,
        source_record_version INTEGER,
        source_revision_id TEXT,
        itinerary_drive_file_id TEXT,
        itinerary_drive_file_name TEXT,
        itinerary_drive_file_url TEXT,
        document_html TEXT NOT NULL DEFAULT '',
        arrival_date TEXT,
        arrival_flight TEXT,
        arrival_sector TEXT,
        arrival_time TEXT,
        departure_date TEXT,
        departure_flight TEXT,
        departure_sector TEXT,
        departure_time TEXT,
        extraction_status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
        local_status TEXT NOT NULL DEFAULT 'LOCAL_DRAFT',
        owner_employee_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vendor_hotel_drafts (
        hotel_stay_id TEXT PRIMARY KEY,
        vendor_draft_id TEXT NOT NULL,
        stay_sequence INTEGER NOT NULL,
        hotel_name TEXT NOT NULL DEFAULT '',
        check_in_date TEXT,
        check_out_date TEXT,
        FOREIGN KEY(vendor_draft_id) REFERENCES vendor_intake_drafts(vendor_draft_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_vendor_hotel_draft
        ON vendor_hotel_drafts(vendor_draft_id, stay_sequence);

      CREATE TABLE IF NOT EXISTS vendor_day_drafts (
        tour_day_id TEXT PRIMARY KEY,
        vendor_draft_id TEXT NOT NULL,
        day_number INTEGER NOT NULL,
        service_date TEXT,
        day_title TEXT NOT NULL DEFAULT '',
        start_time TEXT NOT NULL DEFAULT '',
        finish_time TEXT NOT NULL DEFAULT '',
        daywise_text TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        FOREIGN KEY(vendor_draft_id) REFERENCES vendor_intake_drafts(vendor_draft_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_vendor_day_draft
        ON vendor_day_drafts(vendor_draft_id, day_number);

      CREATE TABLE IF NOT EXISTS vendor_service_splits (
        service_id TEXT PRIMARY KEY,
        tour_day_id TEXT NOT NULL,
        split_sequence INTEGER NOT NULL,
        service_type TEXT NOT NULL,
        activity_text TEXT NOT NULL DEFAULT '',
        vendor_id TEXT,
        vendor_name TEXT,
        service_master_id TEXT,
        supplier_id TEXT,
        product_id TEXT,
        contract_id TEXT,
        contract_rate_id TEXT,
        price_source TEXT NOT NULL DEFAULT 'NONE',
        adult_rate_idr REAL,
        child_rate_idr REAL,
        infant_rate_idr REAL,
        unit_rate_idr REAL,
        price_basis TEXT NOT NULL DEFAULT 'PER_SERVICE',
        quantity REAL NOT NULL DEFAULT 1,
        currency TEXT NOT NULL DEFAULT 'IDR',
        rate_status TEXT NOT NULL DEFAULT 'PENDING_RATE' CHECK(rate_status IN ('RATE_READY','PENDING_RATE')),
        manual_price_reason TEXT NOT NULL DEFAULT '',
        manual_rate_source TEXT NOT NULL DEFAULT '',
        manual_evidence_ref TEXT NOT NULL DEFAULT '',
        rate_valid_to TEXT NOT NULL DEFAULT '',
        rate_snapshot_at TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        FOREIGN KEY(tour_day_id) REFERENCES vendor_day_drafts(tour_day_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_vendor_split_day
        ON vendor_service_splits(tour_day_id, split_sequence);

      CREATE TABLE IF NOT EXISTS local_vendor_bookings (
        booking_id TEXT PRIMARY KEY,
        package_key TEXT NOT NULL,
        customer_code TEXT NOT NULL,
        tour_id TEXT,
        supplier_id TEXT,
        supplier_name TEXT NOT NULL,
        supplier_type TEXT NOT NULL,
        action_type TEXT NOT NULL DEFAULT 'NEW',
        channel TEXT NOT NULL DEFAULT 'OTHERS',
        booking_status TEXT NOT NULL DEFAULT 'DRAFT',
        communication_status TEXT NOT NULL DEFAULT 'NOT_GENERATED',
        supplier_result TEXT NOT NULL DEFAULT 'PENDING',
        rate_status TEXT NOT NULL DEFAULT 'PENDING_RATE',
        subject TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        recipients_json TEXT NOT NULL DEFAULT '[]',
        source_revision_id TEXT,
        cancellation_reason TEXT NOT NULL DEFAULT '',
        external_reference TEXT NOT NULL DEFAULT '',
        external_evidence_json TEXT NOT NULL DEFAULT '{}',
        gmail_thread_id TEXT NOT NULL DEFAULT '',
        gmail_message_id TEXT NOT NULL DEFAULT '',
        official_sync_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
        last_send_attempt_id TEXT NOT NULL DEFAULT '',
        reply_review_status TEXT NOT NULL DEFAULT 'NONE',
        latest_inbound_message_id TEXT NOT NULL DEFAULT '',
        latest_inbound_at TEXT NOT NULL DEFAULT '',
        generated_at TEXT,
        sent_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_local_vendor_booking_package
        ON local_vendor_bookings(package_key, action_type, updated_at);
      CREATE INDEX IF NOT EXISTS idx_local_vendor_booking_status
        ON local_vendor_bookings(booking_status, communication_status, updated_at);

      CREATE TABLE IF NOT EXISTS local_vendor_booking_services (
        booking_service_id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        service_snapshot_json TEXT NOT NULL,
        service_status TEXT NOT NULL DEFAULT 'REQUIRED',
        created_at TEXT NOT NULL,
        FOREIGN KEY(booking_id) REFERENCES local_vendor_bookings(booking_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_local_vendor_booking_service_booking
        ON local_vendor_booking_services(booking_id, service_id);

      CREATE TABLE IF NOT EXISTS local_vendor_send_attempts (
        send_attempt_id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        resend_of_attempt_id TEXT NOT NULL DEFAULT '',
        resend_reason TEXT NOT NULL DEFAULT '',
        snapshot_json TEXT NOT NULL,
        snapshot_hash TEXT NOT NULL,
        actor_email TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        gmail_message_id TEXT NOT NULL DEFAULT '',
        gmail_thread_id TEXT NOT NULL DEFAULT '',
        official_evidence_id TEXT NOT NULL DEFAULT '',
        sync_attempts INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT NOT NULL DEFAULT '',
        last_error_message TEXT NOT NULL DEFAULT '',
        prepared_at TEXT NOT NULL,
        gmail_accepted_at TEXT,
        synced_at TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(booking_id) REFERENCES local_vendor_bookings(booking_id)
      );

      CREATE INDEX IF NOT EXISTS idx_vendor_send_attempt_booking
        ON local_vendor_send_attempts(booking_id, prepared_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_send_attempt_active
        ON local_vendor_send_attempts(booking_id)
        WHERE status IN ('PREPARED','SEND_OUTCOME_UNKNOWN','GMAIL_ACCEPTED','SENT_PENDING_SYNC');

      CREATE TABLE IF NOT EXISTS local_vendor_reply_evidence (
        gmail_message_id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        send_attempt_id TEXT NOT NULL DEFAULT '',
        gmail_thread_id TEXT NOT NULL,
        received_at TEXT NOT NULL,
        detected_at TEXT NOT NULL,
        FOREIGN KEY(booking_id) REFERENCES local_vendor_bookings(booking_id)
      );

      CREATE INDEX IF NOT EXISTS idx_vendor_reply_booking
        ON local_vendor_reply_evidence(booking_id, received_at);

      CREATE TABLE IF NOT EXISTS local_toc_master (
        toc_id TEXT PRIMARY KEY,
        toc_name TEXT NOT NULL,
        adult_rate_idr,
        child_rate_idr,
        child_age TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        valid_to TEXT NOT NULL,
        source_sheet TEXT NOT NULL DEFAULT '',
        source_row INTEGER,
        seed_version TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_local_toc_master_name
        ON local_toc_master(toc_name);
      CREATE INDEX IF NOT EXISTS idx_local_toc_master_validity
        ON local_toc_master(valid_to);

      CREATE TABLE IF NOT EXISTS local_vendor_rate_master (
        vendor_rate_id TEXT PRIMARY KEY,
        service_name TEXT NOT NULL,
        vendor_name TEXT NOT NULL DEFAULT '',
        adult_rate_idr,
        child_rate_idr,
        notes TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        contract_validity TEXT NOT NULL DEFAULT '',
        valid_to TEXT NOT NULL,
        source_sheet TEXT NOT NULL DEFAULT '',
        source_row INTEGER,
        seed_version TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_local_vendor_rate_service
        ON local_vendor_rate_master(service_name);
      CREATE INDEX IF NOT EXISTS idx_local_vendor_rate_vendor
        ON local_vendor_rate_master(vendor_name);
      CREATE INDEX IF NOT EXISTS idx_local_vendor_rate_validity
        ON local_vendor_rate_master(valid_to);

      CREATE TABLE IF NOT EXISTS master_data_sync_state (
        master_key TEXT PRIMARY KEY,
        source_version TEXT NOT NULL,
        checksum TEXT NOT NULL,
        source_updated_at TEXT,
        synced_at TEXT NOT NULL,
        toc_rows INTEGER NOT NULL DEFAULT 0,
        vendor_rate_rows INTEGER NOT NULL DEFAULT 0,
        transport_rate_rows INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_supplier_master_cache (
        entity_kind TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        parent_id TEXT,
        supplier_type_code TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        payload_json TEXT NOT NULL,
        source_version TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        PRIMARY KEY(entity_kind, entity_id)
      );

      CREATE INDEX IF NOT EXISTS idx_supplier_master_kind_parent
        ON local_supplier_master_cache(entity_kind, parent_id);
      CREATE INDEX IF NOT EXISTS idx_supplier_master_type_status
        ON local_supplier_master_cache(supplier_type_code, status);

      CREATE TABLE IF NOT EXISTS local_supplier_master_drafts (
        draft_id TEXT PRIMARY KEY,
        entity_kind TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        parent_id TEXT,
        payload_json TEXT NOT NULL,
        base_record_version INTEGER,
        local_status TEXT NOT NULL DEFAULT 'READY_TO_PUBLISH',
        last_error_code TEXT,
        last_error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced_at TEXT,
        UNIQUE(entity_kind, entity_id)
      );

      CREATE INDEX IF NOT EXISTS idx_supplier_master_drafts_status
        ON local_supplier_master_drafts(local_status, updated_at);

      CREATE TABLE IF NOT EXISTS local_supplier_rate_approvals (
        approval_id TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL UNIQUE,
        entity_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL DEFAULT '',
        snapshot_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'LOCAL_ONLY',
        maker_employee_id TEXT NOT NULL DEFAULT '',
        maker_email TEXT NOT NULL DEFAULT '',
        request_reason TEXT NOT NULL DEFAULT '',
        evidence_reference TEXT NOT NULL DEFAULT '',
        requested_at TEXT,
        reviewer_employee_id TEXT NOT NULL DEFAULT '',
        reviewer_email TEXT NOT NULL DEFAULT '',
        review_reason TEXT NOT NULL DEFAULT '',
        reviewed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(draft_id) REFERENCES local_supplier_master_drafts(draft_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_supplier_rate_approval_status
        ON local_supplier_rate_approvals(status, updated_at);

      CREATE TABLE IF NOT EXISTS local_supplier_publish_sessions (
        session_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        total_items INTEGER NOT NULL DEFAULT 0,
        confirmed_items INTEGER NOT NULL DEFAULT 0,
        failed_items INTEGER NOT NULL DEFAULT 0,
        conflict_items INTEGER NOT NULL DEFAULT 0,
        blocked_items INTEGER NOT NULL DEFAULT 0,
        progress_percent INTEGER NOT NULL DEFAULT 0,
        current_type_code TEXT,
        current_stage TEXT,
        current_item_label TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS local_supplier_publish_session_items (
        session_id TEXT NOT NULL,
        draft_id TEXT NOT NULL,
        entity_kind TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        type_code TEXT,
        stage TEXT NOT NULL,
        item_label TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'WAITING',
        error_code TEXT,
        error_message TEXT,
        sequence_no INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(session_id, draft_id),
        FOREIGN KEY(session_id) REFERENCES local_supplier_publish_sessions(session_id)
      );

      CREATE INDEX IF NOT EXISTS idx_supplier_publish_session_items_status
        ON local_supplier_publish_session_items(session_id, status, sequence_no);

      CREATE TABLE IF NOT EXISTS local_supplier_import_batches (
        batch_id TEXT PRIMARY KEY,
        file_name TEXT NOT NULL,
        type_code TEXT NOT NULL,
        status TEXT NOT NULL,
        summary_json TEXT NOT NULL,
        analysis_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_supplier_import_batches_status
        ON local_supplier_import_batches(status, updated_at);
    `);
    this.migrateVendorServiceSplits();
    this.ensureColumn("local_sync_queue", "sync_mode", "TEXT");
    this.ensureColumn("vendor_intake_drafts", "adult_pax", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("vendor_intake_drafts", "child_pax", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("vendor_intake_drafts", "infant_pax", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("vendor_intake_drafts", "client_tag", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("vendor_day_drafts", "day_title", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("vendor_day_drafts", "start_time", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("vendor_day_drafts", "finish_time", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("vendor_service_splits", "infant_rate_idr", "REAL");
    this.ensureColumn("local_vendor_bookings", "official_sync_status", "TEXT NOT NULL DEFAULT 'NOT_REQUIRED'");
    this.ensureColumn("local_vendor_bookings", "last_send_attempt_id", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("local_vendor_bookings", "reply_review_status", "TEXT NOT NULL DEFAULT 'NONE'");
    this.ensureColumn("local_vendor_bookings", "latest_inbound_message_id", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("local_vendor_bookings", "latest_inbound_at", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("local_vendor_bookings", "external_evidence_json", "TEXT NOT NULL DEFAULT '{}'");
    this.ensureColumn("local_vendor_send_attempts", "resend_of_attempt_id", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("local_vendor_send_attempts", "resend_reason", "TEXT NOT NULL DEFAULT ''");
  }

  migrateVendorServiceSplits() {
    const table = this.db.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vendor_service_splits'
    `).get();
    const columns = this.db.prepare("PRAGMA table_info(vendor_service_splits)").all();
    const columnNames = new Set(columns.map((column) => column.name));
    if (
      table
      && !String(table.sql || "").includes("CHECK(service_type")
      && columnNames.has("rate_status")
      && columnNames.has("supplier_id")
      && columnNames.has("contract_rate_id")
      && columnNames.has("manual_evidence_ref")
    ) return;

    const expression = (name, fallback) => columnNames.has(name) ? name : fallback;
    this.db.pragma("foreign_keys = OFF");
    try {
      this.db.transaction(() => {
        this.db.exec(`
          DROP TABLE IF EXISTS vendor_service_splits_v3;
          CREATE TABLE vendor_service_splits_v3 (
            service_id TEXT PRIMARY KEY,
            tour_day_id TEXT NOT NULL,
            split_sequence INTEGER NOT NULL,
            service_type TEXT NOT NULL,
            activity_text TEXT NOT NULL DEFAULT '',
            vendor_id TEXT,
            vendor_name TEXT,
            service_master_id TEXT,
            supplier_id TEXT,
            product_id TEXT,
            contract_id TEXT,
            contract_rate_id TEXT,
            price_source TEXT NOT NULL DEFAULT 'NONE',
            adult_rate_idr REAL,
            child_rate_idr REAL,
            infant_rate_idr REAL,
            unit_rate_idr REAL,
            price_basis TEXT NOT NULL DEFAULT 'PER_SERVICE',
            quantity REAL NOT NULL DEFAULT 1,
            currency TEXT NOT NULL DEFAULT 'IDR',
            rate_status TEXT NOT NULL DEFAULT 'PENDING_RATE' CHECK(rate_status IN ('RATE_READY','PENDING_RATE')),
            manual_price_reason TEXT NOT NULL DEFAULT '',
            manual_rate_source TEXT NOT NULL DEFAULT '',
            manual_evidence_ref TEXT NOT NULL DEFAULT '',
            rate_valid_to TEXT NOT NULL DEFAULT '',
            rate_snapshot_at TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'DRAFT',
            FOREIGN KEY(tour_day_id) REFERENCES vendor_day_drafts(tour_day_id) ON DELETE CASCADE
          );
        `);
        this.db.exec(`
          INSERT INTO vendor_service_splits_v3 (
            service_id, tour_day_id, split_sequence, service_type, activity_text,
            vendor_id, vendor_name, service_master_id, supplier_id, product_id,
            contract_id, contract_rate_id, price_source,
            adult_rate_idr, child_rate_idr, infant_rate_idr, unit_rate_idr, price_basis, quantity,
            currency, rate_status, manual_price_reason, manual_rate_source,
            manual_evidence_ref, rate_valid_to,
            rate_snapshot_at, status
          )
          SELECT
            service_id, tour_day_id, split_sequence,
            CASE
              WHEN service_type = 'VEHICLE' THEN 'TRANSPORT'
              WHEN service_type = 'ADDITIONAL_SERVICES' THEN 'ADDITIONAL_SERVICE'
              ELSE service_type
            END,
            activity_text, vendor_id, vendor_name,
            ${expression("service_master_id", "NULL")},
            ${expression("supplier_id", "vendor_id")},
            ${expression("product_id", expression("service_master_id", "NULL"))},
            ${expression("contract_id", "NULL")},
            ${expression("contract_rate_id", "NULL")},
            ${expression("price_source", "'NONE'")},
            ${expression("adult_rate_idr", "NULL")},
            ${expression("child_rate_idr", "NULL")},
            ${expression("infant_rate_idr", "NULL")},
            ${expression("unit_rate_idr", "NULL")},
            ${expression("price_basis", "'PER_SERVICE'")},
            ${expression("quantity", "1")},
            ${expression("currency", "'IDR'")},
            ${expression("rate_status", "'PENDING_RATE'")},
            ${expression("manual_price_reason", "''")},
            ${expression("manual_rate_source", "''")},
            ${expression("manual_evidence_ref", "''")},
            ${expression("rate_valid_to", "''")},
            ${expression("rate_snapshot_at", "''")},
            status
          FROM vendor_service_splits;
          DROP TABLE vendor_service_splits;
          ALTER TABLE vendor_service_splits_v3 RENAME TO vendor_service_splits;
          CREATE INDEX idx_vendor_split_day
            ON vendor_service_splits(tour_day_id, split_sequence);
        `);
      })();
    } finally {
      this.db.pragma("foreign_keys = ON");
    }
  }

  ensureColumn(tableName, columnName, definition) {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!columns.some((column) => column.name === columnName)) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
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

  replaceMasterData(input) {
    const tocRows = Array.isArray(input.toc) ? input.toc : [];
    const vendorRows = Array.isArray(input.vendorRates) ? input.vendorRates : [];
    if (!tocRows.length || !vendorRows.length) {
      throw new Error("Online master data is incomplete; local cache was not replaced.");
    }
    if (!String(input.checksum || "").trim()) {
      throw new Error("Online master-data checksum is required.");
    }
    const now = this.now();
    const insertToc = this.db.prepare(`
      INSERT INTO local_toc_master (
        toc_id, toc_name, adult_rate_idr, child_rate_idr, child_age, notes,
        valid_to, source_sheet, source_row, seed_version, updated_at
      ) VALUES (
        @tocId, @tocName, @adultRateIdr, @childRateIdr, @childAge, @notes,
        @validTo, @sourceSheet, @sourceRow, @seedVersion, @updatedAt
      )
    `);
    const insertVendorRate = this.db.prepare(`
      INSERT INTO local_vendor_rate_master (
        vendor_rate_id, service_name, vendor_name, adult_rate_idr, child_rate_idr,
        notes, description, contract_validity, valid_to, source_sheet, source_row,
        seed_version, updated_at
      ) VALUES (
        @vendorRateId, @serviceName, @vendorName, @adultRateIdr, @childRateIdr,
        @notes, @description, @contractValidity, @validTo, @sourceSheet, @sourceRow,
        @seedVersion, @updatedAt
      )
    `);
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM local_toc_master").run();
      this.db.prepare("DELETE FROM local_vendor_rate_master").run();
      for (const row of tocRows) {
        insertToc.run({
          tocId: row.tocId,
          tocName: String(row.tocName || "").trim(),
          adultRateIdr: row.adultRateIdr ?? null,
          childRateIdr: row.childRateIdr ?? null,
          childAge: String(row.childAge || "").trim(),
          notes: String(row.notes || "").trim(),
          validTo: row.validTo,
          sourceSheet: String(row.sourceSheet || "").trim(),
          sourceRow: Number(row.sourceRow || 0) || null,
          seedVersion: input.sourceVersion || "ONLINE",
          updatedAt: row.updatedAt || now,
        });
      }
      for (const row of vendorRows) {
        insertVendorRate.run({
          vendorRateId: row.vendorRateId,
          serviceName: String(row.serviceName || "").trim(),
          vendorName: String(row.vendorName || "").trim(),
          adultRateIdr: row.adultRateIdr ?? null,
          childRateIdr: row.childRateIdr ?? null,
          notes: String(row.notes || "").trim(),
          description: String(row.description || "").trim(),
          contractValidity: String(row.contractValidity || "").trim(),
          validTo: row.validTo,
          sourceSheet: String(row.sourceSheet || "").trim(),
          sourceRow: Number(row.sourceRow || 0) || null,
          seedVersion: input.sourceVersion || "ONLINE",
          updatedAt: row.updatedAt || now,
        });
      }
      this.db.prepare(`
        INSERT INTO master_data_sync_state (
          master_key, source_version, checksum, source_updated_at, synced_at,
          toc_rows, vendor_rate_rows, transport_rate_rows, status
        ) VALUES (
          'TOC_VENDOR_RATES', @sourceVersion, @checksum, @sourceUpdatedAt, @syncedAt,
          @tocRows, @vendorRateRows, @transportRateRows, 'SYNCED'
        )
        ON CONFLICT(master_key) DO UPDATE SET
          source_version = excluded.source_version,
          checksum = excluded.checksum,
          source_updated_at = excluded.source_updated_at,
          synced_at = excluded.synced_at,
          toc_rows = excluded.toc_rows,
          vendor_rate_rows = excluded.vendor_rate_rows,
          transport_rate_rows = excluded.transport_rate_rows,
          status = excluded.status
      `).run({
        sourceVersion: input.sourceVersion || "ONLINE",
        checksum: String(input.checksum).trim(),
        sourceUpdatedAt: input.sourceUpdatedAt || null,
        syncedAt: now,
        tocRows: tocRows.length,
        vendorRateRows: vendorRows.length,
        transportRateRows: Number(input.transportRateRows || 0),
      });
    })();
    this.log("MASTER_DATA_CACHE_REPLACED", "MASTER_DATA", "TOC_VENDOR_RATES", {
      sourceVersion: input.sourceVersion || "ONLINE",
      checksum: String(input.checksum).trim(),
      tocRows: tocRows.length,
      vendorRateRows: vendorRows.length,
      transportRateRows: Number(input.transportRateRows || 0),
    });
    return this.getLocalMasterDataSummary();
  }

  getMasterDataSyncState() {
    const row = this.db.prepare(`
      SELECT * FROM master_data_sync_state WHERE master_key = 'TOC_VENDOR_RATES'
    `).get();
    return row ? {
      masterKey: row.master_key,
      sourceVersion: row.source_version,
      checksum: row.checksum,
      sourceUpdatedAt: row.source_updated_at || "",
      syncedAt: row.synced_at,
      tocRows: Number(row.toc_rows || 0),
      vendorRateRows: Number(row.vendor_rate_rows || 0),
      transportRateRows: Number(row.transport_rate_rows || 0),
      status: row.status,
    } : null;
  }

  getLocalMasterDataSummary() {
    const toc = this.db.prepare(`
      SELECT COUNT(*) AS total, MIN(valid_to) AS earliest_valid_to, MAX(valid_to) AS latest_valid_to
      FROM local_toc_master
    `).get();
    const vendor = this.db.prepare(`
      SELECT COUNT(*) AS total, MIN(valid_to) AS earliest_valid_to, MAX(valid_to) AS latest_valid_to
      FROM local_vendor_rate_master
    `).get();
    return {
      toc: {
        total: Number(toc.total || 0),
        earliestValidTo: toc.earliest_valid_to || "",
        latestValidTo: toc.latest_valid_to || "",
      },
      vendorRates: {
        total: Number(vendor.total || 0),
        earliestValidTo: vendor.earliest_valid_to || "",
        latestValidTo: vendor.latest_valid_to || "",
      },
      transportRates: { total: 0, status: "PENDING_SOURCE_DATA" },
    };
  }

  getLocalVendorSuggestions(asOfDate = new Date().toISOString().slice(0, 10)) {
    const supplierSuggestions = this.getSupplierSuggestions(asOfDate);
    if (
      supplierSuggestions.supplierTypes.length
      && (supplierSuggestions.suppliers.length || supplierSuggestions.products.length)
    ) {
      return supplierSuggestions;
    }
    const activeVendorRates = this.db.prepare(`
      SELECT vendor_rate_id, vendor_name, service_name, adult_rate_idr, child_rate_idr, valid_to
      FROM local_vendor_rate_master
      WHERE valid_to >= ?
      ORDER BY vendor_name COLLATE NOCASE, service_name COLLATE NOCASE
    `).all(asOfDate);
    const activeToc = this.db.prepare(`
      SELECT toc_id, toc_name, adult_rate_idr, child_rate_idr, valid_to
      FROM local_toc_master
      WHERE valid_to >= ?
      ORDER BY toc_name COLLATE NOCASE
    `).all(asOfDate);
    const validity = this.db.prepare(`
      SELECT MAX(valid_to) AS valid_to
      FROM (
        SELECT valid_to FROM local_vendor_rate_master WHERE valid_to >= ?
        UNION ALL
        SELECT valid_to FROM local_toc_master WHERE valid_to >= ?
      )
    `).get(asOfDate, asOfDate);
    const unique = (values) => [...new Set(
      values.map((value) => String(value || "").trim()).filter(Boolean),
    )].sort((a, b) => a.localeCompare(b));
    const vendorRates = [
      ...activeVendorRates.map((row) => ({
        serviceMasterId: row.vendor_rate_id,
        vendorName: row.vendor_name,
        serviceName: row.service_name,
        adultRateIdr: row.adult_rate_idr,
        childRateIdr: row.child_rate_idr,
        unitRateIdr: null,
        priceBasis: "AS_CONTRACT",
        validTo: row.valid_to,
        priceSource: "VENDOR_RATE_MASTER",
      })),
      ...DEV_VENDOR_RATE_FIXTURES,
    ];
    const tocRates = activeToc.map((row) => ({
      serviceMasterId: row.toc_id,
      vendorName: "TOC Master",
      serviceName: row.toc_name,
      adultRateIdr: row.adult_rate_idr,
      childRateIdr: row.child_rate_idr,
      unitRateIdr: null,
      priceBasis: "PER_PAX",
      validTo: row.valid_to,
      priceSource: "TOC_MASTER",
    }));
    return {
      vendorNames: unique(vendorRates.map((row) => row.vendorName)),
      vendorServices: unique(vendorRates.map((row) => row.serviceName)),
      tocNames: unique(activeToc.map((row) => row.toc_name)),
      vendorRates,
      tocRates,
      transportRates: DEV_TRANSPORT_RATE_FIXTURES,
      luggageVanRates: DEV_LUGGAGE_VAN_RATE_FIXTURES,
      validTo: validity.valid_to || "",
      supplierTypes: [
        { typeCode: "VENDOR", typeName: "Vendor" },
        { typeCode: "TOC", typeName: "TOC" },
        { typeCode: "TRANSPORT", typeName: "Transport" },
        { typeCode: "LUGGAGE_VAN", typeName: "Luggage Van" },
        { typeCode: "ADDITIONAL_SERVICE", typeName: "Additional Service" },
      ],
      suppliers: [],
      products: [],
      contracts: [],
      rates: [],
    };
  }

  replaceSupplierMasterCache(catalog = {}) {
    const collections = {
      SUPPLIER_TYPE: catalog.supplierTypes || [],
      SUPPLIER: catalog.suppliers || [],
      CONTACT: catalog.contacts || [],
      RECIPIENT: catalog.recipients || [],
      SOP: catalog.sops || [],
      PRODUCT: catalog.products || [],
      CONTRACT: catalog.contracts || [],
      RATE: catalog.rates || [],
    };
    const idFields = {
      SUPPLIER_TYPE: "supplierTypeId",
      SUPPLIER: "supplierId",
      CONTACT: "contactId",
      RECIPIENT: "recipientId",
      SOP: "sopId",
      PRODUCT: "productId",
      CONTRACT: "contractId",
      RATE: "contractRateId",
    };
    const parentFields = {
      SUPPLIER: "supplierTypeId",
      CONTACT: "supplierId",
      RECIPIENT: "supplierId",
      SOP: "supplierId",
      PRODUCT: "supplierId",
      CONTRACT: "supplierId",
      RATE: "contractId",
    };
    const sourceVersion = String(catalog.sourceVersion || catalog.checksum || "ONLINE");
    const now = this.now();
    const insert = this.db.prepare(`
      INSERT INTO local_supplier_master_cache (
        entity_kind, entity_id, parent_id, supplier_type_code, status,
        payload_json, source_version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM local_supplier_master_cache").run();
      for (const [kind, rows] of Object.entries(collections)) {
        for (const row of rows) {
          const entityId = String(row[idFields[kind]] || "").trim();
          if (!entityId) continue;
          insert.run(
            kind,
            entityId,
            String(row[parentFields[kind]] || ""),
            String(row.typeCode || row.supplierTypeCode || ""),
            String(row.status || (row.active === false ? "ARCHIVED" : "ACTIVE")),
            JSON.stringify(row),
            sourceVersion,
            row.updatedAt || now,
          );
        }
      }
    })();
    this.log("SUPPLIER_MASTER_CACHE_REPLACED", "MASTER_DATA", "SUPPLIER_MASTER", {
      sourceVersion,
      counts: Object.fromEntries(Object.entries(collections).map(([key, rows]) => [key, rows.length])),
    });
    return this.getSupplierMasterCatalog();
  }

  getSupplierMasterCatalog() {
    const rows = this.db.prepare(`
      SELECT entity_kind, payload_json FROM local_supplier_master_cache
      ORDER BY entity_kind, entity_id
    `).all();
    const result = {
      supplierTypes: [], suppliers: [], contacts: [], recipients: [],
      sops: [], products: [], contracts: [], rates: [],
    };
    const target = {
      SUPPLIER_TYPE: "supplierTypes",
      SUPPLIER: "suppliers",
      CONTACT: "contacts",
      RECIPIENT: "recipients",
      SOP: "sops",
      PRODUCT: "products",
      CONTRACT: "contracts",
      RATE: "rates",
    };
    for (const row of rows) {
      try {
        result[target[row.entity_kind]]?.push(JSON.parse(row.payload_json));
      } catch {
        // A malformed cache row is ignored; the next online sync replaces the cache atomically.
      }
    }
    return this.applySupplierMasterDrafts(result);
  }

  listSupplierMasterDrafts({ includeSynced = false } = {}) {
    const rows = this.db.prepare(`
      SELECT * FROM local_supplier_master_drafts
      ${includeSynced ? "" : "WHERE local_status <> 'SYNCED'"}
      ORDER BY
        CASE entity_kind
          WHEN 'TYPE' THEN 1 WHEN 'SUPPLIER' THEN 2 WHEN 'PRODUCT' THEN 3
          WHEN 'CONTRACT' THEN 4 WHEN 'ARCHIVE' THEN 5 ELSE 9
        END,
        updated_at
    `).all();
    const approvalStatement = this.db.prepare(`
      SELECT * FROM local_supplier_rate_approvals WHERE draft_id = ?
    `);
    return rows.map((row) => ({
      draftId: row.draft_id,
      entityKind: row.entity_kind,
      entityId: row.entity_id,
      parentId: row.parent_id || "",
      payload: JSON.parse(row.payload_json),
      baseRecordVersion: row.base_record_version,
      localStatus: row.local_status,
      lastErrorCode: row.last_error_code || "",
      lastErrorMessage: row.last_error_message || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      syncedAt: row.synced_at || "",
      rateApproval: this.supplierRateApprovalRow(approvalStatement.get(row.draft_id)),
    }));
  }

  supplierRateApprovalRow(row) {
    if (!row) return null;
    const affectedBookingIds = this.db.prepare(`
      SELECT booking_id, service_snapshot_json FROM local_vendor_booking_services
    `).all().filter((item) => {
      try {
        return String(JSON.parse(item.service_snapshot_json || "{}").contractId || "")
          === String(row.entity_id || "");
      } catch {
        return false;
      }
    }).map((item) => item.booking_id);
    return {
      approvalId: row.approval_id,
      draftId: row.draft_id,
      entityId: row.entity_id,
      supplierId: row.supplier_id || "",
      snapshotHash: row.snapshot_hash,
      status: row.status,
      makerEmployeeId: row.maker_employee_id || "",
      makerEmail: row.maker_email || "",
      requestReason: row.request_reason || "",
      evidenceReference: row.evidence_reference || "",
      requestedAt: row.requested_at || "",
      reviewerEmployeeId: row.reviewer_employee_id || "",
      reviewerEmail: row.reviewer_email || "",
      reviewReason: row.review_reason || "",
      reviewedAt: row.reviewed_at || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      affectedBookingIds: [...new Set(affectedBookingIds)],
    };
  }

  listSupplierRateApprovals({ status = "" } = {}) {
    return this.db.prepare(`
      SELECT * FROM local_supplier_rate_approvals
      ${status ? "WHERE status = ?" : ""}
      ORDER BY updated_at DESC
    `).all(...(status ? [String(status).toUpperCase()] : []))
      .map((row) => this.supplierRateApprovalRow(row));
  }

  requestSupplierRateApproval(input = {}) {
    const draftId = String(input.draftId || "");
    const draft = this.listSupplierMasterDrafts({ includeSynced: true })
      .find((row) => row.draftId === draftId);
    if (!draft || draft.entityKind !== "CONTRACT" || !(draft.payload.rates || []).length) {
      throw new Error("A local Contract/Rate draft is required.");
    }
    const reason = String(input.reason || "").trim();
    const evidenceReference = String(input.evidenceReference || "").trim();
    if (!reason || !evidenceReference) {
      throw new Error("Approval reason and source/evidence reference are required.");
    }
    const settings = this.getPublicSettings();
    const snapshotHash = crypto.createHash("sha256")
      .update(JSON.stringify(draft.payload)).digest("hex");
    const now = this.now();
    this.db.prepare(`
      INSERT INTO local_supplier_rate_approvals (
        approval_id, draft_id, entity_id, supplier_id, snapshot_hash, status,
        maker_employee_id, maker_email, request_reason, evidence_reference,
        requested_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'APPROVAL_REQUESTED', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(draft_id) DO UPDATE SET
        snapshot_hash=excluded.snapshot_hash, status='APPROVAL_REQUESTED',
        maker_employee_id=excluded.maker_employee_id, maker_email=excluded.maker_email,
        request_reason=excluded.request_reason,
        evidence_reference=excluded.evidence_reference,
        requested_at=excluded.requested_at,
        reviewer_employee_id='', reviewer_email='', review_reason='',
        reviewed_at=NULL, updated_at=excluded.updated_at
    `).run(
      `SRAPP-${crypto.randomUUID()}`,
      draftId,
      draft.entityId,
      String(draft.payload.supplierId || draft.parentId || ""),
      snapshotHash,
      String(settings.employeeId || ""),
      String(input.makerEmail || ""),
      reason,
      evidenceReference,
      now,
      now,
      now,
    );
    this.log("SUPPLIER_RATE_APPROVAL_REQUESTED", "CONTRACT", draft.entityId, {
      draftId, snapshotHash, evidenceReference,
    });
    return this.supplierRateApprovalRow(
      this.db.prepare("SELECT * FROM local_supplier_rate_approvals WHERE draft_id = ?").get(draftId),
    );
  }

  reviewSupplierRateApproval(input = {}) {
    const approvalId = String(input.approvalId || "");
    const decision = String(input.decision || "").toUpperCase();
    if (!["APPROVE", "REQUEST_CHANGES", "REJECT"].includes(decision)) {
      throw new Error("Choose Approve, Request Changes, or Reject.");
    }
    const settings = this.getPublicSettings();
    if (settings.department !== "MANAGER_ADMIN" && settings.environment !== "ADMIN_DEV") {
      throw new Error("Only Manager/Admin may review local Supplier Rate sync requests.");
    }
    const row = this.db.prepare(`
      SELECT * FROM local_supplier_rate_approvals WHERE approval_id = ?
    `).get(approvalId);
    if (!row || row.status !== "APPROVAL_REQUESTED") {
      throw new Error("This approval request is no longer pending.");
    }
    if (row.maker_employee_id
      && String(row.maker_employee_id) === String(settings.employeeId || "")) {
      throw new Error("Maker-checker rule: the employee who entered the rate cannot approve it.");
    }
    const draft = this.listSupplierMasterDrafts({ includeSynced: true })
      .find((item) => item.draftId === row.draft_id);
    const currentHash = draft
      ? crypto.createHash("sha256").update(JSON.stringify(draft.payload)).digest("hex")
      : "";
    if (!draft || currentHash !== row.snapshot_hash) {
      this.db.prepare(`
        UPDATE local_supplier_rate_approvals
        SET status='CANCELED_PAYLOAD_CHANGED', updated_at=? WHERE approval_id=?
      `).run(this.now(), approvalId);
      throw new Error("The Contract/Rate changed after approval was requested. Request approval again.");
    }
    const reason = String(input.reason || "").trim();
    if (decision !== "APPROVE" && !reason) {
      throw new Error("Review reason is required.");
    }
    const status = decision === "APPROVE"
      ? "APPROVED_TO_SYNC"
      : decision === "REQUEST_CHANGES" ? "CHANGES_REQUESTED" : "REJECTED";
    const now = this.now();
    this.db.prepare(`
      UPDATE local_supplier_rate_approvals
      SET status=?, reviewer_employee_id=?, reviewer_email=?, review_reason=?,
        reviewed_at=?, updated_at=? WHERE approval_id=?
    `).run(
      status,
      String(settings.employeeId || ""),
      String(input.reviewerEmail || ""),
      reason,
      now,
      now,
      approvalId,
    );
    this.log(`SUPPLIER_RATE_${status}`, "CONTRACT", row.entity_id, {
      approvalId, draftId: row.draft_id, reason,
    });
    return this.supplierRateApprovalRow(
      this.db.prepare("SELECT * FROM local_supplier_rate_approvals WHERE approval_id = ?").get(approvalId),
    );
  }

  applyRemoteSupplierRateApproval(input = {}) {
    const draftId = String(input.draftId || "");
    const local = this.db.prepare(`
      SELECT * FROM local_supplier_rate_approvals WHERE draft_id = ?
    `).get(draftId);
    if (!local) return null;
    if (String(local.snapshot_hash) !== String(input.snapshotHash || "")) {
      return this.supplierRateApprovalRow(local);
    }
    const now = this.now();
    this.db.prepare(`
      UPDATE local_supplier_rate_approvals
      SET status=?, maker_employee_id=?, maker_email=?, request_reason=?,
        evidence_reference=?, requested_at=?, reviewer_employee_id=?,
        reviewer_email=?, review_reason=?, reviewed_at=?, updated_at=?
      WHERE draft_id=?
    `).run(
      String(input.status || local.status),
      String(input.makerEmployeeId || local.maker_employee_id || ""),
      String(input.makerEmail || local.maker_email || ""),
      String(input.requestReason || local.request_reason || ""),
      String(input.evidenceReference || local.evidence_reference || ""),
      input.requestedAt || local.requested_at || null,
      String(input.reviewerEmployeeId || ""),
      String(input.reviewerEmail || ""),
      String(input.reviewReason || ""),
      input.reviewedAt || null,
      now,
      draftId,
    );
    return this.supplierRateApprovalRow(
      this.db.prepare("SELECT * FROM local_supplier_rate_approvals WHERE draft_id = ?").get(draftId),
    );
  }

  saveSupplierMasterDraft(entityKind, details = {}) {
    const kind = String(entityKind || "").trim().toUpperCase();
    const config = {
      TYPE: ["supplierTypeId", "STYPE", ""],
      SUPPLIER: ["supplierId", "SUP", ""],
      PRODUCT: ["productId", "PROD", "supplierId"],
      CONTRACT: ["contractId", "CTR", "supplierId"],
      ARCHIVE: ["entityId", "ARCH", "supplierId"],
    }[kind];
    if (!config) throw new Error("Unsupported Supplier Master draft type.");
    const payload = structuredClone(details || {});
    const [idField, prefix, parentField] = config;
    const entityId = String(payload[idField] || `${prefix}-${crypto.randomUUID()}`).trim();
    payload[idField] = entityId;
    if (kind === "TYPE") {
      payload.typeCode = String(payload.typeCode || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
      payload.typeName = String(payload.typeName || "").trim();
      payload.status = payload.status || "ACTIVE";
      payload.active = true;
    }
    if (kind === "SUPPLIER") {
      payload.typeCode = String(payload.typeCode || "").trim().toUpperCase();
      payload.status = payload.status || "ACTIVE";
      payload.active = true;
      payload.contacts = (payload.contacts || []).map((row) => ({
        ...row,
        contactId: row.contactId || `SCON-${crypto.randomUUID()}`,
      }));
      payload.recipients = (payload.recipients || []).map((row) => ({
        ...row,
        recipientId: row.recipientId || `SREC-${crypto.randomUUID()}`,
      }));
      payload.sop = { ...(payload.sop || {}), sopId: payload.sop?.sopId || `SSOP-${crypto.randomUUID()}` };
    }
    if (kind === "CONTRACT") {
      payload.status = payload.status || "LOCAL_DRAFT";
      payload.active = true;
      payload.rates = (payload.rates || []).map((row) => ({
        ...row,
        contractRateId: row.contractRateId || `RATE-${crypto.randomUUID()}`,
        contractId: entityId,
      }));
    }
    const existing = this.db.prepare(`
      SELECT created_at FROM local_supplier_master_drafts
      WHERE entity_kind = ? AND entity_id = ?
    `).get(kind, entityId);
    const now = this.now();
    this.db.prepare(`
      INSERT INTO local_supplier_master_drafts (
        draft_id, entity_kind, entity_id, parent_id, payload_json,
        base_record_version, local_status, last_error_code, last_error_message,
        created_at, updated_at, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'READY_TO_PUBLISH', NULL, NULL, ?, ?, NULL)
      ON CONFLICT(entity_kind, entity_id) DO UPDATE SET
        parent_id = excluded.parent_id,
        payload_json = excluded.payload_json,
        base_record_version = excluded.base_record_version,
        local_status = 'READY_TO_PUBLISH',
        last_error_code = NULL,
        last_error_message = NULL,
        updated_at = excluded.updated_at,
        synced_at = NULL
    `).run(
      existing ? `${kind}-${entityId}` : `${kind}-${entityId}`,
      kind,
      entityId,
      String(parentField ? payload[parentField] || "" : ""),
      JSON.stringify(payload),
      details.recordVersion ?? details.baseRecordVersion ?? null,
      existing?.created_at || now,
      now,
    );
    if (kind === "CONTRACT" && (payload.rates || []).length) {
      const draftId = `${kind}-${entityId}`;
      const snapshotHash = crypto.createHash("sha256")
        .update(JSON.stringify(payload)).digest("hex");
      const approval = this.db.prepare(`
        SELECT * FROM local_supplier_rate_approvals WHERE draft_id = ?
      `).get(draftId);
      if (!approval) {
        const settings = this.getPublicSettings();
        this.db.prepare(`
          INSERT INTO local_supplier_rate_approvals (
            approval_id, draft_id, entity_id, supplier_id, snapshot_hash, status,
            maker_employee_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'LOCAL_ONLY', ?, ?, ?)
        `).run(
          `SRAPP-${crypto.randomUUID()}`,
          draftId,
          entityId,
          String(payload.supplierId || ""),
          snapshotHash,
          String(settings.employeeId || ""),
          now,
          now,
        );
      } else if (approval.snapshot_hash !== snapshotHash) {
        this.db.prepare(`
          UPDATE local_supplier_rate_approvals
          SET snapshot_hash=?, status='LOCAL_ONLY', request_reason='',
            evidence_reference='', requested_at=NULL, reviewer_employee_id='',
            reviewer_email='', review_reason='', reviewed_at=NULL, updated_at=?
          WHERE draft_id=?
        `).run(snapshotHash, now, draftId);
      }
    }
    this.log("SUPPLIER_MASTER_DRAFT_SAVED", kind, entityId, { parentId: payload[parentField] || "" });
    return {
      draft: this.listSupplierMasterDrafts().find((row) =>
        row.entityKind === kind && row.entityId === entityId),
      drafts: this.listSupplierMasterDrafts(),
      catalog: this.getSupplierMasterCatalog(),
    };
  }

  duplicateSupplierProduct(details = {}) {
    const sourceProductIds = [...new Set(
      (details.sourceProductIds || []).map(String).filter(Boolean),
    )];
    if (sourceProductIds.length > 1) {
      const created = [];
      const conflicts = [];
      const failed = [];
      for (const sourceProductId of sourceProductIds) {
        const source = this.getSupplierMasterCatalog().products.find((row) =>
          row.productId === sourceProductId
        );
        try {
          const result = this.duplicateSupplierProduct({
            ...details,
            sourceProductIds: [],
            sourceProductId,
            productName: "",
          });
          created.push(...result.created.map((row) => ({
            ...row,
            sourceProductId,
            sourceProductName: source?.productName || sourceProductId,
          })));
          conflicts.push(...result.conflicts.map((row) => ({
            ...row,
            sourceProductId,
            sourceProductName: source?.productName || sourceProductId,
          })));
        } catch (error) {
          for (const supplierId of details.targetSupplierIds || []) {
            const supplier = this.getSupplierMasterCatalog().suppliers.find((row) =>
              row.supplierId === supplierId
            );
            failed.push({
              sourceProductId,
              productName: source?.productName || sourceProductId,
              supplierId,
              supplierName: supplier?.supplierName || supplierId,
              reason: error.message,
            });
          }
        }
      }
      return {
        created,
        conflicts,
        failed,
        drafts: this.listSupplierMasterDrafts(),
        catalog: this.getSupplierMasterCatalog(),
      };
    }
    const sourceProductId = String(details.sourceProductId || "").trim();
    const targetSupplierIds = [...new Set((details.targetSupplierIds || []).map(String).filter(Boolean))];
    const includeContracts = details.includeContracts !== false;
    const includeRates = includeContracts && details.includeRates !== false;
    const catalog = this.getSupplierMasterCatalog();
    const sourceProduct = catalog.products.find((row) =>
      row.productId === sourceProductId && row.active !== false
    );
    if (!sourceProduct) throw new Error("Source Product was not found or is archived.");
    const sourceSupplier = catalog.suppliers.find((row) =>
      row.supplierId === sourceProduct.supplierId && row.active !== false
    );
    if (!sourceSupplier) throw new Error("Source Product supplier was not found or is archived.");
    if (!targetSupplierIds.length) throw new Error("Choose at least one destination supplier.");

    const requestedName = String(details.productName || sourceProduct.productName || "").trim();
    if (!requestedName) throw new Error("Product/service name is required.");
    const normalizeName = (value) => String(value || "").trim().toLocaleLowerCase();
    const targetSuppliers = targetSupplierIds.map((supplierId) => {
      const supplier = catalog.suppliers.find((row) =>
        row.supplierId === supplierId && row.active !== false
      );
      if (!supplier) throw new Error(`Destination supplier ${supplierId} was not found or is archived.`);
      if (String(supplier.typeCode || "") !== String(sourceSupplier.typeCode || "")) {
        throw new Error(`${supplier.supplierName} belongs to a different Supplier Type.`);
      }
      return supplier;
    });
    const sourceRates = catalog.rates.filter((row) =>
      row.productId === sourceProduct.productId && row.active !== false
    );
    const sourceRateContractIds = new Set(sourceRates.map((row) => row.contractId));
    const sourceContracts = catalog.contracts.filter((row) =>
      row.supplierId === sourceSupplier.supplierId
      && row.active !== false
      && sourceRateContractIds.has(row.contractId)
    );
    const created = [];
    const conflicts = [];
    const cleanClone = (row, fields) => {
      const clone = structuredClone(row || {});
      fields.forEach((field) => delete clone[field]);
      return clone;
    };

    this.db.transaction(() => {
      for (const targetSupplier of targetSuppliers) {
        const duplicate = this.getSupplierMasterCatalog().products.find((row) =>
          row.supplierId === targetSupplier.supplierId
          && row.active !== false
          && normalizeName(row.productName) === normalizeName(requestedName)
        );
        if (duplicate) {
          conflicts.push({
            supplierId: targetSupplier.supplierId,
            supplierName: targetSupplier.supplierName,
            productId: duplicate.productId,
            productName: duplicate.productName,
            reason: "A product with the same name already exists for this supplier.",
          });
          continue;
        }

        const productPayload = cleanClone(sourceProduct, [
          "productId", "productCode", "recordVersion", "localDraftStatus",
          "createdAt", "createdBy", "updatedAt", "updatedBy",
        ]);
        Object.assign(productPayload, {
          supplierId: targetSupplier.supplierId,
          productName: requestedName,
          productCode: "",
          status: "ACTIVE",
          active: true,
          duplicatedFromProductId: sourceProduct.productId,
          duplicatedFromSupplierId: sourceSupplier.supplierId,
          baseRecordVersion: null,
        });
        const productResult = this.saveSupplierMasterDraft("PRODUCT", productPayload);
        const newProductId = productResult.draft.entityId;
        const contractIds = [];

        if (includeContracts) {
          for (const sourceContract of sourceContracts) {
            const contractPayload = cleanClone(sourceContract, [
              "contractId", "recordVersion", "localDraftStatus", "createdAt", "createdBy",
              "updatedAt", "updatedBy", "driveFileId", "driveFileName", "driveFileUrl",
            ]);
            const supplierReference = targetSupplier.supplierCode || targetSupplier.supplierName;
            Object.assign(contractPayload, {
              supplierId: targetSupplier.supplierId,
              contractNumber: `${sourceContract.contractNumber || "CONTRACT"} / ${supplierReference}`,
              contractName: sourceContract.contractName
                ? `${sourceContract.contractName} - ${targetSupplier.supplierName}`
                : `${requestedName} - ${targetSupplier.supplierName}`,
              driveFileId: "",
              driveFileName: "",
              driveFileUrl: "",
              status: "LOCAL_DRAFT",
              active: true,
              duplicatedFromContractId: sourceContract.contractId,
              baseRecordVersion: null,
              rates: includeRates
                ? sourceRates
                  .filter((rate) => rate.contractId === sourceContract.contractId)
                  .map((rate) => ({
                    ...cleanClone(rate, [
                      "contractRateId", "contractId", "productId", "recordVersion",
                      "localDraftStatus", "createdAt", "createdBy", "updatedAt", "updatedBy",
                    ]),
                    productId: newProductId,
                    status: "ACTIVE",
                    active: true,
                    duplicatedFromContractRateId: rate.contractRateId,
                  }))
                : [],
            });
            const contractResult = this.saveSupplierMasterDraft("CONTRACT", contractPayload);
            contractIds.push(contractResult.draft.entityId);
          }
        }
        created.push({
          supplierId: targetSupplier.supplierId,
          supplierName: targetSupplier.supplierName,
          productId: newProductId,
          productName: requestedName,
          contractIds,
          rateCount: includeRates
            ? sourceRates.filter((rate) => sourceRateContractIds.has(rate.contractId)).length
            : 0,
        });
      }
    })();

    this.log("SUPPLIER_PRODUCT_DUPLICATED", "PRODUCT", sourceProduct.productId, {
      sourceSupplierId: sourceSupplier.supplierId,
      requestedTargets: targetSupplierIds.length,
      created: created.length,
      conflicts: conflicts.length,
      includeContracts,
      includeRates,
    });
    return {
      created,
      conflicts,
      drafts: this.listSupplierMasterDrafts(),
      catalog: this.getSupplierMasterCatalog(),
    };
  }

  setSupplierMasterDraftStatus(draftId, status, error = {}) {
    const now = this.now();
    this.db.prepare(`
      UPDATE local_supplier_master_drafts
      SET local_status = ?, last_error_code = ?, last_error_message = ?,
        updated_at = ?, synced_at = CASE WHEN ? = 'SYNCED' THEN ? ELSE synced_at END
      WHERE draft_id = ?
    `).run(
      status,
      error.code || null,
      error.message || null,
      now,
      status,
      now,
      draftId,
    );
    if (status === "SYNCED") {
      this.db.prepare(`
        UPDATE local_supplier_rate_approvals
        SET status='SYNCED', updated_at=? WHERE draft_id=? AND status='APPROVED_TO_SYNC'
      `).run(now, draftId);
    }
  }

  createSupplierPublishSession(items = []) {
    const sessionId = `SPUB-${crypto.randomUUID()}`;
    const now = this.now();
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO local_supplier_publish_sessions (
          session_id, status, total_items, created_at, updated_at
        ) VALUES (?, 'PREFLIGHT', ?, ?, ?)
      `).run(sessionId, items.length, now, now);
      const insertItem = this.db.prepare(`
        INSERT INTO local_supplier_publish_session_items (
          session_id, draft_id, entity_kind, entity_id, type_code, stage,
          item_label, status, sequence_no, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'WAITING', ?, ?)
      `);
      items.forEach((item, index) => insertItem.run(
        sessionId,
        item.draftId,
        item.entityKind,
        item.entityId,
        item.typeCode || "UNASSIGNED",
        item.stage,
        item.itemLabel || item.entityId,
        index + 1,
        now,
      ));
    })();
    return this.getSupplierPublishSession(sessionId);
  }

  resetSupplierPublishSession(sessionId, draftIds = []) {
    const ids = new Set(draftIds.map(String));
    const items = this.getSupplierPublishSession(sessionId)?.items || [];
    const now = this.now();
    this.db.transaction(() => {
      items
        .filter((item) => ids.has(item.draftId) && item.status !== "SYNCED")
        .forEach((item) => this.db.prepare(`
          UPDATE local_supplier_publish_session_items
          SET status = 'WAITING', error_code = NULL, error_message = NULL, updated_at = ?
          WHERE session_id = ? AND draft_id = ?
        `).run(now, sessionId, item.draftId));
      this.db.prepare(`
        UPDATE local_supplier_publish_sessions
        SET status = 'PREFLIGHT', completed_at = NULL, updated_at = ?
        WHERE session_id = ?
      `).run(now, sessionId);
    })();
    return this.refreshSupplierPublishSession(sessionId, { status: "PREFLIGHT" });
  }

  updateSupplierPublishSessionItem(sessionId, draftId, status, details = {}) {
    const now = this.now();
    this.db.prepare(`
      UPDATE local_supplier_publish_session_items
      SET status = ?, error_code = ?, error_message = ?, updated_at = ?
      WHERE session_id = ? AND draft_id = ?
    `).run(
      status,
      details.errorCode || null,
      details.errorMessage || null,
      now,
      sessionId,
      draftId,
    );
    return this.refreshSupplierPublishSession(sessionId, details);
  }

  refreshSupplierPublishSession(sessionId, details = {}) {
    const counts = this.db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'SYNCED' THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'CONFLICT' THEN 1 ELSE 0 END) AS conflicts,
        SUM(CASE WHEN status = 'BLOCKED_BY_DEPENDENCY' THEN 1 ELSE 0 END) AS blocked,
        SUM(CASE WHEN status IN ('WAITING','PUBLISHING','VERIFYING') THEN 1 ELSE 0 END) AS pending
      FROM local_supplier_publish_session_items
      WHERE session_id = ?
    `).get(sessionId);
    const total = Number(counts.total || 0);
    const confirmed = Number(counts.confirmed || 0);
    const terminal = confirmed + Number(counts.failed || 0)
      + Number(counts.conflicts || 0) + Number(counts.blocked || 0);
    const status = details.status || (
      terminal === total
        ? (confirmed === total ? "COMPLETED" : "COMPLETED_WITH_ISSUES")
        : "PUBLISHING"
    );
    const now = this.now();
    this.db.prepare(`
      UPDATE local_supplier_publish_sessions
      SET status = ?, confirmed_items = ?, failed_items = ?, conflict_items = ?,
        blocked_items = ?, progress_percent = ?, current_type_code = COALESCE(?, current_type_code),
        current_stage = COALESCE(?, current_stage),
        current_item_label = COALESCE(?, current_item_label), updated_at = ?,
        completed_at = CASE WHEN ? IN ('COMPLETED','COMPLETED_WITH_ISSUES') THEN ? ELSE completed_at END
      WHERE session_id = ?
    `).run(
      status,
      confirmed,
      Number(counts.failed || 0),
      Number(counts.conflicts || 0),
      Number(counts.blocked || 0),
      total ? Math.floor((confirmed / total) * 100) : 100,
      details.typeCode || null,
      details.stage || null,
      details.itemLabel || null,
      now,
      status,
      now,
      sessionId,
    );
    return this.getSupplierPublishSession(sessionId);
  }

  getSupplierPublishSession(sessionId) {
    const row = this.db.prepare(`
      SELECT * FROM local_supplier_publish_sessions WHERE session_id = ?
    `).get(sessionId);
    if (!row) return null;
    const items = this.db.prepare(`
      SELECT * FROM local_supplier_publish_session_items
      WHERE session_id = ? ORDER BY sequence_no
    `).all(sessionId);
    return {
      sessionId: row.session_id,
      status: row.status,
      totalItems: Number(row.total_items || 0),
      confirmedItems: Number(row.confirmed_items || 0),
      failedItems: Number(row.failed_items || 0),
      conflictItems: Number(row.conflict_items || 0),
      blockedItems: Number(row.blocked_items || 0),
      progressPercent: Number(row.progress_percent || 0),
      currentTypeCode: row.current_type_code || "",
      currentStage: row.current_stage || "",
      currentItemLabel: row.current_item_label || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at || "",
      items: items.map((item) => ({
        draftId: item.draft_id,
        entityKind: item.entity_kind,
        entityId: item.entity_id,
        typeCode: item.type_code || "",
        stage: item.stage,
        itemLabel: item.item_label,
        status: item.status,
        errorCode: item.error_code || "",
        errorMessage: item.error_message || "",
        updatedAt: item.updated_at,
      })),
    };
  }

  listSupplierPublishSessions({ limit = 20 } = {}) {
    return this.db.prepare(`
      SELECT session_id FROM local_supplier_publish_sessions
      ORDER BY updated_at DESC LIMIT ?
    `).all(Number(limit || 20)).map((row) => this.getSupplierPublishSession(row.session_id));
  }

  discardSupplierMasterDraft(draftId) {
    this.db.prepare("DELETE FROM local_supplier_master_drafts WHERE draft_id = ?").run(draftId);
    return { drafts: this.listSupplierMasterDrafts(), catalog: this.getSupplierMasterCatalog() };
  }

  saveSupplierImportBatch(input = {}) {
    const batchId = String(input.batchId || `SIMPORT-${crypto.randomUUID()}`);
    const now = this.now();
    this.db.prepare(`
      INSERT INTO local_supplier_import_batches (
        batch_id, file_name, type_code, status, summary_json,
        analysis_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(batch_id) DO UPDATE SET
        status = excluded.status,
        summary_json = excluded.summary_json,
        analysis_json = excluded.analysis_json,
        updated_at = excluded.updated_at
    `).run(
      batchId,
      String(input.fileName || ""),
      String(input.typeCode || ""),
      String(input.status || "READY_FOR_REVIEW"),
      JSON.stringify(input.summary || {}),
      JSON.stringify(input.analysis || {}),
      now,
      now,
    );
    this.log("SUPPLIER_IMPORT_ANALYZED", "SUPPLIER_IMPORT_BATCH", batchId, {
      fileName: input.fileName || "",
      typeCode: input.typeCode || "",
      summary: input.summary || {},
    });
    return this.getSupplierImportBatch(batchId);
  }

  getSupplierImportBatch(batchId) {
    const row = this.db.prepare(`
      SELECT * FROM local_supplier_import_batches WHERE batch_id = ?
    `).get(batchId);
    if (!row) return null;
    return {
      batchId: row.batch_id,
      fileName: row.file_name,
      typeCode: row.type_code,
      status: row.status,
      summary: JSON.parse(row.summary_json),
      analysis: JSON.parse(row.analysis_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listSupplierImportBatches() {
    return this.db.prepare(`
      SELECT batch_id FROM local_supplier_import_batches
      ORDER BY updated_at DESC LIMIT 50
    `).all().map((row) => this.getSupplierImportBatch(row.batch_id));
  }

  updateSupplierImportBatchStatus(batchId, status, summary) {
    const existing = this.getSupplierImportBatch(batchId);
    if (!existing) throw new Error("Supplier import batch was not found.");
    this.db.prepare(`
      UPDATE local_supplier_import_batches
      SET status = ?, summary_json = ?, updated_at = ?
      WHERE batch_id = ?
    `).run(
      status,
      JSON.stringify(summary || existing.summary),
      this.now(),
      batchId,
    );
    return this.getSupplierImportBatch(batchId);
  }

  applySupplierMasterDrafts(catalog) {
    const result = structuredClone(catalog);
    const upsert = (collection, idField, payload) => {
      const index = collection.findIndex((row) => String(row[idField]) === String(payload[idField]));
      const next = { ...(index >= 0 ? collection[index] : {}), ...payload, localDraftStatus: "READY_TO_PUBLISH" };
      if (index >= 0) collection[index] = next;
      else collection.push(next);
    };
    for (const draft of this.listSupplierMasterDrafts()) {
      const payload = { ...draft.payload, localDraftUpdatedAt: draft.updatedAt };
      if (draft.entityKind === "TYPE") upsert(result.supplierTypes, "supplierTypeId", payload);
      if (draft.entityKind === "SUPPLIER") {
        upsert(result.suppliers, "supplierId", payload);
        result.contacts = result.contacts.filter((row) => row.supplierId !== payload.supplierId);
        result.recipients = result.recipients.filter((row) => row.supplierId !== payload.supplierId);
        result.sops = result.sops.filter((row) => row.supplierId !== payload.supplierId);
        result.contacts.push(...(payload.contacts || []).map((row) => ({ ...row, supplierId: payload.supplierId, localDraftStatus: draft.localStatus })));
        result.recipients.push(...(payload.recipients || []).map((row) => ({ ...row, supplierId: payload.supplierId, localDraftStatus: draft.localStatus })));
        if (payload.sop) result.sops.push({ ...payload.sop, supplierId: payload.supplierId, localDraftStatus: draft.localStatus });
      }
      if (draft.entityKind === "PRODUCT") upsert(result.products, "productId", payload);
      if (draft.entityKind === "CONTRACT") {
        upsert(result.contracts, "contractId", payload);
        result.rates = result.rates.filter((row) => row.contractId !== payload.contractId);
        result.rates.push(...(payload.rates || []).map((row) => ({ ...row, contractId: payload.contractId, localDraftStatus: draft.localStatus })));
      }
      if (draft.entityKind === "ARCHIVE") {
        const target = {
          SUPPLIER_TYPE: ["supplierTypes", "supplierTypeId"],
          SUPPLIER: ["suppliers", "supplierId"],
          PRODUCT: ["products", "productId"],
          CONTRACT: ["contracts", "contractId"],
        }[String(payload.entityKind || "").toUpperCase()];
        const row = target && result[target[0]].find((item) => item[target[1]] === payload.entityId);
        if (row) Object.assign(row, { status: "PENDING_ARCHIVE", active: false, localDraftStatus: draft.localStatus });
      }
    }
    return result;
  }

  getSupplierSuggestions(asOfDate = new Date().toISOString().slice(0, 10)) {
    const catalog = this.getSupplierMasterCatalog();
    const active = (row) => row.active !== false && !["ARCHIVED", "CANCELLED", "SUPERSEDED"].includes(
      String(row.status || "").toUpperCase(),
    );
    const supplierTypes = catalog.supplierTypes.filter(active)
      .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
    const suppliers = catalog.suppliers.filter(active);
    const products = catalog.products.filter(active);
    const contracts = catalog.contracts.filter(active);
    const contractById = new Map(contracts.map((row) => [row.contractId, row]));
    const supplierById = new Map(suppliers.map((row) => [row.supplierId, row]));
    const productById = new Map(products.map((row) => [row.productId, row]));
    const approvalByContract = new Map(this.listSupplierRateApprovals()
      .map((row) => [String(row.entityId || ""), row]));
    const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);
    const allRates = catalog.rates
      .filter(active)
      .map((rate) => {
        const contract = contractById.get(rate.contractId) || {};
        const product = productById.get(rate.productId) || {};
        const supplier = supplierById.get(product.supplierId || contract.supplierId) || {};
        const basis = String(rate.priceBasis || "PER_SERVICE").toUpperCase();
        const amount = rate.amount === "" || rate.amount === null ? null : Number(rate.amount);
        return {
          serviceMasterId: product.productId || rate.productId,
          productId: product.productId || rate.productId,
          supplierId: supplier.supplierId || "",
          contractId: contract.contractId || rate.contractId,
          contractRateId: rate.contractRateId,
          typeCode: supplier.typeCode || "",
          vendorName: supplier.supplierName || "",
          serviceName: product.productName || "",
          adultRateIdr: basis === "PER_ADULT" ? amount : null,
          childRateIdr: basis === "PER_CHILD" ? amount : null,
          infantRateIdr: basis === "PER_INFANT" ? amount : null,
          unitRateIdr: !["PER_ADULT", "PER_CHILD", "PER_INFANT"].includes(basis) ? amount : null,
          priceBasis: basis,
          currency: rate.currency || contract.currency || "IDR",
          validFrom: rate.validFrom || contract.validFrom || "",
          validTo: rate.validTo || contract.validTo || "",
          priceSource: "CONTRACT",
          contractNumber: contract.contractNumber || "",
          inclusion: product.inclusion || "",
          exclusion: product.exclusion || "",
          termsAndConditions: product.termsAndConditions || contract.termsAndConditions || "",
          localDraftStatus: rate.localDraftStatus || contract.localDraftStatus || "",
          localRateApprovalStatus: approvalByContract.get(String(contract.contractId || rate.contractId))?.status || "",
          localRateApprovalId: approvalByContract.get(String(contract.contractId || rate.contractId))?.approvalId || "",
        };
      })
      .filter((rate) => rate.contractId && rate.productId);
    const rates = allRates.filter((rate) =>
      inRange(asOfDate, rate.validFrom, rate.validTo)
      && !["REJECTED", "CHANGES_REQUESTED", "CANCELED_PAYLOAD_CHANGED"].includes(
        String(rate.localRateApprovalStatus || "").toUpperCase(),
      )
    );
    const byType = (typeCode) => rates.filter((row) => row.typeCode === typeCode);
    const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      ...catalog,
      supplierTypes,
      suppliers,
      products,
      contracts,
      allRates,
      rates,
      vendorRates: byType("VENDOR"),
      tocRates: byType("TOC"),
      transportRates: byType("TRANSPORT"),
      luggageVanRates: byType("LUGGAGE_VAN"),
      vendorNames: unique(byType("VENDOR").map((row) => row.vendorName)),
      vendorServices: unique(byType("VENDOR").map((row) => row.serviceName)),
      tocNames: unique(byType("TOC").map((row) => row.serviceName)),
      validTo: rates.map((row) => row.validTo).filter(Boolean).sort().at(-1) || "",
    };
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

  startReservationFollowup(input) {
    const code = String(input.customerCode || "").trim().toUpperCase();
    if (!code) throw new Error("Customer Code is required.");
    const now = this.now();
    const existing = this.db.prepare(`
      SELECT followup_id FROM reservation_followups
      WHERE customer_code = ? AND source_type = ? AND status = 'PENDING'
      ORDER BY started_at DESC LIMIT 1
    `).get(code, input.sourceType);
    if (existing) return this.getReservationFollowup(existing.followup_id);
    const followupId = this.id("FUP");
    this.db.prepare(`
      INSERT INTO reservation_followups (
        followup_id, customer_code, tour_id, source_type, source_reference_id,
        status, pending_reason, waiting_for_department, started_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'PENDING', '', '', ?, ?)
    `).run(
      followupId,
      code,
      input.tourId || null,
      input.sourceType || "NEW_ITINERARY",
      input.sourceReferenceId || null,
      now,
      now,
    );
    this.log("RESERVATION_FOLLOWUP_STARTED", "RESERVATION_FOLLOWUP", followupId, {
      customerCode: code,
      sourceType: input.sourceType,
    });
    return this.getReservationFollowup(followupId);
  }

  getReservationFollowup(id) {
    return this.db.prepare("SELECT * FROM reservation_followups WHERE followup_id = ?").get(id) || null;
  }

  listReservationFollowups() {
    return this.db.prepare(`
      SELECT * FROM reservation_followups
      ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END, started_at ASC
    `).all().map((row) => ({
      ...row,
      pendingHours: Math.max(0, (Date.now() - new Date(row.started_at).getTime()) / 3_600_000),
    }));
  }

  updateReservationFollowup(id, input) {
    const followup = this.getReservationFollowup(id);
    if (!followup) throw new Error("Reservation follow-up was not found.");
    const reason = String(input.pendingReason || "").trim();
    if (followup.status === "PENDING" && !reason) throw new Error("Pending reason is required.");
    this.db.prepare(`
      UPDATE reservation_followups
      SET pending_reason = ?, waiting_for_department = ?, updated_at = ?
      WHERE followup_id = ?
    `).run(reason, String(input.waitingForDepartment || "").trim(), this.now(), id);
    this.log("RESERVATION_FOLLOWUP_UPDATED", "RESERVATION_FOLLOWUP", id, {
      pendingReason: reason,
      waitingForDepartment: input.waitingForDepartment,
    });
    return this.getReservationFollowup(id);
  }

  resolveReservationFollowup(id) {
    const now = this.now();
    this.db.prepare(`
      UPDATE reservation_followups
      SET status = 'RESOLVED', resolved_at = ?, updated_at = ?
      WHERE followup_id = ?
    `).run(now, now, id);
    this.log("RESERVATION_FOLLOWUP_RESOLVED", "RESERVATION_FOLLOWUP", id, {});
    return this.getReservationFollowup(id);
  }

  getVendorIntakeDraftByCode(customerCode) {
    const code = String(customerCode || "").trim().toUpperCase();
    if (!code) return null;
    const draft = this.db.prepare(
      "SELECT * FROM vendor_intake_drafts WHERE customer_code = ?",
    ).get(code);
    if (!draft) return null;
    const hotels = this.db.prepare(`
      SELECT hotel_stay_id, stay_sequence, hotel_name, check_in_date, check_out_date
      FROM vendor_hotel_drafts WHERE vendor_draft_id = ? ORDER BY stay_sequence
    `).all(draft.vendor_draft_id);
    const dayRows = this.db.prepare(`
      SELECT tour_day_id, day_number, service_date, day_title, start_time, finish_time, daywise_text, status
      FROM vendor_day_drafts WHERE vendor_draft_id = ? ORDER BY day_number
    `).all(draft.vendor_draft_id);
    const splitStatement = this.db.prepare(`
      SELECT service_id, split_sequence, service_type, activity_text,
        vendor_id, vendor_name, service_master_id, supplier_id, product_id,
        contract_id, contract_rate_id, price_source,
        adult_rate_idr, child_rate_idr, infant_rate_idr, unit_rate_idr, price_basis, quantity,
        currency, rate_status, manual_price_reason, manual_rate_source,
        manual_evidence_ref, rate_valid_to,
        rate_snapshot_at, status
      FROM vendor_service_splits WHERE tour_day_id = ? ORDER BY split_sequence
    `);
    return {
      vendorDraftId: draft.vendor_draft_id,
      customerCode: draft.customer_code,
      customerName: draft.customer_name,
      clientTag: draft.client_tag || "",
      adultPax: Number(draft.adult_pax || 0),
      childPax: Number(draft.child_pax || 0),
      infantPax: Number(draft.infant_pax || 0),
      tourId: draft.tour_id || "",
      sourcePublicationId: draft.source_publication_id || "",
      sourceRecordVersion: Number(draft.source_record_version || 0),
      sourceRevisionId: draft.source_revision_id || "",
      driveFileId: draft.itinerary_drive_file_id || "",
      driveFileName: draft.itinerary_drive_file_name || "",
      driveFileUrl: draft.itinerary_drive_file_url || "",
      documentHtml: draft.document_html || "",
      arrivalDate: draft.arrival_date || "",
      arrivalFlight: draft.arrival_flight || "",
      arrivalSector: draft.arrival_sector || "",
      arrivalTime: draft.arrival_time || "",
      departureDate: draft.departure_date || "",
      departureFlight: draft.departure_flight || "",
      departureSector: draft.departure_sector || "",
      departureTime: draft.departure_time || "",
      extractionStatus: draft.extraction_status,
      localStatus: draft.local_status,
      ownerEmployeeId: draft.owner_employee_id,
      createdAt: draft.created_at,
      updatedAt: draft.updated_at,
      hotels: hotels.map((hotel) => ({
        hotelStayId: hotel.hotel_stay_id,
        staySequence: Number(hotel.stay_sequence),
        hotelName: hotel.hotel_name,
        checkInDate: hotel.check_in_date || "",
        checkOutDate: hotel.check_out_date || "",
      })),
      days: dayRows.map((day) => ({
        tourDayId: day.tour_day_id,
        dayNumber: Number(day.day_number),
        serviceDate: day.service_date || "",
        dayTitle: day.day_title || "",
        startTime: day.start_time || "",
        finishTime: day.finish_time || "",
        daywiseText: day.daywise_text,
        status: day.status,
        splits: splitStatement.all(day.tour_day_id).map((split) => ({
          serviceId: split.service_id,
          splitSequence: Number(split.split_sequence),
          serviceType: split.service_type,
          activityText: split.activity_text,
          vendorId: split.vendor_id || "",
          vendorName: split.vendor_name || "",
          serviceMasterId: split.service_master_id || "",
          supplierId: split.supplier_id || "",
          productId: split.product_id || "",
          contractId: split.contract_id || "",
          contractRateId: split.contract_rate_id || "",
          priceSource: split.price_source || "NONE",
          adultRateIdr: split.adult_rate_idr,
          childRateIdr: split.child_rate_idr,
          infantRateIdr: split.infant_rate_idr,
          unitRateIdr: split.unit_rate_idr,
          priceBasis: split.price_basis || "PER_SERVICE",
          quantity: Number(split.quantity ?? 1),
          currency: split.currency || "IDR",
          rateStatus: split.rate_status || "PENDING_RATE",
          manualPriceReason: split.manual_price_reason || "",
          manualRateSource: split.manual_rate_source || "",
          manualEvidenceRef: split.manual_evidence_ref || "",
          rateValidTo: split.rate_valid_to || "",
          rateSnapshotAt: split.rate_snapshot_at || "",
          status: split.status,
        })),
      })),
    };
  }

  listVendorIntakeDrafts() {
    return this.db.prepare(`
      SELECT vendor_draft_id, customer_code, customer_name, arrival_date,
        departure_date, extraction_status, local_status, owner_employee_id, updated_at
      FROM vendor_intake_drafts ORDER BY updated_at DESC
    `).all();
  }

  saveVendorIntakeDraft(input) {
    const code = String(input.customerCode || "").trim().toUpperCase();
    if (!code) throw new Error("Customer Code is required.");
    if (!String(input.customerName || "").trim()) throw new Error("Customer Name is required.");
    const existing = this.getVendorIntakeDraftByCode(code);
    const pax = {
      adultPax: Number(input.adultPax ?? 0),
      childPax: Number(input.childPax ?? 0),
      infantPax: Number(input.infantPax ?? 0),
    };
    if (!Object.values(pax).every((value) => Number.isInteger(value) && value >= 0)) {
      throw new Error("Adult, Child, and Infant must be whole numbers starting from 0.");
    }
    const draftId = existing?.vendorDraftId || input.vendorDraftId || this.id("VDR");
    const now = this.now();
    const owner = this.settings().employee_id || "DEV-USER";
    const hotels = Array.isArray(input.hotels) ? input.hotels : [];
    const days = Array.isArray(input.days) ? input.days : [];
    const dayNumbers = new Set();
    days.forEach((day) => {
      const dayNumber = Number(day.dayNumber);
      if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumbers.has(dayNumber)) {
        throw new Error("Each Day Wise row must have a unique positive day number.");
      }
      dayNumbers.add(dayNumber);
      const cachedSupplierTypes = this.getSupplierMasterCatalog().supplierTypes
        .filter((row) => row.status === "ACTIVE")
        .map((row) => normalizeVendorSplitType(row.typeCode));
      const allowedSupplierTypes = cachedSupplierTypes.length
        ? cachedSupplierTypes
        : ["VENDOR", "TOC", "TRANSPORT", "LUGGAGE_VAN", "ADDITIONAL_SERVICE"];
      const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (day.startTime && !timePattern.test(String(day.startTime))) {
        throw new Error(`Day ${dayNumber} Start Time must use HH:MM.`);
      }
      if (day.finishTime && !timePattern.test(String(day.finishTime))) {
        throw new Error(`Day ${dayNumber} Finish Time must use HH:MM.`);
      }
      (day.splits || []).forEach((split) => {
        const serviceType = normalizeVendorSplitType(split.serviceType);
        if (!serviceType || !/^[A-Z][A-Z0-9_]{1,63}$/.test(serviceType)
          || !allowedSupplierTypes.includes(serviceType)) {
          throw new Error("Split type must be an active Supplier Type code.");
        }
        if (!String(split.activityText || "").trim()) {
          throw new Error(`Day ${dayNumber} Vendor Service is required for every split item.`);
        }
        const quantity = Number(split.quantity ?? 1);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(`Day ${dayNumber} split quantity must be greater than 0.`);
        }
        if (["PER_ITEM", "PER_UNIT", "PER_VEHICLE", "PER_TRIP", "PER_SERVICE"].includes(
          String(split.priceBasis || "PER_SERVICE").toUpperCase(),
        ) && !Number.isInteger(quantity)) {
          throw new Error(`Day ${dayNumber} split quantity must be a whole number for this Price Basis.`);
        }
        const priceBasis = String(split.priceBasis || "PER_SERVICE").toUpperCase();
        if (["PER_PAX", "PER_SERVICE"].includes(priceBasis) && quantity !== 1) {
          throw new Error(`Day ${dayNumber} ${priceBasis} quantity is fixed at 1.`);
        }
        if (split.priceSource === "MANUAL" && split.rateStatus === "RATE_READY") {
          const nonNegativeRate = (value) =>
            value !== "" && value !== null && value !== undefined
            && Number.isFinite(Number(value)) && Number(value) >= 0;
          const manualReady = priceBasis === "PER_PAX"
            ? (!pax.adultPax || nonNegativeRate(split.adultRateIdr))
              && (!pax.childPax || nonNegativeRate(split.childRateIdr))
              && (!pax.infantPax || nonNegativeRate(split.infantRateIdr))
            : nonNegativeRate(split.unitRateIdr);
          if (!manualReady) {
            throw new Error(`Day ${dayNumber} manual ${priceBasis} rate is incomplete for RATE_READY.`);
          }
        }
        if (!["RATE_READY", "PENDING_RATE"].includes(String(split.rateStatus || "PENDING_RATE"))) {
          throw new Error(`Day ${dayNumber} split rate status is invalid.`);
        }
        const manualRateFilled = split.priceSource === "MANUAL"
          || split.manualPriceReason || split.manualRateSource || split.manualEvidenceRef;
        if (manualRateFilled && !String(split.manualPriceReason || "").trim()) {
          throw new Error(`Day ${dayNumber} manual rate reason is required.`);
        }
        if (manualRateFilled && !String(split.manualRateSource || "").trim()) {
          throw new Error(`Day ${dayNumber} manual rate source is required.`);
        }
      });
    });

    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO vendor_intake_drafts (
          vendor_draft_id, customer_code, customer_name, client_tag,
          adult_pax, child_pax, infant_pax, tour_id,
          source_publication_id, source_record_version, source_revision_id,
          itinerary_drive_file_id, itinerary_drive_file_name, itinerary_drive_file_url,
          document_html, arrival_date, arrival_flight, arrival_sector, arrival_time,
          departure_date, departure_flight, departure_sector, departure_time,
          extraction_status, local_status, owner_employee_id, created_at, updated_at
        ) VALUES (
          @vendorDraftId, @customerCode, @customerName, @clientTag,
          @adultPax, @childPax, @infantPax, @tourId,
          @sourcePublicationId, @sourceRecordVersion, @sourceRevisionId,
          @driveFileId, @driveFileName, @driveFileUrl,
          @documentHtml, @arrivalDate, @arrivalFlight, @arrivalSector, @arrivalTime,
          @departureDate, @departureFlight, @departureSector, @departureTime,
          @extractionStatus, @localStatus, @ownerEmployeeId, @createdAt, @updatedAt
        )
        ON CONFLICT(customer_code) DO UPDATE SET
          customer_name=excluded.customer_name, client_tag=excluded.client_tag,
          adult_pax=excluded.adult_pax,
          child_pax=excluded.child_pax, infant_pax=excluded.infant_pax, tour_id=excluded.tour_id,
          source_publication_id=excluded.source_publication_id,
          source_record_version=excluded.source_record_version,
          source_revision_id=excluded.source_revision_id,
          itinerary_drive_file_id=excluded.itinerary_drive_file_id,
          itinerary_drive_file_name=excluded.itinerary_drive_file_name,
          itinerary_drive_file_url=excluded.itinerary_drive_file_url,
          document_html=excluded.document_html, arrival_date=excluded.arrival_date,
          arrival_flight=excluded.arrival_flight, arrival_sector=excluded.arrival_sector,
          arrival_time=excluded.arrival_time, departure_date=excluded.departure_date,
          departure_flight=excluded.departure_flight, departure_sector=excluded.departure_sector,
          departure_time=excluded.departure_time, extraction_status=excluded.extraction_status,
          local_status=excluded.local_status, owner_employee_id=excluded.owner_employee_id,
          updated_at=excluded.updated_at
      `).run({
        vendorDraftId: draftId,
        customerCode: code,
        customerName: String(input.customerName || "").trim(),
        clientTag: String(input.clientTag || "").trim().toUpperCase(),
        adultPax: pax.adultPax,
        childPax: pax.childPax,
        infantPax: pax.infantPax,
        tourId: input.tourId || "",
        sourcePublicationId: input.sourcePublicationId || "",
        sourceRecordVersion: Number(input.sourceRecordVersion || 0),
        sourceRevisionId: input.sourceRevisionId || "",
        driveFileId: input.driveFileId || "",
        driveFileName: input.driveFileName || "",
        driveFileUrl: input.driveFileUrl || "",
        documentHtml: input.documentHtml || "",
        arrivalDate: input.arrivalDate || "",
        arrivalFlight: input.arrivalFlight || "",
        arrivalSector: input.arrivalSector || "",
        arrivalTime: input.arrivalTime || "",
        departureDate: input.departureDate || "",
        departureFlight: input.departureFlight || "",
        departureSector: input.departureSector || "",
        departureTime: input.departureTime || "",
        extractionStatus: input.extractionStatus || "NEEDS_REVIEW",
        localStatus: input.localStatus || "LOCAL_DRAFT",
        ownerEmployeeId: owner,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      });
      this.db.prepare("DELETE FROM vendor_hotel_drafts WHERE vendor_draft_id = ?").run(draftId);
      this.db.prepare(`
        DELETE FROM vendor_service_splits WHERE tour_day_id IN (
          SELECT tour_day_id FROM vendor_day_drafts WHERE vendor_draft_id = ?
        )
      `).run(draftId);
      this.db.prepare("DELETE FROM vendor_day_drafts WHERE vendor_draft_id = ?").run(draftId);
      const insertHotel = this.db.prepare(`
        INSERT INTO vendor_hotel_drafts (
          hotel_stay_id, vendor_draft_id, stay_sequence, hotel_name, check_in_date, check_out_date
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      hotels.forEach((hotel, index) => insertHotel.run(
        hotel.hotelStayId || this.id("HST"), draftId, index + 1,
        String(hotel.hotelName || "").trim(), hotel.checkInDate || "", hotel.checkOutDate || "",
      ));
      const insertDay = this.db.prepare(`
        INSERT INTO vendor_day_drafts (
          tour_day_id, vendor_draft_id, day_number, service_date, day_title,
          start_time, finish_time, daywise_text, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertSplit = this.db.prepare(`
        INSERT INTO vendor_service_splits (
          service_id, tour_day_id, split_sequence, service_type,
          activity_text, vendor_id, vendor_name, service_master_id,
          supplier_id, product_id, contract_id, contract_rate_id, price_source,
          adult_rate_idr, child_rate_idr, infant_rate_idr, unit_rate_idr, price_basis, quantity,
          currency, rate_status, manual_price_reason, manual_rate_source,
          manual_evidence_ref, rate_valid_to,
          rate_snapshot_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      days.forEach((day) => {
        const dayId = day.tourDayId || this.id("TDAY");
        insertDay.run(
          dayId, draftId, Number(day.dayNumber), day.serviceDate || "",
          String(day.dayTitle || "").trim(), day.startTime || "", day.finishTime || "",
          String(day.daywiseText || ""), day.status || "DRAFT",
        );
        (day.splits || []).forEach((split, index) => insertSplit.run(
          split.serviceId || this.id("SVC"), dayId, index + 1,
          normalizeVendorSplitType(split.serviceType || "VENDOR"),
          String(split.activityText || ""), split.vendorId || "",
          String(split.vendorName || ""), split.serviceMasterId || "",
          split.supplierId || split.vendorId || "", split.productId || split.serviceMasterId || "",
          split.contractId || "", split.contractRateId || "",
          split.priceSource || "NONE",
          split.adultRateIdr === "" ? null : (split.adultRateIdr ?? null),
          split.childRateIdr === "" ? null : (split.childRateIdr ?? null),
          split.infantRateIdr === "" ? null : (split.infantRateIdr ?? null),
          split.unitRateIdr === "" ? null : (split.unitRateIdr ?? null),
          split.priceBasis || "PER_SERVICE", Number(split.quantity ?? 1),
          split.currency || "IDR", split.rateStatus || "PENDING_RATE",
          String(split.manualPriceReason || ""), String(split.manualRateSource || ""),
          String(split.manualEvidenceRef || ""), split.rateValidTo || "",
          split.rateSnapshotAt || now, split.status || "DRAFT",
        ));
      });
    })();
    const saved = this.getVendorIntakeDraftByCode(code);
    this.log("VENDOR_INTAKE_DRAFT_SAVED", "VENDOR_INTAKE", draftId, {
      customerCode: code,
      hotelCount: saved.hotels.length,
      dayCount: saved.days.length,
      splitCount: saved.days.reduce((sum, day) => sum + day.splits.length, 0),
    });
    return saved;
  }

  markVendorIntakePublished(customerCode) {
    const code = String(customerCode || "").trim().toUpperCase();
    this.db.prepare(`
      UPDATE vendor_intake_drafts SET local_status = 'PUBLISHED', updated_at = ?
      WHERE customer_code = ?
    `).run(this.now(), code);
    return this.getVendorIntakeDraftByCode(code);
  }

  listVendorBookingQueue() {
    const catalog = this.getSupplierMasterCatalog();
    const active = (row) => String(row.status || "ACTIVE").toUpperCase() !== "ARCHIVED"
      && row.active !== false;
    const suppliers = (catalog.suppliers || []).filter(active);
    const products = new Map((catalog.products || []).filter(active)
      .map((row) => [String(row.productId || ""), row]));
    const rateApprovals = new Map(this.listSupplierRateApprovals()
      .map((row) => [String(row.entityId || ""), row]));
    const supplierById = new Map(suppliers.map((row) => [String(row.supplierId || ""), row]));
    const supplierByName = new Map(suppliers.map((row) => [
      String(row.supplierName || "").trim().toUpperCase(), row,
    ]));
    const packages = new Map();
    for (const summary of this.listVendorIntakeDrafts()) {
      const intake = this.getVendorIntakeDraftByCode(summary.customer_code);
      for (const day of intake?.days || []) {
        for (const split of day.splits || []) {
          const type = normalizeVendorSplitType(split.serviceType);
          if (type !== "VENDOR") continue;
          const matchedSupplier = supplierById.get(String(split.supplierId || ""))
            || supplierByName.get(String(split.vendorName || "").trim().toUpperCase())
            || null;
          const supplierId = String(matchedSupplier?.supplierId || split.supplierId || "");
          const supplierName = String(matchedSupplier?.supplierName || split.vendorName || "Unassigned supplier").trim();
          const identity = supplierId || `NAME:${supplierName.toUpperCase()}`;
          const packageKey = `${intake.customerCode}|${identity}`;
          if (!packages.has(packageKey)) {
            packages.set(packageKey, {
              packageKey,
              customerCode: intake.customerCode,
              customerName: intake.customerName,
              clientTag: intake.clientTag || "",
              tourId: intake.tourId || "",
              sourceRevisionId: intake.sourceRevisionId || "",
              arrivalDate: intake.arrivalDate || "",
              departureDate: intake.departureDate || "",
              adultPax: Number(intake.adultPax || 0),
              childPax: Number(intake.childPax || 0),
              infantPax: Number(intake.infantPax || 0),
              updatedAt: intake.updatedAt || "",
              supplierId,
              supplierName,
              supplierType: type,
              masterLinked: Boolean(matchedSupplier),
              services: [],
            });
          }
          const product = products.get(String(split.productId || "")) || {};
          const serviceDate = day.serviceDate || "";
          const hotelsOnDay = (intake.hotels || []).filter((hotel) =>
            serviceDate
            && (!hotel.checkInDate || hotel.checkInDate <= serviceDate)
            && (!hotel.checkOutDate || serviceDate < hotel.checkOutDate)
          ).map((hotel) => hotel.hotelName).filter(Boolean);
          packages.get(packageKey).services.push({
            ...split,
            serviceType: type,
            dayNumber: Number(day.dayNumber || 0),
            serviceDate,
            dayTitle: day.dayTitle || "",
            startTime: day.startTime || "",
            finishTime: day.finishTime || "",
            hotelOnDay: hotelsOnDay.join(" => "),
            productName: product.productName || split.activityText,
            localRateApprovalStatus: rateApprovals.get(String(split.contractId || ""))?.status || "",
            localRateApprovalId: rateApprovals.get(String(split.contractId || ""))?.approvalId || "",
            rateProvenance: rateApprovals.has(String(split.contractId || ""))
              ? "LOCAL_SUPPLIER_RATE"
              : (split.priceSource || "NONE"),
          });
        }
      }
    }
    const latestStatement = this.db.prepare(`
      SELECT * FROM local_vendor_bookings
      WHERE package_key = ?
      ORDER BY updated_at DESC LIMIT 1
    `);
    const serviceStateStatement = this.db.prepare(`
      SELECT s.service_id, b.booking_id, b.action_type, b.communication_status,
        b.supplier_result, b.official_sync_status, b.gmail_thread_id,
        b.external_reference, b.generated_at, b.sent_at, b.updated_at
      FROM local_vendor_booking_services s
      JOIN local_vendor_bookings b ON b.booking_id = s.booking_id
      WHERE b.package_key = ?
      ORDER BY b.updated_at DESC, s.created_at DESC
    `);
    return [...packages.values()].map((item) => {
      const latest = latestStatement.get(item.packageKey);
      const serviceStateById = new Map();
      serviceStateStatement.all(item.packageKey).forEach((row) => {
        if (!serviceStateById.has(row.service_id)) serviceStateById.set(row.service_id, row);
      });
      const services = [...item.services].sort((left, right) =>
        compareVendorServices(left, right)
      ).map((service) => {
        const bookingState = serviceStateById.get(service.serviceId);
        return {
          ...service,
          bookingId: bookingState?.booking_id || "",
          actionType: bookingState?.action_type || "NEW",
          workflowStatus: bookingState?.communication_status || "NOT_GENERATED",
          supplierResult: bookingState?.supplier_result || "PENDING",
          officialSyncStatus: bookingState?.official_sync_status || "NOT_REQUIRED",
          gmailThreadId: bookingState?.gmail_thread_id || "",
          externalReference: bookingState?.external_reference || "",
          generatedAt: bookingState?.generated_at || "",
          sentAt: bookingState?.sent_at || "",
        };
      });
      const generatedCount = services.filter((service) =>
        service.workflowStatus !== "NOT_GENERATED"
      ).length;
      const pendingRates = item.services.filter((service) => service.rateStatus !== "RATE_READY").length;
      return {
        ...item,
        services,
        firstServiceDate: services[0]?.serviceDate || "",
        firstDayNumber: Number(services[0]?.dayNumber || 0),
        firstProductName: services[0]?.productName || services[0]?.activityText || "",
        serviceCount: item.services.length,
        generatedCount,
        eligibleCount: services.filter((service) =>
          service.workflowStatus === "NOT_GENERATED"
        ).length,
        pendingRateCount: pendingRates,
        rateStatus: pendingRates ? "PENDING_RATE" : "RATE_READY",
        latestBooking: latest ? this.vendorBookingRow(latest) : null,
        workflowStatus: generatedCount === 0
          ? "NOT_GENERATED"
          : generatedCount < services.length ? "PARTIALLY_GENERATED"
            : latest?.communication_status || "GENERATED",
        updatedAt: latest?.updated_at || item.updatedAt,
      };
    }).sort((a, b) =>
      String(a.firstServiceDate || "9999-12-31").localeCompare(String(b.firstServiceDate || "9999-12-31"))
      || Number(a.firstDayNumber || 0) - Number(b.firstDayNumber || 0)
      || a.customerCode.localeCompare(b.customerCode)
      || normalizedSortText(a.supplierName).localeCompare(normalizedSortText(b.supplierName))
      || a.packageKey.localeCompare(b.packageKey)
    );
  }

  getVendorBookingPreview(input = {}) {
    const packageKey = String(input.packageKey || "");
    const item = this.listVendorBookingQueue().find((row) => row.packageKey === packageKey);
    if (!item) throw new Error("Vendor booking package was not found. Save the Micro Split first.");
    const requestedBooking = input.bookingId ? this.getVendorBooking(String(input.bookingId)) : null;
    if (requestedBooking && requestedBooking.packageKey !== packageKey) {
      throw new Error("The requested booking does not belong to this supplier package.");
    }
    const requestedServiceIds = [...new Set(
      (Array.isArray(input.serviceIds) ? input.serviceIds : [])
        .map((value) => String(value || "").trim()).filter(Boolean),
    )];
    const availableServiceIds = new Set(item.services.map((service) => service.serviceId));
    if (requestedServiceIds.some((serviceId) => !availableServiceIds.has(serviceId))) {
      throw new Error("One or more selected Micro Split services no longer belong to this package.");
    }
    let selectedServices = requestedServiceIds.length
      ? item.services.filter((service) => requestedServiceIds.includes(service.serviceId))
      : item.services;
    if (!selectedServices.length) throw new Error("Choose at least one Micro Split service.");
    const catalog = this.getSupplierMasterCatalog();
    const active = (row) => String(row.status || "ACTIVE").toUpperCase() !== "ARCHIVED"
      && row.active !== false;
    const sops = (catalog.sops || []).filter((row) => active(row) && row.supplierId === item.supplierId);
    const recipients = (catalog.recipients || [])
      .filter((row) => active(row) && row.supplierId === item.supplierId && String(row.address || "").trim());
    const contacts = (catalog.contacts || []).filter((row) => active(row) && row.supplierId === item.supplierId);
    const sop = sops[0] || {};
    const availableChannels = [...new Set([
      ...(sop.bookingChannels || []),
      ...recipients.map((row) => row.channel),
      ...contacts.map((row) => row.preferredChannel),
    ].map((value) => String(value || "").toUpperCase()).filter(Boolean))];
    if (!availableChannels.length) availableChannels.push("OTHERS");
    const channel = String(input.channel || availableChannels[0]).toUpperCase();
    selectedServices = [...selectedServices].sort((left, right) =>
      compareVendorServices(left, right, channel)
    );
    let selectedRecipients = recipients
      .filter((row) => String(row.channel || "").toUpperCase() === channel)
      .map((row) => ({
        recipientType: String(row.recipientType || "TO").toUpperCase(),
        address: String(row.address || "").trim(),
        purpose: row.purpose || "",
      }));
    if (!selectedRecipients.length && channel === "EMAIL") {
      selectedRecipients = contacts.filter((row) => row.email).map((row, index) => ({
        recipientType: index ? "CC" : "TO", address: row.email, purpose: row.responsibility || "",
      }));
    }
    if (!selectedRecipients.length && channel === "WHATSAPP") {
      selectedRecipients = contacts.filter((row) => row.whatsapp).map((row) => ({
        recipientType: "WHATSAPP", address: row.whatsapp, purpose: row.responsibility || "",
      }));
    }
    const actionType = String(input.actionType || "NEW").toUpperCase();
    const label = actionType === "CANCEL" ? "Cancellation" : actionType === "AMEND" ? "Amendment" : "Booking";
    const values = {
      customer_code: item.customerCode,
      customer_name: item.customerName,
      client_tag: item.clientTag,
      supplier_name: item.supplierName,
      arrival_date: item.arrivalDate,
      departure_date: item.departureDate,
      adult_pax: item.adultPax,
      child_pax: item.childPax,
      infant_pax: item.infantPax,
    };
    const applyTemplate = (template) => String(template || "").replace(
      /\{\{\s*([a-z_]+)\s*\}\}/gi,
      (_match, key) => String(values[String(key).toLowerCase()] ?? ""),
    );
    const serviceLines = selectedServices.map((service) => {
      const dayContext = [
        `Day ${service.dayNumber}`,
        service.serviceDate || "date pending",
        service.dayTitle ? `Header: ${service.dayTitle}` : "",
      ].filter(Boolean).join(" | ");
      const operationalContext = [
        service.hotelOnDay ? `Hotel: ${service.hotelOnDay}` : "",
        service.startTime ? `Start: ${service.startTime}` : "",
        service.finishTime ? `Finish: ${service.finishTime}` : "",
      ].filter(Boolean).join(" | ");
      return `- ${dayContext}\n  ${service.productName}`
        + `${service.quantity && Number(service.quantity) !== 1 ? ` | qty ${service.quantity}` : ""}`
        + `${operationalContext ? `\n  ${operationalContext}` : ""}`;
    }).join("\n");
    const subject = [
      `${label} ${item.customerCode}`,
      item.customerName,
      item.clientTag,
      item.supplierName,
    ].map((value) => String(value || "").trim()).filter(Boolean).join(" - ");
    const defaultBody = [
      `Dear ${item.supplierName} Team,`,
      "",
      `Please ${actionType === "CANCEL" ? "cancel all services" : actionType === "AMEND" ? "revise the booking" : "arrange the following booking"} for:`,
      `Customer: ${item.customerName}`,
      `Customer Code: ${item.customerCode}`,
      `Pax: ${item.adultPax} adult, ${item.childPax} child, ${item.infantPax} infant`,
      "",
      serviceLines,
      "",
      actionType === "CANCEL" && input.cancellationReason
        ? `Cancellation reason: ${String(input.cancellationReason).trim()}`
        : "Please confirm availability and booking reference.",
      "",
      "Regards,",
      "Peak Season Holidays",
    ].join("\n");
    const destinationReady = channel === "EMAIL"
      ? selectedRecipients.some((row) => row.recipientType === "TO" && row.address)
        : channel === "WHATSAPP"
          ? selectedRecipients.some((row) => row.address)
        : channel === "PORTAL"
          ? /^https:\/\//i.test(String(sop.portalUrl || ""))
          : selectedRecipients.some((row) => row.address) || channel === "OTHERS";
    const selectedPendingRateCount = selectedServices.filter((service) =>
      service.rateStatus !== "RATE_READY"
    ).length;
    const localRateImpactCount = selectedServices.filter((service) =>
      ["REJECTED", "CHANGES_REQUESTED", "CANCELED_PAYLOAD_CHANGED"].includes(
        String(service.localRateApprovalStatus || "").toUpperCase(),
      )
    ).length;
    const bookingDate = String(input.bookingDate || this.now().slice(0, 10));
    const earliestServiceDate = selectedServices[0]?.serviceDate || "";
    const portalPaymentRule = String(sop.portalPaymentRule || "").toUpperCase();
    const portalLeadDays = channel === "PORTAL"
      ? calendarLeadDays(bookingDate, earliestServiceDate)
      : null;
    const portalPaymentInstruction = channel === "PORTAL"
      && portalPaymentRule === "EKA_JAYA_15_DAY"
      && portalLeadDays !== null
        ? (portalLeadDays <= 15 ? "USE DEPOSIT" : "USE PREPAID")
        : "";
    const selectedIdSet = new Set(selectedServices.map((service) => service.serviceId));
    const possiblePortalReturn = channel === "PORTAL" && item.services.some((service) =>
      !selectedIdSet.has(service.serviceId)
      && (!earliestServiceDate || !service.serviceDate || service.serviceDate >= earliestServiceDate)
    );
    const readinessNotices = [
      !item.masterLinked ? "Supplier is not linked to an active Supplier Master entry." : "",
      !sops.length ? "Active Supplier Booking SOP is missing." : "",
      !destinationReady ? `${channel} destination is missing.` : "",
      selectedPendingRateCount ? `${selectedPendingRateCount} item(s) use pending or manual rates; communication remains allowed.` : "",
      localRateImpactCount
        ? `${localRateImpactCount} local-rate item(s) require approval impact review before a new booking.`
        : "",
      portalPaymentInstruction
        ? `Eka Jaya payment instruction: ${portalPaymentInstruction} (${portalLeadDays} calendar days before outbound).`
        : "",
      possiblePortalReturn ? "Possible return segment not included." : "",
    ].filter(Boolean);
    return {
      ...item,
      latestBooking: requestedBooking || item.latestBooking,
      services: selectedServices,
      selectedServiceIds: selectedServices.map((service) => service.serviceId),
      serviceCount: selectedServices.length,
      pendingRateCount: selectedPendingRateCount,
      rateStatus: selectedPendingRateCount ? "PENDING_RATE" : "RATE_READY",
      actionType,
      availableChannels,
      channel,
      recipients: selectedRecipients,
      subject,
      body: applyTemplate(sop.bodyTemplate) || defaultBody,
      templateVersion: sop.bodyTemplate || sop.subjectTemplate ? "SUPPLIER_SOP" : "STANDARD_V1",
      destinationReady,
      readinessNotices,
      sop: {
        leadTime: sop.leadTime || "",
        cutoffTime: sop.cutoffTime || "",
        portalUrl: sop.portalUrl || "",
        accountReference: sop.accountReference || "",
        portalPaymentRule,
        confirmationProcedure: sop.confirmationProcedure || "",
        amendmentProcedure: sop.amendmentProcedure || "",
        cancellationProcedure: sop.cancellationProcedure || "",
      },
      portalTransaction: channel === "PORTAL" ? {
        bookingDate,
        earliestServiceDate,
        leadDays: portalLeadDays,
        paymentInstruction: portalPaymentInstruction,
        ruleVersion: portalPaymentInstruction ? "EKA_JAYA_15_DAY_V1" : "",
        serviceIds: selectedServices.map((service) => service.serviceId),
      } : null,
      cancellationReason: String(input.cancellationReason || ""),
      canSendEmail: channel === "EMAIL"
        && selectedRecipients.some((row) => row.recipientType === "TO" && row.address),
      requiresExternalAction: channel !== "EMAIL",
    };
  }

  saveVendorBookingPreview(input = {}) {
    const preview = this.getVendorBookingPreview(input);
    const now = this.now();
    const requestedId = String(
      input.bookingId
      || (preview.latestBooking?.actionType === preview.actionType
        ? preview.latestBooking.bookingId
        : "")
      || "",
    );
    const requested = requestedId ? this.getVendorBooking(requestedId) : null;
    const canReuse = requested
      && requested.actionType === preview.actionType
      && !["SENT", "SENT_PENDING_SYNC", "SEND_OUTCOME_UNKNOWN"].includes(
        requested.communicationStatus,
      );
    const bookingId = canReuse ? requestedId : this.id("VBK");
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO local_vendor_bookings (
          booking_id, package_key, customer_code, tour_id, supplier_id, supplier_name,
          supplier_type, action_type, channel, booking_status, communication_status,
          supplier_result, rate_status, subject, body, recipients_json,
          source_revision_id, cancellation_reason, external_evidence_json,
          generated_at, created_at, updated_at
        ) VALUES (
          @bookingId, @packageKey, @customerCode, @tourId, @supplierId, @supplierName,
          @supplierType, @actionType, @channel, 'READY', 'GENERATED',
          'PENDING', @rateStatus, @subject, @body, @recipientsJson,
          @sourceRevisionId, @cancellationReason, @externalEvidenceJson,
          @now, @now, @now
        )
        ON CONFLICT(booking_id) DO UPDATE SET
          action_type=excluded.action_type, channel=excluded.channel,
          booking_status='READY', communication_status='GENERATED',
          rate_status=excluded.rate_status, subject=excluded.subject, body=excluded.body,
          recipients_json=excluded.recipients_json,
          cancellation_reason=excluded.cancellation_reason,
          external_evidence_json=excluded.external_evidence_json,
          generated_at=excluded.generated_at, updated_at=excluded.updated_at
      `).run({
        ...preview,
        bookingId,
        recipientsJson: JSON.stringify(input.recipients || preview.recipients),
        subject: String(input.subject || preview.subject),
        body: String(input.body || preview.body),
        externalEvidenceJson: JSON.stringify({
          portalTransaction: preview.portalTransaction || null,
          generatedServiceIds: preview.selectedServiceIds,
        }),
        now,
      });
      this.db.prepare("DELETE FROM local_vendor_booking_services WHERE booking_id = ?").run(bookingId);
      const insert = this.db.prepare(`
        INSERT INTO local_vendor_booking_services (
          booking_service_id, booking_id, service_id, service_snapshot_json,
          service_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      preview.services.forEach((service) => insert.run(
        this.id("VBS"), bookingId, service.serviceId, JSON.stringify(service),
        preview.actionType === "CANCEL" ? "CANCEL_REQUIRED" : "REQUIRED", now,
      ));
    })();
    this.log("VENDOR_BOOKING_GENERATED", "VENDOR_BOOKING", bookingId, {
      customerCode: preview.customerCode,
      supplierName: preview.supplierName,
      actionType: preview.actionType,
      serviceCount: preview.services.length,
      rateStatus: preview.rateStatus,
    });
    return this.getVendorBooking(bookingId);
  }

  getVendorBooking(bookingId) {
    const row = this.db.prepare("SELECT * FROM local_vendor_bookings WHERE booking_id = ?").get(bookingId);
    if (!row) return null;
    return {
      ...this.vendorBookingRow(row),
      services: this.db.prepare(`
        SELECT service_snapshot_json FROM local_vendor_booking_services
        WHERE booking_id = ? ORDER BY created_at
      `).all(bookingId).map((item) => JSON.parse(item.service_snapshot_json)),
      deliveryAttempts: this.listVendorSendAttempts(bookingId),
      replyEvidence: this.db.prepare(`
        SELECT * FROM local_vendor_reply_evidence
        WHERE booking_id = ? ORDER BY received_at
      `).all(bookingId).map((item) => ({
        gmailMessageId: item.gmail_message_id,
        sendAttemptId: item.send_attempt_id || "",
        gmailThreadId: item.gmail_thread_id,
        receivedAt: item.received_at,
        detectedAt: item.detected_at,
      })),
    };
  }

  listVendorBookings() {
    const serviceStatement = this.db.prepare(`
      SELECT service_snapshot_json FROM local_vendor_booking_services
      WHERE booking_id = ? ORDER BY created_at
    `);
    return this.db.prepare(`
      SELECT b.*, i.customer_name, i.adult_pax, i.child_pax, i.infant_pax,
        i.arrival_date, i.departure_date
      FROM local_vendor_bookings b
      LEFT JOIN vendor_intake_drafts i ON i.customer_code = b.customer_code
      ORDER BY b.updated_at DESC
    `).all().map((row) => ({
      ...this.vendorBookingRow(row),
      customerName: row.customer_name || "",
      adultPax: Number(row.adult_pax || 0),
      childPax: Number(row.child_pax || 0),
      infantPax: Number(row.infant_pax || 0),
      arrivalDate: row.arrival_date || "",
      departureDate: row.departure_date || "",
      services: serviceStatement.all(row.booking_id).map((item) =>
        JSON.parse(item.service_snapshot_json || "{}")
      ),
    }));
  }

  recordVendorBookingExternalAction(input = {}) {
    const bookingId = String(input.bookingId || "");
    const booking = this.getVendorBooking(bookingId);
    if (!booking) throw new Error("Generated booking was not found.");
    const reference = String(input.externalReference || "").trim();
    if (!reference) throw new Error("External booking reference or evidence note is required.");
    const now = this.now();
    const canceled = booking.actionType === "CANCEL";
    const evidence = {
      ...(booking.externalEvidence || {}),
      externalReference: reference,
      channel: booking.channel,
      recordedAt: now,
      serviceIds: booking.services.map((service) => service.serviceId).filter(Boolean),
    };
    this.db.prepare(`
      UPDATE local_vendor_bookings
      SET booking_status = ?, communication_status = 'SENT',
        external_reference = ?, external_evidence_json = ?, sent_at = ?, updated_at = ?
      WHERE booking_id = ?
    `).run(
      canceled ? "CANCELED" : "ACTIVE",
      reference,
      JSON.stringify(evidence),
      now,
      now,
      bookingId,
    );
    this.log("VENDOR_BOOKING_EXTERNAL_SENT", "VENDOR_BOOKING", bookingId, {
      channel: booking.channel, externalReference: reference,
    });
    return this.getVendorBooking(bookingId);
  }

  refreshVendorPortalEvidence(bookingId, bookingDate = "") {
    const booking = this.getVendorBooking(String(bookingId || ""));
    if (!booking || booking.channel !== "PORTAL") {
      throw new Error("Generated Portal booking was not found.");
    }
    if (booking.communicationStatus !== "GENERATED") {
      throw new Error("Portal payment instruction can only refresh before the booking is recorded.");
    }
    const preview = this.getVendorBookingPreview({
      packageKey: booking.packageKey,
      bookingId: booking.bookingId,
      serviceIds: booking.services.map((service) => service.serviceId),
      actionType: booking.actionType,
      channel: "PORTAL",
      bookingDate: bookingDate || this.now().slice(0, 10),
    });
    const evidence = {
      ...(booking.externalEvidence || {}),
      portalTransaction: preview.portalTransaction,
      generatedServiceIds: preview.selectedServiceIds,
      recheckedAt: this.now(),
    };
    this.db.prepare(`
      UPDATE local_vendor_bookings
      SET external_evidence_json=?, updated_at=? WHERE booking_id=?
    `).run(JSON.stringify(evidence), this.now(), booking.bookingId);
    return {
      booking: this.getVendorBooking(booking.bookingId),
      portalTransaction: preview.portalTransaction,
    };
  }

  recordVendorBookingEmailSent(input = {}) {
    const bookingId = String(input.bookingId || "");
    const booking = this.getVendorBooking(bookingId);
    if (!booking) throw new Error("Generated booking was not found.");
    if (booking.communicationStatus === "SENT") return booking;
    const messageId = String(input.gmailMessageId || "").trim();
    if (!messageId) throw new Error("Gmail message evidence is required.");
    const now = this.now();
    const canceled = booking.actionType === "CANCEL";
    this.db.prepare(`
      UPDATE local_vendor_bookings
      SET booking_status = ?, communication_status = 'SENT',
        gmail_thread_id = ?, gmail_message_id = ?, sent_at = ?, updated_at = ?
      WHERE booking_id = ?
    `).run(
      canceled ? "CANCELED" : "ACTIVE",
      String(input.gmailThreadId || ""), messageId, now, now, bookingId,
    );
    this.log("VENDOR_BOOKING_EMAIL_SENT", "VENDOR_BOOKING", bookingId, {
      gmailMessageId: messageId,
      gmailThreadId: String(input.gmailThreadId || ""),
    });
    return this.getVendorBooking(bookingId);
  }

  prepareVendorBookingSendAttempt(input = {}) {
    const bookingId = String(input.bookingId || "");
    const booking = this.getVendorBooking(bookingId);
    if (!booking) throw new Error("Generated booking was not found.");
    if (booking.channel !== "EMAIL") throw new Error("This booking channel is not Email.");
    const resendOfAttemptId = String(input.resendOfAttemptId || "").trim();
    const resendReason = String(input.resendReason || "").trim();
    const isResend = Boolean(resendOfAttemptId);
    if (isResend && !resendReason) {
      throw new Error("Intentional resend requires a reason.");
    }
    const originalAttempt = isResend ? this.getVendorSendAttempt(resendOfAttemptId) : null;
    if (isResend && (!originalAttempt || originalAttempt.bookingId !== bookingId)) {
      throw new Error("Original send attempt was not found for this booking.");
    }
    if (!isResend && booking.communicationStatus !== "GENERATED") {
      throw new Error(
        booking.communicationStatus === "SENT"
          ? "This booking is already sent. Prepare an Amendment instead."
          : `Email cannot be sent while communication status is ${booking.communicationStatus}.`,
      );
    }
    if (isResend && !["SENT", "SENT_PENDING_SYNC"].includes(booking.communicationStatus)) {
      throw new Error(`Intentional resend is not available while communication status is ${booking.communicationStatus}.`);
    }
    if (input.expectedBookingUpdatedAt
      && String(input.expectedBookingUpdatedAt) !== String(booking.updatedAt)) {
      throw new Error("The generated booking snapshot changed. Reopen and review it before sending.");
    }
    const recipients = (Array.isArray(input.recipients) ? input.recipients : booking.recipients)
      .map((row) => ({
        recipientType: String(row.recipientType || "").trim().toUpperCase(),
        address: String(row.address || "").trim(),
        purpose: String(row.purpose || ""),
      }))
      .filter((row) => row.address);
    if (!recipients.some((row) => row.recipientType === "TO")) {
      throw new Error("At least one TO email address is required before a Send Attempt can be created.");
    }
    const active = this.db.prepare(`
      SELECT * FROM local_vendor_send_attempts
      WHERE booking_id = ?
        AND status IN ('PREPARED','SEND_OUTCOME_UNKNOWN','GMAIL_ACCEPTED','SENT_PENDING_SYNC')
      ORDER BY prepared_at DESC LIMIT 1
    `).get(bookingId);
    if (active) {
      throw new Error(
        `Send attempt ${active.send_attempt_id} is ${active.status}. Reconcile that attempt before any new send.`,
      );
    }
    const now = this.now();
    const sendAttemptId = this.id("VSEND");
    const snapshot = {
      sendAttemptId,
      bookingId,
      packageKey: booking.packageKey,
      customerCode: booking.customerCode,
      tourId: booking.tourId,
      sourceRevisionId: booking.sourceRevisionId,
      supplierId: booking.supplierId,
      supplierName: booking.supplierName,
      actionType: booking.actionType,
      channel: booking.channel,
      recipients,
      subject: booking.subject,
      body: booking.body,
      services: booking.services,
      rateStatus: booking.rateStatus,
      actorEmail: String(input.actorEmail || "").trim().toLowerCase(),
      resendOfAttemptId,
      resendReason,
      preparedAt: now,
    };
    const snapshotJson = JSON.stringify(snapshot);
    const snapshotHash = crypto.createHash("sha256").update(snapshotJson).digest("hex");
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO local_vendor_send_attempts (
          send_attempt_id, booking_id, resend_of_attempt_id, resend_reason,
          snapshot_json, snapshot_hash, actor_email,
          status, prepared_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PREPARED', ?, ?)
      `).run(
        sendAttemptId, bookingId, resendOfAttemptId, resendReason, snapshotJson, snapshotHash,
        snapshot.actorEmail, now, now,
      );
      this.db.prepare(`
        UPDATE local_vendor_bookings
        SET last_send_attempt_id = ?, official_sync_status = 'PENDING',
          updated_at = ?
        WHERE booking_id = ?
      `).run(sendAttemptId, now, bookingId);
    })();
    this.log("VENDOR_SEND_ATTEMPT_PREPARED", "VENDOR_SEND_ATTEMPT", sendAttemptId, {
      bookingId, snapshotHash, actorEmail: snapshot.actorEmail,
    });
    return this.getVendorSendAttempt(sendAttemptId);
  }

  getVendorSendAttempt(sendAttemptId) {
    const row = this.db.prepare(
      "SELECT * FROM local_vendor_send_attempts WHERE send_attempt_id = ?",
    ).get(String(sendAttemptId || ""));
    if (!row) return null;
    return {
      sendAttemptId: row.send_attempt_id,
      bookingId: row.booking_id,
      resendOfAttemptId: row.resend_of_attempt_id || "",
      resendReason: row.resend_reason || "",
      snapshot: JSON.parse(row.snapshot_json || "{}"),
      snapshotHash: row.snapshot_hash,
      actorEmail: row.actor_email,
      status: row.status,
      gmailMessageId: row.gmail_message_id,
      gmailThreadId: row.gmail_thread_id,
      officialEvidenceId: row.official_evidence_id,
      syncAttempts: Number(row.sync_attempts || 0),
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
      preparedAt: row.prepared_at,
      gmailAcceptedAt: row.gmail_accepted_at || "",
      syncedAt: row.synced_at || "",
      updatedAt: row.updated_at,
    };
  }

  listVendorSendAttempts(bookingId) {
    return this.db.prepare(`
      SELECT send_attempt_id FROM local_vendor_send_attempts
      WHERE booking_id = ? ORDER BY prepared_at DESC
    `).all(String(bookingId || "")).map((row) =>
      this.getVendorSendAttempt(row.send_attempt_id)
    );
  }

  recordVendorSendOutcomeUnknown(sendAttemptId, error) {
    const attempt = this.getVendorSendAttempt(sendAttemptId);
    if (!attempt) throw new Error("Send attempt was not found.");
    const now = this.now();
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE local_vendor_send_attempts
        SET status = 'SEND_OUTCOME_UNKNOWN', last_error_code = 'GMAIL_OUTCOME_UNKNOWN',
          last_error_message = ?, updated_at = ?
        WHERE send_attempt_id = ?
      `).run(String(error?.message || error || "Gmail send outcome is unknown."), now, sendAttemptId);
      this.db.prepare(`
        UPDATE local_vendor_bookings
        SET communication_status = 'SEND_OUTCOME_UNKNOWN',
          official_sync_status = 'BLOCKED', updated_at = ?
        WHERE booking_id = ?
      `).run(now, attempt.bookingId);
    })();
    this.log("VENDOR_SEND_OUTCOME_UNKNOWN", "VENDOR_SEND_ATTEMPT", sendAttemptId, {
      bookingId: attempt.bookingId,
    });
    return this.getVendorSendAttempt(sendAttemptId);
  }

  recordVendorSendGmailAccepted(sendAttemptId, input = {}) {
    const attempt = this.getVendorSendAttempt(sendAttemptId);
    if (!attempt) throw new Error("Send attempt was not found.");
    if (!["PREPARED", "SEND_OUTCOME_UNKNOWN"].includes(attempt.status)) {
      if (["GMAIL_ACCEPTED", "SENT_PENDING_SYNC", "SYNCED"].includes(attempt.status)) return attempt;
      throw new Error(`Send attempt cannot accept Gmail evidence from ${attempt.status}.`);
    }
    const messageId = String(input.gmailMessageId || "").trim();
    const threadId = String(input.gmailThreadId || "").trim();
    if (!messageId || !threadId) throw new Error("Gmail message and thread IDs are required.");
    const now = this.now();
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE local_vendor_send_attempts
        SET status = 'GMAIL_ACCEPTED', gmail_message_id = ?, gmail_thread_id = ?,
          gmail_accepted_at = ?, updated_at = ?
        WHERE send_attempt_id = ?
      `).run(messageId, threadId, now, now, sendAttemptId);
      this.db.prepare(`
        UPDATE local_vendor_bookings
        SET booking_status = ?, communication_status = 'SENT_PENDING_SYNC',
          official_sync_status = 'PENDING', gmail_message_id = ?,
          gmail_thread_id = ?, sent_at = ?, updated_at = ?
        WHERE booking_id = ?
      `).run(
        attempt.snapshot.actionType === "CANCEL" ? "CANCELED" : "ACTIVE",
        messageId, threadId, now, now, attempt.bookingId,
      );
    })();
    this.log("VENDOR_GMAIL_ACCEPTED", "VENDOR_SEND_ATTEMPT", sendAttemptId, {
      bookingId: attempt.bookingId, gmailMessageId: messageId, gmailThreadId: threadId,
    });
    return this.getVendorSendAttempt(sendAttemptId);
  }

  recordVendorSendSyncResult(sendAttemptId, input = {}) {
    const attempt = this.getVendorSendAttempt(sendAttemptId);
    if (!attempt) throw new Error("Send attempt was not found.");
    if (!["GMAIL_ACCEPTED", "SENT_PENDING_SYNC"].includes(attempt.status)) {
      if (attempt.status === "SYNCED") return attempt;
      throw new Error(`Send evidence cannot sync from ${attempt.status}.`);
    }
    const now = this.now();
    const ok = input.ok === true;
    const errorMessage = String(input.error?.message || input.error || "");
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE local_vendor_send_attempts
        SET status = ?, official_evidence_id = ?, sync_attempts = sync_attempts + 1,
          last_error_code = ?, last_error_message = ?, synced_at = ?, updated_at = ?
        WHERE send_attempt_id = ?
      `).run(
        ok ? "SYNCED" : "SENT_PENDING_SYNC",
        ok ? String(input.officialEvidenceId || "") : attempt.officialEvidenceId,
        ok ? "" : String(input.errorCode || "OFFICIAL_SYNC_FAILED"),
        ok ? "" : errorMessage,
        ok ? now : null,
        now,
        sendAttemptId,
      );
      this.db.prepare(`
        UPDATE local_vendor_bookings
        SET communication_status = ?, official_sync_status = ?, updated_at = ?
        WHERE booking_id = ?
      `).run(ok ? "SENT" : "SENT_PENDING_SYNC", ok ? "SYNCED" : "FAILED", now, attempt.bookingId);
    })();
    this.log(
      ok ? "VENDOR_SEND_EVIDENCE_SYNCED" : "VENDOR_SEND_EVIDENCE_SYNC_FAILED",
      "VENDOR_SEND_ATTEMPT",
      sendAttemptId,
      { bookingId: attempt.bookingId, error: errorMessage },
    );
    return this.getVendorSendAttempt(sendAttemptId);
  }

  listVendorPendingSendSync() {
    return this.db.prepare(`
      SELECT send_attempt_id FROM local_vendor_send_attempts
      WHERE status IN ('GMAIL_ACCEPTED','SENT_PENDING_SYNC')
      ORDER BY prepared_at
    `).all().map((row) => this.getVendorSendAttempt(row.send_attempt_id));
  }

  recordVendorReplyDetected(input = {}) {
    const bookingId = String(input.bookingId || "");
    const booking = this.getVendorBooking(bookingId);
    if (!booking) throw new Error("Vendor booking was not found.");
    const messageId = String(input.gmailMessageId || "").trim();
    if (!messageId || messageId === booking.gmailMessageId) return booking;
    if (
      booking.latestInboundMessageId === messageId
      && booking.replyReviewStatus === "REVIEW_REQUIRED"
    ) return booking;
    const now = this.now();
    const receivedAt = String(input.receivedAt || now);
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO local_vendor_reply_evidence (
          gmail_message_id, booking_id, send_attempt_id, gmail_thread_id,
          received_at, detected_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(gmail_message_id) DO NOTHING
      `).run(
        messageId,
        bookingId,
        String(input.sendAttemptId || ""),
        String(input.gmailThreadId || booking.gmailThreadId || ""),
        receivedAt,
        now,
      );
      this.db.prepare(`
        UPDATE local_vendor_bookings
        SET reply_review_status = 'REVIEW_REQUIRED',
          latest_inbound_message_id = ?, latest_inbound_at = ?, updated_at = ?
        WHERE booking_id = ?
      `).run(messageId, receivedAt, now, bookingId);
    })();
    this.log("VENDOR_REPLY_REVIEW_REQUIRED", "VENDOR_BOOKING", bookingId, {
      gmailThreadId: String(input.gmailThreadId || booking.gmailThreadId || ""),
      sendAttemptId: String(input.sendAttemptId || ""),
      gmailMessageId: messageId,
    });
    return this.getVendorBooking(bookingId);
  }

  getVendorItineraryCheck(customerCode) {
    const code = String(customerCode || "").trim().toUpperCase();
    if (!code) throw new Error("Customer Code is required.");
    const intake = this.getVendorIntakeDraftByCode(code);
    if (!intake) throw new Error("Customer Code was not found in the local itinerary workspace.");
    const bookings = this.listVendorBookings().filter((row) => row.customerCode === code);
    const bookingByService = new Map();
    bookings.forEach((booking) => {
      const details = this.getVendorBooking(booking.bookingId);
      (details?.services || []).forEach((service) => {
        if (!bookingByService.has(service.serviceId)) bookingByService.set(service.serviceId, booking);
      });
    });
    return {
      customerCode: intake.customerCode,
      customerName: intake.customerName,
      tourId: intake.tourId || "",
      sourceRevisionId: intake.sourceRevisionId || "",
      arrivalDate: intake.arrivalDate || "",
      departureDate: intake.departureDate || "",
      adultPax: Number(intake.adultPax || 0),
      childPax: Number(intake.childPax || 0),
      infantPax: Number(intake.infantPax || 0),
      readOnly: true,
      days: (intake.days || []).map((day) => ({
        tourDayId: day.tourDayId,
        dayNumber: day.dayNumber,
        serviceDate: day.serviceDate,
        dayTitle: day.dayTitle,
        daywiseText: day.daywiseText,
        services: (day.splits || []).map((service) => {
          const booking = bookingByService.get(service.serviceId);
          return {
            ...service,
            ownerDepartment: ["TRANSPORT", "TOC", "LUGGAGE_VAN"].includes(service.serviceType)
              ? "TRANSPORT" : "VENDOR",
            bookingId: booking?.bookingId || "",
            bookingState: booking?.communicationStatus || "NOT_GENERATED",
            gmailThreadId: booking?.gmailThreadId || "",
            externalReference: booking?.externalReference || "",
          };
        }),
      })),
    };
  }

  getVendorOperationalModel() {
    const queue = this.listVendorBookingQueue();
    const intakes = this.listVendorIntakeDrafts().map((row) =>
      this.getVendorIntakeDraftByCode(row.customer_code)
    ).filter(Boolean);
    const bookings = this.listVendorBookings();
    const customerItem = (intake, extra = {}) => ({
      customerCode: intake.customerCode,
      customerName: intake.customerName,
      tourId: intake.tourId || "",
      sourceRevisionId: intake.sourceRevisionId || "",
      arrivalDate: intake.arrivalDate || "",
      ...extra,
    });
    const notSplit = intakes.filter((intake) => {
      const owned = (intake.days || []).flatMap((day) => day.splits || [])
        .filter((split) => split.serviceType === "VENDOR");
      return owned.length === 0 && intake.localStatus !== "VENDOR_COMPLETE";
    }).map((intake) => customerItem(intake, { status: "NOT_SPLIT" }));
    const byCustomer = new Map();
    queue.forEach((item) => {
      if (!byCustomer.has(item.customerCode)) byCustomer.set(item.customerCode, []);
      byCustomer.get(item.customerCode).push(item);
    });
    const notGenerated = [...byCustomer.entries()].map(([code, packages]) => {
      const generated = packages.filter((item) =>
        ["GENERATED", "SENT_PENDING_SYNC", "SENT"].includes(item.workflowStatus)
      ).length;
      if (generated === packages.length) return null;
      const intake = intakes.find((item) => item.customerCode === code);
      return customerItem(intake || packages[0], {
        packageKey: packages.find((item) => item.workflowStatus === "NOT_GENERATED")?.packageKey
          || packages[0].packageKey,
        generatedCount: generated,
        totalCount: packages.length,
        status: `${generated}/${packages.length} GENERATED`,
      });
    }).filter(Boolean);
    const replied = bookings.filter((booking) =>
      booking.replyReviewStatus === "REVIEW_REQUIRED"
    ).map((booking) => ({
      ...booking,
      serviceName: booking.supplierName,
      status: "REVIEW_REQUIRED",
    }));
    const start = operationalDateEpoch(1);
    const end = operationalDateEpoch(8);
    const upcoming = intakes.filter((intake) => {
      const arrival = new Date(`${intake.arrivalDate || ""}T00:00:00Z`).getTime();
      return arrival >= start && arrival < end;
    }).map((intake) => customerItem(intake, { status: "D+1 TO D+7" }));
    const workInbox = intakes.map((intake) => ({
      eventId: intake.sourceRevisionId || intake.sourcePublicationId || intake.vendorDraftId,
      eventType: intake.sourceRevisionId ? "REVISED_ITINERARY" : "NEW_ITINERARY",
      customerCode: intake.customerCode,
      customerName: intake.customerName,
      sourceRevisionId: intake.sourceRevisionId || "",
      createdAt: intake.updatedAt,
      state: "UNREAD",
      actionUrl: intake.sourceRevisionId
        ? `vendor-revise-itinerary:${intake.customerCode}`
        : `vendor-new-itinerary:${intake.customerCode}`,
    }));
    return {
      dashboard: { notSplit, notGenerated, replied, upcoming, offline: false },
      bookingRegister: bookings.filter((row) =>
        ["GENERATED", "SENT_PENDING_SYNC", "SENT", "SEND_OUTCOME_UNKNOWN"].includes(
          row.communicationStatus,
        )
      ),
      workInbox,
    };
  }

  vendorBookingRow(row) {
    const communicationStatus = row.communication_status;
    const deliveryEvidenceStatus = row.channel !== "EMAIL"
      ? "NON_EMAIL_CHANNEL"
      : communicationStatus === "SEND_OUTCOME_UNKNOWN"
        ? "OUTCOME_UNKNOWN"
        : !row.gmail_message_id
          ? "EMAIL_ID_NOT_CREATED"
          : row.official_sync_status === "SYNCED"
            ? "RECORDED_SYNCED"
            : "RECORDED_SYNC_PENDING";
    return {
      bookingId: row.booking_id,
      packageKey: row.package_key,
      customerCode: row.customer_code,
      tourId: row.tour_id || "",
      supplierId: row.supplier_id || "",
      supplierName: row.supplier_name,
      supplierType: row.supplier_type,
      actionType: row.action_type,
      channel: row.channel,
      bookingStatus: row.booking_status,
      communicationStatus,
      supplierResult: row.supplier_result,
      rateStatus: row.rate_status,
      subject: row.subject,
      body: row.body,
      recipients: JSON.parse(row.recipients_json || "[]"),
      sourceRevisionId: row.source_revision_id || "",
      cancellationReason: row.cancellation_reason || "",
      externalReference: row.external_reference || "",
      externalEvidence: JSON.parse(row.external_evidence_json || "{}"),
      gmailThreadId: row.gmail_thread_id || "",
      gmailMessageId: row.gmail_message_id || "",
      deliveryEvidenceStatus,
      officialSyncStatus: row.official_sync_status || "NOT_REQUIRED",
      lastSendAttemptId: row.last_send_attempt_id || "",
      replyReviewStatus: row.reply_review_status || "NONE",
      latestInboundMessageId: row.latest_inbound_message_id || "",
      latestInboundAt: row.latest_inbound_at || "",
      generatedAt: row.generated_at || "",
      sentAt: row.sent_at || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
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
    const syncMode = response.mode || "ONLINE_APPS_SCRIPT";
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE local_sync_queue
        SET status = 'SYNCED', sync_mode = ?, last_error_code = NULL, last_error_message = NULL,
          updated_at = ?
        WHERE sync_job_id = ?
      `).run(syncMode, now, jobId);
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

  requeueAdminDevDummyPublications() {
    if (this.getPublicSettings().environment !== "ADMIN_DEV") return 0;
    const jobs = this.db.prepare(`
      SELECT DISTINCT q.sync_job_id, q.draft_id
      FROM local_sync_queue q
      JOIN local_sync_results r ON r.sync_job_id = q.sync_job_id
      WHERE q.status = 'SYNCED'
        AND (q.sync_mode = 'LOCAL_DUMMY' OR r.response_json LIKE '%"mode":"LOCAL_DUMMY"%')
    `).all();
    if (!jobs.length) return 0;
    const now = this.now();
    this.db.transaction(() => {
      for (const job of jobs) {
        this.db.prepare("DELETE FROM local_sync_results WHERE sync_job_id = ?").run(job.sync_job_id);
        this.db.prepare(`
          UPDATE local_sync_queue
          SET status = 'PENDING_SYNC', sync_mode = NULL, attempts = 0,
            next_attempt_at = NULL, last_attempt_at = NULL,
            last_error_code = NULL, last_error_message = NULL, updated_at = ?
          WHERE sync_job_id = ?
        `).run(now, job.sync_job_id);
        this.db.prepare(`
          UPDATE local_drafts
          SET local_status = 'READY_TO_POST', sync_status = 'PENDING_SYNC',
            official_entity_id = NULL, updated_at = ?
          WHERE draft_id = ?
        `).run(now, job.draft_id);
      }
    })();
    this.log("ADMIN_DEV_DUMMY_REQUEUED", "SYNC_QUEUE", null, {
      count: jobs.length,
      jobIds: jobs.map((job) => job.sync_job_id),
    });
    return jobs.length;
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
