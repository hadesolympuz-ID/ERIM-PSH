const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");
const { ISSUE_HEADERS, WORKBOOK_SHEETS } = require("./supplier-workbook-schema.cjs");

const STATUS = {
  READY: "READY",
  CONFLICT: "CONFLICT",
  INVALID: "INVALID",
};

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (value.text !== undefined) return String(value.text).trim();
    if (value.result !== undefined) return normalizeText(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("").trim();
  }
  return String(value).trim().replace(/^'/, "");
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

function splitList(value) {
  return normalizeText(value).split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
}

function truthy(value) {
  return ["TRUE", "YES", "Y", "1"].includes(normalizeCode(value)) || value === true;
}

function numberOrBlank(value) {
  const text = normalizeText(value);
  if (!text) return "";
  const number = Number(text.replaceAll(",", ""));
  return Number.isFinite(number) ? number : text;
}

function snakeToCamel(value) {
  return value.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function rowToObject(row, headers) {
  return Object.fromEntries(headers.map((header, index) => [
    header,
    normalizeText(row.getCell(index + 1).value),
  ]));
}

function issueFor(row, code, reason, existing = {}, action = "") {
  return {
    issueId: `ISSUE-${crypto.randomUUID()}`,
    sourceSheet: row.sourceSheet,
    sourceRow: row.sourceRow,
    entityType: row.entityKind,
    supplierCode: row.payload.supplier_code || "",
    recordCode: row.payload.supplier_code || row.payload.product_code
      || row.payload.contract_number || row.payload.email || row.payload.address || "",
    conflictCode: code,
    conflictReason: reason,
    conflictingValue: existing.value || "",
    existingRecordId: existing.id || "",
    existingRecordName: existing.name || "",
    recommendedAction: action || "Review this row and correct the source workbook.",
    status: row.status,
  };
}

class SupplierExcelService {
  constructor({ database, chooseFile, saveFile, templatePath }) {
    this.database = database;
    this.chooseFile = chooseFile;
    this.saveFile = saveFile;
    this.templatePath = templatePath;
  }

  async downloadTemplate({ typeCode = "VENDOR" } = {}) {
    const filePath = await this.saveFile({
      title: "Save Supplier Import Template",
      defaultPath: `ERIM-PSH-${normalizeCode(typeCode)}-Import-Template.xlsx`,
      filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    });
    if (!filePath) return { canceled: true };
    fs.copyFileSync(this.templatePath, filePath);
    return { canceled: false, filePath };
  }

  async analyzeImport({ typeCode } = {}) {
    const normalizedType = normalizeCode(typeCode);
    if (!normalizedType) throw new Error("Choose one Supplier Type before selecting the Excel file.");
    const filePath = await this.chooseFile({
      title: "Choose Supplier Import Workbook",
      xlsxOnly: true,
    });
    if (!filePath) return { canceled: true };
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const schemaErrors = [];
    const rows = [];
    for (const [sheetName, requiredHeaders] of Object.entries(WORKBOOK_SHEETS)) {
      const sheet = workbook.getWorksheet(sheetName);
      if (!sheet) {
        schemaErrors.push(`${sheetName} sheet is missing.`);
        continue;
      }
      const actualHeaders = sheet.getRow(1).values.slice(1).map(normalizeText).filter(Boolean);
      const missing = requiredHeaders.filter((header) => !actualHeaders.includes(header));
      if (missing.length) schemaErrors.push(`${sheetName} is missing header(s): ${missing.join(", ")}.`);
      if (missing.length) continue;
      sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return;
        const payload = rowToObject(row, actualHeaders);
        if (!Object.values(payload).some(Boolean)) return;
        rows.push({
          rowId: `IROW-${crypto.randomUUID()}`,
          entityKind: sheetName,
          sourceSheet: sheetName,
          sourceRow: rowNumber,
          payload,
          status: STATUS.READY,
          issue: null,
        });
      });
    }
    if (schemaErrors.length) {
      const error = new Error(`Workbook format is not valid. ${schemaErrors.join(" ")}`);
      error.code = "INVALID_WORKBOOK_FORMAT";
      error.details = schemaErrors;
      throw error;
    }
    const analysis = this.validateCreateOnlyRows(rows, normalizedType);
    const summary = {
      total: analysis.rows.length,
      ready: analysis.rows.filter((row) => row.status === STATUS.READY).length,
      conflicts: analysis.rows.filter((row) => row.status === STATUS.CONFLICT).length,
      invalid: analysis.rows.filter((row) => row.status === STATUS.INVALID).length,
    };
    const batch = this.database.saveSupplierImportBatch({
      fileName: path.basename(filePath),
      typeCode: normalizedType,
      status: "READY_FOR_REVIEW",
      summary,
      analysis,
    });
    return { canceled: false, batch };
  }

  validateCreateOnlyRows(rows, typeCode) {
    const catalog = this.database.getSupplierMasterCatalog();
    const supplierByCode = new Map((catalog.suppliers || []).map((row) => [
      `${normalizeCode(row.typeCode)}|${normalizeCode(row.supplierCode)}`, row,
    ]));
    const supplierById = new Map((catalog.suppliers || []).map((row) => [row.supplierId, row]));
    const newSupplierCodes = new Set(rows
      .filter((row) => row.entityKind === "SUPPLIERS")
      .map((row) => normalizeCode(row.payload.supplier_code)));
    const supplierForCode = (code) =>
      supplierByCode.get(`${typeCode}|${normalizeCode(code)}`) || null;
    const parentExists = (code) => Boolean(supplierForCode(code) || newSupplierCodes.has(normalizeCode(code)));
    const seen = new Set();
    const existingProducts = new Map((catalog.products || []).map((product) => {
      const supplier = supplierById.get(product.supplierId) || {};
      return [`${normalizeCode(supplier.supplierCode)}|${normalizeCode(product.productCode)}`, product];
    }));
    const existingContracts = new Map((catalog.contracts || []).map((contract) => {
      const supplier = supplierById.get(contract.supplierId) || {};
      return [`${normalizeCode(supplier.supplierCode)}|${normalizeCode(contract.contractNumber)}`, contract];
    }));
    const newContracts = new Set(rows.filter((row) => row.entityKind === "CONTRACTS")
      .map((row) => `${normalizeCode(row.payload.supplier_code)}|${normalizeCode(row.payload.contract_number)}`));
    const mark = (row, status, code, reason, existing, action) => {
      row.status = status;
      row.issue = issueFor(row, code, reason, existing, action);
    };

    for (const row of rows) {
      const payload = row.payload;
      const supplierCode = normalizeCode(payload.supplier_code);
      if (row.entityKind === "SUPPLIERS") {
        payload.type_code = normalizeCode(payload.type_code) || typeCode;
        if (payload.type_code !== typeCode) {
          mark(row, STATUS.INVALID, "TYPE_MISMATCH",
            `Workbook row uses ${payload.type_code}; selected Type is ${typeCode}.`);
          continue;
        }
        if (!supplierCode || !payload.supplier_name) {
          mark(row, STATUS.INVALID, "REQUIRED_VALUE_MISSING",
            "supplier_code and supplier_name are required.");
          continue;
        }
        const key = `SUPPLIER|${typeCode}|${supplierCode}`;
        const existing = supplierForCode(supplierCode);
        if (existing) {
          mark(row, STATUS.CONFLICT, "DUPLICATE_SUPPLIER_CODE",
            `Supplier code ${supplierCode} already exists in ${typeCode}.`,
            { id: existing.supplierId, name: existing.supplierName, value: supplierCode },
            "Open the existing Supplier Master record or use a new supplier_code.");
        } else if (seen.has(key)) {
          mark(row, STATUS.CONFLICT, "DUPLICATE_IN_WORKBOOK",
            `Supplier code ${supplierCode} appears more than once in this workbook.`);
        } else seen.add(key);
        continue;
      }

      if (!supplierCode || !parentExists(supplierCode)) {
        mark(row, STATUS.INVALID, "SUPPLIER_NOT_FOUND",
          `Supplier code ${supplierCode || "(blank)"} was not found online or in this workbook.`,
          {}, "Add the Supplier row first or correct supplier_code.");
        continue;
      }

      if (row.entityKind === "CONTACTS") {
        if (!payload.contact_name || ![payload.email, payload.phone, payload.whatsapp].some(Boolean)) {
          mark(row, STATUS.INVALID, "REQUIRED_VALUE_MISSING",
            "Contact name and at least one email, phone, or WhatsApp value are required.");
          continue;
        }
        const identity = normalizeCode(payload.email || payload.whatsapp || payload.phone);
        const key = `CONTACT|${supplierCode}|${identity}`;
        const supplier = supplierForCode(supplierCode);
        const existing = supplier && (catalog.contacts || []).find((contact) =>
          contact.supplierId === supplier.supplierId
          && [contact.email, contact.whatsapp, contact.phone].map(normalizeCode).includes(identity));
        if (existing) {
          mark(row, STATUS.CONFLICT, "DUPLICATE_CONTACT",
            "The same contact email/phone/WhatsApp already exists for this supplier.",
            { id: existing.contactId, name: existing.contactName, value: identity },
            "Edit the existing contact in Supplier Master.");
        } else if (seen.has(key)) {
          mark(row, STATUS.CONFLICT, "DUPLICATE_IN_WORKBOOK", "This contact appears more than once.");
        } else seen.add(key);
      }

      if (row.entityKind === "RECIPIENTS") {
        if (!payload.address) {
          mark(row, STATUS.INVALID, "REQUIRED_VALUE_MISSING", "Recipient address is required.");
          continue;
        }
        const identity = [
          normalizeCode(payload.recipient_type || "TO"),
          normalizeCode(payload.channel || "EMAIL"),
          normalizeCode(payload.address),
        ].join("|");
        const key = `RECIPIENT|${supplierCode}|${identity}`;
        const supplier = supplierForCode(supplierCode);
        const existing = supplier && (catalog.recipients || []).find((recipient) =>
          recipient.supplierId === supplier.supplierId
          && [
            normalizeCode(recipient.recipientType || "TO"),
            normalizeCode(recipient.channel || "EMAIL"),
            normalizeCode(recipient.address),
          ].join("|") === identity);
        if (existing) {
          mark(row, STATUS.CONFLICT, "DUPLICATE_RECIPIENT",
            "The same booking recipient already exists for this supplier.",
            { id: existing.recipientId, name: existing.address, value: identity },
            "Edit the existing recipient in Supplier Master.");
        } else if (seen.has(key)) {
          mark(row, STATUS.CONFLICT, "DUPLICATE_IN_WORKBOOK", "This recipient appears more than once.");
        } else seen.add(key);
      }

      if (row.entityKind === "BOOKING_SOPS") {
        const supplier = supplierForCode(supplierCode);
        const existing = supplier && (catalog.sops || []).find((sop) => sop.supplierId === supplier.supplierId);
        const key = `SOP|${supplierCode}`;
        if (existing) {
          mark(row, STATUS.CONFLICT, "SOP_ALREADY_EXISTS",
            "This supplier already has a Booking SOP.",
            { id: existing.sopId, name: supplier.supplierName },
            "Edit the existing SOP in Supplier Master.");
        } else if (seen.has(key)) {
          mark(row, STATUS.CONFLICT, "DUPLICATE_IN_WORKBOOK", "Only one Booking SOP is allowed per supplier.");
        } else seen.add(key);
      }

      if (row.entityKind === "PRODUCTS") {
        if (!payload.product_code || !payload.product_name) {
          mark(row, STATUS.INVALID, "REQUIRED_VALUE_MISSING",
            "product_code and product_name are required.");
          continue;
        }
        const key = `${supplierCode}|${normalizeCode(payload.product_code)}`;
        const existing = existingProducts.get(key);
        if (existing) {
          mark(row, STATUS.CONFLICT, "DUPLICATE_PRODUCT_CODE",
            `Product code ${payload.product_code} already exists for this supplier.`,
            { id: existing.productId, name: existing.productName, value: payload.product_code },
            "Open the existing Product or use a new product_code.");
        } else if (seen.has(`PRODUCT|${key}`)) {
          mark(row, STATUS.CONFLICT, "DUPLICATE_IN_WORKBOOK", "This Product appears more than once.");
        } else seen.add(`PRODUCT|${key}`);
      }

      if (row.entityKind === "CONTRACTS") {
        if (!payload.contract_number || !payload.valid_from || !payload.valid_to) {
          mark(row, STATUS.INVALID, "REQUIRED_VALUE_MISSING",
            "contract_number, valid_from, and valid_to are required.");
          continue;
        }
        const key = `${supplierCode}|${normalizeCode(payload.contract_number)}`;
        const existing = existingContracts.get(key);
        if (existing) {
          mark(row, STATUS.CONFLICT, "DUPLICATE_CONTRACT_NUMBER",
            `Contract ${payload.contract_number} already exists for this supplier.`,
            { id: existing.contractId, name: existing.contractNumber, value: payload.contract_number },
            "Open the existing Contract or use a new contract_number.");
        } else if (seen.has(`CONTRACT|${key}`)) {
          mark(row, STATUS.CONFLICT, "DUPLICATE_IN_WORKBOOK", "This Contract appears more than once.");
        } else seen.add(`CONTRACT|${key}`);
      }

      if (row.entityKind === "CONTRACT_RATES") {
        if (!payload.contract_number || !payload.product_code || !payload.price_basis || payload.amount === "") {
          mark(row, STATUS.INVALID, "REQUIRED_VALUE_MISSING",
            "contract_number, product_code, price_basis, and amount are required.");
          continue;
        }
        const contractKey = `${supplierCode}|${normalizeCode(payload.contract_number)}`;
        if (!newContracts.has(contractKey)) {
          mark(row, STATUS.CONFLICT, "CONTRACT_NOT_NEW",
            "Rates may only be imported together with a new Contract in the same workbook.",
            {}, "Add a new Contract row or maintain the existing Contract in Supplier Master.");
          continue;
        }
        const productKey = `${supplierCode}|${normalizeCode(payload.product_code)}`;
        const productInFile = rows.some((candidate) =>
          candidate.entityKind === "PRODUCTS"
          && normalizeCode(candidate.payload.supplier_code) === supplierCode
          && normalizeCode(candidate.payload.product_code) === normalizeCode(payload.product_code)
          && candidate.status === STATUS.READY);
        if (!existingProducts.has(productKey) && !productInFile) {
          mark(row, STATUS.INVALID, "PRODUCT_NOT_FOUND",
            `Product ${payload.product_code} was not found for this supplier.`,
            {}, "Add the Product row first or correct product_code.");
          continue;
        }
        const key = [
          "RATE", contractKey, normalizeCode(payload.product_code),
          normalizeCode(payload.price_basis), payload.valid_from, payload.valid_to,
        ].join("|");
        if (seen.has(key)) {
          mark(row, STATUS.CONFLICT, "DUPLICATE_IN_WORKBOOK", "This Contract Rate appears more than once.");
        } else seen.add(key);
      }
    }
    for (const contractRow of rows.filter((row) =>
      row.entityKind === "CONTRACTS" && row.status === STATUS.READY)) {
      const supplierCode = normalizeCode(contractRow.payload.supplier_code);
      const contractNumber = normalizeCode(contractRow.payload.contract_number);
      const readyRates = rows.filter((row) =>
        row.entityKind === "CONTRACT_RATES"
        && row.status === STATUS.READY
        && normalizeCode(row.payload.supplier_code) === supplierCode
        && normalizeCode(row.payload.contract_number) === contractNumber);
      if (!readyRates.length) {
        mark(contractRow, STATUS.INVALID, "MISSING_CONTRACT_RATE",
          "A new Contract must include at least one valid Contract Rate row.",
          {}, "Add a valid CONTRACT_RATES row for this contract.");
      }
    }
    return {
      rows,
      issues: rows.filter((row) => row.issue).map((row) => row.issue),
    };
  }

  stageImport(batchId) {
    const batch = this.database.getSupplierImportBatch(batchId);
    if (!batch) throw new Error("Supplier import batch was not found.");
    const readyRows = batch.analysis.rows.filter((row) => row.status === STATUS.READY);
    if (!readyRows.length) throw new Error("This import has no valid new records to save locally.");
    const catalog = this.database.getSupplierMasterCatalog();
    const typeCode = batch.typeCode;
    const suppliers = catalog.suppliers || [];
    const bySupplierCode = new Map(suppliers.map((supplier) => [
      `${normalizeCode(supplier.typeCode)}|${normalizeCode(supplier.supplierCode)}`, supplier,
    ]));
    const supplierDraftByCode = new Map();
    const rowsBy = (kind, code) => readyRows.filter((row) =>
      row.entityKind === kind && normalizeCode(row.payload.supplier_code) === code);
    const supplierCodes = new Set(readyRows.map((row) => normalizeCode(row.payload.supplier_code)).filter(Boolean));
    let staged = 0;

    for (const code of supplierCodes) {
      const supplierRow = rowsBy("SUPPLIERS", code)[0];
      const existing = bySupplierCode.get(`${typeCode}|${code}`);
      const childRows = [
        ...rowsBy("CONTACTS", code),
        ...rowsBy("RECIPIENTS", code),
        ...rowsBy("BOOKING_SOPS", code),
      ];
      if (supplierRow || childRows.length) {
        const base = existing ? this.supplierPayloadFromCatalog(existing, catalog) : this.mapSupplier(supplierRow.payload, typeCode);
        const contacts = rowsBy("CONTACTS", code).map((row) => this.mapContact(row.payload));
        const recipients = rowsBy("RECIPIENTS", code).map((row, index) => this.mapRecipient(row.payload, index));
        const sopRow = rowsBy("BOOKING_SOPS", code)[0];
        base.contacts = [...(base.contacts || []), ...contacts];
        base.recipients = [...(base.recipients || []), ...recipients];
        if (sopRow) base.sop = this.mapSop(sopRow.payload);
        if (existing) base.baseRecordVersion = existing.recordVersion ?? null;
        const result = this.database.saveSupplierMasterDraft("SUPPLIER", base);
        supplierDraftByCode.set(code, result.draft.payload);
        staged += 1;
      }
    }

    const supplierIdForCode = (code) =>
      supplierDraftByCode.get(code)?.supplierId
      || bySupplierCode.get(`${typeCode}|${code}`)?.supplierId || "";
    const productIdByKey = new Map();
    for (const product of catalog.products || []) {
      const supplier = suppliers.find((row) => row.supplierId === product.supplierId) || {};
      productIdByKey.set(`${normalizeCode(supplier.supplierCode)}|${normalizeCode(product.productCode)}`, product.productId);
    }
    for (const row of readyRows.filter((item) => item.entityKind === "PRODUCTS")) {
      const code = normalizeCode(row.payload.supplier_code);
      const payload = this.mapProduct(row.payload, supplierIdForCode(code));
      const result = this.database.saveSupplierMasterDraft("PRODUCT", payload);
      productIdByKey.set(`${code}|${normalizeCode(payload.productCode)}`, result.draft.entityId);
      staged += 1;
    }
    for (const row of readyRows.filter((item) => item.entityKind === "CONTRACTS")) {
      const code = normalizeCode(row.payload.supplier_code);
      const contractNumber = normalizeCode(row.payload.contract_number);
      const rateRows = readyRows.filter((candidate) =>
        candidate.entityKind === "CONTRACT_RATES"
        && normalizeCode(candidate.payload.supplier_code) === code
        && normalizeCode(candidate.payload.contract_number) === contractNumber);
      if (!rateRows.length) continue;
      const payload = this.mapContract(
        row.payload,
        supplierIdForCode(code),
        rateRows.map((rate) => this.mapRate(
          rate.payload,
          productIdByKey.get(`${code}|${normalizeCode(rate.payload.product_code)}`),
        )),
      );
      this.database.saveSupplierMasterDraft("CONTRACT", payload);
      staged += 1;
    }
    const summary = { ...batch.summary, staged };
    const updated = this.database.updateSupplierImportBatchStatus(batchId, "LOCAL_PENDING", summary);
    return {
      batch: updated,
      drafts: this.database.listSupplierMasterDrafts(),
      catalog: this.database.getSupplierMasterCatalog(),
    };
  }

  supplierPayloadFromCatalog(supplier, catalog) {
    return {
      ...supplier,
      contacts: (catalog.contacts || []).filter((row) => row.supplierId === supplier.supplierId),
      recipients: (catalog.recipients || []).filter((row) => row.supplierId === supplier.supplierId),
      sop: (catalog.sops || []).find((row) => row.supplierId === supplier.supplierId) || {},
    };
  }

  mapSupplier(row, typeCode) {
    return {
      typeCode,
      supplierCode: normalizeCode(row.supplier_code),
      supplierName: row.supplier_name,
      legalName: row.legal_name,
      destinations: splitList(row.destinations),
      address: row.address,
      website: row.website,
      taxId: row.tax_id,
      internalPicEmployeeId: row.internal_pic_employee_id,
      operationalNotes: row.operational_notes,
    };
  }

  mapContact(row) {
    return {
      contactName: row.contact_name, position: row.position, department: row.department,
      phone: row.phone, whatsapp: row.whatsapp, email: row.email,
      preferredChannel: normalizeCode(row.preferred_channel),
      operationalHours: row.operational_hours, isEmergency: truthy(row.is_emergency),
      responsibility: row.responsibility,
    };
  }

  mapRecipient(row, index) {
    return {
      recipientType: normalizeCode(row.recipient_type) || "TO",
      channel: normalizeCode(row.channel) || "EMAIL",
      address: row.address, purpose: row.purpose,
      sequence: Number(row.sequence || index + 1),
    };
  }

  mapSop(row) {
    return {
      bookingChannels: splitList(row.booking_channels).map(normalizeCode),
      leadTime: row.lead_time, cutoffTime: row.cutoff_time,
      requiredInformation: row.required_information,
      confirmationProcedure: row.confirmation_procedure,
      amendmentProcedure: row.amendment_procedure,
      cancellationProcedure: row.cancellation_procedure,
      emergencyProcedure: row.emergency_procedure,
      portalUrl: row.portal_url, accountReference: row.account_reference,
      subjectTemplate: row.subject_template, bodyTemplate: row.body_template,
    };
  }

  mapProduct(row, supplierId) {
    return {
      supplierId, productCode: normalizeCode(row.product_code),
      productName: row.product_name, category: row.category, subcategory: row.subcategory,
      destinations: splitList(row.destinations), description: row.description,
      inclusion: row.inclusion, exclusion: row.exclusion,
      termsAndConditions: row.terms_and_conditions,
      cancellationTerms: row.cancellation_terms,
      bookingInstructions: row.booking_instructions,
      minimumOrder: row.minimum_order, maximumCapacity: row.maximum_capacity,
      taxTreatment: normalizeCode(row.tax_treatment) || "AS_CONTRACT",
      notes: row.notes,
    };
  }

  mapRate(row, productId) {
    return {
      productId,
      priceBasis: normalizeCode(row.price_basis),
      amount: numberOrBlank(row.amount),
      currency: normalizeCode(row.currency) || "IDR",
      minQuantity: numberOrBlank(row.min_quantity),
      maxQuantity: numberOrBlank(row.max_quantity),
      market: row.market, season: row.season, surchargeRule: row.surcharge_rule,
      validFrom: row.valid_from, validTo: row.valid_to, notes: row.notes,
    };
  }

  mapContract(row, supplierId, rates) {
    return {
      supplierId,
      contractNumber: row.contract_number,
      contractName: row.contract_name || row.contract_number,
      validFrom: row.valid_from, validTo: row.valid_to,
      currency: normalizeCode(row.currency) || "IDR",
      taxTreatment: normalizeCode(row.tax_treatment) || "AS_CONTRACT",
      termsAndConditions: row.terms_and_conditions,
      driveFileName: row.drive_file_name, driveFileUrl: row.drive_file_url,
      allowOverlap: truthy(row.allow_overlap), overlapReason: row.overlap_reason,
      rates,
    };
  }

  listBatches() {
    return this.database.listSupplierImportBatches();
  }

  suggestions({ typeCode } = {}) {
    const catalog = this.database.getSupplierMasterCatalog();
    const suppliers = (catalog.suppliers || []).filter((row) =>
      row.active !== false && (!typeCode || normalizeCode(row.typeCode) === normalizeCode(typeCode)));
    const supplierIds = new Set(suppliers.map((row) => row.supplierId));
    const products = (catalog.products || []).filter((row) => supplierIds.has(row.supplierId));
    const contracts = (catalog.contracts || []).filter((row) => supplierIds.has(row.supplierId));
    const unique = (values) => [...new Set(values.flatMap((value) =>
      Array.isArray(value) ? value : splitList(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      locations: unique(suppliers.map((row) => row.destinations || [])),
      products: unique(products.map((row) => row.productName)),
      supplierStatuses: unique(suppliers.map((row) => row.status)),
      contractStatuses: unique(contracts.map((row) => row.status)),
      bookingChannels: unique((catalog.sops || [])
        .filter((row) => supplierIds.has(row.supplierId))
        .map((row) => row.bookingChannels || [])),
    };
  }

  async exportCatalog(options = {}) {
    const typeCode = normalizeCode(options.typeCode);
    if (!typeCode) throw new Error("Choose one Supplier Type before exporting.");
    const catalog = this.database.getSupplierMasterCatalog();
    const selectedIds = new Set((options.supplierIds || []).map(String));
    const channelSupplierIds = new Set((catalog.sops || [])
      .filter((sop) => !options.bookingChannels?.length
        || options.bookingChannels.some((channel) =>
          (sop.bookingChannels || []).map(normalizeCode).includes(normalizeCode(channel))))
      .map((sop) => sop.supplierId));
    const matchesList = (values, selected) => !selected?.length
      || selected.some((filter) => values.map(normalizeCode).includes(normalizeCode(filter)));
    const suppliers = (catalog.suppliers || []).filter((supplier) => {
      if (normalizeCode(supplier.typeCode) !== typeCode) return false;
      if (supplier.active === false && !options.supplierStatuses?.length) return false;
      if (selectedIds.size && !selectedIds.has(supplier.supplierId)) return false;
      if (!matchesList(supplier.destinations || [], options.locations || [])) return false;
      if (options.bookingChannels?.length && !channelSupplierIds.has(supplier.supplierId)) return false;
      if (options.supplierStatuses?.length
          && !options.supplierStatuses.map(normalizeCode).includes(normalizeCode(supplier.status))) return false;
      return true;
    });
    const supplierIds = new Set(suppliers.map((row) => row.supplierId));
    let products = (catalog.products || []).filter((row) => supplierIds.has(row.supplierId) && row.active !== false);
    if (options.products?.length) {
      products = products.filter((row) =>
        options.products.map(normalizeCode).includes(normalizeCode(row.productName)));
    }
    const productIds = new Set(products.map((row) => row.productId));
    let contracts = (catalog.contracts || []).filter((row) =>
      supplierIds.has(row.supplierId) && row.active !== false);
    if (options.contractStatuses?.length) {
      contracts = contracts.filter((row) =>
        options.contractStatuses.map(normalizeCode).includes(normalizeCode(row.status)));
    }
    if (options.validFrom) contracts = contracts.filter((row) => !row.validTo || row.validTo >= options.validFrom);
    if (options.validTo) contracts = contracts.filter((row) => !row.validFrom || row.validFrom <= options.validTo);
    let rates = (catalog.rates || []).filter((row) =>
      contracts.some((contract) => contract.contractId === row.contractId)
      && productIds.has(row.productId) && row.active !== false);
    if (options.rateState === "HAS_ACTIVE_RATE") {
      const contractIds = new Set(rates.map((row) => row.contractId));
      contracts = contracts.filter((row) => contractIds.has(row.contractId));
    }
    if (options.rateState === "PENDING_RATE") {
      const ratedProductIds = new Set(rates.map((row) => row.productId));
      products = products.filter((row) => !ratedProductIds.has(row.productId));
      rates = [];
    }
    const filePath = await this.saveFile({
      title: "Export Supplier Master",
      defaultPath: `ERIM-PSH-${typeCode}-Export-${new Date().toISOString().slice(0, 10)}.xlsx`,
      filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    });
    if (!filePath) return { canceled: true };
    const workbook = await this.buildWorkbook({
      typeCode,
      suppliers,
      contacts: (catalog.contacts || []).filter((row) => supplierIds.has(row.supplierId)),
      recipients: (catalog.recipients || []).filter((row) => supplierIds.has(row.supplierId)),
      sops: (catalog.sops || []).filter((row) => supplierIds.has(row.supplierId)),
      products,
      contracts,
      rates,
      issues: [],
    });
    await workbook.xlsx.writeFile(filePath);
    return {
      canceled: false,
      filePath,
      counts: {
        suppliers: suppliers.length, products: products.length,
        contracts: contracts.length, rates: rates.length,
      },
    };
  }

  async exportConflicts(batchId) {
    const batch = this.database.getSupplierImportBatch(batchId);
    if (!batch) throw new Error("Supplier import batch was not found.");
    const filePath = await this.saveFile({
      title: "Export Supplier Import Conflicts",
      defaultPath: `ERIM-PSH-${batch.typeCode}-Import-Conflicts.xlsx`,
      filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    });
    if (!filePath) return { canceled: true };
    const data = Object.fromEntries(Object.keys(WORKBOOK_SHEETS).map((name) => [name, []]));
    batch.analysis.rows.filter((row) => row.status !== STATUS.READY)
      .forEach((row) => data[row.entityKind].push(row.payload));
    const workbook = await this.buildWorkbook({
      typeCode: batch.typeCode,
      ...Object.fromEntries(Object.entries(data).map(([name, rows]) => [name.toLowerCase(), rows])),
      rawRows: data,
      issues: batch.analysis.issues || [],
    });
    await workbook.xlsx.writeFile(filePath);
    return { canceled: false, filePath, issues: batch.analysis.issues.length };
  }

  async buildWorkbook(input) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ERIM-PSH";
    workbook.created = new Date();
    const readme = workbook.addWorksheet("README", { views: [{ showGridLines: false }] });
    readme.columns = [{ width: 28 }, { width: 90 }];
    readme.addRows([
      ["ERIM-PSH Supplier Import / Export", ""],
      ["Selected Type", input.typeCode || ""],
      ["Import rule", "CREATE ONLY. Existing records are never overwritten by Excel import."],
      ["Workflow", "Validate workbook → save valid rows locally → review Pending → publish to Google."],
      ["Conflict handling", "Review IMPORT_ISSUES, export conflicts, or edit the existing record in Supplier Master."],
      ["Hotel scope", "Hotel seasonal rates and surcharges will use a separate submenu and data model."],
    ]);
    readme.mergeCells("A1:B1");
    readme.getCell("A1").font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
    readme.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17324D" } };
    readme.getRow(1).height = 34;
    readme.getColumn(2).alignment = { wrapText: true, vertical: "top" };

    const supplierById = new Map((input.suppliers || []).map((row) => [row.supplierId, row]));
    const productById = new Map((input.products || []).map((row) => [row.productId, row]));
    const contractById = new Map((input.contracts || []).map((row) => [row.contractId, row]));
    const rawRows = input.rawRows || {};
    const rowsFor = {
      SUPPLIERS: rawRows.SUPPLIERS || (input.suppliers || []).map((row) => this.objectToSnake(row)),
      CONTACTS: rawRows.CONTACTS || (input.contacts || []).map((row) => ({
        ...this.objectToSnake(row),
        supplier_code: supplierById.get(row.supplierId)?.supplierCode || "",
      })),
      RECIPIENTS: rawRows.RECIPIENTS || (input.recipients || []).map((row) => ({
        ...this.objectToSnake(row),
        supplier_code: supplierById.get(row.supplierId)?.supplierCode || "",
      })),
      BOOKING_SOPS: rawRows.BOOKING_SOPS || (input.sops || []).map((row) => ({
        ...this.objectToSnake(row),
        supplier_code: supplierById.get(row.supplierId)?.supplierCode || "",
      })),
      PRODUCTS: rawRows.PRODUCTS || (input.products || []).map((row) => ({
        ...this.objectToSnake(row),
        supplier_code: supplierById.get(row.supplierId)?.supplierCode || "",
      })),
      CONTRACTS: rawRows.CONTRACTS || (input.contracts || []).map((row) => ({
        ...this.objectToSnake(row),
        supplier_code: supplierById.get(row.supplierId)?.supplierCode || "",
      })),
      CONTRACT_RATES: rawRows.CONTRACT_RATES || (input.rates || []).map((row) => {
        const contract = contractById.get(row.contractId) || {};
        const supplier = supplierById.get(contract.supplierId) || {};
        const product = productById.get(row.productId) || {};
        return {
          ...this.objectToSnake(row),
          supplier_code: supplier.supplierCode || "",
          contract_number: contract.contractNumber || "",
          product_code: product.productCode || "",
        };
      }),
    };
    for (const [sheetName, headers] of Object.entries(WORKBOOK_SHEETS)) {
      const sheet = workbook.addWorksheet(sheetName, {
        views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
      });
      sheet.addRow(headers);
      (rowsFor[sheetName] || []).forEach((row) => {
        sheet.addRow(headers.map((header) => {
          const value = row[header];
          if (Array.isArray(value)) return value.join(", ");
          if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
          return value ?? "";
        }));
      });
      this.styleDataSheet(sheet, headers);
    }
    const issueSheet = workbook.addWorksheet("IMPORT_ISSUES", {
      views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    });
    issueSheet.addRow(ISSUE_HEADERS);
    (input.issues || []).forEach((issue) => issueSheet.addRow(ISSUE_HEADERS.map((header) =>
      issue[snakeToCamel(header)] ?? issue[header] ?? "")));
    this.styleDataSheet(issueSheet, ISSUE_HEADERS, true);
    return workbook;
  }

  objectToSnake(object) {
    return Object.fromEntries(Object.entries(object || {}).map(([key, value]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      value,
    ]));
  }

  styleDataSheet(sheet, headers, issueSheet = false) {
    const header = sheet.getRow(1);
    header.height = 28;
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: issueSheet ? "FF8A3B3B" : "FF17324D" },
    };
    header.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    sheet.autoFilter = { from: "A1", to: sheet.getCell(1, headers.length).address };
    headers.forEach((name, index) => {
      const width = /description|procedure|terms|notes|information|template|reason/.test(name)
        ? 34 : /id|code|status|channel|currency|basis/.test(name) ? 18 : 24;
      sheet.getColumn(index + 1).width = width;
      sheet.getColumn(index + 1).alignment = { vertical: "top", wrapText: true };
      if (/valid_from|valid_to/.test(name)) sheet.getColumn(index + 1).numFmt = "yyyy-mm-dd";
      if (/amount|min_quantity|max_quantity|sequence|record_version/.test(name)) {
        sheet.getColumn(index + 1).numFmt = "#,##0.00";
      }
    });
    if (sheet.rowCount > 1) {
      for (let row = 2; row <= sheet.rowCount; row += 1) {
        sheet.getRow(row).height = 24;
        if (row % 2 === 0) {
          sheet.getRow(row).fill = {
            type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F7F9" },
          };
        }
      }
    }
  }
}

module.exports = { SupplierExcelService, STATUS, WORKBOOK_SHEETS };
