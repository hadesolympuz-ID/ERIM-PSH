const API_VERSION = "v1";

function doGet() {
  return json_({
    ok: true,
    data: {
      service: "ERIM-PSH API",
      version: API_VERSION,
      serverTime: new Date().toISOString(),
    },
  });
}

function doPost(event) {
  try {
    const request = parseJsonBody_(event);
    const actor = authenticateRequest_(request.auth);
    const route = request.action;

    if (route === "publication.publish") {
      requireDesktop_(request, actor);
      return json_({ ok: true, data: publishDepartmentResult_(request, actor) });
    }

    if (route === "itinerary.event") {
      requireDesktop_(request, actor);
      return json_({ ok: true, data: recordItineraryEvent_(request, actor) });
    }

    if (route === "vendor.intake.save") {
      requireDesktop_(request, actor);
      return json_({ ok: true, data: saveVendorIntake_(request, actor) });
    }

    if (route === "vendor.booking.evidence") {
      requireDesktop_(request, actor);
      requireVendorBooking_(actor);
      return json_({ ok: true, data: recordVendorBookingEvidence_(request, actor) });
    }

    if (route === "supplier.master.list") {
      requireDesktop_(request, actor);
      return json_({ ok: true, data: supplierMasterCatalog_() });
    }

    if (route === "supplier.master.initialize") {
      requireDesktop_(request, actor);
      requireSupplierManager_(actor);
      return json_({ ok: true, data: initializeSupplierMaster_(request, actor) });
    }

    if (route === "supplier.master.batch.publish") {
      requireDesktop_(request, actor);
      requireSupplierManager_(actor);
      return json_({ ok: true, data: publishSupplierMasterBatch_(request, actor) });
    }

    if (route === "supplier.type.save") {
      requireDesktop_(request, actor);
      requireSupplierManager_(actor);
      return json_({ ok: true, data: saveSupplierType_(request, actor) });
    }

    if (route === "supplier.save") {
      requireDesktop_(request, actor);
      requireSupplierManager_(actor);
      return json_({ ok: true, data: saveSupplier_(request, actor) });
    }

    if (route === "supplier.product.save") {
      requireDesktop_(request, actor);
      requireSupplierManager_(actor);
      return json_({ ok: true, data: saveSupplierProduct_(request, actor) });
    }

    if (route === "supplier.contract.save") {
      requireDesktop_(request, actor);
      requireSupplierManager_(actor);
      return json_({ ok: true, data: saveSupplierContract_(request, actor) });
    }

    if (route === "supplier.entity.archive") {
      requireDesktop_(request, actor);
      requireSupplierManager_(actor);
      return json_({ ok: true, data: archiveSupplierEntity_(request, actor) });
    }

    if (route === "tour.detail") {
      return json_({ ok: true, data: getTourDetail_(request.customerCode, actor) });
    }

    throw apiError_("NOT_FOUND", "Unknown API action.");
  } catch (error) {
    recordRejectedAudit_(error);
    return json_({
      ok: false,
      error: {
        code: error.code || "INTERNAL_ERROR",
        message: error.publicMessage || "The request could not be completed.",
        details: error.publicDetails || null,
      },
    });
  }
}

function parseJsonBody_(event) {
  const raw = event && event.postData && event.postData.contents;
  if (!raw) throw apiError_("INVALID_REQUEST", "Request body is required.");
  try {
    return JSON.parse(raw);
  } catch (_error) {
    throw apiError_("INVALID_JSON", "Request body must be valid JSON.");
  }
}

function authenticateRequest_(auth) {
  const token = auth && auth.accessToken;
  if (!token) throw apiError_("AUTH_REQUIRED", "Google authentication is required.");

  const response = UrlFetchApp.fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
    { muteHttpExceptions: true },
  );
  if (response.getResponseCode() !== 200) {
    throw apiError_("AUTH_INVALID", "Google session is invalid or expired.");
  }

  const identity = JSON.parse(response.getContentText());
  const properties = PropertiesService.getScriptProperties();
  const expectedClientId = properties.getProperty("GOOGLE_CLIENT_ID");
  const companyDomain = properties.getProperty("COMPANY_DOMAIN");
  if (expectedClientId && identity.aud !== expectedClientId) {
    throw apiError_("AUTH_AUDIENCE_INVALID", "Google session was not issued for ERIM-PSH.");
  }
  if (!identity.email || identity.email_verified !== "true") {
    throw apiError_("AUTH_EMAIL_REQUIRED", "A verified Google email is required.");
  }
  if (companyDomain && !identity.email.toLowerCase().endsWith(`@${companyDomain.toLowerCase()}`)) {
    throw apiError_("AUTH_DOMAIN_DENIED", "This Google account is outside the approved company domain.");
  }

  const employee = findRecord_("EMPLOYEES", "company_email", identity.email.toLowerCase());
  if (!employee || !truthy_(employee.active)) {
    throw apiError_("EMPLOYEE_INACTIVE", "This account is not an active ERIM-PSH employee.");
  }
  return {
    employeeId: employee.employee_id,
    fullName: employee.full_name || employee.company_email,
    email: identity.email.toLowerCase(),
    department: employee.department,
    role: employee.role,
    mobileAccess: truthy_(employee.mobile_access),
    desktopAccess: truthy_(employee.desktop_access),
  };
}

function requireDesktop_(request, actor) {
  if (request.clientMode !== "DESKTOP") {
    throw apiError_("MOBILE_READ_ONLY", "Mobile access is read-only.");
  }
  if (!actor.desktopAccess) {
    throw apiError_("DESKTOP_ACCESS_DENIED", "Desktop publishing is not enabled for this employee.");
  }
  if (request.draft && request.draft.department !== actor.department && actor.role !== "ADMIN") {
    throw apiError_("DEPARTMENT_DENIED", "You cannot publish another department's work.");
  }
}

function requireSupplierManager_(actor) {
  const role = String(actor.role || "").toUpperCase().replace(/[ -]+/g, "_");
  const department = String(actor.department || "").toUpperCase().replace(/[ -]+/g, "_");
  if (!["ADMIN", "MANAGER"].includes(role) && department !== "MANAGER_ADMIN") {
    throw apiError_("ACCESS_DENIED", "Only Manager or Admin may change Supplier Master data.");
  }
}

function requireVendorBooking_(actor) {
  const role = String(actor.role || "").toUpperCase().replace(/[ -]+/g, "_");
  const department = String(actor.department || "").toUpperCase().replace(/[ -]+/g, "_");
  if (department !== "VENDOR" && !["ADMIN", "MANAGER", "ALL_ROUNDER"].includes(role)) {
    throw apiError_("ACCESS_DENIED", "Only Vendor Booking or an authorized manager may publish booking evidence.");
  }
}

const SUPPLIER_MASTER_SCHEMA = {
  SUPPLIER_TYPES: [
    "supplier_type_id", "type_code", "type_name", "description", "requires_supplier",
    "allowed_price_bases", "default_booking_channels", "display_order", "status",
    "record_version", "created_at", "created_by", "updated_at", "updated_by",
  ],
  SUPPLIERS: [
    "supplier_id", "supplier_type_id", "type_code", "supplier_code", "supplier_name",
    "legal_name", "status", "destinations", "address", "website", "tax_id",
    "internal_pic_employee_id", "operational_notes", "record_version", "created_at",
    "created_by", "updated_at", "updated_by",
  ],
  SUPPLIER_CONTACTS: [
    "contact_id", "supplier_id", "contact_name", "position", "department", "phone",
    "whatsapp", "email", "preferred_channel", "operational_hours", "is_emergency",
    "responsibility", "status", "record_version", "created_at", "created_by",
    "updated_at", "updated_by",
  ],
  SUPPLIER_RECIPIENTS: [
    "recipient_id", "supplier_id", "recipient_type", "address", "channel", "purpose",
    "sequence", "status", "record_version", "created_at", "created_by", "updated_at",
    "updated_by",
  ],
  SUPPLIER_SOPS: [
    "sop_id", "supplier_id", "booking_channels", "lead_time", "cutoff_time",
    "required_information", "confirmation_procedure", "amendment_procedure",
    "cancellation_procedure", "emergency_procedure", "portal_url", "account_reference",
    "subject_template", "body_template", "status", "record_version", "created_at",
    "created_by", "updated_at", "updated_by",
  ],
  SUPPLIER_PRODUCTS: [
    "product_id", "supplier_id", "product_code", "product_name", "category",
    "subcategory", "destinations", "description", "inclusion", "exclusion",
    "terms_and_conditions", "cancellation_terms", "booking_instructions",
    "minimum_order", "maximum_capacity", "tax_treatment", "notes", "status",
    "record_version", "created_at", "created_by", "updated_at", "updated_by",
  ],
  SUPPLIER_CONTRACTS: [
    "contract_id", "supplier_id", "contract_number", "contract_name", "valid_from",
    "valid_to", "currency", "tax_treatment", "terms_and_conditions", "drive_file_id",
    "drive_file_name", "drive_file_url", "status", "allow_overlap", "overlap_reason",
    "record_version", "created_at", "created_by", "updated_at", "updated_by",
  ],
  CONTRACT_RATES: [
    "contract_rate_id", "contract_id", "product_id", "price_basis", "amount",
    "currency", "min_quantity", "max_quantity", "market", "season", "surcharge_rule",
    "valid_from", "valid_to", "notes", "status", "record_version", "created_at",
    "created_by", "updated_at", "updated_by",
  ],
  SUPPLIER_MASTER_EVENTS: [
    "event_id", "event_key", "event_type", "entity_type", "entity_id", "supplier_id",
    "type_code", "summary", "event_at", "actor_employee_id",
  ],
};

function ensureSupplierMasterSchema_() {
  Object.keys(SUPPLIER_MASTER_SCHEMA).forEach((sheetName) => {
    const sheet = ensureSheetWithHeaders_(sheetName, SUPPLIER_MASTER_SCHEMA[sheetName]);
    const headerRange = sheet.getRange(1, 1, 1, SUPPLIER_MASTER_SCHEMA[sheetName].length);
    headerRange.setFontWeight("bold").setBackground("#e8eef2");
    if (sheet.getLastColumn() > 0) sheet.autoResizeColumns(1, sheet.getLastColumn());
  });
  repairSupplierTextFields_();
}

