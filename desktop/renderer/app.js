const state = {
  bootstrap: null,
  drafts: [],
  syncQueue: [],
  currentView: "dashboard",
  currentModule: null,
  updateStatus: "DEV_MODE",
  auth: { connected: false, email: "" },
  health: null,
  agentSearchTimer: null,
  revisionContext: null,
  followups: [],
};

const moduleDescriptions = {
  RESERVATION: "Confirmation intake, current itinerary, controlled revision, final checking, and delivery.",
  VENDOR: "Daywise services, supplier split, booking communication, confirmation, and follow-up.",
  TRANSPORT: "Transport requirements, driver and vehicle assignment, rates, TOC, and transporter invoice.",
  OPS_ACCOUNTING: "Quotation linkage, customer invoice, Cost Sheet, reconciliation, and payment request.",
  GENERAL_CASHIER: "Approved request review, payment execution, bank reference, and proof.",
  MANAGER_ADMIN: "Configuration, exceptions, KPI, access, audit, backup, and operational control.",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function toast(message, error = false) {
  const node = $("#toast");
  node.textContent = message;
  node.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.className = "toast"; }, 3400);
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(status) {
  const lower = String(status || "").toLowerCase();
  if (lower.includes("sync") || lower.includes("healthy")) return "synced";
  if (lower.includes("fail")) return "failed";
  if (lower.includes("conflict") || lower.includes("unavailable") || lower.includes("not_configured")) return "conflict";
  return "";
}

