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
  recheckContext: null,
  onlineNotifications: [],
  followups: [],
  vendorDashboard: { urgent: [], pending: [], replied: [], done: [], offline: true },
  vendorIntake: null,
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
  try {
    state.onlineNotifications = state.auth.connected
      ? await window.erim.workspace.listNotifications()
      : [];
  } catch {
    state.onlineNotifications = [];
  }
  try {
    state.vendorDashboard = state.auth.connected
      ? await window.erim.vendor.getDashboard()
      : { urgent: [], pending: [], replied: [], done: [], offline: true };
  } catch {
    state.vendorDashboard = { urgent: [], pending: [], replied: [], done: [], offline: true };
  }
  renderChrome();
  renderDashboard();
  renderVendorDashboard();
  renderVendorInbox();
  renderWorkspace();
  renderReservationFollowups();
  renderPersonalKpi();
  renderSync();
  renderSettings();
  if (state.currentView === "dashboard" && state.bootstrap.settings.department === "VENDOR") {
    showView("vendor-dashboard", "VENDOR");
  }
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
    <article class="notification-item ${item.tone} ${item.actionUrl ? "actionable" : ""}" ${item.actionUrl ? `data-notification-action="${escapeHtml(item.actionUrl)}"` : ""}>
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
  const notifications = state.onlineNotifications.map((item) => ({
    tone: item.readAt ? "" : "success",
    title: item.title,
    message: item.message,
    updatedAt: item.createdAt,
    actionUrl: item.actionUrl || "",
  }));
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

function renderVendorDashboard() {
  const data = state.vendorDashboard || {};
  ["urgent", "pending", "replied", "done"].forEach((bucket) => {
    const items = Array.isArray(data[bucket]) ? data[bucket] : [];
    $(`#vendor-${bucket}-count`).textContent = items.length;
    $(`#vendor-${bucket}-list`).innerHTML = items.length ? items.map((item) => `
      <article class="vendor-dashboard-item">
        <div>
          <strong>${escapeHtml(item.customerCode || "No customer code")}</strong>
          <small>${escapeHtml([
            item.customerName,
            item.serviceName,
            item.arrivalDate ? `Arrival ${item.arrivalDate}` : "",
            item.status,
          ].filter(Boolean).join(" · "))}</small>
        </div>
        ${bucket === "done" ? "" : `<button class="button ghost small" type="button" data-vendor-open-code="${escapeHtml(item.customerCode || "")}">Open</button>`}
      </article>
    `).join("") : `<div class="empty-notifications">${data.offline ? "Connect Google to load online Vendor data." : `No ${bucket} item.`}</div>`;
  });
}