function repairSupplierTextFields_() {
  const fields = {
    SUPPLIER_CONTACTS: ["phone", "whatsapp"],
    SUPPLIER_RECIPIENTS: ["address"],
  };
  let repaired = 0;
  Object.keys(fields).forEach((sheetName) => {
    const sheet = sheet_(sheetName);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    fields[sheetName].forEach((field) => {
      const column = headers.indexOf(field) + 1;
      if (!column) return;
      const height = Math.max(sheet.getLastRow() - 1, 1);
      const range = sheet.getRange(2, column, height, 1);
      const formulas = range.getFormulas();
      range.setNumberFormat("@");
      formulas.forEach((row, index) => {
        if (!row[0]) return;
        const literal = String(row[0]).replace(/^=/, "");
        range.getCell(index + 1, 1).setValue(safeSheetValue_(literal));
        repaired += 1;
      });
    });
  });
  return repaired;
}

function initializeSupplierMaster_(request, actor) {
  ensureSupplierMasterSchema_();
  seedSupplierTypes_(actor);
  seedSupplierMasterFromLegacy_(actor);
  ensureSupplierExpiryTrigger_();
  const now = new Date().toISOString();
  recordSupplierMasterEvent_({
    eventType: "SUPPLIER_MASTER_INITIALIZED",
    entityType: "SUPPLIER_MASTER",
    entityId: "SUPPLIER_MASTER",
    supplierId: "",
    typeCode: "",
    summary: "Supplier Master schema, legacy migration, and contract expiry monitor initialized.",
  }, actor, now);
  broadcastSupplierMasterNotification_({
    type: "SUPPLIER_MASTER_INITIALIZED",
    title: "Supplier Master initialized",
    message: `${actor.fullName || actor.employeeId} initialized the centralized supplier, product, contract, and rate source.`,
    actionUrl: "supplier-master",
  }, actor, now);
  return supplierMasterCatalog_();
}

function seedSupplierTypes_(actor) {
  const existing = allRecords_("SUPPLIER_TYPES");
  if (existing.length) return;
  const now = new Date().toISOString();
  const defaults = [
    ["VENDOR", "Vendor", 10, "EMAIL,WHATSAPP,EMAIL_WHATSAPP,PORTAL,OTHERS"],
    ["TOC", "TOC", 20, "EMAIL,WHATSAPP,EMAIL_WHATSAPP,PORTAL,OTHERS"],
    ["TRANSPORT", "Transport", 30, "EMAIL,WHATSAPP,EMAIL_WHATSAPP,PORTAL,OTHERS"],
    ["LUGGAGE_VAN", "Luggage Van", 40, "EMAIL,WHATSAPP,EMAIL_WHATSAPP,PORTAL,OTHERS"],
    ["ADDITIONAL_SERVICE", "Additional Service", 50, "EMAIL,WHATSAPP,EMAIL_WHATSAPP,PORTAL,OTHERS"],
  ].map(([code, name, order, channels]) => ({
    supplier_type_id: `STYPE-${code}`,
    type_code: code,
    type_name: name,
    description: `${name} supplier/service classification.`,
    requires_supplier: true,
    allowed_price_bases: "PER_ADULT,PER_CHILD,PER_INFANT,PER_PAX,PER_SERVICE,PER_ITEM,PER_UNIT,PER_TRIP,PER_VEHICLE,PER_VAN,PER_GROUP,PER_HOUR,PER_DAY,CUSTOM",
    default_booking_channels: channels,
    display_order: order,
    status: "ACTIVE",
    record_version: 1,
    created_at: now,
    created_by: actor.employeeId,
    updated_at: now,
    updated_by: actor.employeeId,
  }));
  appendRecords_("SUPPLIER_TYPES", defaults);
}

