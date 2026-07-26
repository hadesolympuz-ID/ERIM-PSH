const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const mammoth = require("mammoth");

class GoogleWorkspaceService {
  constructor({ database, authService, chooseFile }) {
    this.database = database;
    this.authService = authService;
    this.chooseFile = chooseFile;
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
    if (driveFolderId) metadata.parents = [driveFolderId];

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
      tourId: tour.tour_id || "",
      tourStatus: tour.status || tour.tour_status || "",
      days,
      currentRevision: Number(
        latestRevision.revision_number
        || latestRevision.revision_no
        || matchingRevisions.length
        || 0
      ),
      driveFileId,
      driveFileName: metadata.name,
      driveFileUrl: metadata.webViewLink || `https://drive.google.com/open?id=${driveFileId}`,
      modifiedTime: metadata.modifiedTime || "",
      documentHtml: sanitizeDocumentHtml(converted.value),
      conversionWarnings: converted.messages.map((message) => message.message),
    };
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
    await this.appendRevisionRecord({
      revision_id: `REV-${crypto.randomUUID()}`,
      tour_id: input.tourId || "",
      customer_code: code,
      revision_number: revisionNumber,
      revision_no: revisionNumber,
      revision_note: note,
      revision_description: note,
      drive_file_id: driveFileId,
      itinerary_drive_file_id: driveFileId,
      revised_drive_file_id: driveFileId,
      file_name: path.basename(filePath),
      status: "POSTED",
      revised_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      revised_by: this.database.getPublicSettings().employeeId || "",
      created_by: this.database.getPublicSettings().employeeId || "",
    });
    return {
      ok: true,
      revisionNumber,
      driveFileId,
      driveFileUrl: input.driveFileUrl || `https://drive.google.com/open?id=${driveFileId}`,
    };
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

module.exports = { GoogleWorkspaceService, parseCustomerCode, sanitizeFilePart };
