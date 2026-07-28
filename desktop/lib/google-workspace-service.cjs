const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const mammoth = require("mammoth");
const { extractItineraryFromHtml } = require("./itinerary-extractor.cjs");

class GoogleWorkspaceService {
  constructor({ database, authService, chooseFile, downloadDirectory, onSupplierPublishProgress }) {
    this.database = database;
    this.authService = authService;
    this.chooseFile = chooseFile;
    this.onSupplierPublishProgress = onSupplierPublishProgress || (() => {});
    this.downloadDirectory = downloadDirectory || path.join(process.cwd(), "downloads", "ERIM-PSH", "Itineraries");
  }

  async authorizedFetch(url, options = {}) {
    const token = await this.authService.accessToken();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.error?.message || `Google API returned HTTP ${response.status}.`;
      if (response.status === 401 || response.status === 403) {
        throw new Error(`${message} Disconnect and reconnect Google to approve the latest permissions.`);
      }
      throw new Error(message);
    }
    return payload;
  }

  async authorizedRawFetch(url, options = {}) {
    const token = await this.authService.accessToken();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = payload.error?.message || `Google API returned HTTP ${response.status}.`;
      if (response.status === 401 || response.status === 403) {
        throw new Error(`${message} Disconnect and reconnect Google to approve the latest permissions.`);
      }
      throw new Error(message);
    }
    return response;
  }

  async sheetRecords(sheetName) {
    const { spreadsheetId } = this.database.getPublicSettings();
    if (!spreadsheetId) throw new Error("Google Spreadsheet ID is not configured.");
    const range = encodeURIComponent(`${sheetName}!A:ZZ`);
    const payload = await this.authorizedFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}`,
    );
    const [headers = [], ...rows] = payload.values || [];
    return rows
      .filter((row) => row.some((cell) => cell !== ""))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  }

  async syncMasterDataCache() {
    let supplierMaster = null;
    if (typeof this.database.getSupplierMasterCatalog === "function"
      && typeof this.database.replaceSupplierMasterCache === "function") {
      try {
        supplierMaster = await this.listSupplierMaster({ refresh: true });
      } catch (error) {
        supplierMaster = {
          status: "OFFLINE_CACHE",
          message: error.message,
          catalog: this.database.getSupplierMasterCatalog(),
        };
      }
    }
    const [tocRecords, vendorRecords, stateRecords] = await Promise.all([
      this.sheetRecords("TOC_MASTER"),
      this.sheetRecords("VENDOR_RATE_MASTER"),
      this.sheetRecords("MASTER_DATA_STATE").catch(() => []),
    ]);
    if (!tocRecords.length || !vendorRecords.length) {
      throw new Error("Google Sheet TOC/Vendor master data is empty; existing SQLite cache was retained.");
    }
    const toc = tocRecords.map((row) => ({
      tocId: String(row.toc_id || "").trim(),
      tocName: String(row.toc_name || "").trim(),
      adultRateIdr: row.adult_rate_idr === "" ? null : row.adult_rate_idr,
      childRateIdr: row.child_rate_idr === "" ? null : row.child_rate_idr,
      childAge: String(row.child_age || "").trim(),
      notes: String(row.notes || "").trim(),
      validTo: String(row.valid_to || "").trim(),
      sourceSheet: String(row.source_sheet || "").trim(),
      sourceRow: Number(row.source_row || 0) || null,
      updatedAt: String(row.updated_at || "").trim(),
    }));
    const vendorRates = vendorRecords.map((row) => ({
      vendorRateId: String(row.vendor_rate_id || "").trim(),
      serviceName: String(row.service_name || "").trim(),
      vendorName: String(row.vendor_name || "").trim(),
      adultRateIdr: row.adult_rate_idr === "" ? null : row.adult_rate_idr,
      childRateIdr: row.child_rate_idr === "" ? null : row.child_rate_idr,
      notes: String(row.notes || "").trim(),
      description: String(row.description || "").trim(),
      contractValidity: String(row.contract_validity || "").trim(),
      validTo: String(row.valid_to || "").trim(),
      sourceSheet: String(row.source_sheet || "").trim(),
      sourceRow: Number(row.source_row || 0) || null,
      updatedAt: String(row.updated_at || "").trim(),
    }));
    const invalidToc = toc.find((row) => !row.tocId || !row.tocName || !row.validTo);
    const invalidVendor = vendorRates.find((row) =>
      !row.vendorRateId || !row.serviceName || !row.validTo
    );
    if (invalidToc || invalidVendor) {
      throw new Error("Google Sheet master data contains a row without ID, name/service, or valid date.");
    }
    const checksum = masterDataChecksum(toc, vendorRates);
    const state = stateRecords.find((row) =>
      String(row.master_key || "").trim().toUpperCase() === "TOC_VENDOR_RATES"
    ) || {};
    const sourceVersion = String(state.version || "GOOGLE_SHEET").trim();
    const existing = this.database.getMasterDataSyncState();
    if (
      existing?.checksum === checksum
      && existing.tocRows === toc.length
      && existing.vendorRateRows === vendorRates.length
    ) {
      return {
        status: "CURRENT",
        source: "GOOGLE_SHEET",
        sourceVersion,
        checksum,
        tocRows: toc.length,
        vendorRateRows: vendorRates.length,
        transportRateRows: Number(state.transport_rate_rows || 0),
        metadataChecksumMatches: !state.checksum || state.checksum === checksum,
        supplierMaster,
      };
    }
    const summary = this.database.replaceMasterData({
      sourceVersion,
      checksum,
      sourceUpdatedAt: String(state.updated_at || "").trim(),
      transportRateRows: Number(state.transport_rate_rows || 0),
      toc,
      vendorRates,
    });
    return {
      status: "SYNCED",
      source: "GOOGLE_SHEET",
      sourceVersion,
      checksum,
      tocRows: toc.length,
      vendorRateRows: vendorRates.length,
      transportRateRows: Number(state.transport_rate_rows || 0),
      metadataChecksumMatches: !state.checksum || state.checksum === checksum,
      summary,
      supplierMaster,
    };
  }

  async listSupplierMaster({ refresh = true } = {}) {
    if (!refresh || !this.authService?.status().connected) {
      return {
        status: "OFFLINE_CACHE",
        catalog: this.database.getSupplierMasterCatalog(),
        drafts: this.database.listSupplierMasterDrafts(),
      };
    }
    try {
      const catalog = await this.callAppsScript("supplier.master.list", {});
      const cached = this.database.replaceSupplierMasterCache(catalog);
      return {
        status: "SYNCED",
        catalog: cached,
        drafts: this.database.listSupplierMasterDrafts(),
        checksum: catalog.checksum || "",
      };
    } catch (error) {
      return {
        status: "OFFLINE_CACHE",
        catalog: this.database.getSupplierMasterCatalog(),
        drafts: this.database.listSupplierMasterDrafts(),
        warning: error.message,
      };
    }
  }

  async initializeSupplierMaster() {
    const catalog = await this.callAppsScript("supplier.master.initialize", {
      requestId: `SUPINIT-${crypto.randomUUID()}`,
    });
    const cached = this.database.replaceSupplierMasterCache(catalog);
    return { status: "SYNCED", catalog: cached, checksum: catalog.checksum || "" };
  }

  async saveSupplierType(details) {
    return this.database.saveSupplierMasterDraft("TYPE", details);
  }

  async saveSupplier(details) {
    return this.database.saveSupplierMasterDraft("SUPPLIER", details);
  }

  async saveSupplierProduct(details) {
    return this.database.saveSupplierMasterDraft("PRODUCT", details);
  }

  async duplicateSupplierProduct(details) {
    return this.database.duplicateSupplierProduct(details);
  }

  async saveSupplierContract(details) {
    return this.database.saveSupplierMasterDraft("CONTRACT", details);
  }

  async archiveSupplierEntity(details) {
    return this.database.saveSupplierMasterDraft("ARCHIVE", details);
  }

  listSupplierMasterDrafts() {
    return this.database.listSupplierMasterDrafts();
  }

  discardSupplierMasterDraft(draftId) {
    return this.database.discardSupplierMasterDraft(draftId);
  }

  listSupplierPublishSessions() {
    return this.database.listSupplierPublishSessions();
  }

  supplierPublishPlan(drafts) {
    const catalog = this.database.getSupplierMasterCatalog();
    const supplierById = new Map((catalog.suppliers || []).map((row) => [row.supplierId, row]));
    const productById = new Map((catalog.products || []).map((row) => [row.productId, row]));
    const stageOrder = { TYPE: 0, SUPPLIER: 1, PRODUCT: 2, CONTRACT: 3, ARCHIVE: 4 };
    const stageName = {
      TYPE: "TYPE",
      SUPPLIER: "SUPPLIER",
      PRODUCT: "PRODUCT",
      CONTRACT: "CONTRACT_RATE",
      ARCHIVE: "ARCHIVE",
    };
    const labelFor = (draft) => {
      const payload = draft.payload || {};
      return payload.typeName || payload.supplierName || payload.productName
        || payload.contractNumber || payload.label || draft.entityId;
    };
    return drafts.map((draft) => {
      const payload = draft.payload || {};
      const supplier = supplierById.get(payload.supplierId || draft.parentId);
      const archivedProduct = productById.get(payload.entityId);
      const typeCode = String(
        payload.typeCode
        || supplier?.typeCode
        || supplierById.get(archivedProduct?.supplierId)?.typeCode
        || "UNASSIGNED"
      ).toUpperCase();
      return {
        ...draft,
        typeCode,
        stage: stageName[draft.entityKind] || draft.entityKind,
        stageOrder: stageOrder[draft.entityKind] ?? 9,
        itemLabel: labelFor(draft),
      };
    }).sort((left, right) =>
      left.typeCode.localeCompare(right.typeCode)
      || left.stageOrder - right.stageOrder
      || left.updatedAt.localeCompare(right.updatedAt)
    );
  }

  emitSupplierPublishProgress(session) {
    this.onSupplierPublishProgress(session);
    return session;
  }

  supplierPublishReadbackConfirmed(catalog, item) {
    const find = (rows, key, id) => (rows || []).find((row) => String(row[key]) === String(id));
    if (item.entityKind === "TYPE") {
      return Boolean(find(catalog.supplierTypes, "supplierTypeId", item.entityId));
    }
    if (item.entityKind === "SUPPLIER") {
      return Boolean(find(catalog.suppliers, "supplierId", item.entityId));
    }
    if (item.entityKind === "PRODUCT") {
      return Boolean(find(catalog.products, "productId", item.entityId));
    }
    if (item.entityKind === "CONTRACT") {
      const contract = find(catalog.contracts, "contractId", item.entityId);
      const expectedRateIds = (item.payload.rates || []).map((rate) => rate.contractRateId).filter(Boolean);
      return Boolean(contract) && expectedRateIds.every((rateId) =>
        find(catalog.rates, "contractRateId", rateId)
      );
    }
    if (item.entityKind === "ARCHIVE") {
      const targetKind = String(item.payload.entityKind || "").toUpperCase();
      const config = {
        SUPPLIER_TYPE: ["supplierTypes", "supplierTypeId"],
        SUPPLIER: ["suppliers", "supplierId"],
        PRODUCT: ["products", "productId"],
        CONTRACT: ["contracts", "contractId"],
      }[targetKind];
      if (!config) return false;
      const row = find(catalog[config[0]], config[1], item.payload.entityId);
      return Boolean(row) && row.active === false;
    }
    return false;
  }

  async publishSupplierMasterDrafts({ draftIds = [], sessionId = "" } = {}) {
    const previousSession = sessionId
      ? this.database.getSupplierPublishSession(sessionId)
      : null;
    const resumedDraftIds = previousSession
      ? previousSession.items.filter((item) => item.status !== "SYNCED").map((item) => item.draftId)
      : [];
    if (previousSession && !resumedDraftIds.length) {
      return {
        status: previousSession.status,
        session: previousSession,
        results: [],
        summary: {
          total: previousSession.totalItems,
          synced: previousSession.confirmedItems,
          failed: previousSession.failedItems + previousSession.blockedItems,
          conflicts: previousSession.conflictItems,
          blocked: previousSession.blockedItems,
        },
        drafts: this.database.listSupplierMasterDrafts(),
        catalog: this.database.getSupplierMasterCatalog(),
      };
    }
    const selected = new Set((resumedDraftIds.length ? resumedDraftIds : draftIds || []).map(String));
    const drafts = this.database.listSupplierMasterDrafts()
      .filter((draft) => !selected.size || selected.has(draft.draftId));
    if (!drafts.length) {
      return {
        status: "NOTHING_TO_PUBLISH",
        drafts: this.database.listSupplierMasterDrafts(),
        catalog: this.database.getSupplierMasterCatalog(),
        summary: { total: 0, synced: 0, failed: 0, conflicts: 0 },
      };
    }
    const plan = this.supplierPublishPlan(drafts);
    let session = previousSession
      ? this.database.resetSupplierPublishSession(previousSession.sessionId, plan.map((item) => item.draftId))
      : this.database.createSupplierPublishSession(plan);
    this.emitSupplierPublishProgress(session);
    const results = [];
    const failedEntityIds = new Set();
    const selectedEntityIds = new Set(plan.map((item) => item.entityId));
    const chunkSize = 20;
    const dependencies = (item) => {
      if (item.entityKind === "PRODUCT") return [item.payload.supplierId];
      if (item.entityKind === "CONTRACT") {
        return [
          item.payload.supplierId,
          ...(item.payload.rates || []).map((rate) => rate.productId),
        ].filter(Boolean);
      }
      return [];
    };
    const groups = [];
    plan.forEach((item) => {
      const key = `${item.typeCode}:${item.stage}`;
      const current = groups.at(-1);
      if (!current || current.key !== key) groups.push({ key, items: [item] });
      else current.items.push(item);
    });
    for (const [groupIndex, group] of groups.entries()) {
      const publishable = [];
      for (const item of group.items) {
        const blockedBy = dependencies(item).find((entityId) =>
          selectedEntityIds.has(entityId) && failedEntityIds.has(entityId)
        );
        if (blockedBy) {
          failedEntityIds.add(item.entityId);
          this.database.setSupplierMasterDraftStatus(item.draftId, "FAILED", {
            code: "BLOCKED_BY_DEPENDENCY",
            message: `Dependency ${blockedBy} was not confirmed in Google.`,
          });
          session = this.database.updateSupplierPublishSessionItem(
            session.sessionId,
            item.draftId,
            "BLOCKED_BY_DEPENDENCY",
            {
              errorCode: "BLOCKED_BY_DEPENDENCY",
              errorMessage: `Dependency ${blockedBy} was not confirmed in Google.`,
              typeCode: item.typeCode,
              stage: item.stage,
              itemLabel: item.itemLabel,
            },
          );
          this.emitSupplierPublishProgress(session);
        } else {
          publishable.push(item);
        }
      }
      for (let offset = 0; offset < publishable.length; offset += chunkSize) {
        const chunk = publishable.slice(offset, offset + chunkSize);
        for (const item of chunk) {
          this.database.setSupplierMasterDraftStatus(item.draftId, "SYNCING");
          session = this.database.updateSupplierPublishSessionItem(
            session.sessionId,
            item.draftId,
            "PUBLISHING",
            { typeCode: item.typeCode, stage: item.stage, itemLabel: item.itemLabel },
          );
          this.emitSupplierPublishProgress(session);
        }
        let response;
        try {
          response = await this.callAppsScript("supplier.master.batch.publish", {
            requestId: `${session.sessionId}-${group.key}-${Math.floor(offset / chunkSize) + 1}`,
            broadcast: groupIndex === groups.length - 1 && offset + chunkSize >= publishable.length,
            sessionTotal: session.totalItems,
            changes: chunk.map((draft) => ({
              draftId: draft.draftId,
              entityKind: draft.entityKind,
              entityId: draft.entityId,
              baseRecordVersion: draft.baseRecordVersion,
              payload: draft.payload,
            })),
          });
        } catch (error) {
          for (const item of chunk) {
            failedEntityIds.add(item.entityId);
            const errorDetails = {
              code: error.code || "PUBLISH_FAILED",
              message: error.message,
            };
            this.database.setSupplierMasterDraftStatus(item.draftId, "FAILED", errorDetails);
            session = this.database.updateSupplierPublishSessionItem(
              session.sessionId,
              item.draftId,
              "FAILED",
              {
                errorCode: errorDetails.code,
                errorMessage: errorDetails.message,
                typeCode: item.typeCode,
                stage: item.stage,
                itemLabel: item.itemLabel,
              },
            );
            results.push({
              draftId: item.draftId,
              entityId: item.entityId,
              status: "FAILED",
              errorCode: errorDetails.code,
              message: errorDetails.message,
            });
            this.emitSupplierPublishProgress(session);
          }
          continue;
        }
        if (response.catalog) this.database.replaceSupplierMasterCache(response.catalog);
        for (const item of chunk) {
          session = this.database.updateSupplierPublishSessionItem(
            session.sessionId,
            item.draftId,
            "VERIFYING",
            { typeCode: item.typeCode, stage: item.stage, itemLabel: item.itemLabel },
          );
          this.emitSupplierPublishProgress(session);
          const result = (response.results || []).find((row) => row.draftId === item.draftId);
          const readbackConfirmed = result?.status === "SYNCED"
            && this.supplierPublishReadbackConfirmed(
              response.catalog || this.database.getSupplierMasterCatalog(),
              item,
            );
          const status = readbackConfirmed
            ? "SYNCED"
            : result?.status === "CONFLICT" ? "CONFLICT" : "FAILED";
          const errorCode = result?.status === "SYNCED" && !readbackConfirmed
            ? "READBACK_MISSING" : result?.errorCode || "";
          const message = result?.status === "SYNCED" && !readbackConfirmed
            ? "Google accepted the request but the record was not found during readback."
            : result?.message || "";
          if (status !== "SYNCED") failedEntityIds.add(item.entityId);
          this.database.setSupplierMasterDraftStatus(item.draftId, status, {
            code: errorCode,
            message,
          });
          session = this.database.updateSupplierPublishSessionItem(
            session.sessionId,
            item.draftId,
            status,
            {
              errorCode,
              errorMessage: message,
              typeCode: item.typeCode,
              stage: item.stage,
              itemLabel: item.itemLabel,
            },
          );
          results.push({
            draftId: item.draftId,
            entityId: item.entityId,
            status,
            errorCode,
            message,
          });
          this.emitSupplierPublishProgress(session);
        }
      }
    }
    try {
      const reconciled = await this.listSupplierMaster({ refresh: true });
      if (reconciled.catalog) this.database.replaceSupplierMasterCache(reconciled.catalog);
    } catch {
      // Confirmed chunk readbacks remain authoritative in SQLite when final refresh is offline.
    }
    session = this.database.refreshSupplierPublishSession(session.sessionId);
    this.emitSupplierPublishProgress(session);
    const summary = {
      total: session.totalItems,
      synced: session.confirmedItems,
      failed: session.failedItems + session.blockedItems,
      conflicts: session.conflictItems,
      blocked: session.blockedItems,
    };
    return {
      status: session.status,
      session,
      results,
      summary,
      drafts: this.database.listSupplierMasterDrafts(),
      catalog: this.database.getSupplierMasterCatalog(),
    };
  }

  async selectAndUploadSupplierContract(details = {}) {
    const filePath = await this.chooseFile({
      title: "Choose Supplier Contract",
      contractOnly: true,
    });
    if (!filePath) return { canceled: true };
    const settings = this.database.getPublicSettings();
    if (!settings.driveFolderId) {
      throw new Error("Configure the official Google Drive Folder ID before uploading a supplier contract.");
    }
    const supplierName = String(details.supplierName || "Supplier").trim();
    const supplierId = String(details.supplierId || "UNASSIGNED").trim();
    const contractNumber = String(details.contractNumber || "Contract").trim();
    const folderId = await this.ensureDriveSubfolder(
      settings.driveFolderId,
      "Supplier Contracts",
    );
    const supplierFolderId = await this.ensureDriveSubfolder(
      folderId,
      sanitizeFilePart(`${supplierId} - ${supplierName}`),
    );
    const metadata = {
      name: `${sanitizeFilePart(contractNumber)} - ${path.basename(filePath)}`,
      parents: [supplierFolderId],
    };
    const boundary = `erim_supplier_contract_${crypto.randomBytes(12).toString("hex")}`;
    const content = fs.readFileSync(filePath);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: ${mimeTypeFor(path.extname(filePath).toLowerCase())}\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const uploaded = await this.authorizedFetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      },
    );
    return {
      canceled: false,
      driveFileId: uploaded.id,
      driveFileName: uploaded.name,
      driveFileUrl: uploaded.webViewLink || `https://drive.google.com/open?id=${uploaded.id}`,
    };
  }

  async ensureDriveSubfolder(parentId, name) {
    const query = [
      `'${String(parentId).replaceAll("'", "\\'")}' in parents`,
      "mimeType='application/vnd.google-apps.folder'",
      `name='${String(name).replaceAll("'", "\\'")}'`,
      "trashed=false",
    ].join(" and ");
    const found = await this.authorizedFetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`,
    );
    if (found.files?.[0]?.id) return found.files[0].id;
    const created = await this.authorizedFetch(
      "https://www.googleapis.com/drive/v3/files?fields=id,name",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentId],
        }),
      },
    );
    return created.id;
  }

  async searchAgents(query) {
    const text = String(query || "").trim().toLowerCase();
    if (!text) return [];
    const { spreadsheetId } = this.database.getPublicSettings();
    if (!spreadsheetId) throw new Error("Google Spreadsheet ID is not configured.");
    const range = encodeURIComponent("AGENTS!A2:M");
    const payload = await this.authorizedFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}`,
    );
    return (payload.values || [])
      .map((row) => ({
        agentId: row[0] || "",
        agentName: row[1] || "",
        market: row[2] || "",
        contactName: row[3] || "",
        active: String(row[7] || "").toLowerCase() !== "false",
      }))
      .filter((agent) => agent.active && agent.agentName.toLowerCase().includes(text))
      .slice(0, 8);
  }

  async searchConfirmationEmails(customerCode) {
    const parsed = parseCustomerCode(customerCode);
    if (!parsed.customerCode) throw new Error("Customer Code is required before searching email.");
    let matchedBy = "CUSTOMER_CODE";
    let list = await this.searchGmailSubject(parsed.customerCode);
    if (!(list.messages || []).length && parsed.fileCode !== parsed.customerCode) {
      matchedBy = "FILE_CODE";
      list = await this.searchGmailSubject(parsed.fileCode);
    }
    const messages = await Promise.all((list.messages || []).map(async ({ id }) => {
      const message = await this.authorizedFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      );
      const headers = Object.fromEntries(
        (message.payload?.headers || []).map((header) => [header.name.toLowerCase(), header.value]),
      );
      return {
        messageId: message.id,
        threadId: message.threadId,
        subject: headers.subject || "(No subject)",
        from: headers.from || "",
        date: headers.date || "",
        matchedBy,
      };
    }));
    return messages.filter((message) =>
      message.subject.toUpperCase().includes(parsed.fileCode)
    );
  }

  async searchGmailSubject(value) {
    const query = encodeURIComponent(`subject:"${String(value).replaceAll('"', "")}"`);
    return this.authorizedFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=10`,
    );
  }

  async getGmailThread(threadId) {
    const id = String(threadId || "").trim();
    if (!id) throw new Error("Gmail Thread ID is required.");
    const thread = await this.authorizedFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(id)}?format=full`,
    );
    return {
      threadId: thread.id,
      messages: (thread.messages || []).map((message) => {
        const headers = Object.fromEntries(
          (message.payload?.headers || []).map((header) => [header.name.toLowerCase(), header.value]),
        );
        const body = extractGmailBody(message.payload);
        return {
          messageId: message.id,
          subject: headers.subject || "(No subject)",
          from: headers.from || "",
          to: headers.to || "",
          cc: headers.cc || "",
          date: headers.date || "",
          bodyHtml: body.html,
          attachments: body.attachments,
        };
      }).sort((a, b) => new Date(a.date) - new Date(b.date)),
    };
  }

  async selectAndUploadItinerary({ customerCode, customerName }) {
    const parsed = parseCustomerCode(customerCode);
    const code = parsed.customerCode;
    const name = String(customerName || "").trim();
    if (!code || !name) throw new Error("Complete Customer Code and Customer Name first.");
    const filePath = await this.chooseFile();
    if (!filePath) return { canceled: true };

    const extension = path.extname(filePath).toLowerCase();
    const safeCustomer = sanitizeFilePart(name);
    const fileName = `${parsed.fileNameCode} - ${safeCustomer}${extension}`;
    const metadata = { name: fileName };
    const { driveFolderId } = this.database.getPublicSettings();
    if (!driveFolderId) {
      throw new Error("Configure the official Itinerary Drive Folder ID before uploading.");
    }
    metadata.parents = [driveFolderId];

    const mimeType = mimeTypeFor(extension);
    const boundary = `erim_psh_${Date.now().toString(16)}`;
    const content = fs.readFileSync(filePath);
    const prefix = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`
      + `${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    );
    const suffix = Buffer.from(`\r\n--${boundary}--`);
    const payload = await this.authorizedFetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType,size",
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body: Buffer.concat([prefix, content, suffix]),
      },
    );
    return {
      canceled: false,
      originalPath: filePath,
      driveFileId: payload.id,
      fileName: payload.name,
      webViewLink: payload.webViewLink || `https://drive.google.com/open?id=${payload.id}`,
      mimeType: payload.mimeType || mimeType,
      size: Number(payload.size || content.length),
      customerCode: parsed.customerCode,
      salesCode: parsed.salesCode,
      fileCode: parsed.fileCode,
      fileNameCode: parsed.fileNameCode,
    };
  }

  async getRevisionContext(customerCode) {
    const code = String(customerCode || "").trim().toUpperCase();
    if (!code) throw new Error("Customer Code is required.");
    const [tours, tourDays, revisions] = await Promise.all([
      this.sheetRecords("TOURS"),
      this.sheetRecords("TOUR_DAYS"),
      this.sheetRecords("ITINERARY_REVISIONS"),
    ]);
    const tour = tours.find((row) => String(row.customer_code || "").trim().toUpperCase() === code);
    if (!tour) throw new Error(`Customer Code ${code} was not found in the central record.`);
    const days = tourDays
      .filter((row) => String(row.tour_id || "") === String(tour.tour_id || ""))
      .sort((a, b) => Number(a.day_number || 0) - Number(b.day_number || 0))
      .map((row) => ({
        dayNumber: row.day_number || "",
        date: row.service_date || row.tour_date || row.date || "",
        title: row.day_title || row.title || row.location || "",
        status: row.status || row.day_status || "UNKNOWN",
      }));
    const matchingRevisions = revisions
      .filter((row) =>
        String(row.tour_id || "") === String(tour.tour_id || "")
        || String(row.customer_code || "").trim().toUpperCase() === code
      )
      .sort((a, b) => Number(b.revision_number || b.revision_no || 0) - Number(a.revision_number || a.revision_no || 0));
    const localDraft = this.database.listDrafts({ module: "RESERVATION" })
      .map((draft) => this.database.getDraft(draft.draft_id))
      .find((draft) => draft.customer_code === code && draft.payload?.itineraryDriveFileId);
    const latestRevision = matchingRevisions[0] || {};
    const driveFileId = firstValue(
      latestRevision,
      ["drive_file_id", "itinerary_drive_file_id", "revised_drive_file_id", "file_id"],
    ) || firstValue(
      tour,
      ["itinerary_drive_file_id", "drive_file_id", "soft_copy_drive_file_id", "file_id"],
    ) || localDraft?.payload?.itineraryDriveFileId || "";
    if (!driveFileId) throw new Error(`No DOCX Drive File ID is linked to ${code}.`);

    const metadata = await this.authorizedFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?fields=id,name,mimeType,webViewLink,modifiedTime`,
    );
    const response = await this.authorizedRawFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`,
    );
    const buffer = Buffer.from(await response.arrayBuffer());
    const converted = await mammoth.convertToHtml({ buffer });
    return {
      customerCode: code,
      customerName: tour.client_name || tour.customer_name || "",
      adultPax: Number(tour.pax_adult || 0),
      childPax: Number(tour.pax_child || 0),
      infantPax: Number(tour.pax_infant || 0),
      tourId: tour.tour_id || "",
      tourStatus: tour.status || tour.tour_status || "",
      days,
      currentRevision: Number(
        latestRevision.revision_number
        || latestRevision.revision_no
        || matchingRevisions.length
        || 0
      ),
      currentRevisionId: latestRevision.revision_id || "",
      driveFileId,
      driveFileName: metadata.name,
      driveFileUrl: metadata.webViewLink || `https://drive.google.com/open?id=${driveFileId}`,
      modifiedTime: metadata.modifiedTime || "",
      documentHtml: sanitizeDocumentHtml(converted.value),
      conversionWarnings: converted.messages.map((message) => message.message),
    };
  }

  async getVendorIntakeContext(customerCode) {
    const itinerary = await this.getRevisionContext(customerCode);
    const localSuggestions = this.database.getLocalVendorSuggestions();
    const [publications, vendors, services] = await Promise.all([
      this.sheetRecords("DEPARTMENT_PUBLICATIONS"),
      this.sheetRecords("VENDORS").catch(() => []),
      this.sheetRecords("SERVICES").catch(() => []),
    ]);
    const suggestions = {
      ...localSuggestions,
      vendorNames: uniqueSortedStrings([
        ...localSuggestions.vendorNames,
        ...vendors.map((row) =>
          firstValue(row, ["vendor_name", "display_name", "legal_name", "name"])
        ),
      ]),
      vendorServices: uniqueSortedStrings([
        ...localSuggestions.vendorServices,
        ...services.map((row) =>
          firstValue(row, ["service_name", "service_description", "activity_name"])
        ),
      ]),
      tocNames: localSuggestions.tocNames,
      vendorRates: localSuggestions.vendorRates,
      tocRates: localSuggestions.tocRates,
      transportRates: localSuggestions.transportRates,
      luggageVanRates: localSuggestions.luggageVanRates,
      localMasterValidTo: localSuggestions.validTo,
    };
    const source = publications
      .filter((row) =>
        String(row.customer_code || "").trim().toUpperCase() === itinerary.customerCode
        && String(row.department || "").toUpperCase() === "RESERVATION"
        && String(row.status || "").toUpperCase() === "PUBLISHED"
      )
      .sort((a, b) =>
        Number(b.published_record_version || 0) - Number(a.published_record_version || 0)
      )[0] || {};
    const extracted = extractItineraryFromHtml(itinerary.documentHtml);
    const local = this.database.getVendorIntakeDraftByCode(itinerary.customerCode);
    if (local) {
      return {
        ...local,
        sourcePublicationId: source.publication_id || local.sourcePublicationId,
        sourceRecordVersion: Number(source.published_record_version || local.sourceRecordVersion || 0),
        sourceRevisionId: itinerary.currentRevisionId || local.sourceRevisionId,
        driveFileId: itinerary.driveFileId,
        driveFileName: itinerary.driveFileName,
        driveFileUrl: itinerary.driveFileUrl,
        documentHtml: itinerary.documentHtml,
        suggestions,
        conversionWarnings: itinerary.conversionWarnings,
        sourceRefreshedAt: new Date().toISOString(),
      };
    }
    return {
      vendorDraftId: "",
      customerCode: itinerary.customerCode,
      customerName: extracted.customerName || itinerary.customerName,
      adultPax: itinerary.adultPax,
      childPax: itinerary.childPax,
      infantPax: itinerary.infantPax,
      tourId: itinerary.tourId,
      sourcePublicationId: source.publication_id || "",
      sourceRecordVersion: Number(source.published_record_version || 0),
      sourceRevisionId: itinerary.currentRevisionId || "",
      driveFileId: itinerary.driveFileId,
      driveFileName: itinerary.driveFileName,
      driveFileUrl: itinerary.driveFileUrl,
      documentHtml: itinerary.documentHtml,
      suggestions,
      arrivalDate: extracted.arrivalDate || "",
      arrivalFlight: extracted.arrivalFlight || "",
      arrivalSector: extracted.arrivalSector || "",
      arrivalTime: extracted.arrivalTime || "",
      departureDate: extracted.departureDate || "",
      departureFlight: extracted.departureFlight || "",
      departureSector: extracted.departureSector || "",
      departureTime: extracted.departureTime || "",
      hotels: extracted.hotels || [],
      days: buildVendorDays(extracted.arrivalDate, extracted.departureDate),
      extractionStatus: "NEEDS_REVIEW",
      localStatus: "LOCAL_DRAFT",
      conversionWarnings: itinerary.conversionWarnings,
    };
  }

  async publishVendorIntake(input) {
    const saved = this.database.saveVendorIntakeDraft(input);
    const result = await this.callAppsScript("vendor.intake.save", {
      requestId: `VINT-${crypto.randomUUID()}`,
      sourcePublicationId: saved.sourcePublicationId,
      sourceRecordVersion: saved.sourceRecordVersion,
      intake: saved,
    });
    this.database.markVendorIntakePublished(saved.customerCode);
    return { ...result, local: this.database.getVendorIntakeDraftByCode(saved.customerCode) };
  }

  async sendVendorBookingEmail(input = {}) {
    const booking = this.database.getVendorBooking(String(input.bookingId || ""));
    if (!booking) throw new Error("Generate the Vendor booking before sending.");
    if (booking.communicationStatus === "SENT") {
      throw new Error("This booking is already recorded as sent. Generate an amendment instead of resending it.");
    }
    if (booking.channel !== "EMAIL") throw new Error("This booking channel is not Email.");
    const cleanHeader = (value) => String(value || "").replace(/[\r\n]+/g, " ").trim();
    const recipients = booking.recipients || [];
    const byType = (type) => recipients
      .filter((row) => String(row.recipientType || "").toUpperCase() === type)
      .map((row) => cleanHeader(row.address))
      .filter(Boolean);
    const to = byType("TO");
    if (!to.length) throw new Error("At least one TO email address is required.");
    const headers = [
      `To: ${to.join(", ")}`,
      byType("CC").length ? `Cc: ${byType("CC").join(", ")}` : "",
      byType("BCC").length ? `Bcc: ${byType("BCC").join(", ")}` : "",
      `Subject: =?UTF-8?B?${Buffer.from(cleanHeader(booking.subject), "utf8").toString("base64")}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
    ].filter(Boolean);
    const mime = `${headers.join("\r\n")}\r\n\r\n${String(booking.body || "").replace(/\r?\n/g, "\r\n")}`;
    const payload = await this.authorizedFetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: Buffer.from(mime, "utf8").toString("base64url") }),
      },
    );
    const saved = this.database.recordVendorBookingEmailSent({
      bookingId: booking.bookingId,
      gmailMessageId: payload.id,
      gmailThreadId: payload.threadId,
    });
    return { booking: saved, gmailMessageId: payload.id, gmailThreadId: payload.threadId };
  }

  async getVendorDashboard() {
    const settings = this.database.getPublicSettings();
    const now = Date.now();
    const plusSeven = now + (7 * 86_400_000);
    const localQueue = this.database.listVendorBookingQueue();
    const localItem = (row) => ({
      customerCode: row.customerCode,
      customerName: row.customerName,
      serviceName: `${row.supplierName} · ${row.serviceCount} service${row.serviceCount === 1 ? "" : "s"}`,
      arrivalDate: row.arrivalDate,
      status: row.workflowStatus,
      packageKey: row.packageKey,
      pendingRateCount: row.pendingRateCount,
      source: "LOCAL_SPLIT",
    });
    const localPending = localQueue
      .filter((row) => row.workflowStatus !== "SENT")
      .map(localItem);
    const localUrgent = localQueue
      .filter((row) => row.workflowStatus !== "SENT")
      .filter((row) => {
        const arrival = new Date(row.arrivalDate || 0).getTime();
        const age = now - new Date(row.updatedAt || 0).getTime();
        return (arrival > 0 && arrival <= now + (3 * 86_400_000)) || age > 72 * 3_600_000;
      })
      .map(localItem);
    const localDone = localQueue
      .filter((row) => row.workflowStatus === "SENT")
      .filter((row) => {
        const arrival = new Date(row.arrivalDate || 0).getTime();
        return arrival > now && arrival <= plusSeven;
      })
      .map(localItem);
    if (!settings.spreadsheetId || !this.authService?.status().connected) {
      return {
        urgent: localUrgent, pending: localPending, replied: [], done: localDone,
        offline: true, localQueueCount: localQueue.length,
      };
    }
    const [tours, publications, services, bookings, communications] = await Promise.all([
      this.sheetRecords("TOURS").catch(() => []),
      this.sheetRecords("DEPARTMENT_PUBLICATIONS").catch(() => []),
      this.sheetRecords("SERVICES").catch(() => []),
      this.sheetRecords("SUPPLIER_BOOKINGS").catch(() => []),
      this.sheetRecords("COMMUNICATIONS").catch(() => []),
    ]);
    const tourById = new Map(tours.map((tour) => [String(tour.tour_id || ""), tour]));
    const serviceById = new Map(services.map((service) => [String(service.service_id || ""), service]));
    const latestReservation = new Map();
    publications
      .filter((row) =>
        String(row.department || "").toUpperCase() === "RESERVATION"
        && String(row.status || "").toUpperCase() === "PUBLISHED"
      )
      .forEach((row) => {
        const key = String(row.tour_id || row.customer_code || "");
        const previous = latestReservation.get(key);
        if (!previous || Number(row.published_record_version || 0) > Number(previous.published_record_version || 0)) {
          latestReservation.set(key, row);
        }
      });
    const urgent = [...latestReservation.values()]
      .filter((row) => now - new Date(row.published_at || row.created_at || 0).getTime() > 72 * 3_600_000)
      .filter((row) => !services.some((service) =>
        String(service.tour_id || "") === String(row.tour_id || "")
      ))
      .map((row) => dashboardTourItem(row, tourById.get(String(row.tour_id || ""))));
    const onlinePending = bookings
      .filter((row) => !["SENT", "CONFIRMED", "CANCELED"].includes(String(row.status || "").toUpperCase()))
      .map((row) => {
        const service = serviceById.get(String(row.service_id || "")) || {};
        return dashboardTourItem(row, tourById.get(String(row.tour_id || service.tour_id || "")), {
          serviceName: service.service_name || service.service_description || "",
        });
      });
    const replied = communications
      .filter((row) =>
        String(row.direction || "").toUpperCase() === "INBOUND"
        && !["REVIEWED", "CLOSED"].includes(String(row.status || "").toUpperCase())
      )
      .map((row) => dashboardTourItem(row, tourById.get(String(row.tour_id || ""))));
    const onlineDone = tours
      .filter((tour) => ["DONE", "COMPLETE", "COMPLETED"].includes(String(tour.overall_status || tour.status || "").toUpperCase()))
      .filter((tour) => {
        const arrival = new Date(tour.arrival_date || 0).getTime();
        return arrival > now && arrival <= plusSeven;
      })
      .map((tour) => dashboardTourItem(tour, tour));
    const merge = (first, second) => {
      const result = new Map();
      [...first, ...second].forEach((row) => {
        const key = row.packageKey || `${row.customerCode}|${row.serviceName || row.status || ""}`;
        if (!result.has(key)) result.set(key, row);
      });
      return [...result.values()];
    };
    return {
      urgent: merge(localUrgent, urgent),
      pending: merge(localPending, onlinePending),
      replied,
      done: merge(localDone, onlineDone),
      offline: false,
      localQueueCount: localQueue.length,
    };
  }

  async getRecheckContext(customerCode) {
    const itinerary = await this.getRevisionContext(customerCode);
    const [emails, auditRows, employees] = await Promise.all([
      this.searchConfirmationEmails(itinerary.customerCode),
      this.sheetRecords("AUDIT_LOG"),
      this.sheetRecords("EMPLOYEES"),
    ]);
    const employeeNames = new Map(
      employees.map((employee) => [
        String(employee.employee_id || ""),
        employee.full_name || employee.company_email || employee.employee_id || "Unknown user",
      ]),
    );
    const activities = auditRows
      .map((row) => ({ row, after: parseJsonObject(row.after_json) }))
      .filter(({ row, after }) =>
        String(row.tour_id || "") === String(itinerary.tourId || "")
        || String(row.entity_id || "") === String(itinerary.driveFileId || "")
        || String(after.customerCode || after.customer_code || "").trim().toUpperCase() === itinerary.customerCode
      )
      .map(({ row, after }) => ({
        auditId: row.audit_id || "",
        timestamp: row.event_timestamp || "",
        actorEmployeeId: row.actor_employee_id || "",
        actorEmail: row.actor_email || "",
        actorName: employeeNames.get(String(row.actor_employee_id || ""))
          || row.actor_email
          || row.actor_employee_id
          || "System",
        action: row.action || "",
        note: row.reason || after.note || "",
        revisionNumber: Number(after.revisionNumber || after.revision_number || 0),
        result: row.result || "",
      }))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return { ...itinerary, emails, activities };
  }

  async chooseRevisedDocx() {
    const filePath = await this.chooseFile({ docxOnly: true, title: "Choose Revised Itinerary DOCX" });
    if (!filePath) return { canceled: true };
    if (path.extname(filePath).toLowerCase() !== ".docx") {
      throw new Error("The revised itinerary must be a DOCX file.");
    }
    return { canceled: false, filePath, fileName: path.basename(filePath) };
  }

  async postItineraryRevision(input) {
    const code = String(input.customerCode || "").trim().toUpperCase();
    const note = String(input.revisionNote || "").trim();
    const filePath = String(input.filePath || "");
    const driveFileId = String(input.driveFileId || "");
    if (!code || !note || !filePath || !driveFileId) {
      throw new Error("Customer Code, revised DOCX, revision note, and Drive File ID are required.");
    }
    if (!fs.existsSync(filePath) || path.extname(filePath).toLowerCase() !== ".docx") {
      throw new Error("The selected revised DOCX is no longer available.");
    }
    const content = fs.readFileSync(filePath);
    await this.authorizedFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(driveFileId)}?uploadType=media&keepRevisionForever=true`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
        body: content,
      },
    );
    const revisionPayload = await this.authorizedFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}/revisions?fields=revisions(id,modifiedTime,keepForever)`,
    );
    const revisionNumber = Math.max(Number(input.currentRevision || 0) + 1, revisionPayload.revisions?.length || 1);
    const revisionId = `REV-${crypto.randomUUID()}`;
    const postedAt = new Date().toISOString();
    await this.appendRevisionRecord({
      revision_id: revisionId,
      tour_id: input.tourId || "",
      revision_number: revisionNumber,
      revision_type: "ITINERARY_REVISION",
      revision_notes: note,
      affected_departments: "ALL",
      drive_file_id: driveFileId,
      drive_version_reference: String(revisionPayload.revisions?.at(-1)?.id || ""),
      base_record_version: Number(input.currentRevision || 0),
      revision_status: "PUBLISHED",
      submitted_at: postedAt,
      submitted_by: this.database.getPublicSettings().employeeId || "",
      published_at: postedAt,
      published_by: this.database.getPublicSettings().employeeId || "",
    });
    let activityWarning = "";
    try {
      await this.recordItineraryEvent({
        eventId: revisionId,
        eventType: "REVISION",
        customerCode: code,
        tourId: input.tourId || "",
        driveFileId,
        driveFileName: path.basename(filePath),
        revisionNumber,
        note,
      });
    } catch (error) {
      activityWarning = `Revision posted, but notification/log delivery needs attention: ${error.message}`;
    }
    return {
      ok: true,
      revisionNumber,
      revisionId,
      driveFileId,
      driveFileUrl: input.driveFileUrl || `https://drive.google.com/open?id=${driveFileId}`,
      activityWarning,
    };
  }

  async downloadLatestItinerary(input) {
    const code = String(input.customerCode || "").trim().toUpperCase();
    const driveFileId = String(input.driveFileId || "").trim();
    if (!code || !driveFileId) throw new Error("Load a Customer Code before downloading its itinerary.");
    const response = await this.authorizedRawFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`,
    );
    const content = Buffer.from(await response.arrayBuffer());
    const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    const revisionNumber = Number(input.currentRevision || 0);
    const baseName = sanitizeFilePart(
      `${parseCustomerCode(code).fileNameCode} - ${input.customerName || "Itinerary"} - REV ${revisionNumber} - ${stamp}`,
    );
    const folderPath = this.ensureDownloadDirectory();
    const fileName = `${baseName}.docx`;
    const localPath = path.join(folderPath, fileName);
    fs.writeFileSync(localPath, content);
    let activityWarning = "";
    try {
      await this.recordItineraryEvent({
        eventId: `DWL-${crypto.randomUUID()}`,
        eventType: "DOWNLOAD",
        customerCode: code,
        tourId: input.tourId || "",
        driveFileId,
        driveFileName: input.driveFileName || "",
        downloadedFileName: fileName,
        revisionNumber,
        note: `Downloaded latest itinerary REV ${revisionNumber}.`,
      });
    } catch (error) {
      activityWarning = `File downloaded, but download log delivery needs attention: ${error.message}`;
    }
    return { ok: true, localPath, folderPath, fileName, activityWarning };
  }

  ensureDownloadDirectory() {
    fs.mkdirSync(this.downloadDirectory, { recursive: true });
    return this.downloadDirectory;
  }

  async listNotifications() {
    const settings = this.database.getPublicSettings();
    const employeeId = String(settings.employeeId || "");
    if (!employeeId || !settings.spreadsheetId || !this.authService?.status().connected) return [];
    const [notifications, recipients] = await Promise.all([
      this.sheetRecords("NOTIFICATIONS"),
      this.sheetRecords("NOTIF_RECIPIENTS"),
    ]);
    const recipientByNotification = new Map(
      recipients
        .filter((row) => String(row.employee_id || "") === employeeId)
        .map((row) => [String(row.notification_id || ""), row]),
    );
    return notifications
      .filter((row) => recipientByNotification.has(String(row.notification_id || "")))
      .map((row) => {
        const recipient = recipientByNotification.get(String(row.notification_id || ""));
        return {
          notificationId: row.notification_id || "",
          tourId: row.tour_id || "",
          revisionId: row.revision_id || "",
          type: row.notification_type || "",
          title: row.title || "ERIM-PSH notification",
          message: row.message || "",
          createdAt: row.created_at || "",
          readAt: recipient.read_at || "",
          deliveryStatus: recipient.delivery_status || "",
          actionUrl: row.action_url || "",
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);
  }

  async recordItineraryEvent(details) {
    return this.callAppsScript("itinerary.event", details);
  }

  async callAppsScript(action, details = {}) {
    const settings = this.database.getPublicSettings();
    if (!settings.apiBaseUrl) throw new Error("Apps Script API URL is not configured.");
    const accessToken = await this.authService.accessToken();
    const response = await fetch(settings.apiBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action,
        apiVersion: "v1",
        clientMode: "DESKTOP",
        auth: { accessToken },
        ...details,
      }),
      redirect: "follow",
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      const contentType = response.headers.get("content-type") || "unknown content type";
      throw new Error(
        `Apps Script endpoint returned HTTP ${response.status} (${contentType}) instead of JSON. `
        + "The local Supplier Master cache remains available; verify the active Web App deployment.",
      );
    }
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error?.message || `Apps Script returned HTTP ${response.status}.`);
    }
    return payload.data;
  }

  async syncReservationKpi(followup) {
    const settings = this.database.getPublicSettings();
    const sheetName = "RESERVATION_KPI";
    const range = encodeURIComponent(`${sheetName}!A:S`);
    const payload = await this.authorizedFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(settings.spreadsheetId)}/values/${range}`,
    );
    const [headers = [], ...rows] = payload.values || [];
    if (!headers.length || !headers.includes("followup_id")) {
      throw new Error("RESERVATION_KPI headers are not configured.");
    }
    const followupIndex = headers.indexOf("followup_id");
    const existingIndex = rows.findIndex((row) => String(row[followupIndex] || "") === followup.followup_id);
    const rowNumber = existingIndex >= 0 ? existingIndex + 2 : rows.length + 2;
    const status = followup.status || "PENDING";
    const record = {
      kpi_record_id: `KPI-${followup.followup_id}`,
      followup_id: followup.followup_id,
      customer_code: followup.customer_code,
      tour_id: followup.tour_id || "",
      source_type: followup.source_type,
      source_reference_id: followup.source_reference_id || "",
      reservation_employee_id: settings.employeeId || "",
      reservation_employee_name: settings.employeeName || "",
      status,
      started_at: followup.started_at,
      pending_hours: pendingHoursFormula(rowNumber),
      kpi_band: kpiBandFormula(rowNumber),
      waiting_for_department: followup.waiting_for_department || "",
      pending_reason: followup.pending_reason || "",
      last_followup_at: followup.updated_at,
      resolved_at: followup.resolved_at || "",
      resolution_hours: resolutionHoursFormula(rowNumber),
      updated_at: followup.updated_at,
      recorded_by_email: this.authService.status().email || "",
    };
    const values = headers.map((header) => record[header] ?? "");
    const target = encodeURIComponent(`${sheetName}!A${rowNumber}:S${rowNumber}`);
    await this.authorizedFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(settings.spreadsheetId)}/values/${target}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range: `${sheetName}!A${rowNumber}:S${rowNumber}`, majorDimension: "ROWS", values: [values] }),
      },
    );
    return { ok: true, rowNumber, followupId: followup.followup_id };
  }

  async appendRevisionRecord(record) {
    const { spreadsheetId } = this.database.getPublicSettings();
    const headerPayload = await this.authorizedFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent("ITINERARY_REVISIONS!1:1")}`,
    );
    const headers = headerPayload.values?.[0] || [];
    const values = headers.map((header) => record[header] ?? "");
    await this.authorizedFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent("ITINERARY_REVISIONS!A:ZZ")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: [values] }),
      },
    );
  }
}

function buildVendorDays(arrivalDate, departureDate) {
  const start = new Date(`${arrivalDate || ""}T00:00:00Z`);
  const end = new Date(`${departureDate || ""}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const days = [];
  for (let cursor = start.getTime(), dayNumber = 1; cursor <= end.getTime(); cursor += 86_400_000, dayNumber += 1) {
    days.push({
      tourDayId: "",
      dayNumber,
      serviceDate: new Date(cursor).toISOString().slice(0, 10),
      daywiseText: "",
      status: "DRAFT",
      splits: [],
    });
  }
  return days;
}