function seedSupplierMasterFromLegacy_(actor) {
  if (allRecords_("SUPPLIERS").length) return;
  const now = new Date().toISOString();
  const supplierRows = [];
  const productRows = [];
  const contractRows = [];
  const rateRows = [];
  const supplierByKey = {};
  const contractBySupplier = {};
  const safeCode = (value) => String(value || "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "MASTER";
  const ensureSupplier = (typeCode, name) => {
    const key = `${typeCode}|${String(name || "").trim().toUpperCase()}`;
    if (supplierByKey[key]) return supplierByKey[key];
    const supplierId = `SUP-${typeCode}-${digest_(key).slice(0, 12)}`;
    supplierByKey[key] = supplierId;
    supplierRows.push({
      supplier_id: supplierId,
      supplier_type_id: `STYPE-${typeCode}`,
      type_code: typeCode,
      supplier_code: `${typeCode.slice(0, 4)}-${safeCode(name)}`,
      supplier_name: name,
      legal_name: name,
      status: "ACTIVE",
      destinations: "",
      address: "",
      website: "",
      tax_id: "",
      internal_pic_employee_id: "",
      operational_notes: "Migrated into centralized Supplier Master.",
      record_version: 1,
      created_at: now,
      created_by: actor.employeeId,
      updated_at: now,
      updated_by: actor.employeeId,
    });
    return supplierId;
  };
  const ensureContract = (supplierId, number, validTo) => {
    if (contractBySupplier[supplierId]) {
      const existing = contractRows.find((row) => row.contract_id === contractBySupplier[supplierId]);
      if (existing && validTo > existing.valid_to) existing.valid_to = validTo;
      return contractBySupplier[supplierId];
    }
    const contractId = `CTR-${digest_(supplierId).slice(0, 14)}`;
    contractBySupplier[supplierId] = contractId;
    contractRows.push({
      contract_id: contractId,
      supplier_id: supplierId,
      contract_number: number,
      contract_name: "Migrated master rate",
      valid_from: "2026-01-01",
      valid_to: validTo || "2099-12-31",
      currency: "IDR",
      tax_treatment: "AS_CONTRACT",
      terms_and_conditions: "",
      drive_file_id: "",
      drive_file_name: "",
      drive_file_url: "",
      status: contractStatusForDate_("2026-01-01", validTo || "2099-12-31", "ACTIVE"),
      allow_overlap: false,
      overlap_reason: "",
      record_version: 1,
      created_at: now,
      created_by: actor.employeeId,
      updated_at: now,
      updated_by: actor.employeeId,
    });
    return contractId;
  };
  const addProductRate = (typeCode, supplierName, productName, sourceId, adult, child, unit, basis, validTo, notes) => {
    const supplierId = ensureSupplier(typeCode, supplierName);
    const contractId = ensureContract(supplierId, `MIGRATED-${safeCode(supplierName)}`, validTo);
    const productId = `PROD-${digest_(`${supplierId}|${sourceId}|${productName}`).slice(0, 16)}`;
    productRows.push({
      product_id: productId,
      supplier_id: supplierId,
      product_code: `${typeCode.slice(0, 4)}-${safeCode(productName)}`.slice(0, 48),
      product_name: productName,
      category: typeCode,
      subcategory: "",
      destinations: "",
      description: notes || "",
      inclusion: "",
      exclusion: "",
      terms_and_conditions: "",
      cancellation_terms: "",
      booking_instructions: "",
      minimum_order: "",
      maximum_capacity: "",
      tax_treatment: "AS_CONTRACT",
      notes: notes || "",
      status: "ACTIVE",
      record_version: 1,
      created_at: now,
      created_by: actor.employeeId,
      updated_at: now,
      updated_by: actor.employeeId,
    });
    const components = [
      ["PER_ADULT", adult],
      ["PER_CHILD", child],
      [basis || "PER_SERVICE", unit],
    ].filter((entry) => entry[1] !== "" && entry[1] !== null && entry[1] !== undefined);
    components.forEach(([priceBasis, amount], index) => rateRows.push({
      contract_rate_id: `RATE-${digest_(`${productId}|${priceBasis}|${index}`).slice(0, 16)}`,
      contract_id: contractId,
      product_id: productId,
      price_basis: priceBasis,
      amount: Number(amount),
      currency: "IDR",
      min_quantity: "",
      max_quantity: "",
      market: "",
      season: "",
      surcharge_rule: "",
      valid_from: "2026-01-01",
      valid_to: validTo || "2099-12-31",
      notes: notes || "",
      status: "ACTIVE",
      record_version: 1,
      created_at: now,
      created_by: actor.employeeId,
      updated_at: now,
      updated_by: actor.employeeId,
    }));
  };

  const legacyVendors = spreadsheet_().getSheetByName("VENDOR_RATE_MASTER")
    ? allRecords_("VENDOR_RATE_MASTER") : [];
  legacyVendors.forEach((row) => addProductRate(
    "VENDOR",
    String(row.vendor_name || "Legacy Vendor").trim() || "Legacy Vendor",
    String(row.service_name || "Service").trim(),
    row.vendor_rate_id || uuid_("LEGACY"),
    row.adult_rate_idr,
    row.child_rate_idr,
    null,
    "",
    String(row.valid_to || "2099-12-31"),
    row.notes || row.description || "",
  ));
  const legacyToc = spreadsheet_().getSheetByName("TOC_MASTER")
    ? allRecords_("TOC_MASTER") : [];
  legacyToc.forEach((row) => addProductRate(
    "TOC", "TOC Master", String(row.toc_name || "TOC Service").trim(),
    row.toc_id || uuid_("LEGACY"), row.adult_rate_idr, row.child_rate_idr, null, "",
    String(row.valid_to || "2099-12-31"), row.notes || "",
  ));
  [
    ["TRANSPORT", "DEV Transport Partner", "Airport Transfer", 350000, "PER_VEHICLE"],
    ["TRANSPORT", "DEV Transport Partner", "Full Day Transport", 700000, "PER_VEHICLE"],
    ["LUGGAGE_VAN", "DEV Luggage Van Partner", "Airport - Hotel Luggage Van", 450000, "PER_VAN"],
    ["LUGGAGE_VAN", "DEV Luggage Van Partner", "Full Day Luggage Van", 800000, "PER_VAN"],
    ["ADDITIONAL_SERVICE", "Additional", "Garland", 50000, "PER_ITEM"],
    ["ADDITIONAL_SERVICE", "Additional", "Water", 10000, "PER_ITEM"],
  ].forEach(([type, supplier, product, amount, basis], index) => addProductRate(
    type, supplier, product, `DEV-${index}`, null, null, amount, basis, "2099-12-31",
    "DEV fixture pending approved production contract.",
  ));
  appendRecords_("SUPPLIERS", supplierRows);
  appendRecords_("SUPPLIER_PRODUCTS", productRows);
  appendRecords_("SUPPLIER_CONTRACTS", contractRows);
  appendRecords_("CONTRACT_RATES", rateRows);
}

function saveSupplierType_(request, actor, options) {
  options = options || {};
  if (!options.schemaReady) ensureSupplierMasterSchema_();
  const input = request.supplierType || {};
  const code = String(input.typeCode || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const name = String(input.typeName || "").trim();
  if (!code || !name) throw apiError_("VALIDATION_ERROR", "Type code and Type name are required.");
  const now = new Date().toISOString();
  const id = input.supplierTypeId || `STYPE-${code}`;
  const before = findRecord_("SUPPLIER_TYPES", "supplier_type_id", id);
  upsertVersionedRecord_("SUPPLIER_TYPES", "supplier_type_id", id, {
    supplier_type_id: id,
    type_code: code,
    type_name: name,
    description: input.description || "",
    requires_supplier: input.requiresSupplier !== false,
    allowed_price_bases: arrayText_(input.allowedPriceBases),
    default_booking_channels: arrayText_(input.defaultBookingChannels),
    display_order: Number(input.displayOrder || 999),
    status: "ACTIVE",
  }, actor, now);
  recordAndBroadcastMasterChange_("SUPPLIER_TYPE_CHANGED", "SUPPLIER_TYPE", id, "", code,
    `${before ? "Updated" : "Added"} Supplier Type ${name}.`, before, input, actor, now, options.broadcast !== false);
  return options.returnCatalog === false ? { entityId: id } : supplierMasterCatalog_();
}

function saveSupplier_(request, actor, options) {
  options = options || {};
  if (!options.schemaReady) ensureSupplierMasterSchema_();
  const input = request.supplier || {};
  const name = String(input.supplierName || "").trim();
  const typeCode = String(input.typeCode || "").trim().toUpperCase();
  const type = findRecord_("SUPPLIER_TYPES", "type_code", typeCode);
  if (!name || !type || String(type.status).toUpperCase() !== "ACTIVE") {
    throw apiError_("VALIDATION_ERROR", "Supplier name and an active Supplier Type are required.");
  }
  const now = new Date().toISOString();
  const id = input.supplierId || uuid_("SUP");
  const before = findRecord_("SUPPLIERS", "supplier_id", id);
  upsertVersionedRecord_("SUPPLIERS", "supplier_id", id, {
    supplier_id: id,
    supplier_type_id: type.supplier_type_id,
    type_code: typeCode,
    supplier_code: input.supplierCode || `${typeCode.slice(0, 4)}-${id.slice(-8).toUpperCase()}`,
    supplier_name: name,
    legal_name: input.legalName || name,
    status: "ACTIVE",
    destinations: arrayText_(input.destinations),
    address: input.address || "",
    website: input.website || "",
    tax_id: input.taxId || "",
    internal_pic_employee_id: input.internalPicEmployeeId || "",
    operational_notes: input.operationalNotes || "",
  }, actor, now);
  replaceSupplierChildren_("SUPPLIER_CONTACTS", "contact_id", "supplier_id", id,
    input.contacts || [], (row) => ({
      contact_id: row.contactId || uuid_("SCON"),
      supplier_id: id,
      contact_name: row.contactName || "",
      position: row.position || "",
      department: row.department || "",
      phone: normalizeSupplierPhone_(row.phone, "Phone"),
      whatsapp: normalizeSupplierPhone_(row.whatsapp, "WhatsApp"),
      email: row.email || "",
      preferred_channel: row.preferredChannel || "",
      operational_hours: row.operationalHours || "",
      is_emergency: Boolean(row.isEmergency),
      responsibility: row.responsibility || "",
      status: "ACTIVE",
    }), actor, now);
  replaceSupplierChildren_("SUPPLIER_RECIPIENTS", "recipient_id", "supplier_id", id,
    input.recipients || [], (row, index) => {
      const isWhatsApp = String(row.channel).toUpperCase() === "WHATSAPP"
        || String(row.recipientType).toUpperCase() === "WHATSAPP";
      return {
        recipient_id: row.recipientId || uuid_("SREC"),
        supplier_id: id,
        recipient_type: row.recipientType || "TO",
        address: isWhatsApp
          ? normalizeSupplierPhone_(row.address, "Recipient WhatsApp") : row.address || "",
        channel: row.channel || "EMAIL",
        purpose: row.purpose || "",
        sequence: Number(row.sequence || index + 1),
        status: "ACTIVE",
      };
    }, actor, now);
  const sopInput = input.sop || {};
  const existingSop = allRecords_("SUPPLIER_SOPS").find((row) => String(row.supplier_id) === id);
  const sopId = sopInput.sopId || existingSop && existingSop.sop_id || uuid_("SSOP");
  upsertVersionedRecord_("SUPPLIER_SOPS", "sop_id", sopId, {
    sop_id: sopId,
    supplier_id: id,
    booking_channels: arrayText_(sopInput.bookingChannels),
    lead_time: sopInput.leadTime || "",
    cutoff_time: sopInput.cutoffTime || "",
    required_information: sopInput.requiredInformation || "",
    confirmation_procedure: sopInput.confirmationProcedure || "",
    amendment_procedure: sopInput.amendmentProcedure || "",
    cancellation_procedure: sopInput.cancellationProcedure || "",
    emergency_procedure: sopInput.emergencyProcedure || "",
    portal_url: sopInput.portalUrl || "",
    account_reference: sopInput.accountReference || "",
    subject_template: sopInput.subjectTemplate || "",
    body_template: sopInput.bodyTemplate || "",
    status: "ACTIVE",
  }, actor, now);
  const changeCount = (input.contacts || []).length + (input.recipients || []).length + 1;
  recordAndBroadcastMasterChange_("SUPPLIER_CHANGED", "SUPPLIER", id, id, typeCode,
    `${before ? "Updated" : "Added"} supplier ${name}; ${changeCount} contact/SOP records synchronized.`,
    before, input, actor, now, options.broadcast !== false);
  return options.returnCatalog === false ? { entityId: id } : supplierMasterCatalog_();
}

function saveSupplierProduct_(request, actor, options) {
  options = options || {};
  if (!options.schemaReady) ensureSupplierMasterSchema_();
  const input = request.product || {};
  const supplier = findRecord_("SUPPLIERS", "supplier_id", input.supplierId);
  if (!supplier || !String(input.productName || "").trim()) {
    throw apiError_("VALIDATION_ERROR", "Supplier and Product name are required.");
  }
  const now = new Date().toISOString();
  const id = input.productId || uuid_("PROD");
  const before = findRecord_("SUPPLIER_PRODUCTS", "product_id", id);
  upsertVersionedRecord_("SUPPLIER_PRODUCTS", "product_id", id, {
    product_id: id,
    supplier_id: supplier.supplier_id,
    product_code: input.productCode || `${supplier.type_code.slice(0, 4)}-${id.slice(-8).toUpperCase()}`,
    product_name: String(input.productName).trim(),
    category: input.category || supplier.type_code,
    subcategory: input.subcategory || "",
    destinations: arrayText_(input.destinations),
    description: input.description || "",
    inclusion: input.inclusion || "",
    exclusion: input.exclusion || "",
    terms_and_conditions: input.termsAndConditions || "",
    cancellation_terms: input.cancellationTerms || "",
    booking_instructions: input.bookingInstructions || "",
    minimum_order: input.minimumOrder || "",
    maximum_capacity: input.maximumCapacity || "",
    tax_treatment: input.taxTreatment || "AS_CONTRACT",
    notes: input.notes || "",
    status: "ACTIVE",
  }, actor, now);
  recordAndBroadcastMasterChange_("SUPPLIER_PRODUCT_CHANGED", "SUPPLIER_PRODUCT", id,
    supplier.supplier_id, supplier.type_code,
    `${before ? "Updated" : "Added"} ${supplier.supplier_name} product ${input.productName}.`,
    before, input, actor, now, options.broadcast !== false);
  return options.returnCatalog === false ? { entityId: id } : supplierMasterCatalog_();
}

function saveSupplierContract_(request, actor, options) {
  options = options || {};
  if (!options.schemaReady) ensureSupplierMasterSchema_();
  const input = request.contract || {};
  const supplier = findRecord_("SUPPLIERS", "supplier_id", input.supplierId);
  const validFrom = normalizeDateText_(input.validFrom);
  const validTo = normalizeDateText_(input.validTo);
  if (!supplier || !String(input.contractNumber || "").trim() || !validFrom || !validTo || validTo < validFrom) {
    throw apiError_("VALIDATION_ERROR", "Supplier, Contract number, and a valid date range are required.");
  }
  const rates = input.rates || [];
  if (!rates.length) throw apiError_("VALIDATION_ERROR", "At least one Contract Rate is required.");
  rates.forEach((rate) => {
    if (!findRecord_("SUPPLIER_PRODUCTS", "product_id", rate.productId)) {
      throw apiError_("VALIDATION_ERROR", "Every Contract Rate must reference an existing product.");
    }
    if (!String(rate.priceBasis || "").trim() || !Number.isFinite(Number(rate.amount))) {
      throw apiError_("VALIDATION_ERROR", "Every Contract Rate requires Price basis and numeric amount.");
    }
  });
  const now = new Date().toISOString();
  const id = input.contractId || uuid_("CTR");
  const before = findRecord_("SUPPLIER_CONTRACTS", "contract_id", id);
  const requestedProductIds = new Set(rates.map((rate) => String(rate.productId)));
  const existingRates = allRecords_("CONTRACT_RATES");
  const overlaps = allRecords_("SUPPLIER_CONTRACTS").filter((row) =>
    String(row.supplier_id) === String(supplier.supplier_id)
    && String(row.contract_id) !== String(id)
    && !["ARCHIVED", "CANCELLED", "SUPERSEDED"].includes(String(row.status).toUpperCase())
    && existingRates.some((rate) =>
      String(rate.contract_id) === String(row.contract_id)
      && requestedProductIds.has(String(rate.product_id))
      && String(rate.status).toUpperCase() !== "ARCHIVED"
    )
    && dateRangesOverlap_(validFrom, validTo, normalizeDateText_(row.valid_from), normalizeDateText_(row.valid_to))
  );
  if (overlaps.length && !input.allowOverlap) {
    throw apiError_("CONTRACT_OVERLAP", "Contract validity overlaps another active/scheduled contract.", {
      overlappingContracts: overlaps.map((row) => row.contract_number),
    });
  }
  if (overlaps.length && !String(input.overlapReason || "").trim()) {
    throw apiError_("VALIDATION_ERROR", "Overlap reason is required when overlapping contracts are allowed.");
  }
  upsertVersionedRecord_("SUPPLIER_CONTRACTS", "contract_id", id, {
    contract_id: id,
    supplier_id: supplier.supplier_id,
    contract_number: String(input.contractNumber).trim(),
    contract_name: input.contractName || input.contractNumber,
    valid_from: validFrom,
    valid_to: validTo,
    currency: input.currency || "IDR",
    tax_treatment: input.taxTreatment || "AS_CONTRACT",
    terms_and_conditions: input.termsAndConditions || "",
    drive_file_id: input.driveFileId || "",
    drive_file_name: input.driveFileName || "",
    drive_file_url: input.driveFileUrl || "",
    status: contractStatusForDate_(validFrom, validTo, input.status || "ACTIVE"),
    allow_overlap: Boolean(input.allowOverlap),
    overlap_reason: input.overlapReason || "",
  }, actor, now);
  replaceSupplierChildren_("CONTRACT_RATES", "contract_rate_id", "contract_id", id,
    rates, (rate) => ({
      contract_rate_id: rate.contractRateId || uuid_("RATE"),
      contract_id: id,
      product_id: rate.productId,
      price_basis: String(rate.priceBasis).toUpperCase(),
      amount: Number(rate.amount),
      currency: rate.currency || input.currency || "IDR",
      min_quantity: rate.minQuantity || "",
      max_quantity: rate.maxQuantity || "",
      market: rate.market || "",
      season: rate.season || "",
      surcharge_rule: rate.surchargeRule || "",
      valid_from: normalizeDateText_(rate.validFrom) || validFrom,
      valid_to: normalizeDateText_(rate.validTo) || validTo,
      notes: rate.notes || "",
      status: "ACTIVE",
    }), actor, now);
  recordAndBroadcastMasterChange_("SUPPLIER_CONTRACT_CHANGED", "SUPPLIER_CONTRACT", id,
    supplier.supplier_id, supplier.type_code,
    `${before ? "Updated" : "Added"} contract ${input.contractNumber} for ${supplier.supplier_name}; ${rates.length} rate components active.`,
    before, input, actor, now, options.broadcast !== false);
  return options.returnCatalog === false ? { entityId: id } : supplierMasterCatalog_();
}

function archiveSupplierEntity_(request, actor, options) {
  options = options || {};
  if (!options.schemaReady) ensureSupplierMasterSchema_();
  const kind = String(request.entityKind || "").toUpperCase();
  const config = {
    SUPPLIER_TYPE: ["SUPPLIER_TYPES", "supplier_type_id"],
    SUPPLIER: ["SUPPLIERS", "supplier_id"],
    PRODUCT: ["SUPPLIER_PRODUCTS", "product_id"],
    CONTRACT: ["SUPPLIER_CONTRACTS", "contract_id"],
  }[kind];
  if (!config || !request.entityId) throw apiError_("VALIDATION_ERROR", "Supported entity kind and ID are required.");
  const [sheetName, key] = config;
  const before = findRecord_(sheetName, key, request.entityId);
  if (!before) throw apiError_("RECORD_NOT_FOUND", "Supplier Master record was not found.");
  if (kind === "SUPPLIER_TYPE") {
    const activeSuppliers = allRecords_("SUPPLIERS").filter((row) =>
      String(row.supplier_type_id) === String(request.entityId)
      && String(row.status).toUpperCase() === "ACTIVE"
    );
    if (activeSuppliers.length) {
      throw apiError_("TYPE_IN_USE", "Archive suppliers under this Type before archiving the Supplier Type.");
    }
  }
  const now = new Date().toISOString();
  updateRecord_(sheetName, key, request.entityId, {
    status: "ARCHIVED",
    record_version: Number(before.record_version || 0) + 1,
    updated_at: now,
    updated_by: actor.employeeId,
  });
  const supplierId = kind === "SUPPLIER" ? request.entityId : before.supplier_id || "";
  recordAndBroadcastMasterChange_("SUPPLIER_MASTER_ARCHIVED", kind, request.entityId,
    supplierId, before.type_code || "", `Archived ${kind.replaceAll("_", " ")}. Reason: ${request.reason || "Not provided"}.`,
    before, { status: "ARCHIVED", reason: request.reason || "" }, actor, now, options.broadcast !== false);
  return options.returnCatalog === false ? { entityId: request.entityId } : supplierMasterCatalog_();
}

function publishSupplierMasterBatch_(request, actor) {
  const changes = Array.isArray(request.changes) ? request.changes : [];
  if (!request.requestId || !changes.length) {
    throw apiError_("VALIDATION_ERROR", "Batch request ID and at least one change are required.");
  }
  if (changes.length > 250) {
    throw apiError_("BATCH_TOO_LARGE", "Publish at most 250 Supplier Master changes per batch.");
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureSupplierMasterSchema_();
    const order = { TYPE: 1, SUPPLIER: 2, PRODUCT: 3, CONTRACT: 4, ARCHIVE: 5 };
    const sorted = changes.slice().sort((a, b) =>
      (order[String(a.entityKind).toUpperCase()] || 9)
      - (order[String(b.entityKind).toUpperCase()] || 9)
    );
    const results = [];
    sorted.forEach((change) => {
      const kind = String(change.entityKind || "").toUpperCase();
      const payload = change.payload || {};
      try {
        assertSupplierMasterBaseVersion_(kind, change.entityId, change.baseRecordVersion);
        const options = { schemaReady: true, returnCatalog: false, broadcast: false };
        if (kind === "TYPE") saveSupplierType_({ supplierType: payload }, actor, options);
        else if (kind === "SUPPLIER") saveSupplier_({ supplier: payload }, actor, options);
        else if (kind === "PRODUCT") saveSupplierProduct_({ product: payload }, actor, options);
        else if (kind === "CONTRACT") saveSupplierContract_({ contract: payload }, actor, options);
        else if (kind === "ARCHIVE") archiveSupplierEntity_(payload, actor, options);
        else throw apiError_("VALIDATION_ERROR", `Unsupported Supplier Master entity kind: ${kind}.`);
        results.push({ draftId: change.draftId, entityId: change.entityId, status: "SYNCED" });
      } catch (error) {
        results.push({
          draftId: change.draftId,
          entityId: change.entityId,
          status: error.code === "VERSION_CONFLICT" ? "CONFLICT" : "FAILED",
          errorCode: error.code || "PUBLISH_FAILED",
          message: error.publicMessage || error.message,
        });
      }
    });
    const synced = results.filter((row) => row.status === "SYNCED").length;
    const conflicts = results.filter((row) => row.status === "CONFLICT").length;
    const failed = results.length - synced - conflicts;
    if (synced && request.broadcast !== false) {
      const now = new Date().toISOString();
      broadcastSupplierMasterNotification_({
        type: "SUPPLIER_MASTER_BATCH_PUBLISHED",
        title: "Supplier Master updated",
        message: `${actor.fullName || actor.employeeId} published ${Number(request.sessionTotal || synced)} Supplier Master change(s).`,
        actionUrl: "supplier-master",
      }, actor, now);
    }
    return {
      results,
      summary: { total: results.length, synced, failed, conflicts },
      catalog: supplierMasterCatalog_(),
    };
  } finally {
    lock.releaseLock();
  }
}

function assertSupplierMasterBaseVersion_(kind, entityId, baseRecordVersion) {
  if (baseRecordVersion === null || baseRecordVersion === undefined || baseRecordVersion === "") return;
  const config = {
    TYPE: ["SUPPLIER_TYPES", "supplier_type_id"],
    SUPPLIER: ["SUPPLIERS", "supplier_id"],
    PRODUCT: ["SUPPLIER_PRODUCTS", "product_id"],
    CONTRACT: ["SUPPLIER_CONTRACTS", "contract_id"],
  }[kind];
  if (!config) return;
  const current = findRecord_(config[0], config[1], entityId);
  if (current && Number(current.record_version || 0) !== Number(baseRecordVersion)) {
    throw apiError_(
      "VERSION_CONFLICT",
      "This record changed in Google after the local edit was started. Refresh and review before publishing.",
      { currentRecordVersion: Number(current.record_version || 0) },
    );
  }
}

function saveVendorIntake_(request, actor) {
  if (request.apiVersion !== API_VERSION) {
    throw apiError_("API_VERSION_UNSUPPORTED", "Desktop application must be updated before saving Vendor intake.");
  }
  const intake = request.intake || {};
  if (!request.requestId || !intake.customerCode || !intake.tourId) {
    throw apiError_("VALIDATION_ERROR", "Request ID, Customer Code, and Tour ID are required.");
  }
  validateVendorIntakePayload_(intake);
  const role = String(actor.role || "").toUpperCase().replace(/[ -]+/g, "_");
  if (String(actor.department || "").toUpperCase() !== "VENDOR"
      && !["ADMIN", "MANAGER", "ALL_ROUNDER"].includes(role)) {
    throw apiError_("DEPARTMENT_DENIED", "Vendor intake can only be posted by Vendor or oversight users.");
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const replay = findRecord_("AUDIT_LOG", "request_id", request.requestId);
    if (replay && replay.result === "SUCCESS") {
      return { customerCode: intake.customerCode, tourId: intake.tourId, replayed: true };
    }
    validateVendorSource_(request);
    ensureVendorSchema_();
    const now = new Date().toISOString();
    const code = String(intake.customerCode).trim().toUpperCase();
    const tour = findRecord_("TOURS", "customer_code", code);
    if (!tour) throw apiError_("TOUR_NOT_FOUND", "Customer Code was not found in TOURS.");
    if (String(tour.tour_id || "") !== String(intake.tourId || "")) {
      throw apiError_("TOUR_MISMATCH", "Customer Code and Tour ID do not refer to the same record.");
    }
    updateRecord_("TOURS", "customer_code", code, {
      client_name: intake.customerName || tour.client_name || "",
      pax_adult: Number(intake.adultPax || 0),
      pax_child: Number(intake.childPax || 0),
      pax_infant: Number(intake.infantPax || 0),
      arrival_date: intake.arrivalDate || "",
      arrival_flight: intake.arrivalFlight || "",
      arrival_sector: intake.arrivalSector || "",
      arrival_time: intake.arrivalTime || "",
      departure_date: intake.departureDate || "",
      departure_flight: intake.departureFlight || "",
      departure_sector: intake.departureSector || "",
      departure_time: intake.departureTime || "",
      record_version: Number(tour.record_version || 0) + 1,
      updated_at: now,
      updated_by: actor.employeeId,
    });
    (intake.hotels || []).forEach((hotel, index) => {
      const hotelStayId = hotel.hotelStayId || uuid_("HST");
      upsertVersionedRecord_(
        "TOUR_HOTEL_STAYS",
        "hotel_stay_id",
        hotelStayId,
        {
        hotel_stay_id: hotelStayId,
        tour_id: tour.tour_id,
        revision_id: intake.sourceRevisionId || "",
        stay_sequence: index + 1,
        hotel_name: hotel.hotelName || "",
        check_in_date: hotel.checkInDate || "",
        check_out_date: hotel.checkOutDate || "",
        status: "ACTIVE",
        record_version: 1,
        created_at: now,
        created_by: actor.employeeId,
        updated_at: now,
        updated_by: actor.employeeId,
        },
        actor,
        now,
      );
    });
    let splitCount = 0;
    (intake.days || []).forEach((day) => {
      const dayId = day.tourDayId || uuid_("TDAY");
      upsertVersionedRecord_("TOUR_DAYS", "tour_day_id", dayId, {
        tour_day_id: dayId,
        tour_id: tour.tour_id,
        revision_id: intake.sourceRevisionId || "",
        day_number: day.dayNumber,
        service_date: day.serviceDate || "",
        day_title: String(day.dayTitle || "").trim() || `Day ${day.dayNumber}`,
        start_time: day.startTime || "",
        finish_time: day.finishTime || "",
        location: "",
        arrival_departure_flag: Number(day.dayNumber) === 1 ? "ARRIVAL" : "",
        day_notes: day.daywiseText || "",
        status: "VENDOR_INTAKE_RECORDED",
        record_version: 1,
        created_at: now,
        created_by: actor.employeeId,
        updated_at: now,
        updated_by: actor.employeeId,
      }, actor, now);
      (day.splits || []).forEach((split, index) => {
        const serviceId = split.serviceId || uuid_("SVC");
        const serviceType = normalizeVendorSplitType_(split.serviceType);
        upsertVersionedRecord_("SERVICES", "service_id", serviceId, {
          service_id: serviceId,
          tour_day_id: dayId,
          tour_id: tour.tour_id,
          revision_id: intake.sourceRevisionId || "",
          service_sequence: index + 1,
          service_type: serviceType,
          service_name: split.activityText || "",
          service_description: split.activityText || "",
          start_time: "",
          end_time: "",
          pickup_location: "",
          dropoff_location: "",
          quantity: Number(split.quantity || 1),
          unit: split.priceBasis || "PER_SERVICE",
          booking_required: serviceType !== "TOC",
          status: "SPLIT_READY",
          notes: "",
          suggested_vendor_id: split.vendorId || "",
          suggested_vendor_name: split.vendorName || "",
          service_master_id: split.serviceMasterId || "",
          supplier_id: split.supplierId || split.vendorId || "",
          product_id: split.productId || split.serviceMasterId || "",
          contract_id: split.contractId || "",
          contract_rate_id: split.contractRateId || "",
          price_source: split.priceSource || "NONE",
          adult_rate_idr: split.adultRateIdr ?? "",
          child_rate_idr: split.childRateIdr ?? "",
          infant_rate_idr: split.infantRateIdr ?? "",
          unit_rate_idr: split.unitRateIdr ?? "",
          currency: split.currency || "IDR",
          rate_status: split.rateStatus || "PENDING_RATE",
          manual_price_reason: split.manualPriceReason || "",
          manual_rate_source: split.manualRateSource || "",
          manual_evidence_ref: split.manualEvidenceRef || "",
          rate_valid_to: split.rateValidTo || "",
          rate_snapshot_at: split.rateSnapshotAt || now,
          record_version: 1,
          created_at: now,
          created_by: actor.employeeId,
          updated_at: now,
          updated_by: actor.employeeId,
        }, actor, now);
        splitCount += 1;
      });
    });
    const auditId = uuid_("AUD");
    appendRecord_("AUDIT_LOG", {
      audit_id: auditId,
      event_timestamp: now,
      actor_employee_id: actor.employeeId,
      actor_email: actor.email,
      client_mode: "DESKTOP",
      action: "VENDOR_INTAKE_SAVED",
      entity_type: "TOUR",
      entity_id: tour.tour_id,
      tour_id: tour.tour_id,
      request_id: request.requestId,
      before_json: "",
      after_json: JSON.stringify({
        customerCode: code,
        sourcePublicationId: request.sourcePublicationId || "",
        sourceRecordVersion: Number(request.sourceRecordVersion || 0),
        adultPax: Number(intake.adultPax || 0),
        childPax: Number(intake.childPax || 0),
        infantPax: Number(intake.infantPax || 0),
        hotelCount: (intake.hotels || []).length,
        dayCount: (intake.days || []).length,
        splitCount,
      }),
      reason: "",
      result: "SUCCESS",
      error_code: "",
    });
    return {
      customerCode: code,
      tourId: tour.tour_id,
      auditId,
      hotelCount: (intake.hotels || []).length,
      dayCount: (intake.days || []).length,
      splitCount,
      replayed: false,
    };
  } finally {
    lock.releaseLock();
  }
}

function validateVendorIntakePayload_(intake) {
  const required = ["customerCode", "customerName", "tourId", "arrivalDate", "departureDate"];
  const missing = required.filter((field) => !String(intake[field] || "").trim());
  if (missing.length) {
    throw apiError_("VALIDATION_ERROR", `Missing Vendor intake fields: ${missing.join(", ")}.`);
  }
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDate.test(String(intake.arrivalDate)) || !isoDate.test(String(intake.departureDate))) {
    throw apiError_("VALIDATION_ERROR", "Arrival and departure dates must use YYYY-MM-DD.");
  }
  if (String(intake.departureDate) < String(intake.arrivalDate)) {
    throw apiError_("VALIDATION_ERROR", "Departure date cannot be earlier than arrival date.");
  }
  ["adultPax", "childPax", "infantPax"].forEach((field) => {
    const value = Number(intake[field] ?? 0);
    if (!Number.isInteger(value) || value < 0) {
      throw apiError_("VALIDATION_ERROR", "Adult, Child, and Infant must be whole numbers starting from 0.");
    }
  });
  ensureSupplierMasterSchema_();
  const allowedTypes = allRecords_("SUPPLIER_TYPES")
    .filter((row) => String(row.status || "").toUpperCase() === "ACTIVE")
    .map((row) => String(row.type_code || "").toUpperCase());
  const dayNumbers = {};
  (intake.days || []).forEach((day) => {
    const number = Number(day.dayNumber);
    if (!Number.isInteger(number) || number < 1 || dayNumbers[number]) {
      throw apiError_("VALIDATION_ERROR", "Day Wise numbers must be unique positive integers.");
    }
    dayNumbers[number] = true;
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(String(day.startTime || ""))) {
      throw apiError_("VALIDATION_ERROR", `Day ${number} Start Time is required and must use HH:MM.`);
    }
    if (day.finishTime && !timePattern.test(String(day.finishTime))) {
      throw apiError_("VALIDATION_ERROR", `Day ${number} Finish Time must use HH:MM.`);
    }
    (day.splits || []).forEach((split) => {
      if (!allowedTypes.includes(normalizeVendorSplitType_(split.serviceType))) {
        throw apiError_("VALIDATION_ERROR", "Unsupported Vendor micro split type.");
      }
      if (!String(split.activityText || "").trim()) {
        throw apiError_("VALIDATION_ERROR", `Day ${number} Vendor Service is required.`);
      }
      if (!["RATE_READY", "PENDING_RATE"].includes(String(split.rateStatus || "PENDING_RATE"))) {
        throw apiError_("VALIDATION_ERROR", `Day ${number} rate status is invalid.`);
      }
      const manualRateFilled = split.priceSource === "MANUAL"
        || split.manualPriceReason || split.manualRateSource || split.manualEvidenceRef;
      if (manualRateFilled && !String(split.manualPriceReason || "").trim()) {
        throw apiError_("VALIDATION_ERROR", `Day ${number} manual rate reason is required.`);
      }
      if (manualRateFilled && !String(split.manualRateSource || "").trim()) {
        throw apiError_("VALIDATION_ERROR", `Day ${number} manual rate source is required.`);
      }
    });
  });
}