function statusPill(value) {
  return `<span class="status ${statusClass(value)}">${escapeHtml(value || "—")}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

function parseOfficeCustomerCode(value) {
  const customerCode = String(value || "").trim().toUpperCase();
  const separator = customerCode.indexOf("/");
  return {
    customerCode,
    salesCode: separator > 0 ? customerCode.slice(0, separator).trim() : "",
    fileCode: separator > 0 ? customerCode.slice(separator + 1).trim() : customerCode,
  };
}

async function refresh() {
  state.bootstrap = await window.erim.bootstrap();
  state.drafts = await window.erim.drafts.list({});
  state.syncQueue = await window.erim.sync.list();
  state.auth = await window.erim.auth.status();
  state.followups = await window.erim.reservation.listFollowups();
  renderChrome();
  renderDashboard();
  renderWorkspace();
  renderReservationFollowups();
  renderPersonalKpi();
  renderSync();
  renderSettings();
}

function renderChrome() {
  const { version, settings } = state.bootstrap;
  $("#version-label").textContent = `Version ${version}`;
  const dummyMode = ["DEV", "ADMIN_DEV"].includes(settings.environment);
  const adminMode = settings.environment === "ADMIN_DEV";
  $("#environment-label").textContent = settings.environment.replace("_", " ");
  $("#user-name").textContent = settings.employeeName;
  $("#user-department").textContent = settings.department;
  $("#user-initials").textContent = settings.employeeName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  $("#sync-nav-count").textContent = state.syncQueue.filter((job) => !["SYNCED", "CANCELED"].includes(job.status)).length;
  $("#google-auth").hidden = dummyMode && !adminMode;
  $("#google-settings").hidden = dummyMode && !adminMode;
  $("#google-auth").textContent = state.auth.connected ? `Google: ${state.auth.email || "Connected"}` : "Connect Google";
}

function renderDashboard() {
  const notifications = buildNotifications();
  $("#inbox-count").textContent = notifications.length;
  $("#notification-inbox").innerHTML = notifications.length ? notifications.map((item) => `
    <article class="notification-item ${item.tone}">
      <span class="notification-dot" aria-hidden="true"></span>
      <div class="notification-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.message)}</p>
      </div>
      <time class="notification-time">${formatDate(item.updatedAt)}</time>
    </article>
  `).join("") : `<div class="empty-notifications">No new notifications.</div>`;
}

function buildNotifications() {
  const notifications = [];
  state.syncQueue
    .filter((job) => ["FAILED", "CONFLICT", "PENDING_SYNC"].includes(job.status))
    .forEach((job) => notifications.push({
      tone: job.status === "PENDING_SYNC" ? "" : "attention",
      title: `${job.customer_code} · ${job.status.replaceAll("_", " ")}`,
      message: job.last_error_message || `${job.module.replaceAll("_", " ")} publication requires attention.`,
      updatedAt: job.updated_at,
    }));
  state.drafts
    .filter((draft) => draft.local_status === "READY_TO_POST" && draft.sync_status !== "PENDING_SYNC")
    .forEach((draft) => notifications.push({
      tone: "",
      title: `${draft.customer_code} · Ready to publish`,
      message: `${draft.module.replaceAll("_", " ")} work is waiting to enter the publication queue.`,
      updatedAt: draft.updated_at,
    }));
  state.followups
    .filter((item) => item.status === "PENDING" && Number(item.pendingHours || 0) >= 24)
    .forEach((item) => notifications.push({
      tone: Number(item.pendingHours || 0) >= 48 ? "attention" : "",
      title: `${item.customer_code} · Reservation follow-up`,
      message: item.pending_reason || "Pending reason has not been recorded.",
      updatedAt: item.updated_at,
    }));
  return notifications.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function renderWorkspace() {
  if (!state.currentModule) return;
  $("#workspace-title").textContent = state.currentModule.replaceAll("_", " ");
  $("#workspace-description").textContent = moduleDescriptions[state.currentModule];
  const rows = state.drafts.filter((draft) => draft.module === state.currentModule);
  $("#workspace-table").innerHTML = rows.length ? rows.map((draft) => `
    <tr>
      <td><strong>${escapeHtml(draft.customer_code)}</strong></td>
      <td>${escapeHtml(draft.work_type)}</td>
      <td>${escapeHtml(draft.title)}</td>
      <td>${statusPill(draft.local_status)}</td>
      <td>${statusPill(draft.sync_status)}</td>
      <td>${formatDate(draft.updated_at)}</td>
      <td>${draftActions(draft)}</td>
    </tr>
  `).join("") : `<tr><td class="empty" colspan="7">No ${escapeHtml(state.currentModule)} drafts on this PC.</td></tr>`;
}

function renderReservationFollowups() {
  const panel = $("#reservation-followup-panel");
  panel.hidden = state.currentModule !== "RESERVATION";
  if (panel.hidden) return;
  const rows = state.followups.filter((item) => item.status === "PENDING");
  $("#reservation-followup-table").innerHTML = rows.length ? rows.map((item) => {
    const hours = Number(item.pendingHours || 0);
    const kpi = hours < 24
      ? { label: "ON TRACK", className: "kpi-good" }
      : hours < 48
        ? { label: "ATTENTION", className: "kpi-attention" }
        : { label: "OVERDUE", className: "kpi-overdue" };
    return `
      <tr data-followup-id="${escapeHtml(item.followup_id)}">
        <td><strong>${escapeHtml(item.customer_code)}</strong></td>
        <td>${escapeHtml(item.source_type.replaceAll("_", " "))}</td>
        <td class="pending-age ${kpi.className}">${formatPendingAge(hours)}</td>
        <td><strong class="${kpi.className}">${kpi.label}</strong></td>
        <td><input class="followup-department" data-field="waitingForDepartment" value="${escapeHtml(item.waiting_for_department || "")}" placeholder="Department / person" /></td>
        <td><input class="followup-reason" data-field="pendingReason" value="${escapeHtml(item.pending_reason || "")}" placeholder="Wajib diisi bila pending" /></td>
        <td><div class="row-actions"><button data-action="save-followup" data-id="${escapeHtml(item.followup_id)}">Save</button><button data-action="resolve-followup" data-id="${escapeHtml(item.followup_id)}">Resolve</button></div></td>
      </tr>
    `;
  }).join("") : `<tr><td class="empty" colspan="7">No pending Reservation follow-up.</td></tr>`;
}

function formatPendingAge(hours) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 24) return `${Math.floor(hours)} hr`;
  return `${Math.floor(hours / 24)} day ${Math.floor(hours % 24)} hr`;
}

function renderPersonalKpi() {
  const items = state.followups;
  const pending = items.filter((item) => item.status === "PENDING");
  const onTrack = pending.filter((item) => Number(item.pendingHours || 0) < 24);
  const attention = pending.filter((item) => Number(item.pendingHours || 0) >= 24 && Number(item.pendingHours || 0) < 48);
  const overdue = pending.filter((item) => Number(item.pendingHours || 0) >= 48);
  const missingReason = pending.filter((item) => !String(item.pending_reason || "").trim());
  $("#personal-kpi-owner").textContent = `${state.bootstrap.settings.employeeName} · ${state.bootstrap.settings.employeeId}`;
  $("#personal-kpi-total").textContent = items.length;
  $("#personal-kpi-pending").textContent = pending.length;
  $("#personal-kpi-ontrack").textContent = onTrack.length;
  $("#personal-kpi-attention").textContent = attention.length;
  $("#personal-kpi-overdue").textContent = overdue.length;
  $("#personal-kpi-missing-reason").textContent = `${missingReason.length} missing reason`;
  $("#personal-kpi-table").innerHTML = items.length ? items.map((item) => {
    const hours = Number(item.pendingHours || 0);
    const kpi = item.status === "RESOLVED"
      ? { label: "RESOLVED", className: "kpi-good" }
      : hours < 24
        ? { label: "ON TRACK", className: "kpi-good" }
        : hours < 48
          ? { label: "ATTENTION", className: "kpi-attention" }
          : { label: "OVERDUE", className: "kpi-overdue" };
    return `
      <tr>
        <td><strong>${escapeHtml(item.customer_code)}</strong></td>
        <td>${escapeHtml(item.source_type.replaceAll("_", " "))}</td>
        <td>${statusPill(item.status)}</td>
        <td class="pending-age ${kpi.className}">${item.status === "RESOLVED" ? "Completed" : formatPendingAge(hours)}</td>
        <td><strong class="${kpi.className}">${kpi.label}</strong></td>
        <td>${escapeHtml(item.waiting_for_department || "—")}</td>
        <td>${escapeHtml(item.pending_reason || "Belum diisi")}</td>
        <td>${formatDate(item.updated_at)}</td>
      </tr>
    `;
  }).join("") : `<tr><td class="empty" colspan="8">Belum ada record KPI Reservation pada komputer ini.</td></tr>`;
}

function renderSync() {
  $("#sync-table").innerHTML = state.syncQueue.length ? state.syncQueue.map((job) => `
    <tr>
      <td><strong>${escapeHtml(job.customer_code)}</strong></td>
      <td>${escapeHtml(job.module)}</td>
      <td>${escapeHtml(job.operation)}</td>
      <td>${statusPill(job.status)}</td>
      <td>${escapeHtml(job.sync_mode || "—")}</td>
      <td>${job.attempts}</td>
      <td>${escapeHtml(job.last_error_message || "—")}</td>
      <td>${formatDate(job.updated_at)}</td>
    </tr>
  `).join("") : `<tr><td class="empty" colspan="8">Nothing is queued for publication.</td></tr>`;
}

function renderSettings() {
  const { settings, databasePath } = state.bootstrap;
  const form = $("#settings-form");
  for (const [key, value] of Object.entries(settings)) {
    if (form.elements[key]) form.elements[key].value = value || "";
  }
  $("#database-path").textContent = databasePath;
}

function renderHealth() {
  if (!state.health) return;
  $("#health-healthy").textContent = state.health.summary.healthy;
  $("#health-attention").textContent = state.health.summary.attention;
  $("#health-failed").textContent = state.health.summary.failed;
  $("#health-checked").textContent = formatDate(state.health.checkedAt);
  $("#health-grid").innerHTML = state.health.checks.map((check) => `
    <article class="health-card">
      <div class="health-heading">
        <strong>${escapeHtml(check.name)}</strong>
        ${statusPill(check.status)}
      </div>
      <p>${escapeHtml(check.detail)}</p>
      <small>${Number(check.latencyMs || 0)} ms</small>
    </article>
  `).join("");
}

function draftActions(draft) {
  const buttons = [`<button data-action="edit" data-id="${draft.draft_id}">Open</button>`];
  if (draft.local_status === "LOCAL_DRAFT") buttons.push(`<button data-action="ready" data-id="${draft.draft_id}">Mark ready</button>`);
  if (draft.local_status === "READY_TO_POST" && draft.sync_status !== "PENDING_SYNC") buttons.push(`<button data-action="queue" data-id="${draft.draft_id}">Queue publish</button>`);
  return `<div class="row-actions">${buttons.join("")}</div>`;
}

function showView(view, module = null) {
  state.currentView = view;
  state.currentModule = module;
  $$(".view").forEach((node) => node.classList.toggle("active", node.id === `${view}-view`));
  $$(".nav-item").forEach((node) => node.classList.toggle("active", node.dataset.view === view && (!module || node.dataset.module === module)));
  const titles = {
    dashboard: ["Local workspace", "Operations dashboard"],
    workspace: ["Department workspace", module?.replaceAll("_", " ") || "Workspace"],
    sync: ["Publication safety", "Sync Center"],
    admin: ["Administrator diagnostics", "Backend connection console"],
    settings: ["Application configuration", "Desktop settings"],
    "reservation-kpi": ["Reservation personal performance", "KPI Saya"],
  };
  $("#view-eyebrow").textContent = titles[view][0];
  $("#view-title").textContent = titles[view][1];
  renderWorkspace();
  renderReservationFollowups();
  renderPersonalKpi();
}

function openDraftDialog(module = null) {
  const form = $("#draft-form");
  form.reset();
  form.elements.draftId.value = "";
  form.elements.module.value = module || state.bootstrap.settings.department;
  $("#draft-dialog-title").textContent = "New local draft";
  $("#draft-dialog").showModal();
}

function openItineraryDialog(action) {
  const form = $("#itinerary-form");
  const isRevision = action === "revise";
  form.reset();
  form.elements.action.value = action;
  form.elements.agentId.value = "";
  form.elements.confirmationMessageId.value = "";
  form.elements.confirmationThreadId.value = "";
  form.elements.confirmationSubject.value = "";
  form.elements.driveFileId.value = "";
  form.elements.driveFileName.value = "";
  form.elements.driveFileUrl.value = "";
  $("#agent-suggestions").hidden = true;
  $("#add-agent-name").hidden = true;
  $("#confirmation-email-results").innerHTML = `<span class="muted-text">No email selected.</span>`;
  $("#confirmation-thread-trail").hidden = true;
  $("#confirmation-thread-trail").innerHTML = "";
  $("#itinerary-upload-result").className = "upload-result muted-text";
  $("#itinerary-upload-result").textContent = "No file uploaded.";
  $("#itinerary-dialog-title").textContent = isRevision ? "Revise Itinerary" : "Add New Itinerary";
  $("#save-itinerary").textContent = isRevision ? "Start revision" : "Create itinerary";
  $("#itinerary-dialog").showModal();
  form.elements.customerCode.focus();
}

function openRevisionDialog() {
  const form = $("#revision-form");
  form.reset();
  state.revisionContext = null;
  $("#revision-record").hidden = true;
  $("#post-revision").disabled = true;
  $("#revised-docx-result").className = "upload-result muted-text";
  $("#revised-docx-result").textContent = "No revised file selected.";
  $("#revision-dialog").showModal();
  form.elements.customerCode.focus();
}

async function loadRevisionRecord() {
  const form = $("#revision-form");
  const code = form.elements.customerCode.value.trim();
  const button = $("#load-revision-record");
  button.disabled = true;
  button.textContent = "Loading…";
  try {
    const context = await window.erim.workspace.getRevisionContext(code);
    state.revisionContext = context;
    $("#revision-customer").textContent = context.customerName || context.customerCode;
    $("#revision-tour-status").textContent = context.tourStatus || "—";
    $("#revision-current-number").textContent = `REV ${context.currentRevision}`;
    $("#revision-drive-link").href = context.driveFileUrl;
    $("#old-itinerary-name").textContent = context.driveFileName || "Current itinerary";
    $("#old-itinerary-content").innerHTML = context.documentHtml || `<p>No readable DOCX content.</p>`;
    $("#revision-daywise").innerHTML = context.days.length ? context.days.map((day) => `
      <tr>
        <td><strong>${escapeHtml(day.dayNumber)}</strong></td>
        <td>${escapeHtml(day.date || "—")}</td>
        <td>${escapeHtml(day.title || "—")}</td>
        <td>${statusPill(day.status)}</td>
      </tr>
    `).join("") : `<tr><td class="empty" colspan="4">No daywise records found.</td></tr>`;
    $("#revision-record").hidden = false;
    $("#post-revision").disabled = !form.elements.revisedFilePath.value;
  } catch (error) {
    state.revisionContext = null;
    $("#revision-record").hidden = true;
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Find record";
  }
}

async function chooseRevisedDocx() {
  try {
    const selected = await window.erim.workspace.chooseRevisedDocx();
    if (selected.canceled) return;
    const form = $("#revision-form");
    form.elements.revisedFilePath.value = selected.filePath;
    const result = $("#revised-docx-result");
    result.className = "upload-result success";
    result.textContent = `Selected: ${selected.fileName}`;
    $("#post-revision").disabled = !state.revisionContext;
  } catch (error) {
    toast(error.message, true);
  }
}

async function searchAgents(value) {
  const form = $("#itinerary-form");
  const suggestions = $("#agent-suggestions");
  const addButton = $("#add-agent-name");
  form.elements.agentId.value = "";
  if (!value.trim()) {
    suggestions.hidden = true;
    addButton.hidden = true;
    return;
  }
  try {
    const agents = await window.erim.workspace.searchAgents(value);
    suggestions.innerHTML = agents.map((agent) => `
      <button type="button" class="suggestion-item" data-agent-id="${escapeHtml(agent.agentId)}" data-agent-name="${escapeHtml(agent.agentName)}">
        <strong>${escapeHtml(agent.agentName)}</strong>
        <small>${escapeHtml([agent.market, agent.contactName].filter(Boolean).join(" · "))}</small>
      </button>
    `).join("");
    suggestions.hidden = agents.length === 0;
    addButton.hidden = agents.length > 0;
  } catch (error) {
    suggestions.hidden = true;
    addButton.hidden = false;
    toast(error.message, true);
  }
}

async function findConfirmationEmails() {
  const form = $("#itinerary-form");
  const code = form.elements.customerCode.value.trim();
  const button = $("#search-confirmation-email");
  const results = $("#confirmation-email-results");
  button.disabled = true;
  button.textContent = "Searching…";
  results.innerHTML = `<span class="muted-text">Searching Gmail…</span>`;
  try {
    const messages = await window.erim.workspace.searchConfirmationEmails(code);
    results.innerHTML = messages.length ? messages.map((message) => `
      <button type="button" class="selection-item"
        data-message-id="${escapeHtml(message.messageId)}"
        data-thread-id="${escapeHtml(message.threadId)}"
        data-subject="${escapeHtml(message.subject)}">
        <strong>${escapeHtml(message.subject)}</strong>
        <small>${escapeHtml([message.from, message.date].filter(Boolean).join(" · "))}</small>
      </button>
    `).join("") : `<span class="muted-text">No Gmail subject found for ${escapeHtml(code)}.</span>`;
  } catch (error) {
    results.innerHTML = `<span class="muted-text">Email search failed.</span>`;
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Find email";
  }
}

async function loadConfirmationTrail(threadId) {
  const trail = $("#confirmation-thread-trail");
  trail.hidden = false;
  trail.innerHTML = `<div class="email-message muted-text">Loading complete email trail…</div>`;
  try {
    const thread = await window.erim.workspace.getGmailThread(threadId);
    trail.innerHTML = thread.messages.map((message, index) => `
      <article class="email-message">
        <div class="email-message-heading">
          <strong>${index + 1}. ${escapeHtml(message.subject)}</strong>
          <span>From: ${escapeHtml(message.from || "—")}</span>
          <span>To: ${escapeHtml(message.to || "—")}</span>
          <small>${escapeHtml(message.date || "—")}</small>
        </div>
        <div class="email-message-body">${message.bodyHtml}</div>
        ${message.attachments.length ? `<small>Attachments: ${escapeHtml(message.attachments.join(", "))}</small>` : ""}
      </article>
    `).join("");
  } catch (error) {
    trail.innerHTML = `<div class="email-message muted-text">Unable to load this email trail.</div>`;
    toast(error.message, true);
  }
}

async function saveFollowup(id) {
  const row = document.querySelector(`[data-followup-id="${CSS.escape(id)}"]`);
  try {
    await window.erim.reservation.updateFollowup(id, {
      waitingForDepartment: row.querySelector('[data-field="waitingForDepartment"]').value,
      pendingReason: row.querySelector('[data-field="pendingReason"]').value,
    });
    await refresh();
    toast("Pending reason saved.");
  } catch (error) {
    toast(error.message, true);
  }
}

async function resolveFollowup(id) {
  try {
    await window.erim.reservation.resolveFollowup(id);
    await refresh();
    toast("Reservation follow-up resolved.");
  } catch (error) {
    toast(error.message, true);
  }
}

async function postItineraryFile() {
  const form = $("#itinerary-form");
  const button = $("#post-itinerary-file");
  button.disabled = true;
  button.textContent = "Uploading…";
  try {
    const uploaded = await window.erim.workspace.uploadItinerary({
      customerCode: form.elements.customerCode.value,
      customerName: form.elements.customerName.value,
    });
    if (uploaded.canceled) return;
    form.elements.driveFileId.value = uploaded.driveFileId;
    form.elements.driveFileName.value = uploaded.fileName;
    form.elements.driveFileUrl.value = uploaded.webViewLink;
    const result = $("#itinerary-upload-result");
    result.className = "upload-result success";
    result.textContent = `Uploaded: ${uploaded.fileName}`;
    toast("Soft copy itinerary uploaded to Google Drive.");
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Post Soft Copy Itinerary";
  }
}

async function editDraft(id) {
  const draft = await window.erim.drafts.get(id);
  if (!draft) return;
  const form = $("#draft-form");
  form.reset();
  const payload = draft.payload || {};
  form.elements.draftId.value = draft.draft_id;
  form.elements.customerCode.value = draft.customer_code;
  form.elements.module.value = draft.module;
  form.elements.workType.value = draft.work_type;
  form.elements.title.value = draft.title;
  form.elements.details.value = payload.details || "";
  form.elements.confirmationEmailUrl.value = payload.confirmationEmailUrl || "";
  form.elements.quotationEmailUrl.value = payload.quotationEmailUrl || "";
  form.elements.bookingChannel.value = payload.bookingChannel || "";
  form.elements.externalReference.value = payload.externalReference || "";
  form.elements.basePublicationId.value = draft.base_publication_id || "";
  form.elements.baseRecordVersion.value = draft.base_record_version || "";
  $("#draft-dialog-title").textContent = `Edit ${draft.customer_code}`;
  $("#draft-dialog").showModal();
}

async function handleDraftAction(action, id) {
  try {
    if (action === "edit") return editDraft(id);
    if (action === "ready") await window.erim.drafts.markReady(id);
    if (action === "queue") await window.erim.sync.queue(id);
    await refresh();
    toast(action === "ready" ? "Draft is ready to publish." : "Draft added to the publication queue.");
  } catch (error) {
    toast(error.message, true);
  }
}

function bindEvents() {
  $("#main-nav").addEventListener("click", (event) => {
    const reservationAction = event.target.closest("[data-reservation-action]");
    if (reservationAction?.dataset.reservationAction === "kpi") {
      state.currentModule = "RESERVATION";
      showView("reservation-kpi", "RESERVATION");
      return;
    }
    const itineraryAction = event.target.closest("[data-itinerary-action]");
    if (itineraryAction) {
      showView("workspace", "RESERVATION");
      if (itineraryAction.dataset.itineraryAction === "revise") openRevisionDialog();
      else openItineraryDialog("new");
      return;
    }
    const button = event.target.closest(".nav-item");
    if (button) showView(button.dataset.view, button.dataset.module || null);
  });
  $("#workspace-new-draft").addEventListener("click", () => {
    if (state.currentModule === "RESERVATION") openItineraryDialog("new");
    else openDraftDialog(state.currentModule);
  });
  $("#close-dialog").addEventListener("click", () => $("#draft-dialog").close());
  $("#cancel-dialog").addEventListener("click", () => $("#draft-dialog").close());
  $("#close-itinerary-dialog").addEventListener("click", () => $("#itinerary-dialog").close());
  $("#cancel-itinerary-dialog").addEventListener("click", () => $("#itinerary-dialog").close());
  $("#close-revision-dialog").addEventListener("click", () => $("#revision-dialog").close());
  $("#cancel-revision-dialog").addEventListener("click", () => $("#revision-dialog").close());
  $("#load-revision-record").addEventListener("click", loadRevisionRecord);
  $("#revision-form").elements.customerCode.addEventListener("change", loadRevisionRecord);
  $("#choose-revised-docx").addEventListener("click", chooseRevisedDocx);
  $("#itinerary-form").elements.agentName.addEventListener("input", (event) => {
    clearTimeout(state.agentSearchTimer);
    state.agentSearchTimer = setTimeout(() => searchAgents(event.target.value), 280);
  });
  $("#itinerary-form").elements.customerCode.addEventListener("change", (event) => {
    if (event.target.value.trim()) findConfirmationEmails();
  });
  $("#agent-suggestions").addEventListener("click", (event) => {
    const selected = event.target.closest("[data-agent-id]");
    if (!selected) return;
    const form = $("#itinerary-form");
    form.elements.agentName.value = selected.dataset.agentName;
    form.elements.agentId.value = selected.dataset.agentId;
    $("#agent-suggestions").hidden = true;
    $("#add-agent-name").hidden = true;
  });
  $("#add-agent-name").addEventListener("click", () => {
    const form = $("#itinerary-form");
    if (!form.elements.agentName.value.trim()) return;
    form.elements.agentId.value = "";
    $("#add-agent-name").hidden = true;
    toast("New Agent Name selected; it will be flagged for master-data registration.");
  });
  $("#search-confirmation-email").addEventListener("click", findConfirmationEmails);
  $("#confirmation-email-results").addEventListener("click", (event) => {
    const selected = event.target.closest("[data-message-id]");
    if (!selected) return;
    const form = $("#itinerary-form");
    form.elements.confirmationMessageId.value = selected.dataset.messageId;
    form.elements.confirmationThreadId.value = selected.dataset.threadId;
    form.elements.confirmationSubject.value = selected.dataset.subject;
    $$("#confirmation-email-results .selection-item").forEach((item) => item.classList.toggle("selected", item === selected));
    toast("Confirmation email linked.");
    loadConfirmationTrail(selected.dataset.threadId);
  });
  $("#post-itinerary-file").addEventListener("click", postItineraryFile);

  document.body.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    if (!action) return;
    if (action.dataset.action === "save-followup") return saveFollowup(action.dataset.id);
    if (action.dataset.action === "resolve-followup") return resolveFollowup(action.dataset.id);
    handleDraftAction(action.dataset.action, action.dataset.id);
  });

  $("#draft-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await window.erim.drafts.save({
        draftId: form.get("draftId") || null,
        customerCode: form.get("customerCode"),
        module: form.get("module"),
        workType: form.get("workType"),
        title: form.get("title"),
        basePublicationId: form.get("basePublicationId") || null,
        baseRecordVersion: form.get("baseRecordVersion") ? Number(form.get("baseRecordVersion")) : null,
        payload: {
          details: form.get("details"),
          confirmationEmailUrl: form.get("confirmationEmailUrl"),
          quotationEmailUrl: form.get("quotationEmailUrl"),
          bookingChannel: form.get("bookingChannel"),
          externalReference: form.get("externalReference"),
        },
      });
      $("#draft-dialog").close();
      await refresh();
      toast("Local draft saved.");
    } catch (error) {
      toast(error.message, true);
    }
  });

  $("#itinerary-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsedCode = parseOfficeCustomerCode(form.get("customerCode"));
    const customerCode = parsedCode.customerCode;
    const customerName = String(form.get("customerName") || "").trim();
    const agentName = String(form.get("agentName") || "").trim();
    const isRevision = form.get("action") === "revise";
    try {
      await window.erim.drafts.save({
        customerCode,
        module: "RESERVATION",
        workType: isRevision ? "ITINERARY_REVISION" : "NEW_CONFIRMATION",
        title: isRevision ? `Itinerary revision · ${customerCode}` : `New itinerary · ${customerCode}`,
        payload: {
          details: isRevision
            ? `Controlled itinerary revision initiated for ${customerCode}.`
            : `New itinerary preparation initiated for ${customerCode}.`,
          workflowStage: isRevision ? "REVISION_STARTED" : "ITINERARY_STARTED",
          customerName,
          salesCode: parsedCode.salesCode,
          fileCode: parsedCode.fileCode,
          agentId: form.get("agentId") || "",
          agentName,
          agentRegistrationRequired: Boolean(agentName && !form.get("agentId")),
          confirmationMessageId: form.get("confirmationMessageId") || "",
          confirmationThreadId: form.get("confirmationThreadId") || "",
          confirmationSubject: form.get("confirmationSubject") || "",
          itineraryDriveFileId: form.get("driveFileId") || "",
          itineraryDriveFileName: form.get("driveFileName") || "",
          itineraryDriveFileUrl: form.get("driveFileUrl") || "",
        },
      });
      await window.erim.reservation.startFollowup({
        customerCode,
        sourceType: "NEW_ITINERARY",
        sourceReferenceId: form.get("driveFileId") || "",
      });
      $("#itinerary-dialog").close();
      await refresh();
      showView("workspace", "RESERVATION");
      toast(isRevision ? "Itinerary revision started." : "New itinerary created.");
    } catch (error) {
      toast(error.message, true);
    }
  });

  $("#revision-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const context = state.revisionContext;
    const form = new FormData(event.currentTarget);
    if (!context) return toast("Find the Customer Code record first.", true);
    const button = $("#post-revision");
    button.disabled = true;
    button.textContent = "Posting…";
    try {
      const result = await window.erim.workspace.postItineraryRevision({
        customerCode: context.customerCode,
        tourId: context.tourId,
        driveFileId: context.driveFileId,
        driveFileUrl: context.driveFileUrl,
        currentRevision: context.currentRevision,
        filePath: form.get("revisedFilePath"),
        revisionNote: form.get("revisionNote"),
      });
      await window.erim.reservation.startFollowup({
        customerCode: context.customerCode,
        tourId: context.tourId,
        sourceType: "ITINERARY_REVISION",
        sourceReferenceId: context.driveFileId,
      });
      $("#revision-dialog").close();
      await refresh();
      showView("workspace", "RESERVATION");
      toast(`Itinerary posted as REV ${result.revisionNumber}.`);
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Post";
    }
  });

  $("#settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await window.erim.settings.save(values);
      await refresh();
      toast("Desktop settings saved.");
    } catch (error) {
      toast(error.message, true);
    }
  });

  $("#run-sync").addEventListener("click", async () => {
    const result = await window.erim.sync.run();
    await refresh();
    toast(result.message || (result.ok ? "Publication queue completed." : "Sync requires attention."), !result.ok);
  });

  $("#run-health-check").addEventListener("click", async () => {
    const button = $("#run-health-check");
    button.disabled = true;
    button.textContent = "Checking...";
    try {
      state.health = await window.erim.health.checkAll();
      renderHealth();
      toast("Backend health checks completed.");
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Run all checks";
    }
  });

  $("#google-auth").addEventListener("click", async () => {
    try {
      if (state.auth.connected) await window.erim.auth.logout();
      else await window.erim.auth.login();
      await refresh();
      toast(state.auth.connected
        ? `Google account connected.${state.auth.warning ? ` ${state.auth.warning}` : ""}`
        : "Google account disconnected.");
    } catch (error) {
      toast(error.message, true);
    }
  });

  $("#update-action").addEventListener("click", async () => {
    if (state.updateStatus === "AVAILABLE") await window.erim.updates.download();
    else if (state.updateStatus === "READY_TO_INSTALL") await window.erim.updates.install();
    else await window.erim.updates.check();
  });

  window.erim.updates.onStatus((payload) => {
    state.updateStatus = payload.status;
    const labels = {
      DEV_MODE: "Development mode — updater activates after installation",
      CHECKING: "Checking for updates…",
      CURRENT: `Version ${payload.currentVersion} is current`,
      AVAILABLE: `Version ${payload.version} is available`,
      DOWNLOADING: `Downloading update ${payload.percent || 0}%`,
      READY_TO_INSTALL: `Version ${payload.version} is ready`,
      ERROR: payload.message || "Update check failed",
    };
    $("#update-message").textContent = labels[payload.status] || payload.status;
    const action = $("#update-action");
    action.hidden = !["DEV_MODE", "CURRENT", "AVAILABLE", "READY_TO_INSTALL", "ERROR"].includes(payload.status);
    action.textContent = payload.status === "AVAILABLE" ? "Download" : payload.status === "READY_TO_INSTALL" ? "Restart & install" : "Check update";
  });
}

bindEvents();
refresh().catch((error) => toast(error.message, true));