function renderVendorInbox() {
  const notifications = state.onlineNotifications;
  $("#vendor-inbox-count").textContent = notifications.length;
  $("#vendor-notification-inbox").innerHTML = notifications.length ? notifications.map((item) => `
    <article class="notification-item ${item.readAt ? "" : "success"} ${item.actionUrl ? "actionable" : ""}"
      ${item.actionUrl ? `data-notification-action="${escapeHtml(item.actionUrl)}"` : ""}>
      <span class="notification-dot" aria-hidden="true"></span>
      <div class="notification-copy"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p></div>
      <time class="notification-time">${formatDate(item.createdAt)}</time>
    </article>
  `).join("") : `<div class="empty-notifications">No Vendor notifications.</div>`;
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
  $$("[data-vendor-action]").forEach((node) => {
    const map = {
      inbox: "vendor-inbox", generate: "vendor-generate", new: "vendor-new-itinerary",
      revise: "vendor-revise-itinerary", cancel: "vendor-cancel", kpi: "vendor-kpi",
    };
    node.classList.toggle("active", map[node.dataset.vendorAction] === view);
  });
  const titles = {
    dashboard: ["Local workspace", "Operations dashboard"],
    workspace: ["Department workspace", module?.replaceAll("_", " ") || "Workspace"],
    sync: ["Publication safety", "Sync Center"],
    admin: ["Administrator diagnostics", "Backend connection console"],
    settings: ["Application configuration", "Desktop settings"],
    "reservation-recheck": ["Reservation final checking", "Re Check Itinerary"],
    "reservation-kpi": ["Reservation personal performance", "KPI Saya"],
    "vendor-dashboard": ["Vendor Booking", "Daily control dashboard"],
    "vendor-inbox": ["Vendor Booking", "Inbox"],
    "vendor-generate": ["Vendor Booking", "Generate"],
    "vendor-new-itinerary": ["Vendor Booking intake", "New Itinerary"],
    "vendor-revise-itinerary": ["Vendor Booking", "Revise Itinerary"],
    "vendor-cancel": ["Vendor Booking", "Cancel All Service"],
    "vendor-kpi": ["Vendor Booking", "Cek KPI"],
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

async function loadRecheckRecord() {
  const code = $("#recheck-customer-code").value.trim();
  const button = $("#load-recheck-record");
  if (!code) return toast("Input Customer Code first.", true);
  button.disabled = true;
  button.textContent = "Loading...";
  try {
    const context = await window.erim.workspace.getRecheckContext(code);
    state.recheckContext = context;
    $("#recheck-customer").textContent = context.customerName || context.customerCode;
    $("#recheck-tour-status").textContent = context.tourStatus || "—";
    $("#recheck-revision-number").textContent = `REV ${context.currentRevision}`;
    $("#recheck-itinerary-name").textContent = context.driveFileName || "Latest itinerary";
    $("#recheck-drive-link").href = context.driveFileUrl;
    $("#recheck-itinerary-content").innerHTML = context.documentHtml || "<p>No readable DOCX content.</p>";
    $("#recheck-daywise").innerHTML = context.days.length ? context.days.map((day) => `
      <tr>
        <td><strong>${escapeHtml(day.dayNumber)}</strong></td>
        <td>${escapeHtml(day.date || "—")}</td>
        <td>${escapeHtml(day.title || "—")}</td>
        <td>${statusPill(day.status)}</td>
      </tr>
    `).join("") : `<tr><td class="empty" colspan="4">No daywise records found.</td></tr>`;
    $("#recheck-email-panel").innerHTML = context.emails.length ? `
      <div class="selection-list recheck-email-list">
        ${context.emails.map((message) => `
          <button type="button" class="selection-item" data-recheck-thread-id="${escapeHtml(message.threadId)}">
            <strong>${escapeHtml(message.subject)}</strong>
            <small>${escapeHtml([message.from, message.date].filter(Boolean).join(" · "))}</small>
          </button>
        `).join("")}
      </div>
      <div id="recheck-email-trail" class="email-trail" hidden></div>
    ` : `<div class="empty-notifications">No connected email found for ${escapeHtml(context.customerCode)}.</div>`;
    $("#recheck-logbook").innerHTML = context.activities.length ? context.activities.map((activity) => `
      <tr>
        <td>${formatDate(activity.timestamp)}</td>
        <td><strong>${escapeHtml(activity.actorName)}</strong><small class="table-subtext">${escapeHtml(activity.actorEmployeeId || activity.actorEmail)}</small></td>
        <td>${escapeHtml(activity.action.replaceAll("_", " "))}</td>
        <td>${activity.revisionNumber ? `REV ${activity.revisionNumber}` : "NEW"}</td>
        <td>${escapeHtml(activity.note || "—")}</td>
        <td>${statusPill(activity.result)}</td>
      </tr>
    `).join("") : `<tr><td class="empty" colspan="6">No itinerary activity has been recorded.</td></tr>`;
    $("#recheck-record").hidden = false;
  } catch (error) {
    state.recheckContext = null;
    $("#recheck-record").hidden = true;
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Find record";
  }
}

async function loadRecheckEmailTrail(threadId) {
  const trail = $("#recheck-email-trail");
  if (!trail) return;
  trail.hidden = false;
  trail.innerHTML = `<div class="email-message muted-text">Loading complete email trail...</div>`;
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

async function downloadLatestItinerary() {
  if (!state.recheckContext) return toast("Find the Customer Code record first.", true);
  const button = $("#download-latest-itinerary");
  button.disabled = true;
  button.textContent = "Downloading...";
  try {
    const result = await window.erim.workspace.downloadLatestItinerary(state.recheckContext);
    toast(result.activityWarning || `Downloaded: ${result.fileName}`, Boolean(result.activityWarning));
    await loadRecheckRecord();
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Download Latest Itinerary";
  }
}

async function openItineraryDownloadFolder() {
  try {
    await window.erim.workspace.openDownloadFolder();
  } catch (error) {
    toast(error.message, true);
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

function vendorDateRange(arrivalDate, departureDate, existingDays = []) {
  const start = new Date(`${arrivalDate || ""}T00:00:00Z`);
  const end = new Date(`${departureDate || ""}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const existingByDate = new Map(existingDays.map((day) => [day.serviceDate, day]));
  const rows = [];
  for (let cursor = start.getTime(), dayNumber = 1; cursor <= end.getTime(); cursor += 86_400_000, dayNumber += 1) {
    const serviceDate = new Date(cursor).toISOString().slice(0, 10);
    const existing = existingByDate.get(serviceDate) || {};
    rows.push({
      tourDayId: existing.tourDayId || "",
      dayNumber,
      serviceDate,
      daywiseText: existing.daywiseText || "",
      status: existing.status || "DRAFT",
      splits: existing.splits || [],
    });
  }
  return rows;
}

function renderVendorHotels(hotels = []) {
  $("#vendor-hotel-list").innerHTML = hotels.length ? hotels.map((hotel, index) => `
    <div class="hotel-row" data-hotel-stay-id="${escapeHtml(hotel.hotelStayId || "")}">
      <span class="hotel-sequence">#${index + 1}</span>
      <label>Hotel<input data-vendor-hotel-field="hotelName" value="${escapeHtml(hotel.hotelName || "")}" placeholder="Hotel name" /></label>
      <label>Check-in date<input data-vendor-hotel-field="checkInDate" type="date" value="${escapeHtml(hotel.checkInDate || "")}" /></label>
      <label>Check-out date<input data-vendor-hotel-field="checkOutDate" type="date" value="${escapeHtml(hotel.checkOutDate || "")}" /></label>
      <button class="button ghost small" type="button" data-remove-vendor-hotel="${index}">Remove</button>
    </div>
  `).join("") : `<div class="empty-notifications">No hotel extracted. Add hotel manually if required.</div>`;
}

function vendorSplitRow(split = {}, index = 0) {
  const type = String(split.serviceType || "VENDOR").toUpperCase();
  return `
    <div class="vendor-split-row" data-service-id="${escapeHtml(split.serviceId || "")}">
      <select data-vendor-split-field="serviceType" aria-label="Split type">
        ${[
          ["VENDOR", "Vendor"], ["TOC", "TOC"], ["VEHICLE", "Vehicle"],
          ["ADDITIONAL_SERVICES", "Additional Services"],
        ].map(([value, label]) => `<option value="${value}" ${type === value ? "selected" : ""}>${label}</option>`).join("")}
      </select>
      <input data-vendor-split-field="activityText" value="${escapeHtml(split.activityText || "")}" placeholder="Activity / service detail" />
      <input data-vendor-split-field="vendorName" value="${escapeHtml(split.vendorName || "")}" placeholder="Vendor name" />
      <button class="button ghost small" type="button" data-remove-vendor-split="${index}">Remove</button>
    </div>
  `;
}

function renderVendorDays(days = []) {
  $("#vendor-day-list").innerHTML = days.length ? days.map((day) => `
    <article class="vendor-day-card" data-tour-day-id="${escapeHtml(day.tourDayId || "")}" data-day-number="${Number(day.dayNumber)}">
      <div class="vendor-day-heading">
        <strong>Day ${Number(day.dayNumber)}</strong>
        <input data-vendor-day-field="serviceDate" type="date" value="${escapeHtml(day.serviceDate || "")}" />
        <span class="muted-text">${escapeHtml((day.splits || []).length ? `${day.splits.length} split item` : "Not split")}</span>
        <button class="button ghost small" type="button" data-toggle-vendor-split>Split</button>
      </div>
      <textarea data-vendor-day-field="daywiseText" placeholder="Paste Day ${Number(day.dayNumber)} itinerary detail here">${escapeHtml(day.daywiseText || "")}</textarea>
      <div class="vendor-split-panel" ${(day.splits || []).length ? "" : "hidden"}>
        <div class="vendor-split-list">${(day.splits || []).map(vendorSplitRow).join("")}</div>
        <div class="vendor-split-actions"><button class="button ghost small" type="button" data-add-vendor-split>Add split</button></div>
      </div>
    </article>
  `).join("") : `<div class="empty-notifications">Arrival and departure dates must form a valid range.</div>`;
}

function collectVendorIntake() {
  const form = $("#vendor-intake-form");
  const base = state.vendorIntake || {};
  return {
    ...base,
    vendorDraftId: form.elements.vendorDraftId.value,
    customerCode: form.elements.customerCode.value.trim().toUpperCase(),
    customerName: form.elements.customerName.value.trim(),
    adultPax: Number(form.elements.adultPax.value || 0),
    childPax: Number(form.elements.childPax.value || 0),
    infantPax: Number(form.elements.infantPax.value || 0),
    tourId: form.elements.tourId.value,
    sourcePublicationId: form.elements.sourcePublicationId.value,
    sourceRecordVersion: Number(form.elements.sourceRecordVersion.value || 0),
    sourceRevisionId: form.elements.sourceRevisionId.value,
    driveFileId: form.elements.driveFileId.value,
    driveFileName: form.elements.driveFileName.value,
    driveFileUrl: form.elements.driveFileUrl.value,
    arrivalDate: form.elements.arrivalDate.value,
    arrivalFlight: form.elements.arrivalFlight.value.trim(),
    arrivalSector: form.elements.arrivalSector.value.trim(),
    arrivalTime: form.elements.arrivalTime.value,
    departureDate: form.elements.departureDate.value,
    departureFlight: form.elements.departureFlight.value.trim(),
    departureSector: form.elements.departureSector.value.trim(),
    departureTime: form.elements.departureTime.value,
    hotels: $$("#vendor-hotel-list .hotel-row").map((row, index) => ({
      hotelStayId: row.dataset.hotelStayId || "",
      staySequence: index + 1,
      hotelName: row.querySelector('[data-vendor-hotel-field="hotelName"]').value.trim(),
      checkInDate: row.querySelector('[data-vendor-hotel-field="checkInDate"]').value,
      checkOutDate: row.querySelector('[data-vendor-hotel-field="checkOutDate"]').value,
    })),
    days: $$("#vendor-day-list .vendor-day-card").map((card) => ({
      tourDayId: card.dataset.tourDayId || "",
      dayNumber: Number(card.dataset.dayNumber),
      serviceDate: card.querySelector('[data-vendor-day-field="serviceDate"]').value,
      daywiseText: card.querySelector('[data-vendor-day-field="daywiseText"]').value,
      status: "DRAFT",
      splits: [...card.querySelectorAll(".vendor-split-row")].map((row, index) => ({
        serviceId: row.dataset.serviceId || "",
        splitSequence: index + 1,
        serviceType: row.querySelector('[data-vendor-split-field="serviceType"]').value,
        activityText: row.querySelector('[data-vendor-split-field="activityText"]').value,
        vendorId: "",
        vendorName: row.querySelector('[data-vendor-split-field="vendorName"]').value,
        status: "DRAFT",
      })),
    })),
  };
}

function populateVendorIntake(context) {
  state.vendorIntake = context;
  const form = $("#vendor-intake-form");
  const scalarFields = [
    "vendorDraftId", "customerCode", "customerName", "tourId", "sourcePublicationId",
    "sourceRecordVersion", "sourceRevisionId", "driveFileId", "driveFileName", "driveFileUrl",
    "adultPax", "childPax", "infantPax",
    "arrivalDate", "arrivalFlight", "arrivalSector", "arrivalTime",
    "departureDate", "departureFlight", "departureSector", "departureTime",
  ];
  scalarFields.forEach((field) => {
    if (form.elements[field]) form.elements[field].value = context[field] ?? "";
  });
  form.hidden = false;
  $("#vendor-extraction-status").textContent = context.extractionStatus || "NEEDS REVIEW";
  $("#vendor-itinerary-name").textContent = context.driveFileName || "Posted itinerary";
  $("#vendor-drive-link").href = context.driveFileUrl || "#";
  $("#vendor-itinerary-preview").innerHTML = context.documentHtml || `<div class="empty-notifications">No readable DOCX content.</div>`;
  renderVendorHotels(context.hotels || []);
  renderVendorDays((context.days || []).length
    ? context.days
    : vendorDateRange(context.arrivalDate, context.departureDate));
}

async function loadVendorItinerary(customerCode = "") {
  const code = String(customerCode || $("#vendor-customer-code").value || "").trim().toUpperCase();
  if (!code) return toast("Input Customer Code first.", true);
  const button = $("#load-vendor-itinerary");
  button.disabled = true;
  button.textContent = "Loading...";
  try {
    const context = await window.erim.vendor.getIntakeContext(code);
    $("#vendor-customer-code").value = context.customerCode;
    populateVendorIntake(context);
    toast(context.vendorDraftId ? "Local Vendor draft and latest source loaded." : "Itinerary extracted. Review all fields.");
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Load itinerary";
  }
}

async function saveVendorIntake(publish = false) {
  const payload = collectVendorIntake();
  if (!payload.customerName || !payload.arrivalDate || !payload.departureDate) {
    return toast("Customer Name, Arrival Date, and Departure Date are required.", true);
  }
  if (![payload.adultPax, payload.childPax, payload.infantPax]
    .every((value) => Number.isInteger(value) && value >= 0)) {
    return toast("Adult, Child, and Infant must be whole numbers starting from 0.", true);
  }
  const button = publish ? $("#post-vendor-intake") : $("#save-vendor-draft");
  button.disabled = true;
  const original = button.textContent;
  button.textContent = publish ? "Posting..." : "Saving...";
  try {
    const result = publish
      ? await window.erim.vendor.publishIntake({ ...payload, extractionStatus: "CONFIRMED" })
      : await window.erim.vendor.saveIntakeDraft(payload);
    const saved = publish ? result.local : result;
    populateVendorIntake(saved);
    await refresh();
    toast(publish
      ? `Structured data posted: ${result.dayCount} day, ${result.splitCount} split.`
      : "Vendor intake saved safely on this PC.");
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function openVendorNotification(actionUrl) {
  const [action, ...codeParts] = String(actionUrl || "").split(":");
  const code = codeParts.join(":");
  if (action === "vendor-new-itinerary") {
    showView("vendor-new-itinerary", "VENDOR");
    $("#vendor-customer-code").value = code;
    return loadVendorItinerary(code);
  }
  if (action === "vendor-revise-itinerary") {
    showView("vendor-revise-itinerary", "VENDOR");
    toast(`${code} opened in Vendor revision queue.`);
  }
}

function bindEvents() {
  $("#main-nav").addEventListener("click", (event) => {
    const vendorAction = event.target.closest("[data-vendor-action]");
    if (vendorAction) {
      const views = {
        inbox: "vendor-inbox", generate: "vendor-generate", new: "vendor-new-itinerary",
        revise: "vendor-revise-itinerary", cancel: "vendor-cancel", kpi: "vendor-kpi",
      };
      showView(views[vendorAction.dataset.vendorAction], "VENDOR");
      if (vendorAction.dataset.vendorAction === "new") $("#vendor-customer-code").focus();
      return;
    }
    const reservationAction = event.target.closest("[data-reservation-action]");
    if (reservationAction?.dataset.reservationAction === "recheck") {
      state.currentModule = "RESERVATION";
      showView("reservation-recheck", "RESERVATION");
      $("#recheck-customer-code").focus();
      return;
    }
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
    if (button) {
      if (button.dataset.view === "dashboard" && state.bootstrap.settings.department === "VENDOR") {
        showView("vendor-dashboard", "VENDOR");
      } else {
        showView(button.dataset.view, button.dataset.module || null);
      }
    }
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
  $("#load-recheck-record").addEventListener("click", loadRecheckRecord);
  $("#recheck-customer-code").addEventListener("change", loadRecheckRecord);
  $("#download-latest-itinerary").addEventListener("click", downloadLatestItinerary);
  $("#open-itinerary-download-folder").addEventListener("click", openItineraryDownloadFolder);
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
  $("#load-vendor-itinerary").addEventListener("click", () => loadVendorItinerary());
  $("#vendor-customer-code").addEventListener("change", () => loadVendorItinerary());
  $("#save-vendor-draft").addEventListener("click", () => saveVendorIntake(false));
  $("#post-vendor-intake").addEventListener("click", () => saveVendorIntake(true));
  $("#add-vendor-hotel").addEventListener("click", () => {
    const payload = collectVendorIntake();
    payload.hotels.push({ hotelStayId: "", hotelName: "", checkInDate: "", checkOutDate: "" });
    state.vendorIntake = payload;
    renderVendorHotels(payload.hotels);
  });
  $("#rebuild-vendor-days").addEventListener("click", () => {
    const payload = collectVendorIntake();
    payload.days = vendorDateRange(payload.arrivalDate, payload.departureDate, payload.days);
    state.vendorIntake = payload;
    renderVendorDays(payload.days);
    toast(`${payload.days.length} Day Wise rows prepared.`);
  });

  document.body.addEventListener("click", (event) => {
    const notification = event.target.closest("[data-notification-action]");
    if (notification) return openVendorNotification(notification.dataset.notificationAction);
    const vendorOpen = event.target.closest("[data-vendor-open-code]");
    if (vendorOpen) {
      showView("vendor-new-itinerary", "VENDOR");
      $("#vendor-customer-code").value = vendorOpen.dataset.vendorOpenCode;
      return loadVendorItinerary(vendorOpen.dataset.vendorOpenCode);
    }
    const removeHotel = event.target.closest("[data-remove-vendor-hotel]");
    if (removeHotel) {
      const payload = collectVendorIntake();
      payload.hotels.splice(Number(removeHotel.dataset.removeVendorHotel), 1);
      state.vendorIntake = payload;
      return renderVendorHotels(payload.hotels);
    }
    const splitToggle = event.target.closest("[data-toggle-vendor-split]");
    if (splitToggle) {
      const panel = splitToggle.closest(".vendor-day-card").querySelector(".vendor-split-panel");
      panel.hidden = !panel.hidden;
      return;
    }
    const addSplit = event.target.closest("[data-add-vendor-split]");
    if (addSplit) {
      const card = addSplit.closest(".vendor-day-card");
      const payload = collectVendorIntake();
      const day = payload.days.find((item) => Number(item.dayNumber) === Number(card.dataset.dayNumber));
      day.splits.push({
        serviceId: "", serviceType: "VENDOR", activityText: "", vendorId: "", vendorName: "", status: "DRAFT",
      });
      state.vendorIntake = payload;
      renderVendorDays(payload.days);
      const updated = $(`#vendor-day-list [data-day-number="${day.dayNumber}"] .vendor-split-panel`);
      if (updated) updated.hidden = false;
      return;
    }
    const removeSplit = event.target.closest("[data-remove-vendor-split]");
    if (removeSplit) {
      const card = removeSplit.closest(".vendor-day-card");
      const payload = collectVendorIntake();
      const day = payload.days.find((item) => Number(item.dayNumber) === Number(card.dataset.dayNumber));
      day.splits.splice(Number(removeSplit.dataset.removeVendorSplit), 1);
      state.vendorIntake = payload;
      renderVendorDays(payload.days);
      return;
    }
    const email = event.target.closest("[data-recheck-thread-id]");
    if (email) {
      $$("#recheck-email-panel .selection-item").forEach((item) => item.classList.toggle("selected", item === email));
      return loadRecheckEmailTrail(email.dataset.recheckThreadId);
    }
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
      toast(result.activityWarning || `Itinerary posted as REV ${result.revisionNumber}.`, Boolean(result.activityWarning));
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
