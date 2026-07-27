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

const VENDOR_SPLIT_TYPES = new Set([
  "VENDOR",
  "TOC",
  "TRANSPORT",
  "LUGGAGE_VAN",
  "ADDITIONAL_SERVICE",
]);

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
        service_type TEXT NOT NULL CHECK(service_type IN ('VENDOR','TOC','TRANSPORT','LUGGAGE_VAN','ADDITIONAL_SERVICE')),
        activity_text TEXT NOT NULL DEFAULT '',
        vendor_id TEXT,
        vendor_name TEXT,
        service_master_id TEXT,
        price_source TEXT NOT NULL DEFAULT 'NONE',
        adult_rate_idr REAL,
        child_rate_idr REAL,
        unit_rate_idr REAL,
        price_basis TEXT NOT NULL DEFAULT 'PER_SERVICE',
        quantity REAL NOT NULL DEFAULT 1,
        currency TEXT NOT NULL DEFAULT 'IDR',
        rate_status TEXT NOT NULL DEFAULT 'PENDING_RATE' CHECK(rate_status IN ('RATE_READY','PENDING_RATE')),
        manual_price_reason TEXT NOT NULL DEFAULT '',
        rate_valid_to TEXT NOT NULL DEFAULT '',
        rate_snapshot_at TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        FOREIGN KEY(tour_day_id) REFERENCES vendor_day_drafts(tour_day_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_vendor_split_day
        ON vendor_service_splits(tour_day_id, split_sequence);

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
    `);
    this.migrateVendorServiceSplits();
    this.ensureColumn("local_sync_queue", "sync_mode", "TEXT");
    this.ensureColumn("vendor_intake_drafts", "adult_pax", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("vendor_intake_drafts", "child_pax", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("vendor_intake_drafts", "infant_pax", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("vendor_day_drafts", "day_title", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("vendor_day_drafts", "start_time", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("vendor_day_drafts", "finish_time", "TEXT NOT NULL DEFAULT ''");
  }

  migrateVendorServiceSplits() {
    const table = this.db.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vendor_service_splits'
    `).get();
    const columns = this.db.prepare("PRAGMA table_info(vendor_service_splits)").all();
    const columnNames = new Set(columns.map((column) => column.name));
    if (
      String(table?.sql || "").includes("'LUGGAGE_VAN'")
      && columnNames.has("rate_status")
      && columnNames.has("service_master_id")
    ) return;

    const expression = (name, fallback) => columnNames.has(name) ? name : fallback;
    this.db.pragma("foreign_keys = OFF");
    try {
      this.db.transaction(() => {
        this.db.exec(`
          DROP TABLE IF EXISTS vendor_service_splits_v2;
          CREATE TABLE vendor_service_splits_v2 (
            service_id TEXT PRIMARY KEY,
            tour_day_id TEXT NOT NULL,
            split_sequence INTEGER NOT NULL,
            service_type TEXT NOT NULL CHECK(service_type IN ('VENDOR','TOC','TRANSPORT','LUGGAGE_VAN','ADDITIONAL_SERVICE')),
            activity_text TEXT NOT NULL DEFAULT '',
            vendor_id TEXT,
            vendor_name TEXT,
            service_master_id TEXT,
            price_source TEXT NOT NULL DEFAULT 'NONE',
            adult_rate_idr REAL,
            child_rate_idr REAL,
            unit_rate_idr REAL,
            price_basis TEXT NOT NULL DEFAULT 'PER_SERVICE',
            quantity REAL NOT NULL DEFAULT 1,
            currency TEXT NOT NULL DEFAULT 'IDR',
            rate_status TEXT NOT NULL DEFAULT 'PENDING_RATE' CHECK(rate_status IN ('RATE_READY','PENDING_RATE')),
            manual_price_reason TEXT NOT NULL DEFAULT '',
            rate_valid_to TEXT NOT NULL DEFAULT '',
            rate_snapshot_at TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'DRAFT',
            FOREIGN KEY(tour_day_id) REFERENCES vendor_day_drafts(tour_day_id) ON DELETE CASCADE
          );
        `);
        this.db.exec(`
          INSERT INTO vendor_service_splits_v2 (
            service_id, tour_day_id, split_sequence, service_type, activity_text,
            vendor_id, vendor_name, service_master_id, price_source,
            adult_rate_idr, child_rate_idr, unit_rate_idr, price_basis, quantity,
            currency, rate_status, manual_price_reason, rate_valid_to,
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
            ${expression("price_source", "'NONE'")},
            ${expression("adult_rate_idr", "NULL")},
            ${expression("child_rate_idr", "NULL")},
            ${expression("unit_rate_idr", "NULL")},
            ${expression("price_basis", "'PER_SERVICE'")},
            ${expression("quantity", "1")},
            ${expression("currency", "'IDR'")},
            ${expression("rate_status", "'PENDING_RATE'")},
            ${expression("manual_price_reason", "''")},
            ${expression("rate_valid_to", "''")},
            ${expression("rate_snapshot_at", "''")},
            status
          FROM vendor_service_splits;
          DROP TABLE vendor_service_splits;
          ALTER TABLE vendor_service_splits_v2 RENAME TO vendor_service_splits;
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
        vendor_id, vendor_name, service_master_id, price_source,
        adult_rate_idr, child_rate_idr, unit_rate_idr, price_basis, quantity,
        currency, rate_status, manual_price_reason, rate_valid_to,
        rate_snapshot_at, status
      FROM vendor_service_splits WHERE tour_day_id = ? ORDER BY split_sequence
    `);
    return {
      vendorDraftId: draft.vendor_draft_id,
      customerCode: draft.customer_code,
      customerName: draft.customer_name,
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
          priceSource: split.price_source || "NONE",
          adultRateIdr: split.adult_rate_idr,
          childRateIdr: split.child_rate_idr,
          unitRateIdr: split.unit_rate_idr,
          priceBasis: split.price_basis || "PER_SERVICE",
          quantity: Number(split.quantity ?? 1),
          currency: split.currency || "IDR",
          rateStatus: split.rate_status || "PENDING_RATE",
          manualPriceReason: split.manual_price_reason || "",
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
      const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (day.startTime && !timePattern.test(String(day.startTime))) {
        throw new Error(`Day ${dayNumber} Start Time must use HH:MM.`);
      }
      if (day.finishTime && !timePattern.test(String(day.finishTime))) {
        throw new Error(`Day ${dayNumber} Finish Time must use HH:MM.`);
      }
      (day.splits || []).forEach((split) => {
        const serviceType = normalizeVendorSplitType(split.serviceType);
        if (!VENDOR_SPLIT_TYPES.has(serviceType)) {
          throw new Error("Split type must be Vendor, TOC, Transport, Luggage Van, or Additional Service.");
        }
        if (!String(split.activityText || "").trim()) {
          throw new Error(`Day ${dayNumber} Vendor Service is required for every split item.`);
        }
        const quantity = Number(split.quantity ?? 1);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(`Day ${dayNumber} split quantity must be greater than 0.`);
        }
        if (!["RATE_READY", "PENDING_RATE"].includes(String(split.rateStatus || "PENDING_RATE"))) {
          throw new Error(`Day ${dayNumber} split rate status is invalid.`);
        }
      });
    });

    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO vendor_intake_drafts (
          vendor_draft_id, customer_code, customer_name, adult_pax, child_pax, infant_pax, tour_id,
          source_publication_id, source_record_version, source_revision_id,
          itinerary_drive_file_id, itinerary_drive_file_name, itinerary_drive_file_url,
          document_html, arrival_date, arrival_flight, arrival_sector, arrival_time,
          departure_date, departure_flight, departure_sector, departure_time,
          extraction_status, local_status, owner_employee_id, created_at, updated_at
        ) VALUES (
          @vendorDraftId, @customerCode, @customerName, @adultPax, @childPax, @infantPax, @tourId,
          @sourcePublicationId, @sourceRecordVersion, @sourceRevisionId,
          @driveFileId, @driveFileName, @driveFileUrl,
          @documentHtml, @arrivalDate, @arrivalFlight, @arrivalSector, @arrivalTime,
          @departureDate, @departureFlight, @departureSector, @departureTime,
          @extractionStatus, @localStatus, @ownerEmployeeId, @createdAt, @updatedAt
        )
        ON CONFLICT(customer_code) DO UPDATE SET
          customer_name=excluded.customer_name, adult_pax=excluded.adult_pax,
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
          activity_text, vendor_id, vendor_name, service_master_id, price_source,
          adult_rate_idr, child_rate_idr, unit_rate_idr, price_basis, quantity,
          currency, rate_status, manual_price_reason, rate_valid_to,
          rate_snapshot_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          split.priceSource || "NONE",
          split.adultRateIdr === "" ? null : (split.adultRateIdr ?? null),
          split.childRateIdr === "" ? null : (split.childRateIdr ?? null),
          split.unitRateIdr === "" ? null : (split.unitRateIdr ?? null),
          split.priceBasis || "PER_SERVICE", Number(split.quantity ?? 1),
          split.currency || "IDR", split.rateStatus || "PENDING_RATE",
          String(split.manualPriceReason || ""), split.rateValidTo || "",
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