function dashboardTourItem(source, tour = {}, extra = {}) {
  return {
    customerCode: tour.customer_code || source.customer_code || "",
    customerName: tour.client_name || tour.customer_name || source.client_name || "",
    tourId: tour.tour_id || source.tour_id || "",
    arrivalDate: tour.arrival_date || source.arrival_date || "",
    status: source.status || tour.overall_status || tour.status || "",
    updatedAt: source.updated_at || source.published_at || source.created_at || "",
    ...extra,
  };
}

function mimeTypeFor(extension) {
  return ({
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })[extension] || "application/octet-stream";
}

function firstValue(record, keys) {
  for (const key of keys) {
    if (record?.[key]) return record[key];
  }
  return "";
}

function uniqueSortedStrings(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function masterDataChecksum(toc, vendorRates) {
  const normalized = [
    "TOC_MASTER",
    ...toc.map((row) => [
      row.tocId, row.tocName, row.adultRateIdr ?? "", row.childRateIdr ?? "",
      row.childAge, row.notes, row.validTo, row.sourceSheet, row.sourceRow ?? "",
    ].map((value) => String(value ?? "")).join("\u001f")),
    "VENDOR_RATE_MASTER",
    ...vendorRates.map((row) => [
      row.vendorRateId, row.serviceName, row.vendorName, row.adultRateIdr ?? "",
      row.childRateIdr ?? "", row.notes, row.description, row.contractValidity,
      row.validTo, row.sourceSheet, row.sourceRow ?? "",
    ].map((value) => String(value ?? "")).join("\u001f")),
  ].join("\n");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeDocumentHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+=(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/javascript:/gi, "");
}

function extractGmailBody(payload) {
  const candidates = [];
  const attachments = [];
  const visit = (part) => {
    if (!part) return;
    if (part.filename) attachments.push(part.filename);
    if (part.body?.data && ["text/html", "text/plain"].includes(part.mimeType)) {
      candidates.push({
        mimeType: part.mimeType,
        text: Buffer.from(part.body.data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
      });
    }
    (part.parts || []).forEach(visit);
  };
  visit(payload);
  const html = candidates.find((part) => part.mimeType === "text/html");
  const plain = candidates.find((part) => part.mimeType === "text/plain");
  return {
    html: html
      ? sanitizeDocumentHtml(html.text)
      : `<pre>${escapeHtmlText(plain?.text || "(No readable message body)")}</pre>`,
    attachments,
  };
}

function escapeHtmlText(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function parseCustomerCode(value) {
  const customerCode = String(value || "").trim().toUpperCase();
  const separator = customerCode.indexOf("/");
  const salesCode = separator > 0 ? customerCode.slice(0, separator).trim() : "";
  const fileCode = separator > 0 ? customerCode.slice(separator + 1).trim() : customerCode;
  return {
    customerCode,
    salesCode,
    fileCode,
    fileNameCode: sanitizeFilePart(customerCode),
  };
}

function sanitizeFilePart(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .replace(/^[ .-]+|[ .-]+$/g, "")
    .trim();
}

function pendingHoursFormula(row) {
  return `=IF($J${row}="","",IF($I${row}="PENDING",(NOW()-VALUE(SUBSTITUTE(LEFT($J${row},19),"T"," ")))*24,IF($P${row}="",0,(VALUE(SUBSTITUTE(LEFT($P${row},19),"T"," "))-VALUE(SUBSTITUTE(LEFT($J${row},19),"T"," ")))*24)))`;
}

function kpiBandFormula(row) {
  return `=IF($I${row}="","",IF($I${row}="RESOLVED","RESOLVED",IF($K${row}<24,"ON_TRACK",IF($K${row}<48,"ATTENTION","OVERDUE"))))`;
}

function resolutionHoursFormula(row) {
  return `=IF(OR($J${row}="",$P${row}=""),"",(VALUE(SUBSTITUTE(LEFT($P${row},19),"T"," "))-VALUE(SUBSTITUTE(LEFT($J${row},19),"T"," ")))*24)`;
}

module.exports = {
  GoogleWorkspaceService,
  masterDataChecksum,
  parseCustomerCode,
  sanitizeFilePart,
};