function normalizeVendorSplitType_(value) {
  const normalized = String(value || "VENDOR").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "VEHICLE") return "TRANSPORT";
  if (normalized === "ADDITIONAL_SERVICES") return "ADDITIONAL_SERVICE";
  return normalized;
}

function validateVendorSource_(request) {
  if (!request.sourcePublicationId) return;
  const source = findRecord_("DEPARTMENT_PUBLICATIONS", "publication_id", request.sourcePublicationId);
  if (!source || String(source.status) !== "PUBLISHED") {
    throw apiError_("VERSION_CONFLICT", "Reservation source is no longer current. Reload the itinerary.");
  }
  if (Number(source.published_record_version || 0) !== Number(request.sourceRecordVersion || 0)) {
    throw apiError_("VERSION_CONFLICT", "Reservation published a newer version. Reload before posting.", {
      expectedVersion: Number(source.published_record_version || 0),
      submittedVersion: Number(request.sourceRecordVersion || 0),
    });
  }
}

function ensureVendorSchema_() {
  ensureHeaders_("TOURS", [
    "pax_adult", "pax_child", "pax_infant",
    "arrival_flight", "arrival_sector", "arrival_time",
    "departure_flight", "departure_sector", "departure_time",
  ]);
  ensureSheetWithHeaders_("TOUR_HOTEL_STAYS", [
    "hotel_stay_id", "tour_id", "revision_id", "stay_sequence", "hotel_name",
    "check_in_date", "check_out_date", "status", "record_version",
    "created_at", "created_by", "updated_at", "updated_by",
  ]);
  ensureHeaders_("TOUR_DAYS", ["start_time", "finish_time"]);
  ensureHeaders_("SERVICES", [
    "suggested_vendor_id", "suggested_vendor_name", "service_master_id",
    "supplier_id", "product_id", "contract_id", "contract_rate_id",
    "price_source", "adult_rate_idr", "child_rate_idr", "infant_rate_idr", "unit_rate_idr",
    "currency", "rate_status", "manual_price_reason", "manual_rate_source",
    "manual_evidence_ref", "rate_valid_to", "rate_snapshot_at",
  ]);
}

function publishDepartmentResult_(request, actor) {
  if (request.apiVersion !== API_VERSION) {
    throw apiError_("API_VERSION_UNSUPPORTED", "Desktop application must be updated before publishing.");
  }
  if (!request.idempotencyKey || !request.draft) {
    throw apiError_("VALIDATION_ERROR", "Idempotency key and draft are required.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const existing = findRecord_("DEPARTMENT_PUBLICATIONS", "idempotency_key", request.idempotencyKey);
    if (existing) return publicationResponse_(existing, true);

    const draft = request.draft;
    validatePublicationDraft_(draft);
    validateSourceVersion_(draft);

    const now = new Date().toISOString();
    const reservationTour = draft.department === "RESERVATION" && draft.publicationType === "NEW_CONFIRMATION"
      ? upsertReservationTour_(draft, actor, now)
      : null;
    const resolvedTourId = draft.tourId || (reservationTour && reservationTour.tour_id) || "";
    const publicationId = uuid_("PUB");
    const officialEntityId = draft.officialEntityId || resolvedTourId || uuid_(entityPrefix_(draft.publicationType));
    const previous = latestDepartmentPublication_(resolvedTourId, draft.customerCode, draft.department);
    const publishedVersion = Number(previous && previous.published_record_version || 0) + 1;
    const contentHash = digest_(JSON.stringify(draft.payload));

    const publication = {
      publication_id: publicationId,
      idempotency_key: request.idempotencyKey,
      official_entity_id: officialEntityId,
      tour_id: resolvedTourId,
      customer_code: String(draft.customerCode).trim().toUpperCase(),
      department: draft.department,
      publication_type: draft.publicationType,
      source_publication_id: draft.sourcePublicationId || "",
      source_record_version: draft.sourceRecordVersion || "",
      published_record_version: publishedVersion,
      content_hash: contentHash,
      payload_json: JSON.stringify(draft.payload),
      status: "PUBLISHED",
      published_at: now,
      published_by: actor.employeeId,
      superseded_by_publication_id: "",
    };
    appendRecord_("DEPARTMENT_PUBLICATIONS", publication);

    if (previous) {
      updateRecord_(
        "DEPARTMENT_PUBLICATIONS",
        "publication_id",
        previous.publication_id,
        { status: "SUPERSEDED", superseded_by_publication_id: publicationId },
      );
    }

    if (draft.sourcePublicationId) {
      appendRecord_("PUBLICATION_LINKS", {
        publication_link_id: uuid_("LNK"),
        tour_id: resolvedTourId,
        customer_code: publication.customer_code,
        from_publication_id: draft.sourcePublicationId,
        to_publication_id: publicationId,
        relationship_type: "SOURCE_TO_RESULT",
        created_at: now,
        created_by: actor.employeeId,
      });
    }

    const isNewItinerary = draft.department === "RESERVATION"
      && draft.publicationType === "NEW_CONFIRMATION";
    appendRecord_("AUDIT_LOG", {
      audit_id: uuid_("AUD"),
      event_timestamp: now,
      actor_employee_id: actor.employeeId,
      actor_email: actor.email,
      client_mode: "DESKTOP",
      action: isNewItinerary ? "ITINERARY_POSTED" : "PUBLICATION_PUBLISH",
      entity_type: isNewItinerary ? "ITINERARY" : "DEPARTMENT_PUBLICATION",
      entity_id: isNewItinerary
        ? String(draft.payload.itineraryDriveFileId || publicationId)
        : publicationId,
      tour_id: resolvedTourId,
      request_id: request.idempotencyKey,
      before_json: previous ? JSON.stringify(previous) : "",
      after_json: JSON.stringify(isNewItinerary ? {
        customerCode: publication.customer_code,
        customerName: draft.payload.customerName || "",
        revisionNumber: 0,
        driveFileId: draft.payload.itineraryDriveFileId || "",
        driveFileName: draft.payload.itineraryDriveFileName || "",
        publicationId,
      } : publication),
      reason: isNewItinerary ? "New itinerary posted." : "",
      result: "SUCCESS",
      error_code: "",
    });
    if (isNewItinerary) {
      broadcastItineraryNotification_({
        tourId: resolvedTourId,
        revisionId: "",
        customerCode: publication.customer_code,
        eventType: "NEW",
        revisionNumber: 0,
        note: "New itinerary posted.",
      }, actor, now);
    }

    return publicationResponse_(publication, false);
  } finally {
    lock.releaseLock();
  }
}

function recordItineraryEvent_(request, actor) {
  if (request.apiVersion !== API_VERSION) {
    throw apiError_("API_VERSION_UNSUPPORTED", "Desktop application must be updated before recording itinerary activity.");
  }
  const eventId = String(request.eventId || "").trim();
  const eventType = String(request.eventType || "").trim().toUpperCase();
  const customerCode = String(request.customerCode || "").trim().toUpperCase();
  if (!eventId || !customerCode || !["REVISION", "DOWNLOAD"].includes(eventType)) {
    throw apiError_("VALIDATION_ERROR", "Event ID, Customer Code, and a supported itinerary event are required.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const existing = findRecord_("AUDIT_LOG", "request_id", eventId);
    if (existing) {
      return { eventId, auditId: existing.audit_id, replayed: true, notificationsCreated: 0 };
    }
    const tour = request.tourId
      ? findRecord_("TOURS", "tour_id", request.tourId)
      : findRecord_("TOURS", "customer_code", customerCode);
    if (!tour) throw apiError_("TOUR_NOT_FOUND", "Customer Code was not found.");
    const now = new Date().toISOString();
    const revisionNumber = Number(request.revisionNumber || 0);
    const action = eventType === "REVISION" ? "ITINERARY_REVISED" : "ITINERARY_DOWNLOADED";
    const after = {
      customerCode,
      revisionNumber,
      driveFileId: request.driveFileId || "",
      driveFileName: request.driveFileName || "",
      downloadedFileName: request.downloadedFileName || "",
      note: request.note || "",
    };
    const auditId = uuid_("AUD");
    appendRecord_("AUDIT_LOG", {
      audit_id: auditId,
      event_timestamp: now,
      actor_employee_id: actor.employeeId,
      actor_email: actor.email,
      client_mode: "DESKTOP",
      action,
      entity_type: "ITINERARY",
      entity_id: request.driveFileId || eventId,
      tour_id: tour.tour_id,
      request_id: eventId,
      before_json: "",
      after_json: JSON.stringify(after),
      reason: request.note || "",
      result: "SUCCESS",
      error_code: "",
    });
    const notificationsCreated = eventType === "REVISION"
      ? broadcastItineraryNotification_({
        tourId: tour.tour_id,
        revisionId: eventId,
        customerCode,
        eventType,
        revisionNumber,
        note: request.note || "",
      }, actor, now)
      : 0;
    return { eventId, auditId, replayed: false, notificationsCreated };
  } finally {
    lock.releaseLock();
  }
}

function recordVendorBookingEvidence_(request, actor) {
  if (request.apiVersion !== API_VERSION) {
    throw apiError_("API_VERSION_UNSUPPORTED", "Desktop application must be updated before booking evidence can sync.");
  }
  const evidence = request.evidence || {};
  const sendAttemptId = String(evidence.sendAttemptId || "").trim();
  const bookingId = String(evidence.bookingId || "").trim();
  const customerCode = String(evidence.customerCode || "").trim().toUpperCase();
  const gmailMessageId = String(evidence.gmailMessageId || "").trim();
  const gmailThreadId = String(evidence.gmailThreadId || "").trim();
  if (!sendAttemptId || !bookingId || !customerCode || !gmailMessageId || !gmailThreadId) {
    throw apiError_(
      "VALIDATION_ERROR",
      "Send Attempt, Booking, Customer Code, Gmail message, and Gmail thread IDs are required.",
    );
  }

  ensureSheetWithHeaders_("SUPPLIER_BOOKINGS", [
    "booking_id", "tour_id", "customer_code", "supplier_id", "supplier_name",
    "action_type", "channel", "booking_status", "communication_status",
    "supplier_result", "rate_status", "source_revision_id", "last_send_attempt_id",
    "sent_at", "record_version", "created_at", "created_by", "updated_at", "updated_by",
  ]);
  ensureSheetWithHeaders_("COMMUNICATIONS", [
    "communication_id", "booking_id", "tour_id", "customer_code", "supplier_id",
    "communication_type", "channel", "direction", "status", "send_attempt_id",
    "snapshot_hash", "recipients_json", "subject_snapshot", "body_snapshot",
    "service_ids_json", "source_revision_id", "gmail_thread_id", "gmail_message_id",
    "sent_at", "actor_email", "created_at", "created_by",
  ]);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const replay = findRecord_("COMMUNICATIONS", "send_attempt_id", sendAttemptId);
    if (replay) {
      return {
        sendAttemptId,
        bookingId,
        communicationId: replay.communication_id,
        replayed: true,
      };
    }
    const now = new Date().toISOString();
    const booking = {
      booking_id: bookingId,
      tour_id: evidence.tourId || "",
      customer_code: customerCode,
      supplier_id: evidence.supplierId || "",
      supplier_name: evidence.supplierName || "",
      action_type: evidence.actionType || "NEW",
      channel: "EMAIL",
      booking_status: evidence.actionType === "CANCEL" ? "CANCELED" : "ACTIVE",
      communication_status: "SENT",
      supplier_result: "PENDING",
      rate_status: evidence.rateStatus || "PENDING_RATE",
      source_revision_id: evidence.sourceRevisionId || "",
      last_send_attempt_id: sendAttemptId,
      sent_at: evidence.sentAt || now,
    };
    upsertVersionedRecord_(
      "SUPPLIER_BOOKINGS", "booking_id", bookingId, booking, actor, now,
    );
    const communicationId = uuid_("COMM");
    appendRecord_("COMMUNICATIONS", {
      communication_id: communicationId,
      booking_id: bookingId,
      tour_id: evidence.tourId || "",
      customer_code: customerCode,
      supplier_id: evidence.supplierId || "",
      communication_type: "SUPPLIER_BOOKING",
      channel: "EMAIL",
      direction: "OUTBOUND",
      status: "SENT",
      send_attempt_id: sendAttemptId,
      snapshot_hash: evidence.snapshotHash || "",
      recipients_json: JSON.stringify(evidence.recipients || []),
      subject_snapshot: evidence.subject || "",
      body_snapshot: evidence.body || "",
      service_ids_json: JSON.stringify(evidence.serviceIds || []),
      source_revision_id: evidence.sourceRevisionId || "",
      gmail_thread_id: gmailThreadId,
      gmail_message_id: gmailMessageId,
      sent_at: evidence.sentAt || now,
      actor_email: actor.email,
      created_at: now,
      created_by: actor.employeeId,
    });
    appendRecord_("AUDIT_LOG", {
      audit_id: uuid_("AUD"),
      event_timestamp: now,
      actor_employee_id: actor.employeeId,
      actor_email: actor.email,
      client_mode: "DESKTOP",
      action: "VENDOR_BOOKING_EMAIL_SENT",
      entity_type: "SUPPLIER_BOOKING",
      entity_id: bookingId,
      tour_id: evidence.tourId || "",
      request_id: sendAttemptId,
      before_json: "",
      after_json: JSON.stringify({
        communicationId,
        gmailMessageId,
        gmailThreadId,
        snapshotHash: evidence.snapshotHash || "",
      }),
      reason: "",
      result: "SUCCESS",
      error_code: "",
    });
    return { sendAttemptId, bookingId, communicationId, replayed: false };
  } finally {
    lock.releaseLock();
  }
}

function broadcastItineraryNotification_(details, actor, now) {
  const notificationId = uuid_("NOTIF");
  const revisionLabel = details.eventType === "REVISION"
    ? `REV ${details.revisionNumber}`
    : "New itinerary";
  appendRecord_("NOTIFICATIONS", {
    notification_id: notificationId,
    tour_id: details.tourId || "",
    revision_id: details.revisionId || "",
    notification_type: details.eventType === "REVISION"
      ? "ITINERARY_REVISED"
      : "ITINERARY_POSTED",
    title: `${details.customerCode} - ${revisionLabel}`,
    message: `${actor.fullName || actor.employeeId} ${details.eventType === "REVISION" ? "posted a revision" : "posted a new itinerary"}.${details.note ? ` Note: ${details.note}` : ""}`,
    source_module: "RESERVATION",
    action_url: details.eventType === "REVISION"
      ? `vendor-revise-itinerary:${details.customerCode}`
      : `vendor-new-itinerary:${details.customerCode}`,
    created_at: now,
    created_by: actor.employeeId,
    expires_at: "",
  });
  const recipients = allRecords_("EMPLOYEES")
    .filter((employee) => truthy_(employee.active)
      && (truthy_(employee.desktop_access) || truthy_(employee.mobile_access)))
    .filter((employee) => {
      const department = String(employee.department || "").toUpperCase();
      const role = String(employee.role || "").toUpperCase().replace(/[ -]+/g, "_");
      return department === "VENDOR"
        || ["ADMIN", "MANAGER", "ALL_ROUNDER"].includes(role)
        || String(employee.employee_id || "") === String(actor.employeeId || "");
    });
  recipients.forEach((employee) => {
    appendRecord_("NOTIF_RECIPIENTS", {
      notification_recipient_id: uuid_("NREC"),
      notification_id: notificationId,
      employee_id: employee.employee_id,
      delivery_status: "DELIVERED",
      read_at: "",
      acknowledged_at: "",
      action_status: "PENDING",
      action_note: "",
    });
  });
  return recipients.length;
}

function validatePublicationDraft_(draft) {
  const required = ["customerCode", "department", "publicationType", "payload"];
  const missing = required.filter((key) => draft[key] === undefined || draft[key] === null || draft[key] === "");
  if (missing.length) {
    throw apiError_("VALIDATION_ERROR", `Missing required fields: ${missing.join(", ")}.`);
  }
  if (Object.keys(draft.payload || {}).length === 0) {
    throw apiError_("VALIDATION_ERROR", "Publication payload cannot be empty.");
  }
}

function upsertReservationTour_(draft, actor, now) {
  ensureHeaders_("TOURS", [
    "itinerary_drive_file_id",
    "itinerary_drive_file_name",
    "itinerary_drive_file_url",
    "updated_at",
    "updated_by",
  ]);
  const code = String(draft.customerCode).trim().toUpperCase();
  const payload = draft.payload || {};
  const existing = findRecord_("TOURS", "customer_code", code);
  const tour = {
    tour_id: existing && existing.tour_id || uuid_("TOUR"),
    customer_code: code,
    client_name: payload.customerName || existing && existing.client_name || "",
    agent_name: payload.agentName || existing && existing.agent_name || "",
    confirmation_email_thread_id: payload.confirmationThreadId
      || existing && existing.confirmation_email_thread_id || "",
    itinerary_drive_file_id: payload.itineraryDriveFileId
      || existing && existing.itinerary_drive_file_id || "",
    itinerary_drive_file_name: payload.itineraryDriveFileName
      || existing && existing.itinerary_drive_file_name || "",
    itinerary_drive_file_url: payload.itineraryDriveFileUrl
      || existing && existing.itinerary_drive_file_url || "",
    updated_at: now,
    updated_by: actor.employeeId,
  };
  if (existing) {
    updateRecord_("TOURS", "customer_code", code, tour);
  } else {
    appendRecord_("TOURS", tour);
  }
  return tour;
}

function validateSourceVersion_(draft) {
  if (!draft.sourcePublicationId) return;
  const source = findRecord_("DEPARTMENT_PUBLICATIONS", "publication_id", draft.sourcePublicationId);
  if (!source) throw apiError_("SOURCE_NOT_FOUND", "The upstream publication no longer exists.");
  if (String(source.status) !== "PUBLISHED") {
    throw apiError_("VERSION_CONFLICT", "The upstream publication has been superseded.", {
      latestPublicationId: source.superseded_by_publication_id || "",
    });
  }
  if (Number(source.published_record_version) !== Number(draft.sourceRecordVersion)) {
    throw apiError_("VERSION_CONFLICT", "The upstream version changed. Refresh and review the latest publication.", {
      expectedVersion: Number(source.published_record_version),
      submittedVersion: Number(draft.sourceRecordVersion),
    });
  }
}

function getTourDetail_(customerCode, actor) {
  if (!customerCode) throw apiError_("VALIDATION_ERROR", "Customer Code is required.");
  if (!actor.mobileAccess && !actor.desktopAccess) {
    throw apiError_("ACCESS_DENIED", "This employee does not have ERIM-PSH access.");
  }
  const code = String(customerCode).trim().toUpperCase();
  const tour = findRecord_("TOURS", "customer_code", code);
  if (!tour) throw apiError_("TOUR_NOT_FOUND", "Customer Code was not found.");
  const publications = allRecords_("DEPARTMENT_PUBLICATIONS")
    .filter((row) => row.customer_code === code && row.status === "PUBLISHED")
    .map((row) => ({
      publicationId: row.publication_id,
      department: row.department,
      type: row.publication_type,
      version: row.published_record_version,
      publishedAt: row.published_at,
      publishedBy: row.published_by,
    }));
  const communications = allRecords_("COMMUNICATIONS")
    .filter((row) => row.tour_id === tour.tour_id)
    .map((row) => ({
      type: row.communication_type,
      channel: row.channel,
      status: row.status,
      gmailThreadId: row.gmail_thread_id,
      sentAt: row.sent_at,
    }));
  return { tour, publications, communications };
}

function publicationResponse_(publication, replayed) {
  return {
    publicationId: publication.publication_id,
    officialEntityId: publication.official_entity_id,
    tourId: publication.tour_id,
    publishedRecordVersion: Number(publication.published_record_version),
    publishedAt: publication.published_at,
    replayed,
  };
}

function latestDepartmentPublication_(tourId, customerCode, department) {
  return allRecords_("DEPARTMENT_PUBLICATIONS")
    .filter((row) =>
      (tourId ? row.tour_id === tourId : row.customer_code === String(customerCode).toUpperCase())
      && row.department === department
    )
    .sort((a, b) => Number(b.published_record_version) - Number(a.published_record_version))[0] || null;
}

function supplierMasterCatalog_() {
  const supplierTypes = allRecords_("SUPPLIER_TYPES").map(camelizeSupplierRecord_);
  const suppliers = allRecords_("SUPPLIERS").map(camelizeSupplierRecord_);
  const contacts = allRecords_("SUPPLIER_CONTACTS").map(camelizeSupplierRecord_);
  const recipients = allRecords_("SUPPLIER_RECIPIENTS").map(camelizeSupplierRecord_);
  const sops = allRecords_("SUPPLIER_SOPS").map(camelizeSupplierRecord_);
  const products = allRecords_("SUPPLIER_PRODUCTS").map(camelizeSupplierRecord_);
  const contracts = allRecords_("SUPPLIER_CONTRACTS").map((row) => {
    const mapped = camelizeSupplierRecord_(row);
    mapped.status = contractStatusForDate_(
      normalizeDateText_(row.valid_from),
      normalizeDateText_(row.valid_to),
      row.status,
    );
    return mapped;
  });
  const rates = allRecords_("CONTRACT_RATES").map(camelizeSupplierRecord_);
  const payload = { supplierTypes, suppliers, contacts, recipients, sops, products, contracts, rates };
  return Object.assign(payload, {
    checksum: digest_(JSON.stringify(payload)),
    sourceVersion: new Date().toISOString(),
  });
}

function camelizeSupplierRecord_(record) {
  const result = {};
  Object.keys(record || {}).forEach((key) => {
    const camel = key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
    let value = record[key];
    if (value instanceof Date) value = normalizeDateText_(value);
    if (["requiresSupplier", "isEmergency", "allowOverlap"].includes(camel)) value = truthy_(value);
    if (["displayOrder", "sequence", "recordVersion", "amount", "minQuantity", "maxQuantity"].includes(camel)
        && value !== "") {
      value = Number(value);
    }
    result[camel] = value;
  });
  result.active = !["ARCHIVED", "CANCELLED", "SUPERSEDED"].includes(
    String(result.status || "").toUpperCase(),
  );
  if (result.allowedPriceBases) result.allowedPriceBases = splitText_(result.allowedPriceBases);
  if (result.defaultBookingChannels) result.defaultBookingChannels = splitText_(result.defaultBookingChannels);
  if (result.bookingChannels) result.bookingChannels = splitText_(result.bookingChannels);
  if (result.destinations) result.destinations = splitText_(result.destinations);
  return result;
}

function appendRecords_(sheetName, records) {
  if (!records || !records.length) return;
  const sheet = sheet_(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const rows = records.map((record) => headers.map((header) =>
    safeSheetValue_(record[header] === undefined ? "" : record[header])
  ));
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function replaceSupplierChildren_(sheetName, key, parentKey, parentId, rows, mapper, actor, now) {
  const existing = allRecords_(sheetName).filter((row) => String(row[parentKey]) === String(parentId));
  const retained = [];
  (rows || []).forEach((row, index) => {
    const mapped = mapper(row, index);
    retained.push(String(mapped[key]));
    upsertVersionedRecord_(sheetName, key, mapped[key], mapped, actor, now);
  });
  existing
    .filter((row) => !retained.includes(String(row[key])) && String(row.status).toUpperCase() !== "ARCHIVED")
    .forEach((row) => updateRecord_(sheetName, key, row[key], {
      status: "ARCHIVED",
      record_version: Number(row.record_version || 0) + 1,
      updated_at: now,
      updated_by: actor.employeeId,
    }));
}

function recordAndBroadcastMasterChange_(
  action, entityType, entityId, supplierId, typeCode, summary,
  before, after, actor, now, shouldBroadcast
) {
  const eventId = uuid_("SMEV");
  appendRecord_("AUDIT_LOG", {
    audit_id: uuid_("AUD"),
    event_timestamp: now,
    actor_employee_id: actor.employeeId,
    actor_email: actor.email,
    client_mode: "DESKTOP",
    action,
    entity_type: entityType,
    entity_id: entityId,
    tour_id: "",
    request_id: eventId,
    before_json: before ? JSON.stringify(before) : "",
    after_json: after ? JSON.stringify(after) : "",
    reason: summary,
    result: "SUCCESS",
    error_code: "",
  });
  recordSupplierMasterEvent_({
    eventId,
    eventType: action,
    entityType,
    entityId,
    supplierId,
    typeCode,
    summary,
  }, actor, now);
  if (shouldBroadcast !== false) {
    broadcastSupplierMasterNotification_({
      type: action,
      title: entityType.replaceAll("_", " "),
      message: `${actor.fullName || actor.employeeId}: ${summary}`,
      actionUrl: `supplier-master:${typeCode || ""}:${supplierId || ""}`,
    }, actor, now);
  }
}

function recordSupplierMasterEvent_(details, actor, now) {
  appendRecord_("SUPPLIER_MASTER_EVENTS", {
    event_id: details.eventId || uuid_("SMEV"),
    event_key: details.eventKey || "",
    event_type: details.eventType,
    entity_type: details.entityType,
    entity_id: details.entityId,
    supplier_id: details.supplierId || "",
    type_code: details.typeCode || "",
    summary: details.summary || "",
    event_at: now,
    actor_employee_id: actor.employeeId,
  });
}

function broadcastSupplierMasterNotification_(details, actor, now) {
  const notificationId = uuid_("NOTIF");
  appendRecord_("NOTIFICATIONS", {
    notification_id: notificationId,
    tour_id: "",
    revision_id: "",
    notification_type: details.type,
    title: details.title,
    message: details.message,
    source_module: "MANAGER_ADMIN",
    action_url: details.actionUrl || "supplier-master",
    created_at: now,
    created_by: actor.employeeId,
    expires_at: "",
  });
  const recipients = allRecords_("EMPLOYEES").filter((employee) =>
    truthy_(employee.active) && (truthy_(employee.desktop_access) || truthy_(employee.mobile_access))
  );
  const rows = recipients.map((employee) => ({
    notification_recipient_id: uuid_("NREC"),
    notification_id: notificationId,
    employee_id: employee.employee_id,
    delivery_status: "DELIVERED",
    read_at: "",
    acknowledged_at: "",
    action_status: "PENDING",
    action_note: "",
  }));
  appendRecords_("NOTIF_RECIPIENTS", rows);
  return rows.length;
}

function ensureSupplierExpiryTrigger_() {
  const handler = "runSupplierContractExpiryNotifications";
  const exists = ScriptApp.getProjectTriggers().some((trigger) =>
    trigger.getHandlerFunction() === handler
  );
  if (!exists) ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(8).create();
}

function runSupplierContractExpiryNotifications() {
  ensureSupplierMasterSchema_();
  const today = normalizeDateText_(new Date());
  const thresholds = [90, 60, 30, 14, 7, 1, 0];
  const systemActor = {
    employeeId: "SYSTEM",
    fullName: "ERIM-PSH",
    email: "",
  };
  const now = new Date().toISOString();
  const events = allRecords_("SUPPLIER_MASTER_EVENTS");
  const eventKeys = new Set(events.map((row) => String(row.event_key || "")));
  const suppliers = Object.fromEntries(
    allRecords_("SUPPLIERS").map((row) => [String(row.supplier_id), row]),
  );
  allRecords_("SUPPLIER_CONTRACTS").forEach((contract) => {
    if (["ARCHIVED", "CANCELLED", "SUPERSEDED"].includes(String(contract.status).toUpperCase())) return;
    const validTo = normalizeDateText_(contract.valid_to);
    if (!validTo) return;
    const days = daysBetween_(today, validTo);
    const threshold = thresholds.find((value) => value === days);
    if (days >= 0 && threshold === undefined) return;
    const eventType = days < 0 ? "CONTRACT_EXPIRED" : days === 0 ? "CONTRACT_EXPIRES_TODAY" : "CONTRACT_EXPIRING";
    const eventKey = days < 0
      ? `${eventType}|${contract.contract_id}|${validTo}`
      : `${eventType}|${contract.contract_id}|${validTo}|${days}`;
    if (eventKeys.has(eventKey)) return;
    const supplier = suppliers[String(contract.supplier_id)] || {};
    const summary = days < 0
      ? `Contract ${contract.contract_number} for ${supplier.supplier_name || "supplier"} expired on ${validTo}.`
      : `Contract ${contract.contract_number} for ${supplier.supplier_name || "supplier"} expires in ${days} day(s) on ${validTo}.`;
    recordSupplierMasterEvent_({
      eventKey,
      eventType,
      entityType: "SUPPLIER_CONTRACT",
      entityId: contract.contract_id,
      supplierId: contract.supplier_id,
      typeCode: supplier.type_code || "",
      summary,
    }, systemActor, now);
    broadcastSupplierMasterNotification_({
      type: eventType,
      title: eventType.replaceAll("_", " "),
      message: summary,
      actionUrl: `supplier-master:${supplier.type_code || ""}:${contract.supplier_id}`,
    }, systemActor, now);
  });
}

function contractStatusForDate_(validFrom, validTo, storedStatus) {
  const explicit = String(storedStatus || "").toUpperCase();
  if (["ARCHIVED", "CANCELLED", "SUPERSEDED"].includes(explicit)) return explicit;
  const today = normalizeDateText_(new Date());
  if (validFrom && today < validFrom) return "SCHEDULED";
  if (validTo && today > validTo) return "EXPIRED";
  if (validTo && daysBetween_(today, validTo) <= 30) return "EXPIRING";
  return "ACTIVE";
}

function dateRangesOverlap_(leftFrom, leftTo, rightFrom, rightTo) {
  if (!leftFrom || !leftTo || !rightFrom || !rightTo) return false;
  return leftFrom <= rightTo && rightFrom <= leftTo;
}

function normalizeDateText_(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const text = String(value).trim();
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function daysBetween_(from, to) {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86400000);
}

function arrayText_(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean).join(",");
  return String(value || "").trim();
}

function splitText_(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) throw apiError_("SERVER_NOT_CONFIGURED", "SPREADSHEET_ID is not configured.");
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  const sheet = spreadsheet_().getSheetByName(name);
  if (!sheet) throw apiError_("SCHEMA_MISSING", `Required sheet ${name} does not exist.`);
  return sheet;
}

function allRecords_(sheetName) {
  const values = sheet_(sheetName).getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1)
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

function findRecord_(sheetName, key, value) {
  return allRecords_(sheetName).find((row) =>
    String(row[key] || "").toLowerCase() === String(value || "").toLowerCase()
  ) || null;
}

function appendRecord_(sheetName, record) {
  const sheet = sheet_(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  sheet.appendRow(headers.map((header) =>
    safeSheetValue_(record[header] === undefined ? "" : record[header])
  ));
}

function ensureHeaders_(sheetName, requiredHeaders) {
  const sheet = sheet_(sheetName);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  requiredHeaders.forEach((header) => {
    if (!headers.includes(header)) headers.push(header);
  });
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function ensureSheetWithHeaders_(sheetName, requiredHeaders) {
  const spreadsheet = spreadsheet_();
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String).filter(Boolean);
  requiredHeaders.forEach((header) => {
    if (!headers.includes(header)) headers.push(header);
  });
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function upsertVersionedRecord_(sheetName, key, value, record, actor, now) {
  const existing = findRecord_(sheetName, key, value);
  const versioned = Object.assign({}, record, {
    record_version: existing ? Number(existing.record_version || 0) + 1 : 1,
    created_at: existing && existing.created_at || record.created_at || now,
    created_by: existing && existing.created_by || record.created_by || actor.employeeId,
    updated_at: now,
    updated_by: actor.employeeId,
  });
  if (existing) {
    updateRecord_(sheetName, key, value, versioned);
  } else {
    appendRecord_(sheetName, versioned);
  }
}

function updateRecord_(sheetName, key, value, changes) {
  const sheet = sheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const keyIndex = headers.indexOf(key);
  if (keyIndex < 0) throw apiError_("SCHEMA_INVALID", `${sheetName}.${key} is missing.`);
  const rowIndex = values.findIndex((row, index) => index > 0 && String(row[keyIndex]) === String(value));
  if (rowIndex < 1) throw apiError_("RECORD_NOT_FOUND", `${sheetName} record was not found.`);
  const updatedRow = values[rowIndex].slice();
  Object.entries(changes).forEach(([field, fieldValue]) => {
    const columnIndex = headers.indexOf(field);
    if (columnIndex >= 0) {
      updatedRow[columnIndex] = safeSheetValue_(fieldValue);
    }
  });
  sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([updatedRow]);
}

function recordRejectedAudit_(error) {
  try {
    appendRecord_("AUDIT_LOG", {
      audit_id: uuid_("AUD"),
      event_timestamp: new Date().toISOString(),
      actor_employee_id: "",
      actor_email: "",
      client_mode: "",
      action: "REQUEST_REJECTED",
      entity_type: "",
      entity_id: "",
      tour_id: "",
      request_id: "",
      before_json: "",
      after_json: "",
      reason: error.publicMessage || error.message,
      result: "REJECTED",
      error_code: error.code || "INTERNAL_ERROR",
    });
  } catch (_auditError) {
    console.error("Unable to write rejected audit", _auditError);
  }
}

function apiError_(code, publicMessage, publicDetails) {
  const error = new Error(publicMessage);
  error.code = code;
  error.publicMessage = publicMessage;
  error.publicDetails = publicDetails || null;
  return error;
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function truthy_(value) {
  return value === true || String(value).toUpperCase() === "TRUE" || String(value) === "1";
}

function safeSheetValue_(value) {
  if (typeof value === "string" && /^[=+\-@]/.test(value)) return `'${value}`;
  return value;
}

function normalizeSupplierPhone_(value, label) {
  let normalized = String(value || "").trim().replace(/^'/, "").replace(/\s+/g, " ");
  if (!normalized) return "";
  if (normalized.startsWith("00")) normalized = `+${normalized.slice(2)}`;
  if (!normalized.startsWith("+")) normalized = `+${normalized}`;
  if (!/^\+\d[\d\s().-]{5,24}$/.test(normalized)) {
    throw apiError_(
      "VALIDATION_ERROR",
      `${label || "Phone"} must use international format, for example +62 812-3916-9392.`,
    );
  }
  return normalized;
}

function uuid_(prefix) {
  return `${prefix}-${Utilities.getUuid()}`;
}

function entityPrefix_(publicationType) {
  const map = {
    NEW_CONFIRMATION: "TOUR",
    ITINERARY_REVISION: "REV",
    DAYWISE_BOOKING: "BKG",
    DRIVER_ASSIGNMENT: "DRV",
    CUSTOMER_INVOICE: "INV",
    PAYMENT_REQUEST: "PAYREQ",
  };
  return map[publicationType] || "ENT";
}

function digest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value)
    .map((byte) => (byte + 256).toString(16).slice(-2))
    .join("");
}
