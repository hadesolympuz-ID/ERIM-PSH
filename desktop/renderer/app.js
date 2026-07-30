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
  vendorDashboard: { notSplit: [], notGenerated: [], replied: [], upcoming: [], offline: true },
  vendorOperational: { bookingRegister: [], workInbox: [] },
  vendorItineraryCheck: null,
  vendorBookingQueue: [],
  vendorBookings: [],
  vendorBookingPreview: null,
  vendorSendAttempts: [],
  selectedVendorPackageKey: "",
  selectedVendorServiceIds: new Set(),
  selectedVendorInspectionServiceId: "",
  vendorPackageChannels: new Map(),
  vendorCommunicationBatch: [],
  vendorCommunicationIndex: -1,
  vendorCommunicationBaseline: "",
  vendorGeneratedCancelTarget: null,
  vendorGmailReadiness: null,
  vendorExpandedClients: new Set(),
  vendorExpandedDays: new Set(),
  vendorTreeInitialized: false,
  vendorIntakeMode: "NEW",
  vendorIntake: null,
  vendorSuggestions: {
    vendorNames: [],
    vendorServices: [],
    tocNames: [],
    vendorRates: [],
    tocRates: [],
    transportRates: [],
    luggageVanRates: [],
  },
  supplierMaster: {
    supplierTypes: [], suppliers: [], contacts: [], recipients: [],
    sops: [], products: [], contracts: [], rates: [],
  },
  supplierMasterLoaded: false,
  supplierMasterDrafts: [],
  supplierRateApprovals: [],
  supplierPublishSession: null,
  supplierPublishSessions: [],
  supplierPublishActive: false,
  supplierRateApprovalAction: null,
  supplierFocusContext: null,
  vendorSplitSuggestionSequence: 0,
  selectedSupplierTypeCode: "VENDOR",
  selectedSupplierId: "",
  selectedSupplierProductIds: new Set(),
  duplicateSourceProductIds: [],
  supplierArchiveTarget: null,
  transportAction: "new-itinerary-check",
  navigation: {
    sidebarHidden: false,
    groups: { reservation: false, vendor: false, transport: false, manager: false },
  },
  supplierExcel: {
    typeCode: "VENDOR",
    batch: null,
    batches: [],
    selectedSupplierIds: new Set(),
  },
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
const NAVIGATION_PREFERENCE_KEY = "erim-psh-navigation-v1";

function loadNavigationPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(NAVIGATION_PREFERENCE_KEY) || "{}");
    state.navigation.sidebarHidden = Boolean(saved.sidebarHidden);
    state.navigation.groups = {
      ...state.navigation.groups,
      ...(saved.groups || {}),
    };
  } catch {
    // Invalid local UI preferences fall back to the fully visible navigation.
  }
}

function saveNavigationPreferences() {
  localStorage.setItem(NAVIGATION_PREFERENCE_KEY, JSON.stringify(state.navigation));
}

function applyNavigationPreferences() {
  const shell = $(".app-shell");
  const toggle = $("#sidebar-toggle");
  shell.classList.toggle("sidebar-hidden", state.navigation.sidebarHidden);
  toggle.title = state.navigation.sidebarHidden ? "Show menu" : "Hide menu";
  toggle.setAttribute("aria-label", toggle.title);
  toggle.setAttribute("aria-expanded", String(!state.navigation.sidebarHidden));
  $$("[data-menu-toggle]").forEach((control) => {
    const group = control.dataset.menuToggle;
    const collapsed = Boolean(state.navigation.groups[group]);
    control.setAttribute("aria-expanded", String(!collapsed));
    control.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${group} submenu`);
    control.textContent = collapsed ? "Show" : "Hide";
    $(`[data-menu-content="${group}"]`)?.classList.toggle("collapsed", collapsed);
  });
}

function setMenuGroupCollapsed(group, collapsed) {
  state.navigation.groups[group] = Boolean(collapsed);
  applyNavigationPreferences();
  saveNavigationPreferences();
}

function toggleMenuGroup(group) {
  setMenuGroupCollapsed(group, !state.navigation.groups[group]);
}

function toast(message, error = false) {
  const node = $("#toast");
  node.textContent = message;
  node.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.className = "toast"; }, 3400);
}

function autoGrowTextarea(node) {
  node.style.height = "auto";
  node.style.height = `${node.scrollHeight}px`;
}

function resizeVendorTextareas() {
  $$("#vendor-day-list textarea[data-auto-grow]").forEach(autoGrowTextarea);
}

function flexibleInputSize(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, String(value || "").length + 2));
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function formatVendorDate(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", day: "2-digit", month: "long", year: "numeric",
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.day}/${fields.month}/${fields.year}`;
}

function parseVendorDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[\/\s-]([A-Za-z]+)[\/\s-](\d{4})$/);
  if (!match) return "";
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const month = monthNames.indexOf(match[2].toLowerCase());
  const day = Number(match[1]);
  const year = Number(match[3]);
  if (month < 0 || day < 1 || day > 31) return "";
  const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? "" : iso;
}

function vendorDateValue(input) {
  return parseVendorDate(input?.value);
}

function formatWita(value) {
  if (!value) return "—";
  return `${new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Makassar", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value))} WITA`;
}

function normalizeHourTime(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const hourOnly = text.match(/^([01]?\d|2[0-3])$/);
  if (hourOnly) return `${hourOnly[1].padStart(2, "0")}:00`;
  const full = text.match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
  return full ? `${full[1].padStart(2, "0")}:${full[2]}` : text;
}

function refreshVendorDateDisplays(root = document) {
  root.querySelectorAll("[data-vendor-date-input]").forEach((input) => {
    const iso = parseVendorDate(input.value);
    if (iso) input.value = formatVendorDate(iso);
  });
}

function statusClass(status) {
  const lower = String(status || "").toLowerCase();
  if (lower.includes("pending_sync") || lower.includes("outcome_unknown")) return "conflict";
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
    const [operational, queue] = await Promise.all([
      window.erim.vendor.getOperationalModel(),
      window.erim.vendor.listBookingQueue(),
    ]);
    state.vendorOperational = operational;
    state.vendorDashboard = operational.dashboard;
    state.vendorBookingQueue = queue;
    state.vendorBookings = operational.bookingRegister;
  } catch {
    state.vendorDashboard = {
      notSplit: [], notGenerated: [], replied: [], upcoming: [], offline: true,
    };
    state.vendorOperational = { bookingRegister: [], workInbox: [] };
    state.vendorBookingQueue = [];
    state.vendorBookings = [];
  }
  renderChrome();
  renderDashboard();
  renderVendorDashboard();
  renderVendorInbox();
  renderVendorBookingQueue();
  renderVendorCancel();
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
  [
    ["not-split", "notSplit"],
    ["not-generated", "notGenerated"],
    ["replied", "replied"],
    ["upcoming", "upcoming"],
  ].forEach(([elementKey, dataKey]) => {
    const items = Array.isArray(data[dataKey]) ? data[dataKey] : [];
    $(`#vendor-${elementKey}-count`).textContent = items.length;
    $(`#vendor-${elementKey}-list`).innerHTML = items.length ? items.map((item) => `
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
        <button class="button ghost small" type="button"
          data-vendor-open-code="${escapeHtml(item.customerCode || "")}"
          data-vendor-open-package="${escapeHtml(item.packageKey || "")}"
          data-vendor-open-target="${dataKey === "upcoming" ? "ITINERARY_CHECK" : ""}">Open</button>
      </article>
    `).join("") : `<div class="empty-notifications">No applicable work item.</div>`;
  });
  const processRows = state.vendorOperational.processReport || [];
  $("#vendor-process-report-count").textContent = processRows.length;
  $("#vendor-process-report-list").innerHTML = processRows.length ? `
    <div class="vendor-process-row vendor-process-head">
      <span>Code / Client</span><span>Source</span><span>State</span>
      <span>Latest result</span><span>Time</span><span>Action</span>
    </div>
    ${processRows.map((item) => `<div class="vendor-process-row">
      <span><strong>${escapeHtml(item.customerCode)}</strong><small>${escapeHtml(item.customerName)}</small></span>
      <span>${escapeHtml(item.sourceAction.replaceAll("_", " "))}</span>
      <span>${statusPill(item.processState)}</span>
      <span>${escapeHtml(item.resultMessage || "—")}</span>
      <span>${escapeHtml(formatWita(item.createdAt))}</span>
      <span>${item.requiredAction
        ? `<button class="button ghost small" type="button"
            data-vendor-process-code="${escapeHtml(item.customerCode)}"
            data-vendor-process-action="${escapeHtml(item.requiredAction)}">${escapeHtml(item.requiredAction.replaceAll("_", " "))}</button>`
        : "—"}</span>
    </div>`).join("")}
  ` : `<div class="empty-notifications">No local or online Vendor process has been recorded.</div>`;
}

function renderVendorInboxLegacy() {
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

function renderVendorInbox() {
  const reportSearch = String($("#vendor-delivery-report-search")?.value || "").trim().toLowerCase();
  const reportStatus = $("#vendor-delivery-report-status")?.value || "";
  const reportChannel = $("#vendor-delivery-report-channel")?.value || "";
  const reportSupplier = String($("#vendor-delivery-report-supplier")?.value || "").trim().toLowerCase();
  const reportServiceDate = $("#vendor-delivery-report-service-date")?.value || "";
  const reportSentDate = $("#vendor-delivery-report-sent-date")?.value || "";
  const reportEvidence = $("#vendor-delivery-report-evidence")?.value || "";
  const reportSort = $("#vendor-delivery-report-sort")?.value || "LATEST";
  const deliveryReport = [...(state.vendorOperational.deliveryReport || [])]
    .filter((item) => !reportStatus
      || (reportStatus === "NEEDS_ACTION"
        ? item.communicationStatus !== "SENT"
          || item.officialSyncStatus === "PENDING_SYNC"
          || item.replyReviewStatus === "REVIEW_REQUIRED"
        : item.communicationStatus === reportStatus))
    .filter((item) => !reportChannel || item.channel === reportChannel)
    .filter((item) => !reportSupplier || item.supplierName.toLowerCase().includes(reportSupplier))
    .filter((item) => !reportServiceDate || item.serviceDate === reportServiceDate)
    .filter((item) => !reportSentDate || String(item.sentAt || "").slice(0, 10) === reportSentDate)
    .filter((item) => !reportEvidence
      || (reportEvidence === "PENDING"
        ? ["EMAIL_ID_NOT_CREATED", "RECORDED_SYNC_PENDING", "OUTCOME_UNKNOWN"].includes(item.deliveryEvidenceStatus)
        : reportEvidence === "RECORDED"
          ? ["RECORDED_SYNCED", "NON_EMAIL_CHANNEL"].includes(item.deliveryEvidenceStatus)
          : item.replyReviewStatus === "REVIEW_REQUIRED"))
    .filter((item) => !reportSearch || [
      item.customerCode, item.customerName, item.supplierName, item.productName,
      item.channel, item.communicationStatus, item.externalReference,
    ].join(" ").toLowerCase().includes(reportSearch))
    .sort((left, right) => {
      if (reportSort === "SUPPLIER") return left.supplierName.localeCompare(right.supplierName);
      if (reportSort === "DATE") return String(left.serviceDate).localeCompare(String(right.serviceDate));
      if (reportSort === "CODE") return left.customerCode.localeCompare(right.customerCode);
      return String(right.sentAt || right.updatedAt).localeCompare(String(left.sentAt || left.updatedAt));
    });
  $("#vendor-delivery-report-count").textContent = deliveryReport.length;
  $("#vendor-delivery-report-grid").innerHTML = deliveryReport.length ? `
    <div class="vendor-report-row vendor-report-head">
      <span>Code / Name</span><span>Date / Day</span><span>Product</span><span>Supplier</span>
      <span>Channel</span><span>Booking status</span><span>Sent</span><span>Action</span>
    </div>
    ${deliveryReport.map((item) => `<div class="vendor-report-row">
      <span><strong>${escapeHtml(item.customerCode)}</strong><small>${escapeHtml(item.customerName)}</small></span>
      <span>${escapeHtml(formatVendorDate(item.serviceDate) || "—")}<small>Day ${Number(item.dayNumber || 0)}</small></span>
      <span>${escapeHtml(item.productName || "Package record")}</span>
      <span>${escapeHtml(item.supplierName)}</span>
      <span>${escapeHtml(item.channel)}</span>
      <span>${statusPill(item.communicationStatus)}<small>${escapeHtml(item.officialSyncStatus || "")}</small></span>
      <span>${escapeHtml(formatWita(item.sentAt))}</span>
      <span class="vendor-report-actions">
        <button class="button ghost small" type="button" data-open-vendor-history="${escapeHtml(item.bookingId)}">Open</button>
        ${item.gmailThreadId ? `<button class="button ghost small" type="button" data-open-gmail-thread="${escapeHtml(item.gmailThreadId)}">Gmail</button>` : ""}
        ${item.communicationStatus === "SENT_PENDING_SYNC" && item.latestAttemptId
          ? `<button class="button danger small" type="button" data-retry-vendor-sync="${escapeHtml(item.latestAttemptId)}">Retry sync</button>` : ""}
      </span>
    </div>`).join("")}
  ` : `<div class="empty-notifications">No service-level delivery record matches the filters.</div>`;

  const search = String($("#vendor-register-search")?.value || "").trim().toLowerCase();
  const stateFilter = $("#vendor-register-state")?.value || "";
  const channelFilter = $("#vendor-register-channel")?.value || "";
  const sort = $("#vendor-register-sort")?.value || "SENT";
  const register = [...(state.vendorOperational.bookingRegister || [])]
    .filter((item) => !stateFilter || item.communicationStatus === stateFilter)
    .filter((item) => !channelFilter || item.channel === channelFilter)
    .filter((item) => !search || [
      item.customerCode, item.customerName, item.supplierName,
    ].join(" ").toLowerCase().includes(search))
    .sort((a, b) => {
      if (sort === "CODE") return a.customerCode.localeCompare(b.customerCode);
      const field = sort === "GENERATED" ? "generatedAt" : "sentAt";
      return String(b[field] || b.generatedAt || "").localeCompare(
        String(a[field] || a.generatedAt || ""),
      );
    });
  $("#vendor-booking-register-count").textContent = register.length;
  $("#vendor-booking-register-list").innerHTML = register.length ? register.map((item) => `
    <article class="vendor-register-item">
      <div class="vendor-register-heading">
        <div><strong>${escapeHtml(item.customerCode)} · ${escapeHtml(item.customerName)}</strong>
          <small>${item.adultPax} adult · ${item.childPax} child · ${item.infantPax} infant</small></div>
        ${statusPill(item.communicationStatus)}
      </div>
      <div class="vendor-register-details">
        <span>${escapeHtml(item.supplierName)} · ${escapeHtml(item.actionType)} · ${escapeHtml(item.channel)}</span>
        <span>Generated ${formatDate(item.generatedAt)} · Sent ${formatDate(item.sentAt)}</span>
        <span>${escapeHtml(item.rateStatus)} · Supplier ${escapeHtml(item.supplierResult)}</span>
      </div>
      <div class="vendor-register-actions">
        <button class="button ghost small" type="button" data-open-vendor-register="${escapeHtml(item.packageKey)}">Open booking</button>
        ${item.gmailThreadId ? `<button class="button ghost small" type="button" data-open-gmail-thread="${escapeHtml(item.gmailThreadId)}">Open Gmail thread</button>` : ""}
        ${item.channel === "EMAIL" && ["SENT", "SENT_PENDING_SYNC", "SEND_OUTCOME_UNKNOWN"].includes(item.communicationStatus)
          ? `<button class="button ghost small" type="button"
              data-open-vendor-history="${escapeHtml(item.bookingId)}">Delivery history / Resend</button>` : ""}
        ${item.channel === "EMAIL"
          ? `<small>Evidence: ${escapeHtml((item.deliveryEvidenceStatus || "EMAIL_ID_NOT_CREATED").replaceAll("_", " "))}</small>` : ""}
        ${item.externalReference ? `<small>Evidence: ${escapeHtml(item.externalReference)}</small>` : ""}
        ${item.communicationStatus === "SENT_PENDING_SYNC" && item.lastSendAttemptId
          ? `<button class="button danger small" type="button" data-retry-vendor-sync="${escapeHtml(item.lastSendAttemptId)}">Retry evidence sync</button>` : ""}
      </div>
    </article>
  `).join("") : `<div class="empty-notifications">No booking record matches the current filters.</div>`;

  const notifications = state.vendorOperational.workInbox || [];
  $("#vendor-inbox-count").textContent = notifications.length;
  $("#vendor-notification-inbox").innerHTML = notifications.length ? notifications.map((item) => `
    <article class="notification-item ${item.state === "UNREAD" ? "success" : ""} ${item.actionUrl ? "actionable" : ""}"
      ${item.actionUrl ? `data-notification-action="${escapeHtml(item.actionUrl)}"` : ""}>
      <span class="notification-dot" aria-hidden="true"></span>
      <div class="notification-copy"><strong>${escapeHtml(item.customerCode)} · ${escapeHtml(item.eventType.replaceAll("_", " "))}</strong><p>${escapeHtml(item.customerName || "Open the exact itinerary revision workspace.")}</p><small>${escapeHtml(item.state)}</small></div>
      <time class="notification-time">${formatDate(item.createdAt)}</time>
    </article>
  `).join("") : `<div class="empty-notifications">No Vendor notifications.</div>`;
}

async function loadVendorItineraryCheck(customerCode = "") {
  const code = String(customerCode || $("#vendor-itinerary-check-code").value || "").trim().toUpperCase();
  if (!code) return toast("Input Customer Code first.", true);
  const button = $("#load-vendor-itinerary-check");
  button.disabled = true;
  try {
    state.vendorItineraryCheck = await window.erim.vendor.getItineraryCheck(code);
    $("#vendor-itinerary-check-code").value = state.vendorItineraryCheck.customerCode;
    renderVendorItineraryCheck();
  } catch (error) {
    state.vendorItineraryCheck = null;
    $("#vendor-itinerary-check-result").innerHTML =
      `<div class="empty-notifications">${escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
  }
}

function renderVendorItineraryCheck() {
  const itinerary = state.vendorItineraryCheck;
  if (!itinerary) return;
  $("#vendor-itinerary-check-result").innerHTML = `
    <section class="vendor-itinerary-check-summary">
      <div><strong>${escapeHtml(itinerary.customerCode)} · ${escapeHtml(itinerary.customerName)}</strong>
        <small>${escapeHtml(itinerary.arrivalDate)} — ${escapeHtml(itinerary.departureDate)} · ${itinerary.adultPax} adult · ${itinerary.childPax} child · ${itinerary.infantPax} infant</small></div>
      <span class="status">READ ONLY</span>
    </section>
    <div class="vendor-itinerary-days">${itinerary.days.map((day) => `
      <details class="vendor-itinerary-day" open>
        <summary><strong>Day ${day.dayNumber} · ${escapeHtml(day.serviceDate)} · ${escapeHtml(day.dayTitle || "Untitled day")}</strong></summary>
        <p>${escapeHtml(day.daywiseText || "No Day Wise description.")}</p>
        <div>${day.services.length ? day.services.map((service) => `
          <article class="vendor-itinerary-service">
            <div><span>${escapeHtml(service.serviceType.replaceAll("_", " "))} · Owner ${escapeHtml(service.ownerDepartment)}</span>
              <strong>${escapeHtml(service.activityText || "Unnamed service")}</strong>
              <small>${escapeHtml(service.vendorName || "Supplier not assigned")} · ${escapeHtml(service.rateStatus)} · ${escapeHtml(service.bookingState)}</small></div>
            ${service.gmailThreadId ? `<button class="button ghost small" type="button" data-open-gmail-thread="${escapeHtml(service.gmailThreadId)}">Gmail thread</button>`
              : service.externalReference ? `<small>Evidence: ${escapeHtml(service.externalReference)}</small>`
              : `<span class="status conflict">NO EVIDENCE</span>`}
          </article>
        `).join("") : `<div class="empty-notifications">No Micro Split item for this day.</div>`}</div>
      </details>
    `).join("")}</div>
  `;
}

function formatIdr(value) {
  if (value === null || value === undefined || value === "") return "";
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

function vendorServiceRateLabel(service) {
  const rates = [
    service.adultRateIdr !== null && service.adultRateIdr !== undefined
      ? `Adult ${formatIdr(service.adultRateIdr)}` : "",
    service.childRateIdr !== null && service.childRateIdr !== undefined
      ? `Child ${formatIdr(service.childRateIdr)}` : "",
    service.infantRateIdr !== null && service.infantRateIdr !== undefined
      ? `Infant ${formatIdr(service.infantRateIdr)}` : "",
    service.unitRateIdr !== null && service.unitRateIdr !== undefined
      ? `Unit ${formatIdr(service.unitRateIdr)}` : "",
  ].filter(Boolean);
  return rates.join(" · ") || "Rate amount pending";
}

function vendorBookingStatusLabel(status) {
  if (status === "GENERATED") return "DRAFT READY — NOT SENT";
  if (status === "SENT_PENDING_SYNC") return "SENT — SYNC PENDING";
  return String(status || "NOT_GENERATED").replaceAll("_", " ");
}

function renderVendorBookingQueue() {
  const list = $("#vendor-booking-queue-list");
  if (!list) return;
  const search = String($("#vendor-booking-search")?.value || "").trim().toLowerCase();
  const clients = new Map();
  (state.vendorBookingQueue || []).forEach((item) => {
    if (!clients.has(item.customerCode)) {
      clients.set(item.customerCode, {
        customerCode: item.customerCode,
        customerName: item.customerName,
        arrivalDate: item.arrivalDate,
        days: new Map(),
      });
    }
    const client = clients.get(item.customerCode);
    item.services.forEach((service) => {
      const dayKey = `${item.customerCode}|${service.dayNumber}|${service.serviceDate}`;
      if (!client.days.has(dayKey)) {
        client.days.set(dayKey, {
          dayKey,
          dayNumber: service.dayNumber,
          serviceDate: service.serviceDate,
          dayTitle: service.dayTitle,
          services: [],
        });
      }
      client.days.get(dayKey).services.push({ ...service, package: item });
    });
  });
  const eligibleIds = new Set(
    [...clients.values()].flatMap((client) => [...client.days.values()])
      .flatMap((day) => day.services)
      .filter((service) => service.workflowStatus === "NOT_GENERATED")
      .map((service) => service.serviceId),
  );
  state.selectedVendorServiceIds = new Set(
    [...state.selectedVendorServiceIds].filter((serviceId) => eligibleIds.has(serviceId)),
  );
  if (!state.vendorTreeInitialized) {
    clients.forEach((client) => {
      const eligible = [...client.days.values()].some((day) =>
        day.services.some((service) => service.workflowStatus === "NOT_GENERATED")
      );
      if (eligible) state.vendorExpandedClients.add(client.customerCode);
      client.days.forEach((day) => {
        if (day.services.some((service) => service.workflowStatus === "NOT_GENERATED")) {
          state.vendorExpandedDays.add(day.dayKey);
        }
      });
    });
    state.vendorTreeInitialized = true;
  }
  $("#vendor-booking-package-count").textContent = state.vendorBookingQueue.length;
  const markup = [...clients.values()].map((client) => {
    const clientMatch = `${client.customerCode} ${client.customerName}`.toLowerCase().includes(search);
    const dayMarkup = [...client.days.values()]
      .sort((a, b) => a.dayNumber - b.dayNumber)
      .map((day) => {
        const dayMatch = `${day.dayNumber} ${day.serviceDate} ${day.dayTitle}`.toLowerCase().includes(search);
        const services = day.services.filter((service) =>
          !search || clientMatch || dayMatch
          || `${service.package.supplierName} ${service.productName || service.activityText} ${service.workflowStatus}`
            .toLowerCase().includes(search)
        );
        if (!services.length) return "";
        const eligible = services.filter((service) => service.workflowStatus === "NOT_GENERATED");
        const selected = eligible.filter((service) =>
          state.selectedVendorServiceIds.has(service.serviceId)
        );
        return `
          <details class="vendor-tree-day" data-vendor-tree-day="${escapeHtml(day.dayKey)}"
            ${search || state.vendorExpandedDays.has(day.dayKey) ? "open" : ""}>
            <summary>
              <input type="checkbox" data-vendor-tree-day-select
                ${eligible.length && selected.length === eligible.length ? "checked" : ""}
                ${eligible.length ? "" : "disabled"} />
              <span class="vendor-tree-branch">├─</span>
              <span><strong>Day ${day.dayNumber} | ${escapeHtml(day.serviceDate || "Date pending")}</strong>
                <small><b>Day Wise Header:</b> ${escapeHtml(day.dayTitle || "No Day Wise Header")} · ${selected.length}/${eligible.length} selected</small></span>
            </summary>
            <div class="vendor-tree-services">
              ${services.map((service, index) => `
                <div class="vendor-tree-service${service.serviceId === state.selectedVendorInspectionServiceId ? " active" : ""}"
                  data-vendor-tree-service="${escapeHtml(service.serviceId)}">
                  <input type="checkbox" data-vendor-tree-service-select="${escapeHtml(service.serviceId)}"
                    ${state.selectedVendorServiceIds.has(service.serviceId) ? "checked" : ""}
                    ${service.workflowStatus === "NOT_GENERATED" ? "" : "disabled"} />
                  <span class="vendor-tree-branch">${index === services.length - 1 ? "└─" : "├─"}</span>
                  <button type="button" class="vendor-tree-service-open"
                    data-vendor-tree-open-package="${escapeHtml(service.package.packageKey)}"
                    data-vendor-tree-open-service="${escapeHtml(service.serviceId)}">
                    <strong>${escapeHtml(service.package.supplierName)} | ${escapeHtml(service.productName || service.activityText)}</strong>
                    <small>Booking: ${escapeHtml(vendorBookingStatusLabel(service.workflowStatus))} · Rate: ${escapeHtml(service.rateStatus.replaceAll("_", " "))} · Supplier: ${escapeHtml(service.supplierResult || "PENDING")}</small>
                  </button>
                  ${service.gmailThreadId
                    ? `<button type="button" class="vendor-tree-link"
                        data-open-vendor-history="${escapeHtml(service.bookingId)}">Delivery / Resend</button>`
                    : service.workflowStatus === "GENERATED"
                      ? `<button type="button" class="vendor-tree-link" data-resume-vendor-draft="${escapeHtml(service.bookingId)}">Resume draft</button>`
                      : `<span class="vendor-tree-state">${service.workflowStatus === "SENT_PENDING_SYNC" ? "Retry sync" : "Open"}</span>`}
                </div>
              `).join("")}
            </div>
          </details>
        `;
      }).filter(Boolean);
    if (!dayMarkup.length) return "";
    const visibleServices = [...client.days.values()].flatMap((day) => day.services).filter((service) =>
      !search || clientMatch
      || `${service.package.supplierName} ${service.productName || service.activityText}`.toLowerCase().includes(search)
    );
    const eligible = visibleServices.filter((service) => service.workflowStatus === "NOT_GENERATED");
    const selected = eligible.filter((service) => state.selectedVendorServiceIds.has(service.serviceId));
    return `
      <details class="vendor-tree-client" data-vendor-tree-client="${escapeHtml(client.customerCode)}"
        ${search || state.vendorExpandedClients.has(client.customerCode) ? "open" : ""}>
        <summary>
          <input type="checkbox" data-vendor-tree-client-select
            ${eligible.length && selected.length === eligible.length ? "checked" : ""}
            ${eligible.length ? "" : "disabled"} />
          <span><strong>${escapeHtml(client.customerCode)} — ${escapeHtml(client.customerName)}</strong>
            <small>${selected.length}/${eligible.length} eligible selected · Arrival ${escapeHtml(client.arrivalDate || "pending")}</small></span>
        </summary>
        <div class="vendor-tree-days">${dayMarkup.join("")}</div>
      </details>
    `;
  }).filter(Boolean);
  list.innerHTML = markup.length ? markup.join("")
    : `<div class="empty-notifications">No Vendor split matches this filter.</div>`;
  list.querySelectorAll("[data-vendor-tree-client-select], [data-vendor-tree-day-select]").forEach((checkbox) => {
    const children = [...checkbox.closest("details")
      .querySelectorAll("[data-vendor-tree-service-select]:not(:disabled)")];
    const selected = children.filter((node) => node.checked);
    checkbox.indeterminate = selected.length > 0 && selected.length < children.length;
  });
  const selectedCount = state.selectedVendorServiceIds.size;
  $("#vendor-tree-selected-count").textContent = `${selectedCount} selected`;
  const draftCount = new Set(
    [...clients.values()].flatMap((client) => [...client.days.values()])
      .flatMap((day) => day.services)
      .filter((service) => service.workflowStatus === "GENERATED" && service.bookingId)
      .map((service) => service.bookingId),
  ).size;
  $("#vendor-tree-resume").disabled = draftCount === 0;
  $("#vendor-tree-resume").textContent = draftCount
    ? `Resume ${draftCount} draft${draftCount === 1 ? "" : "s"}`
    : "Resume drafts";
  $("#vendor-tree-prepare").disabled = selectedCount === 0;
  const packageCount = selectedVendorServicesByPackage().size;
  $("#vendor-tree-prepare").textContent = selectedCount
    ? `Generate Booking · ${packageCount} package${packageCount === 1 ? "" : "s"}`
    : "Generate Booking";
  const visibleEligible = [...list.querySelectorAll("[data-vendor-tree-service-select]:not(:disabled)")];
  $("#vendor-tree-select-all").checked = Boolean(visibleEligible.length)
    && visibleEligible.every((node) => node.checked);
  $("#vendor-tree-select-all").indeterminate = visibleEligible.some((node) => node.checked)
    && !visibleEligible.every((node) => node.checked);
}

function selectedVendorServicesByPackage() {
  const groups = new Map();
  state.vendorBookingQueue.forEach((item) => {
    const serviceIds = item.services
      .filter((service) => state.selectedVendorServiceIds.has(service.serviceId)
        && service.workflowStatus === "NOT_GENERATED")
      .map((service) => service.serviceId);
    if (serviceIds.length) groups.set(item.packageKey, serviceIds);
  });
  return groups;
}

function vendorCommunicationSort(left, right) {
  const channelOrder = { EMAIL: 0, WHATSAPP: 1, PORTAL: 2, OTHERS: 3, OTHER: 3 };
  const channelResult = (channelOrder[left.channel] ?? 9) - (channelOrder[right.channel] ?? 9);
  if (channelResult) return channelResult;
  if (left.channel === "PORTAL" && right.channel === "PORTAL") {
    return String(left.customerCode).localeCompare(String(right.customerCode))
      || String(left.supplierName).localeCompare(String(right.supplierName))
      || String(left.firstServiceDate || "9999-12-31").localeCompare(String(right.firstServiceDate || "9999-12-31"))
      || String(left.firstProductName || "").localeCompare(String(right.firstProductName || ""))
      || String(left.packageKey).localeCompare(String(right.packageKey));
  }
  return String(left.supplierName).localeCompare(String(right.supplierName))
    || String(left.customerCode).localeCompare(String(right.customerCode))
    || String(left.firstServiceDate || "9999-12-31").localeCompare(String(right.firstServiceDate || "9999-12-31"))
    || Number(left.firstDayNumber || 0) - Number(right.firstDayNumber || 0)
    || String(left.packageKey).localeCompare(String(right.packageKey));
}

function renderVendorGmailReadiness() {
  const panel = $("#vendor-gmail-readiness");
  const preview = state.vendorBookingPreview;
  if (!panel || preview?.channel !== "EMAIL") {
    if (panel) panel.hidden = true;
    return;
  }
  const readiness = state.vendorGmailReadiness;
  panel.hidden = false;
  panel.className = `vendor-gmail-readiness ${readiness?.ready ? "ready" : "attention"}`;
  panel.innerHTML = readiness ? `
    <strong>${escapeHtml(readiness.state.replaceAll("_", " "))}</strong>
    <small>Sender: ${escapeHtml(readiness.senderEmail || readiness.profileEmail || "Not verified")}</small>
    <small>Checked: ${escapeHtml(readiness.checkedAt || "")} · ${Number(readiness.latencyMs || 0)} ms
      · ${readiness.sessionRefreshed ? "session refreshed" : "session active"}</small>
    <small>Central evidence: ${readiness.centralReady === false ? "UNAVAILABLE" : readiness.centralReady ? "READY" : "NOT CHECKED"}</small>
    <button class="button ghost small" type="button" data-recheck-vendor-gmail>Recheck Gmail</button>
  ` : `
    <strong>Gmail has not been verified for this batch.</strong>
    <button class="button ghost small" type="button" data-recheck-vendor-gmail>Check Gmail</button>
  `;
}

async function prepareSelectedVendorServices() {
  const groups = selectedVendorServicesByPackage();
  if (!groups.size) return toast("Choose at least one eligible Micro Split service.", true);
  const button = $("#vendor-tree-prepare");
  button.disabled = true;
  const original = button.textContent;
  button.textContent = `Generating ${groups.size} package(s)...`;
  try {
    const prepared = [];
    for (const [packageKey, serviceIds] of groups.entries()) {
      const channel = state.vendorPackageChannels.get(packageKey) || "";
      const preview = await window.erim.vendor.getBookingPreview({
        packageKey, serviceIds, actionType: "NEW", channel,
      });
      prepared.push({ packageKey, serviceIds, preview });
    }
    if (prepared.some((item) => item.preview.channel === "EMAIL")) {
      state.vendorGmailReadiness = await window.erim.vendor.gmailPreflight({ checkCentral: true });
      if (!state.vendorGmailReadiness.ready) {
        const reconnect = window.confirm(
          `Gmail preflight: ${state.vendorGmailReadiness.state}\n${state.vendorGmailReadiness.message || ""}\n\nOK: Reconnect Gmail\nCancel: choose Draft Only or cancel Generate.`
        );
        if (reconnect) {
          state.auth = await window.erim.auth.login();
          state.vendorGmailReadiness = await window.erim.vendor.gmailPreflight({ checkCentral: true });
        }
        if (!state.vendorGmailReadiness.ready) {
          const draftOnly = window.confirm(
            "Gmail is not ready.\n\nOK: Generate Draft Only (Send remains disabled until recheck)\nCancel: cancel Generate."
          );
          if (!draftOnly) return;
        }
      }
    }
    const generatedBatch = [];
    for (const { packageKey, serviceIds, preview } of prepared) {
      const booking = await window.erim.vendor.generateBooking({
        packageKey,
        serviceIds,
        bookingId: preview.latestBooking?.bookingId || "",
        actionType: "NEW",
        channel: preview.channel,
        recipients: preview.recipients,
        subject: preview.subject,
        body: preview.body,
      });
      generatedBatch.push({
        packageKey,
        serviceIds,
        bookingId: booking.bookingId,
        channel: booking.channel,
        supplierName: booking.supplierName,
        customerCode: booking.customerCode,
        firstServiceDate: preview.services[0]?.serviceDate || "",
        firstDayNumber: preview.services[0]?.dayNumber || 0,
        firstProductName: preview.services[0]?.productName || preview.services[0]?.activityText || "",
      });
    }
    [state.vendorBookingQueue, state.vendorBookings] = await Promise.all([
      window.erim.vendor.listBookingQueue(),
      window.erim.vendor.listBookings(),
    ]);
    state.vendorCommunicationBatch = generatedBatch.sort(vendorCommunicationSort);
    state.vendorCommunicationIndex = 0;
    renderVendorBookingQueue();
    $("#vendor-communication-dialog").showModal();
    showVendorCommunicationBatchList();
    toast(`${state.selectedVendorServiceIds.size} service(s) generated into ${groups.size} supplier package(s). Nothing was sent.`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = original;
    renderVendorBookingQueue();
  }
}

async function resumeVendorGeneratedDrafts(preferredBookingId = "") {
  try {
    [state.vendorBookingQueue, state.vendorBookings] = await Promise.all([
      window.erim.vendor.listBookingQueue(),
      window.erim.vendor.listBookings(),
    ]);
    const batch = state.vendorBookings
      .filter((booking) => booking.communicationStatus === "GENERATED")
      .map((booking) => ({
        packageKey: booking.packageKey,
        serviceIds: (booking.services || []).map((service) => service.serviceId).filter(Boolean),
        bookingId: booking.bookingId,
        channel: booking.channel,
        supplierName: booking.supplierName,
        customerCode: booking.customerCode,
        firstServiceDate: booking.services[0]?.serviceDate || "",
        firstDayNumber: booking.services[0]?.dayNumber || 0,
        firstProductName: booking.services[0]?.productName || booking.services[0]?.activityText || "",
      }))
      .filter((entry) => entry.packageKey && entry.bookingId && entry.serviceIds.length)
      .sort(vendorCommunicationSort);
    if (!batch.length) {
      renderVendorBookingQueue();
      return toast("No generated draft is waiting to be sent.", true);
    }
    state.vendorCommunicationBatch = batch;
    const preferredIndex = batch.findIndex((entry) => entry.bookingId === preferredBookingId);
    state.vendorCommunicationIndex = preferredIndex >= 0 ? preferredIndex : 0;
    renderVendorBookingQueue();
    const dialog = $("#vendor-communication-dialog");
    if (!dialog.open) dialog.showModal();
    showVendorCommunicationBatchList();
    toast(`${batch.length} generated draft(s) restored. Nothing is marked Sent until delivery succeeds.`);
  } catch (error) {
    toast(error.message, true);
  }
}

function recipientLines(recipients = []) {
  return recipients.map((row) => `${row.recipientType || "TO"} | ${row.address}`).join("\n");
}

function parseRecipientLines(value) {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [type, ...addressParts] = line.split("|");
    return {
      recipientType: String(type || "TO").trim().toUpperCase(),
      address: addressParts.join("|").trim(),
    };
  }).filter((row) => row.address);
}

async function openVendorBookingPackage(packageKey, options = {}) {
  state.selectedVendorPackageKey = packageKey;
  if (options.serviceIds?.length === 1) {
    state.selectedVendorInspectionServiceId = options.serviceIds[0];
  }
  try {
    const serviceIds = Array.isArray(options.serviceIds)
      ? options.serviceIds
      : state.vendorBookingPreview?.packageKey === packageKey
        ? state.vendorBookingPreview.selectedServiceIds || [] : [];
    const preview = await window.erim.vendor.getBookingPreview({
      packageKey,
      serviceIds,
      actionType: options.actionType || $("#vendor-booking-action")?.value || "NEW",
      channel: options.channel || "",
      bookingId: options.bookingId || "",
      cancellationReason: options.cancellationReason || "",
    });
    state.vendorBookingPreview = preview;
    state.vendorSendAttempts = preview.latestBooking?.bookingId
      ? await window.erim.vendor.listSendAttempts(preview.latestBooking.bookingId)
      : [];
    state.vendorPackageChannels.set(packageKey, preview.channel);
    renderVendorBookingQueue();
    renderVendorPreparationDetails();
    if ($("#vendor-communication-dialog")?.open) renderVendorBookingPreview();
  } catch (error) {
    toast(error.message, true);
  }
}

function supplierFocusButton(preview, service, section, label) {
  return `<button class="button ghost small" type="button"
    data-open-supplier-readiness="${escapeHtml(preview.supplierId || "")}"
    data-open-supplier-name="${escapeHtml(preview.supplierName || "")}"
    data-open-supplier-section="${escapeHtml(section)}"
    data-open-supplier-product="${escapeHtml(service.productId || "")}"
    data-open-supplier-service="${escapeHtml(service.serviceId || "")}"
    data-open-supplier-date="${escapeHtml(service.serviceDate || "")}"
    data-open-supplier-package="${escapeHtml(preview.packageKey || "")}">${escapeHtml(label)}</button>`;
}

function renderVendorPreparationDetails() {
  const preview = state.vendorBookingPreview;
  const supplierPanel = $("#vendor-prep-supplier-detail");
  const productPanel = $("#vendor-prep-product-detail");
  if (!preview) {
    supplierPanel.innerHTML = `<div class="empty-notifications">Choose one Daywise service to inspect its Supplier Master detail.</div>`;
    productPanel.innerHTML = `<div class="empty-notifications">Choose one Daywise service to inspect its Product and Rate detail.</div>`;
    return;
  }
  const service = preview.services.find((row) =>
    row.serviceId === state.selectedVendorInspectionServiceId
  ) || preview.services[0] || {};
  const sop = preview.sop || {};
  const recipients = preview.recipients || [];
  supplierPanel.innerHTML = `
    <article class="vendor-prep-card white">
      <span>Supplier</span><strong>${escapeHtml(preview.supplierName)}</strong>
      <small>${escapeHtml(preview.supplierId || "Not linked")} · ${preview.masterLinked ? "ACTIVE MASTER" : "MASTER LINK REQUIRED"}</small>
    </article>
    <article class="vendor-prep-card">
      <span>Booking SOP</span>
      <strong>${escapeHtml(sop.leadTime || "No lead time")} · ${escapeHtml(sop.cutoffTime || "No cut-off")}</strong>
      <small>${escapeHtml(sop.confirmationProcedure || "No confirmation procedure recorded.")}</small>
    </article>
    <article class="vendor-prep-card white">
      <span>One delivery channel</span>
      <div class="vendor-prep-channel-list">
        ${(preview.channelOptions || ["EMAIL", "WHATSAPP", "PORTAL", "OTHERS"].map((channel) => ({
          channel, configured: preview.availableChannels.includes(channel), destinations: [],
        }))).map((option) => `<label class="${option.configured ? "ready" : "attention"}">
          <input type="radio" name="vendor-prep-channel" data-vendor-prep-channel="${escapeHtml(option.channel)}"
            data-vendor-channel-configured="${option.configured ? "true" : "false"}"
            ${option.channel === preview.channel ? "checked" : ""} />
          <span>${escapeHtml(option.channel)}
            <small>${option.configured
              ? escapeHtml(option.destinations.join(" · ") || "Ready")
              : "Missing destination — select to complete"}</small>
          </span>
        </label>`).join("")}
      </div>
    </article>
    <article class="vendor-prep-card white">
      <span>Destination</span>
      <strong>${recipients.length ? escapeHtml(recipientLines(recipients).replaceAll("\n", " · ")) : "No destination"}</strong>
      <small>${sop.portalUrl ? `Portal: ${escapeHtml(sop.portalUrl)}` : "No portal URL recorded."}</small>
    </article>
    ${preview.readinessNotices?.length ? `<article class="vendor-prep-card attention">
      <span>Readiness</span><strong>${preview.readinessNotices.map(escapeHtml).join("<br>")}</strong>
    </article>` : ""}
    <div class="vendor-prep-actions">
      ${supplierFocusButton(preview, service, !preview.masterLinked ? "PROFILE" : "RECIPIENTS", "Open Supplier / Recipients")}
      ${supplierFocusButton(preview, service, "SOP", "Open Booking SOP")}
      ${/^https:\/\//i.test(sop.portalUrl || "") ? `<button class="button ghost small" type="button" data-open-vendor-portal="${escapeHtml(sop.portalUrl)}">Open Portal</button>` : ""}
    </div>
  `;
  productPanel.innerHTML = `
    <article class="vendor-prep-card white">
      <span>Daywise source</span>
      <strong>Day ${Number(service.dayNumber || 0)} | ${escapeHtml(service.serviceDate || "Date pending")}</strong>
      <small>Day Wise Header: ${escapeHtml(service.dayTitle || "No Day Wise Header")}</small>
    </article>
    <article class="vendor-prep-card">
      <span>Product / Service</span>
      <strong>${escapeHtml(service.productName || service.activityText || "Unnamed service")}</strong>
      <small>Product ID: ${escapeHtml(service.productId || "Not linked")} · Service ID: ${escapeHtml(service.serviceId || "")}</small>
    </article>
    <article class="vendor-prep-card ${service.rateStatus === "RATE_READY" ? "" : "attention"}">
      <span>Contract & Rate</span>
      <strong>${escapeHtml(service.rateStatus || "PENDING_RATE")} · ${escapeHtml(service.priceBasis || "PER_SERVICE")}</strong>
      <small>${escapeHtml(vendorServiceRateLabel(service))}<br>
        Contract: ${escapeHtml(service.contractId || "Not linked")} · Valid to: ${escapeHtml(service.rateValidTo || "Not recorded")}</small>
      ${service.rateProvenance === "LOCAL_SUPPLIER_RATE"
        ? `<small class="supplier-draft-error">LOCAL RATE — SYNC APPROVAL REQUIRED · ${escapeHtml((service.localRateApprovalStatus || "LOCAL_ONLY").replaceAll("_", " "))}</small>` : ""}
    </article>
    <article class="vendor-prep-card white">
      <span>Rate source</span>
      <strong>${escapeHtml(service.priceSource || "NONE")}</strong>
      <small>${escapeHtml(service.manualPriceReason || "No manual reason")} · ${escapeHtml(service.manualRateSource || "No source")} · ${escapeHtml(service.manualEvidenceRef || "No evidence")}</small>
    </article>
    <div class="vendor-prep-actions">
      ${supplierFocusButton(preview, service, service.productId ? "PRODUCT" : "PRODUCT", "Open Product")}
      ${supplierFocusButton(preview, service, "RATE", service.rateStatus === "RATE_READY" ? "Open Contract / Rate" : "Isi harga")}
      ${service.rateStatus !== "RATE_READY" ? `<button class="button ghost small" type="button" data-skip-vendor-rate="${escapeHtml(service.serviceId || "")}">Skip untuk sekarang</button>` : ""}
    </div>
  `;
}

function vendorCommunicationBooking(entry) {
  return state.vendorBookings.find((booking) => booking.bookingId === entry?.bookingId)
    || state.vendorBookings.find((booking) => booking.packageKey === entry?.packageKey)
    || null;
}

function showVendorCommunicationBatchList() {
  $("#vendor-communication-batch-view").hidden = false;
  $("#vendor-communication-work-view").hidden = true;
  state.vendorCommunicationIndex = -1;
  state.vendorBookingPreview = null;
  state.vendorCommunicationBaseline = "";
  renderVendorCommunicationQueue();
  renderVendorCommunicationBatchGrid();
}

function showVendorCommunicationWorkView() {
  $("#vendor-communication-batch-view").hidden = true;
  $("#vendor-communication-work-view").hidden = false;
}

function refreshVendorCommunicationBatch() {
  const activeById = new Map((state.vendorBookings || [])
    .filter((booking) => booking.communicationStatus === "GENERATED")
    .map((booking) => [booking.bookingId, booking]));
  state.vendorCommunicationBatch = (state.vendorCommunicationBatch || []).map((entry) => {
    const booking = activeById.get(entry.bookingId);
    if (!booking) return null;
    const serviceIds = (booking.services || []).map((service) => service.serviceId).filter(Boolean);
    return serviceIds.length ? { ...entry, serviceIds } : null;
  }).filter(Boolean).sort(vendorCommunicationSort);
  if (state.vendorCommunicationIndex >= state.vendorCommunicationBatch.length) {
    state.vendorCommunicationIndex = state.vendorCommunicationBatch.length - 1;
  }
}

function renderVendorCommunicationBatchGrid() {
  const grid = $("#vendor-communication-batch-grid");
  const batch = state.vendorCommunicationBatch || [];
  grid.innerHTML = batch.length ? `
    <div class="vendor-batch-row vendor-batch-head">
      <span>Code / Client</span><span>Channel</span><span>Supplier</span>
      <span>Items</span><span>Status</span><span>Action</span>
    </div>
    ${batch.map((entry, index) => {
      const booking = vendorCommunicationBooking(entry);
      const services = (booking?.services || []).filter((service) =>
        entry.serviceIds.includes(service.serviceId)
      );
      return `<details class="vendor-batch-package" open>
        <summary class="vendor-batch-row">
          <span><strong>${escapeHtml(entry.customerCode)}</strong><small>${escapeHtml(booking?.customerName || "")}</small></span>
          <span>${escapeHtml(entry.channel)}</span>
          <span>${escapeHtml(entry.supplierName)}</span>
          <span>${services.length}</span>
          <span>${statusPill(booking?.communicationStatus || "NOT_GENERATED")}</span>
          <span><button class="button primary small" type="button" data-vendor-batch-review="${index}">Review</button></span>
        </summary>
        <div class="vendor-batch-services">
          ${services.map((service) => `<div class="vendor-batch-service-row">
            <span>└─ Day ${Number(service.dayNumber || 0)}</span>
            <span>${escapeHtml(formatVendorDate(service.serviceDate) || service.serviceDate || "Date pending")}</span>
            <strong>${escapeHtml(service.productName || service.activityText || "Service")}</strong>
            <span>${escapeHtml(service.rateStatus || "")}</span>
            <button class="button ghost small" type="button"
              data-cancel-generated-service="${escapeHtml(service.serviceId)}"
              data-cancel-generated-booking="${escapeHtml(booking?.bookingId || entry.bookingId)}">Cancel Generate</button>
          </div>`).join("") || `<div class="empty-notifications">No active generated service remains.</div>`}
        </div>
      </details>`;
    }).join("")}
  ` : `<div class="empty-notifications">No generated package in this batch.</div>`;
}

async function cancelVendorGeneratedService(bookingId, serviceId) {
  state.vendorGeneratedCancelTarget = { bookingId, serviceId };
  $("#vendor-generated-cancel-form").elements.reason.value = "";
  $("#vendor-generated-cancel-dialog").showModal();
}

async function submitVendorGeneratedServiceCancel(event) {
  event.preventDefault();
  const target = state.vendorGeneratedCancelTarget;
  const reason = event.currentTarget.elements.reason.value.trim();
  if (!target || !reason) return;
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await window.erim.vendor.cancelGeneratedService({
      ...target, reason,
    });
    [state.vendorBookingQueue, state.vendorBookings] = await Promise.all([
      window.erim.vendor.listBookingQueue(),
      window.erim.vendor.listBookings(),
    ]);
    refreshVendorCommunicationBatch();
    state.vendorGeneratedCancelTarget = null;
    $("#vendor-generated-cancel-dialog").close();
    renderVendorBookingQueue();
    showVendorCommunicationBatchList();
    toast(result.remainingServiceCount
      ? "One item returned to NOT GENERATED. The remaining package snapshot was rebuilt."
      : "Final item returned to NOT GENERATED. The package is no longer generated.");
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

function renderVendorCommunicationQueue() {
  const list = $("#vendor-communication-queue-list");
  const batch = state.vendorCommunicationBatch || [];
  const counts = { sent: 0, ready: 0, pending: 0, attention: 0 };
  list.innerHTML = batch.length ? batch.map((entry, index) => {
    const booking = vendorCommunicationBooking(entry);
    const status = booking?.communicationStatus || "NOT_GENERATED";
    if (status === "SENT") counts.sent += 1;
    else if (status === "GENERATED") counts.ready += 1;
    else if (["SENT_PENDING_SYNC", "SEND_OUTCOME_UNKNOWN"].includes(status)) counts.attention += 1;
    else counts.pending += 1;
    return `<button class="vendor-communication-queue-item${index === state.vendorCommunicationIndex ? " active" : ""}"
      type="button" data-vendor-communication-index="${index}">
      <span>${escapeHtml(entry.channel)} · ${index + 1} of ${batch.length}</span>
      <strong>${escapeHtml(entry.supplierName)} · ${escapeHtml(entry.customerCode)}</strong>
      <small>${entry.serviceIds.length} service(s) · ${escapeHtml(status.replaceAll("_", " "))}</small>
    </button>`;
  }).join("") : `<div class="empty-notifications">No generated package in this batch.</div>`;
  $("#vendor-communication-progress").textContent =
    `${batch.length} Packages | ${counts.sent} Sent | ${counts.ready} Ready | ${counts.pending} Not Generated | ${counts.attention} Attention`;
  $("#vendor-communication-position").textContent = batch.length
    ? `Package ${state.vendorCommunicationIndex + 1} of ${batch.length}` : "Package 0 of 0";
  $("#vendor-communication-previous").disabled = state.vendorCommunicationIndex <= 0;
  $("#vendor-communication-next").disabled = !batch.length;
}

async function openVendorCommunicationPackage(index) {
  const batch = state.vendorCommunicationBatch || [];
  if (!batch.length) return;
  state.vendorCommunicationIndex = Math.max(0, Math.min(index, batch.length - 1));
  showVendorCommunicationWorkView();
  const entry = batch[state.vendorCommunicationIndex];
  await openVendorBookingPackage(entry.packageKey, {
    serviceIds: entry.serviceIds,
    actionType: vendorCommunicationBooking(entry)?.actionType || "NEW",
    channel: entry.channel,
  });
  renderVendorCommunicationQueue();
  renderVendorBookingPreview();
}

function vendorCommunicationCurrentValues() {
  return JSON.stringify({
    actionType: $("#vendor-booking-action").value,
    recipients: $("#vendor-booking-recipients").value,
    subject: $("#vendor-booking-subject").value,
    body: $("#vendor-booking-body").value,
  });
}

async function confirmVendorCommunicationNavigation() {
  if (vendorCommunicationCurrentValues() === state.vendorCommunicationBaseline) return true;
  const save = window.confirm(
    "Generated message has unsaved changes.\n\nOK: Save & Next\nCancel: choose whether to discard or stay."
  );
  if (save) return Boolean(await generateVendorBooking());
  return window.confirm(
    "Discard the unsaved changes and continue?\n\nOK: Discard & Next\nCancel: Stay on this package."
  );
}

async function navigateVendorCommunication(direction) {
  const batch = state.vendorCommunicationBatch || [];
  if (!batch.length) return;
  if (!await confirmVendorCommunicationNavigation()) return;
  if (direction === "PREVIOUS") {
    return openVendorCommunicationPackage(Math.max(0, state.vendorCommunicationIndex - 1));
  }
  for (let offset = 1; offset <= batch.length; offset += 1) {
    const index = (state.vendorCommunicationIndex + offset) % batch.length;
    const status = vendorCommunicationBooking(batch[index])?.communicationStatus || "NOT_GENERATED";
    if (status !== "SENT") return openVendorCommunicationPackage(index);
  }
  toast("All packages in this batch are already sent.");
}

async function openVendorCommunicationFromQueue(index) {
  if (index === state.vendorCommunicationIndex) return;
  if (!await confirmVendorCommunicationNavigation()) return;
  return openVendorCommunicationPackage(index);
}

function renderVendorBookingPreview() {
  const preview = state.vendorBookingPreview;
  $("#vendor-booking-empty").hidden = Boolean(preview);
  $("#vendor-booking-preview").hidden = !preview;
  if (!preview) return;
  $("#vendor-booking-preview-title").textContent = `${preview.customerCode} · ${preview.supplierName}`;
  $("#vendor-booking-preview-status").innerHTML = `${statusPill(preview.rateStatus)} ${statusPill(preview.workflowStatus)}`;
  $("#vendor-booking-action").value = preview.actionType;
  $("#vendor-booking-channel").innerHTML = preview.availableChannels.map((channel) =>
    `<option value="${escapeHtml(channel)}"${channel === preview.channel ? " selected" : ""}>${escapeHtml(channel)}</option>`
  ).join("");
  const storedSnapshot = preview.latestBooking?.actionType === preview.actionType
    && preview.latestBooking?.channel === preview.channel ? preview.latestBooking : null;
  const effectiveRecipients = storedSnapshot?.recipients || preview.recipients;
  const effectiveSubject = storedSnapshot?.subject || preview.subject;
  const effectiveBody = storedSnapshot?.body || preview.body;
  $("#vendor-booking-recipients").value = recipientLines(effectiveRecipients);
  $("#vendor-booking-subject").value = effectiveSubject;
  $("#vendor-booking-body").value = effectiveBody;
  const deliveryHistoryMode = ["SENT", "SENT_PENDING_SYNC", "SEND_OUTCOME_UNKNOWN"]
    .includes(storedSnapshot?.communicationStatus || "");
  $("#vendor-booking-action").disabled = deliveryHistoryMode;
  $("#vendor-booking-recipients").readOnly = deliveryHistoryMode;
  $("#vendor-booking-subject").readOnly = deliveryHistoryMode;
  $("#vendor-booking-body").readOnly = deliveryHistoryMode;
  $("#generate-vendor-booking").hidden = deliveryHistoryMode;
  $("#vendor-booking-service-summary").innerHTML = `
    <div><strong>${preview.serviceCount} service</strong><small>${preview.adultPax} adult · ${preview.childPax} child · ${preview.infantPax} infant</small></div>
    ${preview.services.map((service) => `
      <article class="vendor-booking-service-item">
        <div>
        <span>Day ${service.dayNumber} · ${escapeHtml(service.serviceDate || "date pending")}</span>
        <strong>${escapeHtml(service.productName || service.activityText)}</strong>
        <small>${escapeHtml(service.priceBasis || "PER SERVICE")} · ${escapeHtml(vendorServiceRateLabel(service))} · ${escapeHtml(service.rateStatus)}</small>
        </div>
        ${storedSnapshot?.communicationStatus === "GENERATED"
          ? `<button class="button danger small" type="button"
              data-cancel-generated-service="${escapeHtml(service.serviceId)}"
              data-cancel-generated-booking="${escapeHtml(storedSnapshot.bookingId)}">Cancel Generate item</button>`
          : ""}
      </article>
    `).join("")}
  `;
  const sop = preview.sop || {};
  const focusService = preview.services.find((service) => service.rateStatus !== "RATE_READY")
    || preview.services[0] || {};
  const focusSection = !preview.masterLinked
    ? "PROFILE"
    : preview.readinessNotices?.some((notice) => String(notice).toUpperCase().includes("SOP"))
      ? "SOP"
      : preview.readinessNotices?.some((notice) =>
        /RECIPIENT|DESTINATION|EMAIL|WHATSAPP/i.test(String(notice)))
        ? "RECIPIENTS"
        : preview.pendingRateCount ? (focusService.productId ? "RATE" : "PRODUCT") : "PROFILE";
  $("#vendor-booking-sop").innerHTML = [
    sop.leadTime && `Lead time: ${sop.leadTime}`,
    sop.cutoffTime && `Cut-off: ${sop.cutoffTime}`,
    sop.portalUrl && `Portal: ${sop.portalUrl}`,
    sop.confirmationProcedure && `Confirmation: ${sop.confirmationProcedure}`,
    preview.pendingRateCount ? `${preview.pendingRateCount} rate belum final; booking tetap boleh dikirim.` : "",
    !preview.masterLinked ? "Supplier belum terhubung ke Supplier Master; recipient/channel perlu dicek manual." : "",
  ].filter(Boolean).map((line) => `<span>${escapeHtml(line)}</span>`).join("")
    + `<button class="button ghost small" type="button"
      data-open-supplier-readiness="${escapeHtml(preview.supplierId || "")}"
      data-open-supplier-name="${escapeHtml(preview.supplierName || "")}"
      data-open-supplier-section="${escapeHtml(focusSection)}"
      data-open-supplier-product="${escapeHtml(focusService.productId || "")}"
      data-open-supplier-service="${escapeHtml(focusService.serviceId || "")}"
      data-open-supplier-date="${escapeHtml(focusService.serviceDate || "")}"
      data-open-supplier-package="${escapeHtml(preview.packageKey || "")}">Open exact Supplier Master</button>`;
  const latest = preview.latestBooking || {};
  const emailRecipients = (effectiveRecipients || []).filter((row) =>
    ["TO", "CC", "BCC"].includes(String(row.recipientType || "").toUpperCase())
  );
  const attemptHistory = (state.vendorSendAttempts || []).map((attempt) => `
    <article class="vendor-final-message">
      <strong>${attempt.resendOfAttemptId ? "Resend" : "Original send"} · ${escapeHtml(attempt.status.replaceAll("_", " "))}</strong>
      <small>${escapeHtml(attempt.preparedAt || "")}${attempt.resendReason ? ` · ${escapeHtml(attempt.resendReason)}` : ""}
        ${attempt.actorEmail ? `<br>Sender: ${escapeHtml(attempt.actorEmail)}` : ""}
        ${attempt.gmailMessageId ? `<br>Message ID: ${escapeHtml(attempt.gmailMessageId)}` : ""}
        ${attempt.gmailThreadId ? `<br>Thread ID: ${escapeHtml(attempt.gmailThreadId)}` : ""}
      </small>
      ${attempt.gmailThreadId ? `<button class="button ghost small" type="button" data-open-gmail-thread="${escapeHtml(attempt.gmailThreadId)}">Open Gmail thread</button>` : ""}
      ${attempt.gmailMessageId ? `<button class="button ghost small" type="button"
        data-copy-vendor-evidence="${escapeHtml(attempt.gmailMessageId)}">Copy Message ID</button>` : ""}
      ${latest.communicationStatus === "SENT" && attempt.status === "SYNCED"
        ? `<button class="button danger small" type="button"
            data-open-vendor-resend-attempt="${escapeHtml(attempt.sendAttemptId)}">Resend from this delivery</button>` : ""}
      ${attempt.status === "SEND_OUTCOME_UNKNOWN"
        ? `<button class="button danger small" type="button"
            data-reconcile-vendor-send="${escapeHtml(attempt.sendAttemptId)}">Reconcile Gmail outcome</button>` : ""}
    </article>
  `).join("");
  const whatsappNumber = (preview.recipients || []).find((row) =>
    String(row.recipientType || "").toUpperCase() === "WHATSAPP"
  )?.address || "";
  const channelAction = preview.channel === "PORTAL" && /^https:\/\//i.test(sop.portalUrl || "")
    ? `<button class="button primary" type="button" data-open-vendor-booking-portal="${escapeHtml(sop.portalUrl)}">Open supplier portal</button>`
    : preview.channel === "WHATSAPP" && whatsappNumber
      ? `<button class="button primary" type="button" data-open-vendor-portal="https://wa.me/${escapeHtml(String(whatsappNumber).replace(/\D/g, ""))}">Open WhatsApp</button>`
      : "";
  $("#vendor-email-context-content").innerHTML = `
    ${preview.channel === "PORTAL" && preview.portalTransaction?.paymentInstruction ? `
      <article class="vendor-portal-payment-notice">
        <span>Eka Jaya payment method · ${escapeHtml(String(preview.portalTransaction.leadDays))} calendar days</span>
        <strong>${escapeHtml(preview.portalTransaction.paymentInstruction)}</strong>
        <small>Booking date ${escapeHtml(preview.portalTransaction.bookingDate)}
          → outbound ${escapeHtml(preview.portalTransaction.earliestServiceDate)}</small>
      </article>` : ""}
    ${preview.channel === "EMAIL" ? `<article class="vendor-final-message">
      <strong>Gmail sender: ${escapeHtml(state.auth.email || "Google account not connected")}</strong>
      <small>${emailRecipients.length
        ? emailRecipients.map((row) => `${escapeHtml(row.recipientType)}: ${escapeHtml(row.address)}`).join("<br>")
        : "No Email recipient is ready."}</small>
    </article>
    <article class="vendor-final-message">
      <strong>${escapeHtml((latest.deliveryEvidenceStatus || "EMAIL_ID_NOT_CREATED").replaceAll("_", " "))}</strong>
      <small>${latest.gmailMessageId ? `Message ID: ${escapeHtml(latest.gmailMessageId)}<br>` : ""}
        ${latest.gmailThreadId ? `Thread ID: ${escapeHtml(latest.gmailThreadId)}<br>` : ""}
        Official sync: ${escapeHtml(latest.officialSyncStatus || "NOT REQUIRED")}</small>
    </article>` : ""}
    ${latest.gmailThreadId ? `<button class="button ghost small" type="button" data-open-gmail-thread="${escapeHtml(latest.gmailThreadId)}">Open stored Gmail thread</button>`
      : `<div class="callout">No stored Gmail thread yet. Generating does not send or create a thread.</div>`}
    <article class="vendor-final-message">
      <strong id="vendor-final-message-subject">${escapeHtml(effectiveSubject)}</strong>
      <small>Template: ${preview.templateVersion || "STANDARD_V1"} · ${escapeHtml(preview.channel)}</small>
      <pre id="vendor-final-message-body">${escapeHtml(effectiveBody)}</pre>
    </article>
    ${attemptHistory}
    ${channelAction}
    ${preview.channel === "EMAIL" && latest.communicationStatus === "SENT"
      ? `<button id="open-vendor-resend" class="button danger" type="button">Kirim ulang / Ganti penerima</button>` : ""}
  `;
  const generated = preview.latestBooking?.communicationStatus === "GENERATED";
  $("#vendor-booking-send-panel").hidden = !generated || preview.channel === "EMAIL";
  $("#vendor-external-reference-label").textContent = preview.channel === "PORTAL"
    ? "Portal ticket / booking reference"
    : preview.channel === "WHATSAPP"
      ? "WhatsApp delivery time / evidence"
      : "External reference / evidence note";
  $("#record-vendor-booking-sent").textContent = preview.channel === "PORTAL"
    ? "Record portal booking"
    : preview.channel === "WHATSAPP" ? "Record WhatsApp sent" : "Record as sent";
  $("#send-vendor-booking-email").hidden = !generated || preview.channel !== "EMAIL";
  $("#send-vendor-booking-email").disabled = preview.channel === "EMAIL"
    && (!state.vendorGmailReadiness?.ready
      || !["GMAIL_READY", "CENTRAL_SYNC_UNAVAILABLE"].includes(state.vendorGmailReadiness.state));
  $("#vendor-booking-send-note").textContent = preview.channel === "EMAIL"
    ? generated
      ? "Generated snapshot is ready. Send uses the connected employee Gmail and requires one final confirmation."
      : latest.communicationStatus === "SENT"
        ? "This package is sent. Open its Gmail thread or use the controlled resend action."
        : "Generate first; email sending will then require explicit final confirmation."
    : "Generate first, complete the external action, then record its reference/evidence.";
  state.vendorCommunicationBaseline = JSON.stringify({
    actionType: $("#vendor-booking-action").value,
    recipients: $("#vendor-booking-recipients").value,
    subject: $("#vendor-booking-subject").value,
    body: $("#vendor-booking-body").value,
  });
  renderVendorGmailReadiness();
  renderVendorCommunicationQueue();
}

async function generateVendorBooking() {
  const preview = state.vendorBookingPreview;
  if (!preview) return toast("Choose a supplier package first.", true);
  const recipients = parseRecipientLines($("#vendor-booking-recipients").value);
  const channel = $("#vendor-booking-channel").value;
  if (channel === "EMAIL" && !recipients.some((row) => row.recipientType === "TO")) {
    return toast("Email booking requires at least one TO recipient.", true);
  }
  const button = $("#generate-vendor-booking");
  button.disabled = true;
  try {
    const booking = await window.erim.vendor.generateBooking({
      packageKey: preview.packageKey,
      serviceIds: preview.selectedServiceIds,
      bookingId: preview.latestBooking?.bookingId || "",
      actionType: $("#vendor-booking-action").value,
      channel,
      recipients,
      subject: $("#vendor-booking-subject").value,
      body: $("#vendor-booking-body").value,
      cancellationReason: preview.cancellationReason || "",
    });
    [state.vendorBookingQueue, state.vendorBookings] = await Promise.all([
      window.erim.vendor.listBookingQueue(),
      window.erim.vendor.listBookings(),
    ]);
    await openVendorBookingPackage(preview.packageKey, {
      actionType: booking.actionType,
      channel: booking.channel,
      cancellationReason: booking.cancellationReason,
    });
    $("#vendor-booking-send-panel").hidden = booking.channel === "EMAIL";
    toast(`${booking.actionType} booking generated for ${booking.supplierName}. Nothing was sent yet.`);
    return booking;
  } catch (error) {
    toast(error.message, true);
    return null;
  } finally {
    button.disabled = false;
  }
}

async function recordVendorBookingSent() {
  const booking = state.vendorBookingPreview?.latestBooking;
  if (!booking?.bookingId) return toast("Generate this booking first.", true);
  try {
    await window.erim.vendor.recordExternalSent({
      bookingId: booking.bookingId,
      externalReference: $("#vendor-booking-external-reference").value,
    });
    await refresh();
    refreshVendorCommunicationBatch();
    showVendorCommunicationBatchList();
    toast("External booking action recorded as sent with local evidence.");
  } catch (error) {
    toast(error.message, true);
  }
}

async function sendVendorBookingEmail() {
  const booking = state.vendorBookingPreview?.latestBooking;
  if (!booking?.bookingId || booking.communicationStatus !== "GENERATED") {
    return toast("Generate the latest email snapshot first.", true);
  }
  state.vendorGmailReadiness = await window.erim.vendor.gmailPreflight({ checkCentral: true });
  renderVendorGmailReadiness();
  if (!state.vendorGmailReadiness.ready) {
    return toast(`Gmail is not ready: ${state.vendorGmailReadiness.state}. Reconnect before Send.`, true);
  }
  const to = (booking.recipients || [])
    .filter((row) => row.recipientType === "TO").map((row) => row.address).join(", ");
  const confirmed = window.confirm(
    `Send this booking email now?\n\nSupplier: ${booking.supplierName}\nTO: ${to}\nSubject: ${booking.subject}\n\nThis action sends a real email from ${state.auth.email || "the connected Google account"}.`
  );
  if (!confirmed) return;
  const button = $("#send-vendor-booking-email");
  button.disabled = true;
  button.textContent = "Sending...";
  try {
    const result = await window.erim.vendor.sendBookingEmail({
      bookingId: booking.bookingId,
      expectedBookingUpdatedAt: booking.updatedAt,
    });
    await refresh();
    refreshVendorCommunicationBatch();
    showVendorCommunicationBatchList();
    toast(result.pendingSync
      ? `Email sent once. Official evidence is pending sync; Gmail message ${result.gmailMessageId}.`
      : `Email sent and synced. Gmail message: ${result.gmailMessageId}`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Send via Gmail";
  }
}

async function recheckVendorGmail() {
  const button = $("[data-recheck-vendor-gmail]");
  if (button) button.disabled = true;
  try {
    state.vendorGmailReadiness = await window.erim.vendor.gmailPreflight({ checkCentral: true });
    renderVendorBookingPreview();
    toast(state.vendorGmailReadiness.ready
      ? `Gmail ready as ${state.vendorGmailReadiness.senderEmail}.`
      : `Gmail check: ${state.vendorGmailReadiness.state}`, !state.vendorGmailReadiness.ready);
    return state.vendorGmailReadiness;
  } finally {
    if (button) button.disabled = false;
  }
}

async function openVendorBookingPortal(url) {
  const preview = state.vendorBookingPreview;
  if (!preview || preview.channel !== "PORTAL") return;
  const refreshed = await window.erim.vendor.getBookingPreview({
    packageKey: preview.packageKey,
    serviceIds: preview.selectedServiceIds,
    bookingId: preview.latestBooking?.bookingId || "",
    actionType: preview.actionType,
    channel: "PORTAL",
  });
  if (refreshed.latestBooking?.bookingId
    && refreshed.latestBooking.communicationStatus === "GENERATED") {
    const evidence = await window.erim.vendor.refreshPortalEvidence(
      refreshed.latestBooking.bookingId,
    );
    refreshed.latestBooking = evidence.booking;
    refreshed.portalTransaction = evidence.portalTransaction;
  }
  state.vendorBookingPreview = refreshed;
  renderVendorBookingPreview();
  await window.erim.external.open(url);
}

async function openVendorDeliveryHistory(bookingId) {
  const booking = state.vendorBookings.find((row) => row.bookingId === bookingId);
  if (!booking) return toast("Booking delivery history was not found.", true);
  const entry = {
    packageKey: booking.packageKey,
    serviceIds: (booking.services || []).map((service) => service.serviceId).filter(Boolean),
    bookingId: booking.bookingId,
    channel: booking.channel,
    supplierName: booking.supplierName,
    customerCode: booking.customerCode,
    firstServiceDate: booking.services?.[0]?.serviceDate || "",
    firstDayNumber: booking.services?.[0]?.dayNumber || 0,
    firstProductName: booking.services?.[0]?.productName || booking.services?.[0]?.activityText || "",
  };
  state.vendorCommunicationBatch = [entry];
  state.vendorCommunicationIndex = 0;
  const dialog = $("#vendor-communication-dialog");
  if (!dialog.open) dialog.showModal();
  await openVendorBookingPackage(booking.packageKey, {
    bookingId: booking.bookingId,
    serviceIds: entry.serviceIds,
    actionType: booking.actionType,
    channel: booking.channel,
  });
}

function openVendorResendDialog(sendAttemptId = "") {
  const booking = state.vendorBookingPreview?.latestBooking;
  const originalAttempt = (state.vendorSendAttempts || []).find((attempt) =>
    attempt.sendAttemptId === sendAttemptId
  ) || (state.vendorSendAttempts || []).find((attempt) =>
    ["SYNCED", "SENT_PENDING_SYNC", "GMAIL_ACCEPTED"].includes(attempt.status)
  );
  if (!booking?.bookingId || !originalAttempt?.sendAttemptId) {
    return toast("A proven original Gmail attempt is required before resend.", true);
  }
  const form = $("#vendor-resend-form");
  form.dataset.bookingId = booking.bookingId;
  form.dataset.originalAttemptId = originalAttempt.sendAttemptId;
  $("#vendor-resend-notice").innerHTML = `
    <strong>This booking was already sent.</strong>
    <p>Sent ${escapeHtml(originalAttempt.gmailAcceptedAt || originalAttempt.preparedAt)}
      by ${escapeHtml(originalAttempt.actorEmail || "connected Gmail")}. Sending again may deliver the booking more than once.</p>
    <p><strong>Subject:</strong> ${escapeHtml(booking.subject)}</p>
  `;
  const oldRecipients = recipientLines(originalAttempt.snapshot?.recipients || booking.recipients);
  $("#vendor-resend-old-recipients").value = oldRecipients;
  $("#vendor-resend-new-recipients").value = oldRecipients;
  $("#vendor-resend-reason").value = "";
  $("#vendor-resend-dialog").showModal();
}

async function submitVendorResend(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const recipients = parseRecipientLines($("#vendor-resend-new-recipients").value);
  const reason = $("#vendor-resend-reason").value.trim();
  if (!recipients.some((row) => row.recipientType === "TO")) {
    return toast("Resend requires at least one TO recipient.", true);
  }
  if (!reason) return toast("Resend reason is required.", true);
  const confirmed = window.confirm(
    `Continue with intentional resend?\n\nNew TO: ${recipients.filter((row) => row.recipientType === "TO").map((row) => row.address).join(", ")}\nReason: ${reason}\n\nThe original email remains in delivery history.`
  );
  if (!confirmed) return;
  const button = $("#confirm-vendor-resend");
  button.disabled = true;
  button.textContent = "Sending...";
  try {
    const result = await window.erim.vendor.sendBookingEmail({
      bookingId: form.dataset.bookingId,
      resendOfAttemptId: form.dataset.originalAttemptId,
      resendReason: reason,
      recipients,
    });
    $("#vendor-resend-dialog").close();
    await refresh();
    const entry = state.vendorCommunicationBatch[state.vendorCommunicationIndex];
    if (entry) await openVendorCommunicationPackage(state.vendorCommunicationIndex);
    toast(result.pendingSync
      ? "Intentional resend was accepted by Gmail; official evidence sync is pending."
      : "Intentional resend sent once and linked to the original delivery.");
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Continue";
  }
}

function renderVendorCancel() {
  const select = $("#vendor-cancel-customer");
  if (!select) return;
  const previous = select.value;
  const customers = [...new Map((state.vendorBookingQueue || []).map((item) =>
    [item.customerCode, item.customerName]
  )).entries()];
  select.innerHTML = `<option value="">Choose Customer Code</option>${customers.map(([code, name]) =>
    `<option value="${escapeHtml(code)}">${escapeHtml(code)} · ${escapeHtml(name)}</option>`
  ).join("")}`;
  if (customers.some(([code]) => code === previous)) select.value = previous;
  const cancellations = (state.vendorBookings || []).filter((row) => row.actionType === "CANCEL");
  $("#vendor-cancel-package-list").innerHTML = cancellations.length ? cancellations.map((row) => `
    <article class="vendor-cancel-record">
      <div><strong>${escapeHtml(row.customerCode)} · ${escapeHtml(row.supplierName)}</strong><small>${escapeHtml(row.channel)} · ${escapeHtml(row.communicationStatus)} · ${escapeHtml(row.cancellationReason)}</small></div>
      <button class="button ghost small" type="button" data-open-vendor-cancel="${escapeHtml(row.packageKey)}">Open</button>
    </article>
  `).join("") : `<div class="empty-notifications">No cancellation package prepared.</div>`;
}

async function prepareVendorCancelAll() {
  const customerCode = $("#vendor-cancel-customer").value;
  const reason = $("#vendor-cancel-reason").value.trim();
  if (!customerCode || !reason) return toast("Customer Code and cancellation reason are required.", true);
  const packages = state.vendorBookingQueue.filter((item) => item.customerCode === customerCode);
  if (!packages.length) return toast("No Vendor package exists for this Customer Code.", true);
  const button = $("#prepare-vendor-cancel");
  button.disabled = true;
  try {
    for (const item of packages) {
      const preview = await window.erim.vendor.getBookingPreview({
        packageKey: item.packageKey, actionType: "CANCEL", cancellationReason: reason,
      });
      await window.erim.vendor.generateBooking({
        packageKey: item.packageKey,
        actionType: "CANCEL",
        channel: preview.channel,
        recipients: preview.recipients,
        subject: preview.subject,
        body: preview.body,
        cancellationReason: reason,
      });
    }
    [state.vendorBookingQueue, state.vendorBookings] = await Promise.all([
      window.erim.vendor.listBookingQueue(), window.erim.vendor.listBookings(),
    ]);
    renderVendorCancel();
    renderVendorBookingQueue();
    toast(`${packages.length} cancellation package(s) prepared. Nothing was sent.`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
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

function supplierCatalogFrom(payload) {
  return payload?.catalog || payload || {
    supplierTypes: [], suppliers: [], contacts: [], recipients: [],
    sops: [], products: [], contracts: [], rates: [],
  };
}

function applySupplierLocalResult(result) {
  state.supplierMaster = supplierCatalogFrom(result);
  state.supplierMasterDrafts = result?.drafts || state.supplierMasterDrafts;
  renderSupplierDraftStatus();
  return result?.draft || null;
}

function supplierDraftLabel(draft) {
  const payload = draft.payload || {};
  if (draft.entityKind === "TYPE") return payload.typeName || payload.typeCode || draft.entityId;
  if (draft.entityKind === "SUPPLIER") return payload.supplierName || draft.entityId;
  if (draft.entityKind === "PRODUCT") return payload.productName || draft.entityId;
  if (draft.entityKind === "CONTRACT") return payload.contractNumber || draft.entityId;
  if (draft.entityKind === "ARCHIVE") return `Archive ${payload.entityKind || "record"} ${payload.entityId || ""}`;
  return draft.entityId;
}

function supplierApprovalReminderLabel(approval) {
  if (approval?.status !== "APPROVAL_REQUESTED" || !approval.requestedAt) return "";
  const hours = Math.max(0, (Date.now() - Date.parse(approval.requestedAt)) / 3_600_000);
  if (hours >= 24) return "REMINDER 24H";
  if (hours >= 8) return "REMINDER 8H";
  if (hours >= 4) return "REMINDER 4H";
  return "";
}

function renderSupplierDraftStatus() {
  const pending = (state.supplierMasterDrafts || []).filter((row) => row.localStatus !== "SYNCED");
  const publishable = pending.filter((row) =>
    row.entityKind !== "CONTRACT"
    || !(row.payload?.rates || []).length
    || row.rateApproval?.status === "APPROVED_TO_SYNC"
  );
  const approvalPending = pending.filter((row) =>
    row.rateApproval?.status === "APPROVAL_REQUESTED"
  );
  $("#supplier-draft-count").textContent = String(pending.length);
  $("#publish-supplier-drafts").disabled = !publishable.length;
  $("#review-supplier-drafts").classList.toggle("attention", Boolean(pending.length));
  const list = $("#supplier-draft-list");
  if (!list) return;
  const mayReviewCentral = state.bootstrap?.settings?.department === "MANAGER_ADMIN"
    || state.bootstrap?.settings?.environment === "ADMIN_DEV";
  const localApprovalIds = new Set(pending.map((draft) => draft.rateApproval?.approvalId).filter(Boolean));
  const centralOnly = (state.supplierRateApprovals || []).filter((approval) =>
    approval.status === "APPROVAL_REQUESTED" && !localApprovalIds.has(approval.approvalId)
  );
  $("#supplier-draft-count").textContent = String(pending.length + centralOnly.length);
  $("#review-supplier-drafts").classList.toggle(
    "attention",
    Boolean(pending.length || centralOnly.length),
  );
  const centralMarkup = centralOnly.map((approval) => `
    <div class="supplier-draft-row">
      <span>
        <strong>${escapeHtml(approval.payload?.contractNumber || approval.entityId || "Local Contract / Rate")}</strong>
        <small>Central approval inbox · Maker ${escapeHtml(approval.makerEmail || approval.makerEmployeeId || "unknown")}
          · ${escapeHtml(formatDate(approval.requestedAt))}</small>
        <span class="supplier-draft-error">LOCAL RATE — SYNC APPROVAL REQUIRED · APPROVAL REQUESTED</span>
        ${supplierApprovalReminderLabel(approval)
          ? `<span class="supplier-draft-error">${supplierApprovalReminderLabel(approval)}</span>` : ""}
        <small>${escapeHtml(approval.requestReason || "")}<br>${escapeHtml(approval.evidenceReference || "")}</small>
        ${mayReviewCentral ? `
          <button class="button primary small" type="button" data-review-rate-approval="${escapeHtml(approval.approvalId)}" data-rate-decision="APPROVE">Approve sync</button>
          <button class="button ghost small" type="button" data-review-rate-approval="${escapeHtml(approval.approvalId)}" data-rate-decision="REQUEST_CHANGES">Request changes</button>
          <button class="button danger small" type="button" data-review-rate-approval="${escapeHtml(approval.approvalId)}" data-rate-decision="REJECT">Reject</button>
        ` : ""}
      </span>
      ${statusPill(approval.status)}
    </div>
  `).join("");
  const localMarkup = pending.map((draft) => {
    const rateApprovalRequired = draft.entityKind === "CONTRACT"
      && (draft.payload?.rates || []).length;
    const approval = draft.rateApproval;
    const mayReview = state.bootstrap?.settings?.department === "MANAGER_ADMIN"
      || state.bootstrap?.settings?.environment === "ADMIN_DEV";
    const canPublish = !rateApprovalRequired || approval?.status === "APPROVED_TO_SYNC";
    return `
    <div class="supplier-draft-row">
      <input type="checkbox" data-supplier-draft-select value="${escapeHtml(draft.draftId)}"
        ${draft.localStatus === "SYNCING" || !canPublish ? "disabled" : "checked"} />
      <span>
        <strong>${escapeHtml(supplierDraftLabel(draft))}</strong>
        <small>${escapeHtml(draft.entityKind)} · saved ${escapeHtml(formatDate(draft.updatedAt))}</small>
        ${rateApprovalRequired ? `<span class="supplier-draft-error">LOCAL RATE — SYNC APPROVAL REQUIRED · ${escapeHtml((approval?.status || "LOCAL_ONLY").replaceAll("_", " "))}</span>` : ""}
        ${supplierApprovalReminderLabel(approval)
          ? `<span class="supplier-draft-error">${supplierApprovalReminderLabel(approval)}</span>` : ""}
        ${draft.lastErrorMessage ? `<span class="supplier-draft-error">${escapeHtml(draft.lastErrorMessage)}</span>` : ""}
        ${rateApprovalRequired && !["APPROVAL_REQUESTED", "APPROVED_TO_SYNC"].includes(approval?.status)
          ? `<button class="button ghost small" type="button" data-request-rate-approval="${escapeHtml(draft.draftId)}">Request approval</button>` : ""}
        ${mayReview && approval?.status === "APPROVAL_REQUESTED"
          ? `<button class="button primary small" type="button" data-review-rate-approval="${escapeHtml(approval.approvalId)}" data-rate-decision="APPROVE">Approve sync</button>
             <button class="button ghost small" type="button" data-review-rate-approval="${escapeHtml(approval.approvalId)}" data-rate-decision="REQUEST_CHANGES">Request changes</button>
             <button class="button danger small" type="button" data-review-rate-approval="${escapeHtml(approval.approvalId)}" data-rate-decision="REJECT">Reject</button>` : ""}
        ${approval?.affectedBookingIds?.length
          ? `<small>${approval.affectedBookingIds.length} generated/sent booking(s) retain this local-rate snapshot and require impact review after rejection or changes.</small>` : ""}
      </span>
      ${statusPill(draft.localStatus)}
    </div>`;
  }).join("");
  list.innerHTML = centralMarkup + localMarkup
    || `<div class="empty-notifications">All Supplier Master changes are published.</div>`;
  $("#supplier-queue-summary").textContent = pending.length
    ? `${pending.length} local change(s) · ${approvalPending.length} approval request(s) pending · ${publishable.length} publishable`
    : "No pending changes.";
  $("#publish-selected-supplier-drafts").disabled = !publishable.length;
}

function requestSupplierRateApproval(draftId) {
  state.supplierRateApprovalAction = { mode: "REQUEST", draftId };
  $("#supplier-rate-approval-title").textContent = "Request Local Rate sync approval";
  $("#supplier-rate-approval-notice").innerHTML =
    "<strong>Local rate remains usable on this PC.</strong><p>Google publication stays locked until another Manager/Admin approves this exact snapshot.</p>";
  $("#supplier-rate-evidence-field").hidden = false;
  $("#supplier-rate-approval-evidence").value = "";
  $("#supplier-rate-approval-reason").value = "";
  $("#confirm-supplier-rate-approval").textContent = "Request approval";
  $("#confirm-supplier-rate-approval").className = "button primary";
  $("#supplier-rate-approval-dialog").showModal();
}

function reviewSupplierRateApproval(approvalId, decision) {
  state.supplierRateApprovalAction = { mode: "REVIEW", approvalId, decision };
  $("#supplier-rate-approval-title").textContent =
    decision === "APPROVE" ? "Approve Local Rate sync"
      : decision === "REQUEST_CHANGES" ? "Request Local Rate changes" : "Reject Local Rate sync";
  $("#supplier-rate-approval-notice").innerHTML = decision === "APPROVE"
    ? "<strong>Approve the exact saved snapshot?</strong><p>The approved Contract/Rate becomes eligible for controlled Google sync.</p>"
    : decision === "REQUEST_CHANGES"
      ? "<strong>Return this rate to the maker?</strong><p>New bookings stop offering this rate until the maker saves and requests approval again.</p>"
      : "<strong>Reject this sync request?</strong><p>The rate remains in audit history; affected booking snapshots are never overwritten.</p>";
  $("#supplier-rate-evidence-field").hidden = true;
  $("#supplier-rate-approval-reason").value = "";
  $("#confirm-supplier-rate-approval").textContent =
    decision === "APPROVE" ? "Approve sync"
      : decision === "REQUEST_CHANGES" ? "Request changes" : "Reject request";
  $("#confirm-supplier-rate-approval").className =
    decision === "APPROVE" ? "button primary" : "button danger";
  $("#supplier-rate-approval-dialog").showModal();
}

async function submitSupplierRateApproval(event) {
  event.preventDefault();
  const action = state.supplierRateApprovalAction;
  if (!action) return;
  const reason = $("#supplier-rate-approval-reason").value.trim();
  const evidenceReference = $("#supplier-rate-approval-evidence").value.trim();
  if (action.mode === "REQUEST" && (!reason || !evidenceReference)) {
    return toast("Approval reason and source/evidence reference are required.", true);
  }
  if (action.mode === "REVIEW" && action.decision !== "APPROVE" && !reason) {
    return toast("Review reason is required.", true);
  }
  try {
    if (action.mode === "REQUEST") {
      await window.erim.supplierMaster.requestRateApproval({
        draftId: action.draftId, reason, evidenceReference,
      });
    } else {
      await window.erim.supplierMaster.reviewRateApproval({
        approvalId: action.approvalId,
        decision: action.decision,
        reason,
      });
    }
    state.supplierMasterDrafts = await window.erim.supplierMaster.listDrafts();
    state.supplierRateApprovals =
      (await window.erim.supplierMaster.listRateApprovals()).approvals || [];
    renderSupplierDraftStatus();
    $("#supplier-rate-approval-dialog").close();
    toast(action.mode === "REQUEST"
      ? "Rate sync approval requested. The local rate remains usable on this PC."
      : action.decision === "APPROVE"
        ? "Local Contract/Rate approved for controlled Google sync."
        : action.decision === "REQUEST_CHANGES"
          ? "Local Contract/Rate returned to the maker for changes."
          : "Local Contract/Rate sync request rejected.");
  } catch (error) {
    toast(error.message, true);
  }
}

function renderSupplierPublishProgress(session = state.supplierPublishSession) {
  const panel = $("#supplier-publish-progress");
  if (!session) {
    panel.hidden = true;
    return;
  }
  state.supplierPublishSession = session;
  panel.hidden = false;
  const percent = Number(session.progressPercent || 0);
  $("#supplier-publish-percent").textContent = `${percent}%`;
  $("#supplier-publish-progress-bar").value = percent;
  $("#supplier-publish-current").textContent = [
    session.currentTypeCode,
    String(session.currentStage || "").replaceAll("_", " "),
    session.currentItemLabel,
  ].filter(Boolean).join(" · ") || session.status;
  $("#supplier-publish-count").textContent =
    `${session.confirmedItems || 0} of ${session.totalItems || 0} records confirmed in Google`;
  const stageGroups = new Map();
  (session.items || []).forEach((item) => {
    const key = `${item.typeCode} · ${item.stage.replaceAll("_", " ")}`;
    const group = stageGroups.get(key) || { total: 0, synced: 0, issues: 0 };
    group.total += 1;
    if (item.status === "SYNCED") group.synced += 1;
    if (["FAILED", "CONFLICT", "BLOCKED_BY_DEPENDENCY"].includes(item.status)) group.issues += 1;
    stageGroups.set(key, group);
  });
  $("#supplier-publish-stage-summary").innerHTML = [...stageGroups.entries()].map(([label, group]) =>
    `<span>${escapeHtml(label)} · ${group.synced}/${group.total}${group.issues ? ` · ${group.issues} issue` : ""}</span>`
  ).join("");
  $("#supplier-publish-item-list").innerHTML = (session.items || []).map((item) => `
    <div class="supplier-publish-item">
      <span><strong>${escapeHtml(item.itemLabel)}</strong><small>${escapeHtml(item.typeCode)} · ${escapeHtml(item.stage.replaceAll("_", " "))}${item.errorMessage ? ` · ${escapeHtml(item.errorMessage)}` : ""}</small></span>
      ${statusPill(item.status)}
    </div>
  `).join("");
  const unresolvedItems = (session.items || []).filter((item) => item.status !== "SYNCED");
  const resumeButton = $("#resume-supplier-publish-session");
  resumeButton.hidden = !unresolvedItems.length || state.supplierPublishActive;
  resumeButton.disabled = state.supplierPublishActive;
  resumeButton.textContent = session.status === "PUBLISHING"
    ? `Resume interrupted session (${unresolvedItems.length})`
    : `Resume unresolved items (${unresolvedItems.length})`;
}

async function loadLatestSupplierPublishSession() {
  state.supplierPublishSessions = await window.erim.supplierMaster.listPublishSessions();
  state.supplierPublishSession = state.supplierPublishSessions[0] || null;
  renderSupplierPublishProgress();
}

async function publishSupplierDrafts(draftIds = [], sessionId = "") {
  state.supplierPublishActive = true;
  renderSupplierPublishProgress();
  $("#publish-selected-supplier-drafts").disabled = true;
  $("#publish-supplier-drafts").disabled = true;
  $("#supplier-master-sync-status").textContent = "PUBLISHING";
  try {
    const result = await window.erim.supplierMaster.publishDrafts({ draftIds, sessionId });
    applySupplierLocalResult(result);
    if (result.session) renderSupplierPublishProgress(result.session);
    renderSupplierMaster();
    state.vendorSuggestions = supplierSuggestionsFromCatalog(state.supplierMaster);
    renderVendorSuggestions(state.vendorSuggestions);
    $("#supplier-master-sync-status").textContent = "SYNCED";
    $("#supplier-master-sync-status").className = "status synced";
    const summary = result.summary || {};
    toast(`${summary.synced || 0} change(s) published; ${summary.conflicts || 0} conflict(s), ${summary.failed || 0} failed.`);
  } catch (error) {
    state.supplierMasterDrafts = await window.erim.supplierMaster.listDrafts();
    renderSupplierDraftStatus();
    $("#supplier-master-sync-status").textContent = "FAILED";
    $("#supplier-master-sync-status").className = "status failed";
    toast(error.message, true);
  } finally {
    state.supplierPublishActive = false;
    renderSupplierPublishProgress();
  }
}

async function loadSupplierMaster({ refresh = true, initialize = false } = {}) {
  const status = $("#supplier-master-sync-status");
  status.textContent = initialize ? "INITIALIZING" : "LOADING";
  try {
    const result = initialize
      ? await window.erim.supplierMaster.initialize()
      : await window.erim.supplierMaster.list({ refresh });
    state.supplierMaster = supplierCatalogFrom(result);
    state.supplierMasterDrafts = result?.drafts || await window.erim.supplierMaster.listDrafts();
    state.supplierMasterLoaded = true;
    if (!state.supplierMaster.supplierTypes.some((row) =>
      row.typeCode === state.selectedSupplierTypeCode && row.active !== false
    )) {
      state.selectedSupplierTypeCode = state.supplierMaster.supplierTypes.find((row) => row.active !== false)?.typeCode || "";
    }
    if (!state.supplierMaster.suppliers.some((row) => row.supplierId === state.selectedSupplierId)) {
      state.selectedSupplierId = "";
    }
    status.textContent = result?.status || "SYNCED";
    status.className = `status ${String(result?.status || "SYNCED").includes("OFFLINE") ? "conflict" : "synced"}`;
    renderSupplierMaster();
    renderSupplierDraftStatus();
    state.vendorSuggestions = supplierSuggestionsFromCatalog(state.supplierMaster);
    renderVendorSuggestions(state.vendorSuggestions);
    if (result?.warning) {
      toast("Google refresh is unavailable. Supplier Master is using the last local cache.", true);
    }
  } catch (error) {
    status.textContent = "FAILED";
    status.className = "status failed";
    toast(error.message, true);
  }
}

const supplierExcelInitialTypes = [
  ["VENDOR", "Vendor"],
  ["TOC", "TOC"],
  ["TRANSPORT", "Transport"],
  ["LUGGAGE_VAN", "Luggage Van"],
  ["ADDITIONAL_SERVICE", "Additional Service"],
];

function supplierExcelTypes() {
  const byCode = new Map((state.supplierMaster.supplierTypes || [])
    .filter((row) => row.active !== false)
    .map((row) => [String(row.typeCode || "").toUpperCase(), row.typeName || row.typeCode]));
  return supplierExcelInitialTypes.map(([code, fallback]) => [code, byCode.get(code) || fallback]);
}

function renderSupplierExcelTypes() {
  $("#supplier-excel-type-tabs").innerHTML = supplierExcelTypes().map(([code, label]) => `
    <button class="supplier-excel-type ${code === state.supplierExcel.typeCode ? "active" : ""}"
      type="button" data-supplier-excel-type="${escapeHtml(code)}">${escapeHtml(label)}</button>
  `).join("");
}

function supplierExcelFilters() {
  const valueList = (selector) => {
    const value = $(selector).value.trim();
    return value ? [value] : [];
  };
  return {
    typeCode: state.supplierExcel.typeCode,
    locations: valueList("#supplier-excel-location"),
    products: valueList("#supplier-excel-product"),
    supplierStatuses: valueList("#supplier-excel-supplier-status"),
    contractStatuses: valueList("#supplier-excel-contract-status"),
    rateState: $("#supplier-excel-rate-state").value,
    bookingChannels: valueList("#supplier-excel-channel"),
    validFrom: $("#supplier-excel-valid-from").value,
    validTo: $("#supplier-excel-valid-to").value,
  };
}

function filteredSupplierExcelSuppliers() {
  const query = $("#supplier-excel-search").value.trim().toLowerCase();
  const location = $("#supplier-excel-location").value.trim().toLowerCase();
  const product = $("#supplier-excel-product").value.trim().toLowerCase();
  const status = $("#supplier-excel-supplier-status").value;
  const productSupplierIds = new Set((state.supplierMaster.products || [])
    .filter((row) => !product || String(row.productName || "").toLowerCase() === product)
    .map((row) => row.supplierId));
  return (state.supplierMaster.suppliers || []).filter((supplier) => {
    if (String(supplier.typeCode || "").toUpperCase() !== state.supplierExcel.typeCode) return false;
    if (supplier.active === false && !status) return false;
    if (status && String(supplier.status || "").toUpperCase() !== status) return false;
    if (location && !(supplier.destinations || []).some((value) =>
      String(value).toLowerCase().includes(location))) return false;
    if (product && !productSupplierIds.has(supplier.supplierId)) return false;
    return !query || [
      supplier.supplierName, supplier.supplierCode, ...(supplier.destinations || []),
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function renderSupplierExcelSelection() {
  const suppliers = filteredSupplierExcelSuppliers();
  const selected = state.supplierExcel.selectedSupplierIds;
  $("#supplier-excel-supplier-list").innerHTML = suppliers.length ? suppliers.map((supplier) => `
    <label class="supplier-excel-supplier-row">
      <input type="checkbox" data-supplier-excel-supplier="${escapeHtml(supplier.supplierId)}"
        ${selected.has(supplier.supplierId) ? "checked" : ""} />
      <span><strong>${escapeHtml(supplier.supplierName)}</strong><small>${escapeHtml([
        supplier.supplierCode, ...(supplier.destinations || []),
      ].filter(Boolean).join(" · "))}</small></span>
      ${statusPill(supplier.status || "ACTIVE")}
    </label>
  `).join("") : `<div class="empty-notifications">No supplier matches this Type and filter.</div>`;
  const allSelected = suppliers.length && suppliers.every((row) => selected.has(row.supplierId));
  $("#supplier-excel-select-all").checked = Boolean(allSelected);
  $("#supplier-excel-select-all").indeterminate = Boolean(
    suppliers.some((row) => selected.has(row.supplierId)) && !allSelected);
  $("#supplier-excel-selected-count").textContent = `${selected.size} selected`;
  $("#supplier-excel-export").disabled = !selected.size;
}

async function loadSupplierExcelSuggestions() {
  const suggestions = await window.erim.supplierExcel.suggestions({
    typeCode: state.supplierExcel.typeCode,
  });
  const fill = (selector, values) => {
    $(selector).innerHTML = (values || []).map((value) =>
      `<option value="${escapeHtml(value)}"></option>`).join("");
  };
  fill("#supplier-excel-location-options", suggestions.locations);
  fill("#supplier-excel-product-options", suggestions.products);
  fill("#supplier-excel-channel-options", suggestions.bookingChannels);
}

function renderSupplierExcelBatch(batch) {
  state.supplierExcel.batch = batch;
  const summary = batch?.summary || {};
  $("#supplier-excel-import-status").textContent = batch?.status || "Waiting for file";
  $("#supplier-excel-import-status").className = `status ${
    Number(summary.conflicts || 0) || Number(summary.invalid || 0) ? "conflict" : "synced"}`;
  $("#supplier-excel-file-result").textContent = batch
    ? `${batch.fileName} · ${batch.typeCode} · validated ${formatDate(batch.updatedAt)}`
    : "No workbook selected.";
  const cards = $$("#supplier-excel-summary article strong");
  [summary.total, summary.ready, summary.conflicts, summary.invalid].forEach((value, index) => {
    cards[index].textContent = String(value || 0);
  });
  const rows = batch?.analysis?.rows || [];
  $("#supplier-excel-preview-rows").innerHTML = rows.length ? rows.slice(0, 100).map((row) => `
    <tr>
      <td>${escapeHtml(row.sourceSheet)} / ${escapeHtml(row.sourceRow)}</td>
      <td><strong>${escapeHtml(row.payload?.supplier_code || "")}</strong><small class="table-subtext">${escapeHtml(
        row.payload?.supplier_name || row.payload?.product_name || row.payload?.contract_number
          || row.payload?.contact_name || row.payload?.address || row.entityKind
      )}</small></td>
      <td>${statusPill(row.status)}</td>
      <td>${escapeHtml(row.issue?.conflictReason || "Ready to save as a new local record.")}</td>
      <td>${row.issue?.existingRecordId
        ? `<button class="button ghost small" type="button" data-supplier-excel-open-record="${escapeHtml(row.issue.existingRecordId)}">Open existing</button>`
        : ""}</td>
    </tr>
  `).join("") : `<tr><td class="empty" colspan="5">No data row found in this workbook.</td></tr>`;
  $("#supplier-excel-stage").disabled = !Number(summary.ready || 0) || batch?.status === "LOCAL_PENDING";
  $("#supplier-excel-export-conflicts").disabled = !Number(summary.conflicts || 0) && !Number(summary.invalid || 0);
}

function renderSupplierExcelBatches() {
  const batches = state.supplierExcel.batches || [];
  $("#supplier-excel-batch-list").innerHTML = batches.length ? batches.map((batch) => `
    <button class="supplier-excel-batch-row" type="button" data-supplier-excel-batch="${escapeHtml(batch.batchId)}">
      <span><strong>${escapeHtml(batch.fileName)}</strong><small>${escapeHtml(batch.typeCode)} · ${escapeHtml(formatDate(batch.updatedAt))}</small></span>
      <span><strong>${escapeHtml(batch.summary?.ready || 0)} ready</strong><small>${escapeHtml(
        Number(batch.summary?.conflicts || 0) + Number(batch.summary?.invalid || 0))} issue(s)</small></span>
      ${statusPill(batch.status)}
    </button>
  `).join("") : `<div class="empty-notifications">No local import batch yet.</div>`;
}

async function loadSupplierExcel() {
  if (!state.supplierMasterLoaded) await loadSupplierMaster({ refresh: false });
  renderSupplierExcelTypes();
  await loadSupplierExcelSuggestions();
  state.supplierExcel.batches = await window.erim.supplierExcel.listBatches();
  renderSupplierExcelBatches();
  renderSupplierExcelSelection();
}

function openSupplierExcelExistingRecord(recordId) {
  const catalog = state.supplierMaster;
  let supplier = (catalog.suppliers || []).find((row) => row.supplierId === recordId);
  if (!supplier) {
    const child = [
      ...(catalog.contacts || []), ...(catalog.recipients || []), ...(catalog.sops || []),
      ...(catalog.products || []), ...(catalog.contracts || []),
    ].find((row) => [
      row.contactId, row.recipientId, row.sopId, row.productId, row.contractId,
    ].includes(recordId));
    supplier = (catalog.suppliers || []).find((row) => row.supplierId === child?.supplierId);
  }
  if (!supplier) return toast("The existing record could not be located in the current local catalog.", true);
  state.selectedSupplierTypeCode = supplier.typeCode;
  state.selectedSupplierId = supplier.supplierId;
  showView("supplier-master", "MANAGER_ADMIN");
  renderSupplierMaster();
}

function supplierSuggestionsFromCatalog(catalog, serviceDate = new Date().toISOString().slice(0, 10)) {
  const suppliers = (catalog.suppliers || []).filter((row) => row.active !== false);
  const products = (catalog.products || []).filter((row) => row.active !== false);
  const contracts = (catalog.contracts || []).filter((row) =>
    row.active !== false && !["ARCHIVED", "CANCELLED", "SUPERSEDED"].includes(String(row.status || "").toUpperCase())
  );
  const contractById = new Map(contracts.map((row) => [row.contractId, row]));
  const productById = new Map(products.map((row) => [row.productId, row]));
  const supplierById = new Map(suppliers.map((row) => [row.supplierId, row]));
  const valid = (date, from, to) => (!from || date >= from) && (!to || date <= to);
  const allRates = (catalog.rates || []).filter((row) => row.active !== false).map((rate) => {
    const contract = contractById.get(rate.contractId);
    if (!contract) return null;
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
    };
  }).filter(Boolean);
  const rates = allRates.filter((rate) =>
    valid(serviceDate, rate.validFrom, rate.validTo)
  );
  const byType = (code) => rates.filter((rate) => rate.typeCode === code);
  const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    ...catalog,
    allRates,
    rates,
    vendorRates: byType("VENDOR"),
    tocRates: byType("TOC"),
    transportRates: byType("TRANSPORT"),
    luggageVanRates: byType("LUGGAGE_VAN"),
    vendorNames: unique(byType("VENDOR").map((row) => row.vendorName)),
    vendorServices: unique(byType("VENDOR").map((row) => row.serviceName)),
    tocNames: unique(byType("TOC").map((row) => row.serviceName)),
  };
}

function renderSupplierMaster() {
  renderSupplierTypeTabs();
  renderSupplierList();
  const selected = state.supplierMaster.suppliers.find((row) => row.supplierId === state.selectedSupplierId);
  if (selected) fillSupplierForm(selected);
  else resetSupplierForm();
  renderSupplierProductsAndContracts();
}

function renderSupplierTypeTabs() {
  const types = (state.supplierMaster.supplierTypes || [])
    .filter((row) => row.active !== false)
    .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
  $("#supplier-type-tabs").innerHTML = types.map((row) => `
    <button class="supplier-type-tab ${row.typeCode === state.selectedSupplierTypeCode ? "active" : ""}"
      type="button" data-supplier-type-code="${escapeHtml(row.typeCode)}">
      ${escapeHtml(row.typeName)}
    </button>
  `).join("") || `<span class="muted-text">Initialize Supplier Master to create types.</span>`;
}

function filteredSuppliers() {
  const query = $("#supplier-master-search")?.value.trim().toLowerCase() || "";
  return (state.supplierMaster.suppliers || [])
    .filter((row) => row.active !== false && row.typeCode === state.selectedSupplierTypeCode)
    .filter((row) => !query || [
      row.supplierName, row.supplierCode, ...(row.destinations || []),
    ].join(" ").toLowerCase().includes(query))
    .sort((a, b) => String(a.supplierName).localeCompare(String(b.supplierName)));
}

function renderSupplierList() {
  const rows = filteredSuppliers();
  $("#supplier-master-list").innerHTML = rows.length ? rows.map((row) => `
    <button class="supplier-list-item ${row.supplierId === state.selectedSupplierId ? "active" : ""}"
      type="button" data-supplier-id="${escapeHtml(row.supplierId)}">
      <strong>${escapeHtml(row.supplierName)}</strong>
      ${row.localDraftStatus ? `<span class="local-change">LOCAL CHANGE</span>` : ""}
      <small>${escapeHtml(row.supplierCode || "No code")} · ${escapeHtml((row.destinations || []).join(", ") || "All destinations")}</small>
    </button>
  `).join("") : `<div class="empty-notifications">No active supplier in this Type.</div>`;
}

function resetSupplierForm() {
  const form = $("#supplier-master-form");
  form.reset();
  form.elements.supplierId.value = "";
  form.elements.typeCode.value = state.selectedSupplierTypeCode || "";
  $("#supplier-form-title").textContent = "New supplier";
  $("#supplier-form-status").textContent = "NEW";
  $("#archive-supplier").hidden = true;
  $("#supplier-contact-list").innerHTML = supplierContactMarkup({});
  $("#supplier-recipient-list").innerHTML = supplierRecipientMarkup({});
  $("#supplier-product-heading").textContent = "Select or save a supplier";
  $("#supplier-product-subheading").textContent = "Products, contracts, and rates will appear here.";
  $("#add-supplier-product").disabled = true;
  $("#add-supplier-contract").disabled = true;
}

function fillSupplierForm(supplier) {
  const form = $("#supplier-master-form");
  form.reset();
  form.elements.supplierId.value = supplier.supplierId || "";
  form.elements.typeCode.value = supplier.typeCode || "";
  ["supplierCode", "supplierName", "legalName", "address", "website", "taxId",
    "internalPicEmployeeId", "operationalNotes"].forEach((field) => {
    form.elements[field].value = supplier[field] || "";
  });
  form.elements.destinations.value = (supplier.destinations || []).join(", ");
  const contacts = state.supplierMaster.contacts.filter((row) =>
    row.supplierId === supplier.supplierId && row.active !== false
  );
  const recipients = state.supplierMaster.recipients.filter((row) =>
    row.supplierId === supplier.supplierId && row.active !== false
  );
  const sop = state.supplierMaster.sops.find((row) =>
    row.supplierId === supplier.supplierId && row.active !== false
  ) || {};
  $("#supplier-contact-list").innerHTML = (contacts.length ? contacts : [{}]).map(supplierContactMarkup).join("");
  $("#supplier-recipient-list").innerHTML = (recipients.length ? recipients : [{}]).map(supplierRecipientMarkup).join("");
  $$('input[name="bookingChannels"]').forEach((node) => {
    node.checked = (sop.bookingChannels || []).includes(node.value);
  });
  ["leadTime", "cutoffTime", "requiredInformation", "confirmationProcedure",
    "amendmentProcedure", "cancellationProcedure", "emergencyProcedure", "portalUrl",
    "accountReference", "portalPaymentRule", "subjectTemplate", "bodyTemplate"].forEach((field) => {
    form.elements[field].value = sop[field] || "";
  });
  $("#supplier-form-title").textContent = supplier.supplierName;
  $("#supplier-form-status").textContent = supplier.localDraftStatus ? "LOCAL DRAFT" : supplier.status || "ACTIVE";
  $("#archive-supplier").hidden = false;
  $("#supplier-product-heading").textContent = supplier.supplierName;
  $("#supplier-product-subheading").textContent = `${supplier.typeCode} · ${supplier.supplierCode || "No code"}`;
  $("#add-supplier-product").disabled = false;
  $("#add-supplier-contract").disabled = false;
}

function normalizeInternationalPhone(value) {
  let normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  if (normalized.startsWith("00")) normalized = `+${normalized.slice(2)}`;
  if (!normalized.startsWith("+")) normalized = `+${normalized}`;
  return normalized;
}

function isValidInternationalPhone(value) {
  const normalized = normalizeInternationalPhone(value);
  return !normalized || /^\+\d[\d\s().-]{5,24}$/.test(normalized);
}

function supplierPhoneForTransport(value) {
  const normalized = normalizeInternationalPhone(value);
  return normalized ? `'${normalized}` : "";
}

function supplierContactMarkup(row = {}, index = 0) {
  return `
    <div class="supplier-repeatable-row supplier-contact-row" data-contact-id="${escapeHtml(row.contactId || "")}">
      <div class="supplier-repeatable-heading">
        <div><strong>Contact person ${index + 1}</strong><small>Identity and direct communication details</small></div>
        <button class="supplier-repeatable-remove" data-remove-supplier-contact type="button" aria-label="Remove contact person">×</button>
      </div>
      <label>Name<input data-supplier-contact="contactName" value="${escapeHtml(row.contactName || "")}" /></label>
      <label>Position<input data-supplier-contact="position" value="${escapeHtml(row.position || "")}" /></label>
      <label>Department<input data-supplier-contact="department" value="${escapeHtml(row.department || "")}" /></label>
      <label>Preferred channel<select data-supplier-contact="preferredChannel">${["EMAIL","WHATSAPP","PHONE","PORTAL","OTHERS"].map((value) => `<option${row.preferredChannel === value ? " selected" : ""}>${value}</option>`).join("")}</select></label>
      <label>Phone<input data-supplier-contact="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+62 812-3916-9392" value="${escapeHtml(row.phone || "")}" /></label>
      <label>WhatsApp<input data-supplier-contact="whatsapp" type="tel" inputmode="tel" autocomplete="tel" placeholder="+62 812-3916-9392" value="${escapeHtml(row.whatsapp || "")}" /></label>
      <label class="wide">Email<input data-supplier-contact="email" type="email" autocomplete="email" value="${escapeHtml(row.email || "")}" /></label>
      <label>Operational hours<input data-supplier-contact="operationalHours" value="${escapeHtml(row.operationalHours || "")}" /></label>
      <label class="supplier-emergency-option"><input data-supplier-contact="isEmergency" type="checkbox" ${row.isEmergency ? "checked" : ""} /><span><strong>Emergency contact</strong><small>May be contacted outside normal hours</small></span></label>
      <label class="wide">Responsibility<input data-supplier-contact="responsibility" value="${escapeHtml(row.responsibility || "")}" /></label>
    </div>
  `;
}

function supplierRecipientMarkup(row = {}, index = 0) {
  return `
    <div class="supplier-repeatable-row supplier-recipient-row" data-recipient-id="${escapeHtml(row.recipientId || "")}">
      <div class="supplier-repeatable-heading">
        <div><strong>Booking recipient ${index + 1}</strong><small>Destination used by the booking SOP</small></div>
        <button class="supplier-repeatable-remove" data-remove-supplier-recipient type="button" aria-label="Remove booking recipient">×</button>
      </div>
      <label>Type<select data-supplier-recipient="recipientType">${["TO","CC","BCC","WHATSAPP"].map((value) => `<option${row.recipientType === value ? " selected" : ""}>${value}</option>`).join("")}</select></label>
      <label>Channel<select data-supplier-recipient="channel">${["EMAIL","WHATSAPP","PORTAL","OTHERS"].map((value) => `<option${row.channel === value ? " selected" : ""}>${value}</option>`).join("")}</select></label>
      <label class="wide">Email / number / account<input data-supplier-recipient="address" inputmode="${row.channel === "WHATSAPP" || row.recipientType === "WHATSAPP" ? "tel" : "text"}" placeholder="${row.channel === "WHATSAPP" || row.recipientType === "WHATSAPP" ? "+62 812-3916-9392" : "Email address, portal account, or number"}" value="${escapeHtml(row.address || "")}" /></label>
      <label class="wide">Purpose<input data-supplier-recipient="purpose" placeholder="Example: reservation confirmation" value="${escapeHtml(row.purpose || "")}" /></label>
    </div>
  `;
}

function collectRepeatable(containerSelector, fieldSelector, idKey, idAttribute) {
  return [...document.querySelectorAll(`${containerSelector} .supplier-repeatable-row`)].map((row) => {
    const result = { [idKey]: row.dataset[idAttribute] || "" };
    row.querySelectorAll(`[${fieldSelector}]`).forEach((input) => {
      const key = input.getAttribute(fieldSelector);
      result[key] = input.type === "checkbox" ? input.checked : input.value.trim();
    });
    return result;
  }).filter((row) => Object.entries(row).some(([key, value]) => key !== idKey && value !== "" && value !== false));
}

function collectSupplierForm() {
  const form = $("#supplier-master-form");
  const contacts = collectRepeatable(
    "#supplier-contact-list", "data-supplier-contact", "contactId", "contactId",
  ).map((row) => ({
    ...row,
    phone: normalizeInternationalPhone(row.phone),
    whatsapp: normalizeInternationalPhone(row.whatsapp),
  }));
  const recipients = collectRepeatable(
    "#supplier-recipient-list", "data-supplier-recipient", "recipientId", "recipientId",
  ).map((row, index) => ({
    ...row,
    address: row.channel === "WHATSAPP" || row.recipientType === "WHATSAPP"
      ? normalizeInternationalPhone(row.address) : row.address,
    sequence: index + 1,
  }));
  return {
    supplierId: form.elements.supplierId.value,
    typeCode: form.elements.typeCode.value || state.selectedSupplierTypeCode,
    supplierCode: form.elements.supplierCode.value.trim(),
    supplierName: form.elements.supplierName.value.trim(),
    legalName: form.elements.legalName.value.trim(),
    destinations: form.elements.destinations.value.split(",").map((x) => x.trim()).filter(Boolean),
    address: form.elements.address.value.trim(),
    website: form.elements.website.value.trim(),
    taxId: form.elements.taxId.value.trim(),
    internalPicEmployeeId: form.elements.internalPicEmployeeId.value.trim(),
    operationalNotes: form.elements.operationalNotes.value.trim(),
    contacts,
    recipients,
    sop: {
      bookingChannels: $$('input[name="bookingChannels"]:checked').map((node) => node.value),
      leadTime: form.elements.leadTime.value.trim(),
      cutoffTime: form.elements.cutoffTime.value.trim(),
      requiredInformation: form.elements.requiredInformation.value.trim(),
      confirmationProcedure: form.elements.confirmationProcedure.value.trim(),
      amendmentProcedure: form.elements.amendmentProcedure.value.trim(),
      cancellationProcedure: form.elements.cancellationProcedure.value.trim(),
      emergencyProcedure: form.elements.emergencyProcedure.value.trim(),
      portalUrl: form.elements.portalUrl.value.trim(),
      accountReference: form.elements.accountReference.value.trim(),
      portalPaymentRule: form.elements.portalPaymentRule.value,
      subjectTemplate: form.elements.subjectTemplate.value.trim(),
      bodyTemplate: form.elements.bodyTemplate.value.trim(),
    },
  };
}

async function saveSupplierMasterForm(event) {
  event.preventDefault();
  const payload = collectSupplierForm();
  if (!payload.supplierName) return toast("Supplier name is required.", true);
  const invalidContact = payload.contacts.find((row) =>
    !isValidInternationalPhone(row.phone) || !isValidInternationalPhone(row.whatsapp)
  );
  const invalidRecipient = payload.recipients.find((row) =>
    (row.channel === "WHATSAPP" || row.recipientType === "WHATSAPP")
    && !isValidInternationalPhone(row.address)
  );
  if (invalidContact || invalidRecipient) {
    return toast("Phone and WhatsApp numbers must start with + and use international format.", true);
  }
  const existing = state.supplierMaster.suppliers.find((row) => row.supplierId === payload.supplierId);
  payload.baseRecordVersion = existing?.recordVersion ?? null;
  try {
    const draft = applySupplierLocalResult(await window.erim.supplierMaster.saveSupplier(payload));
    state.selectedSupplierId = draft?.entityId || payload.supplierId;
    renderSupplierMaster();
    toast(`${payload.supplierName} saved locally. Continue editing or publish the batch when ready.`);
    if (state.supplierFocusContext
      && ["PROFILE", "RECIPIENTS", "SOP"].includes(state.supplierFocusContext.section)) {
      await window.erim.supplierMaster.completeFocused({
        kind: state.supplierFocusContext.section,
        entityId: state.selectedSupplierId,
        localStatus: "LOCAL_PENDING",
      });
    }
  } catch (error) {
    toast(error.message, true);
  }
}

function renderSupplierProductsAndContracts() {
  const supplier = state.supplierMaster.suppliers.find((row) => row.supplierId === state.selectedSupplierId);
  if (!supplier) {
    $("#supplier-product-contract-list").innerHTML = `<div class="empty-notifications">Choose a supplier from the left.</div>`;
    return;
  }
  const newestLocalFirst = (left, right) =>
    Number(Boolean(right.localDraftStatus)) - Number(Boolean(left.localDraftStatus))
    || String(right.localDraftUpdatedAt || right.updatedAt || "")
      .localeCompare(String(left.localDraftUpdatedAt || left.updatedAt || ""));
  const products = state.supplierMaster.products
    .filter((row) => row.supplierId === supplier.supplierId && row.active !== false)
    .sort(newestLocalFirst);
  const contracts = state.supplierMaster.contracts
    .filter((row) => row.supplierId === supplier.supplierId && row.active !== false)
    .sort(newestLocalFirst);
  const rates = state.supplierMaster.rates.filter((row) => row.active !== false);
  const activeProductIds = new Set(state.supplierMaster.products
    .filter((row) => row.active !== false)
    .map((row) => row.productId));
  state.selectedSupplierProductIds = new Set(
    [...state.selectedSupplierProductIds].filter((productId) => activeProductIds.has(productId)),
  );
  const productCards = products.map((product) => `
    <article class="supplier-product-card">
      <div class="supplier-product-card-heading">
        <label class="supplier-product-selection">
          <input data-select-supplier-product="${escapeHtml(product.productId)}" type="checkbox"${state.selectedSupplierProductIds.has(product.productId) ? " checked" : ""} />
          <span><strong>${escapeHtml(product.productName)}</strong><small>${escapeHtml(product.productCode || "No code")} · ${escapeHtml(product.category || supplier.typeCode)}</small></span>
        </label>
        <div class="supplier-product-card-actions">
          <button class="button ghost small" data-duplicate-supplier-product="${escapeHtml(product.productId)}" type="button">Duplicate</button>
          <button class="button ghost small" data-edit-supplier-product="${escapeHtml(product.productId)}" type="button">Edit</button>
        </div>
      </div>
      <div class="supplier-product-detail">${escapeHtml(product.description || "No description")}</div>
      ${product.localDraftStatus ? `<span class="local-change">LOCAL CHANGE</span>` : ""}
    </article>
  `).join("");
  const contractCards = contracts.map((contract) => {
    const contractRates = rates.filter((rate) => rate.contractId === contract.contractId);
    return `
      <article class="supplier-contract-card">
        <div class="supplier-contract-card-heading">
          <div><strong>${escapeHtml(contract.contractNumber)}</strong><small>${escapeHtml(contract.validFrom)} – ${escapeHtml(contract.validTo)} · ${escapeHtml(contract.status)}</small></div>
          <button class="button ghost small" data-edit-supplier-contract="${escapeHtml(contract.contractId)}" type="button">Edit</button>
        </div>
        ${contract.localDraftStatus ? `<span class="local-change">LOCAL CHANGE</span>` : ""}
        <table class="supplier-rate-table"><thead><tr><th>Product</th><th>Basis</th><th>Rate</th><th>Validity</th></tr></thead><tbody>
          ${contractRates.map((rate) => {
            const product = products.find((row) => row.productId === rate.productId);
            return `<tr><td>${escapeHtml(product?.productName || rate.productId)}</td><td>${escapeHtml(rate.priceBasis)}</td><td>${escapeHtml(rate.currency || contract.currency)} ${Number(rate.amount || 0).toLocaleString("id-ID")}</td><td>${escapeHtml(rate.validFrom || contract.validFrom)} – ${escapeHtml(rate.validTo || contract.validTo)}</td></tr>`;
          }).join("") || `<tr><td colspan="4">No active rates.</td></tr>`}
        </tbody></table>
      </article>
    `;
  }).join("");
  $("#supplier-product-contract-list").innerHTML = `
    <div class="section-heading">
      <div><p class="eyebrow">Catalogue</p><h3>Products (${products.length})</h3></div>
      <div class="supplier-product-bulk-actions">
        <button class="button ghost small" data-select-all-supplier-products type="button">Select all visible</button>
        <button class="button ghost small" data-clear-supplier-products type="button">Clear</button>
        <span class="supplier-product-selected-count">${state.selectedSupplierProductIds.size} selected</span>
        <button class="button secondary small" data-duplicate-selected-products type="button"${state.selectedSupplierProductIds.size ? "" : " disabled"}>Duplicate selected</button>
      </div>
    </div>
    ${productCards || `<div class="empty-notifications">No products yet.</div>`}
    <div class="section-heading"><div><p class="eyebrow">Effective dated</p><h3>Contracts (${contracts.length})</h3></div></div>
    ${contractCards || `<div class="empty-notifications">No contracts yet. Products without a valid contract become PENDING_RATE.</div>`}
  `;
}

function openSupplierProductDialog(productId = "") {
  const supplier = state.supplierMaster.suppliers.find((row) => row.supplierId === state.selectedSupplierId);
  if (!supplier) return toast("Select a supplier first.", true);
  const product = state.supplierMaster.products.find((row) => row.productId === productId) || {};
  const form = $("#supplier-product-form");
  form.reset();
  form.elements.supplierId.value = supplier.supplierId;
  ["productId","productCode","productName","category","subcategory","description","inclusion","exclusion",
    "termsAndConditions","cancellationTerms","bookingInstructions","minimumOrder","maximumCapacity",
    "taxTreatment","notes"].forEach((field) => {
    if (form.elements[field]) form.elements[field].value = product[field] || (field === "category" ? supplier.typeCode : "");
  });
  form.elements.destinations.value = (product.destinations || []).join(", ");
  $("#supplier-product-dialog-title").textContent = product.productId ? `Edit ${product.productName}` : "Add Product";
  $("#archive-supplier-product").hidden = !product.productId;
  $("#supplier-product-dialog").showModal();
  if (!product.productId) setTimeout(() => form.elements.productName.focus(), 0);
}

async function saveSupplierProductForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.destinations = String(payload.destinations || "").split(",").map((x) => x.trim()).filter(Boolean);
  const existing = state.supplierMaster.products.find((row) => row.productId === payload.productId);
  payload.baseRecordVersion = existing?.recordVersion ?? null;
  try {
    const draft = applySupplierLocalResult(await window.erim.supplierMaster.saveProduct(payload));
    $("#supplier-product-dialog").close();
    renderSupplierMaster();
    toast(`${payload.productName} saved locally.`);
    if (state.supplierFocusContext?.section === "PRODUCT") {
      await window.erim.supplierMaster.completeFocused({
        kind: "PRODUCT",
        entityId: draft?.entityId || payload.productId,
        localStatus: "LOCAL_PENDING",
      });
    }
  } catch (error) { toast(error.message, true); }
}

function selectedDuplicateProducts() {
  return state.duplicateSourceProductIds
    .map((productId) => state.supplierMaster.products.find((row) =>
      row.productId === productId && row.active !== false
    ))
    .filter(Boolean);
}

function renderSupplierCopyMatrix() {
  const products = selectedDuplicateProducts();
  const targetIds = new Set(
    $$('#supplier-copy-target-list [name="targetSupplierIds"]:checked').map((node) => node.value),
  );
  const targets = state.supplierMaster.suppliers.filter((row) => targetIds.has(row.supplierId));
  const matrix = $("#supplier-copy-matrix");
  if (!products.length || !targets.length) {
    matrix.textContent = "Select destination suppliers to preview the Product × supplier matrix.";
    return;
  }
  matrix.innerHTML = `
    <strong>${products.length} Product × ${targets.length} supplier = ${products.length * targets.length} copy combination</strong>
    <table><thead><tr><th>Product</th><th>Destination supplier</th></tr></thead><tbody>
      ${products.flatMap((product) => targets.map((supplier) =>
        `<tr><td>${escapeHtml(product.productName)}</td><td>${escapeHtml(supplier.supplierName)}</td></tr>`
      )).join("")}
    </tbody></table>
  `;
}

function openSupplierProductDuplicateDialog(productIds) {
  const requestedIds = [...new Set((Array.isArray(productIds) ? productIds : [productIds]).filter(Boolean))];
  const products = requestedIds.map((productId) => state.supplierMaster.products.find((row) =>
    row.productId === productId && row.active !== false
  )).filter(Boolean);
  const sourceSuppliers = products.map((product) => state.supplierMaster.suppliers.find((row) =>
    row.supplierId === product.supplierId && row.active !== false
  )).filter(Boolean);
  const sourceTypes = new Set(sourceSuppliers.map((row) => row.typeCode));
  if (!products.length || products.length !== sourceSuppliers.length) {
    return toast("Choose active Products first.", true);
  }
  if (sourceTypes.size !== 1) {
    return toast("Selected Products must belong to one Supplier Type.", true);
  }
  const sourceSupplier = sourceSuppliers[0];
  state.duplicateSourceProductIds = products.map((row) => row.productId);
  const form = $("#supplier-product-duplicate-form");
  form.reset();
  form.elements.sourceProductId.value = products.length === 1 ? products[0].productId : "";
  form.elements.productName.value = products.length === 1 ? products[0].productName : "";
  form.elements.productName.required = products.length === 1;
  $("#supplier-copy-name-field").hidden = products.length > 1;
  form.elements.includeContracts.checked = true;
  form.elements.includeRates.checked = true;
  form.elements.includeRates.disabled = false;
  $("#supplier-copy-product-name").textContent = products.length === 1
    ? products[0].productName : `${products.length} Products selected`;
  $("#supplier-copy-source-name").textContent = products.length === 1
    ? `${sourceSupplier.supplierName} · ${sourceSupplier.typeCode}`
    : `${sourceSupplier.typeCode} · ${[...new Set(sourceSuppliers.map((row) => row.supplierName))].join(", ")}`;
  $("#supplier-copy-select-all").checked = false;
  $("#supplier-copy-result").hidden = true;
  $("#supplier-copy-result").className = "supplier-copy-result";
  $("#confirm-supplier-product-duplicate").disabled = false;
  $("#confirm-supplier-product-duplicate").textContent = "Save copies locally";
  $("#cancel-supplier-product-duplicate-dialog").textContent = "Cancel";
  const targets = state.supplierMaster.suppliers
    .filter((row) => row.active !== false && row.typeCode === sourceSupplier.typeCode)
    .sort((a, b) => String(a.supplierName).localeCompare(String(b.supplierName)));
  $("#supplier-copy-target-list").innerHTML = targets.length ? targets.map((supplier) => `
    <label class="supplier-copy-target-row">
      <input type="checkbox" name="targetSupplierIds" value="${escapeHtml(supplier.supplierId)}" />
      <span>
        <strong>${escapeHtml(supplier.supplierName)}</strong>
        <small>${escapeHtml(supplier.supplierCode || "No code")}${supplier.supplierId === sourceSupplier.supplierId ? " · source supplier (use a different copy name)" : ""}</small>
      </span>
    </label>
  `).join("") : `<div class="empty-notifications">No active destination suppliers are available.</div>`;
  renderSupplierCopyMatrix();
  $("#supplier-product-duplicate-dialog").showModal();
}

async function duplicateSupplierProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const targetSupplierIds = [...form.querySelectorAll('[name="targetSupplierIds"]:checked')]
    .map((node) => node.value);
  if (!targetSupplierIds.length) return toast("Choose at least one destination supplier.", true);
  const button = $("#confirm-supplier-product-duplicate");
  button.disabled = true;
  button.textContent = "Saving locally...";
  try {
    const result = await window.erim.supplierMaster.duplicateProduct({
      sourceProductId: form.elements.sourceProductId.value,
      sourceProductIds: state.duplicateSourceProductIds,
      productName: state.duplicateSourceProductIds.length === 1
        ? form.elements.productName.value.trim() : "",
      targetSupplierIds,
      includeContracts: form.elements.includeContracts.checked,
      includeRates: form.elements.includeRates.checked,
    });
    applySupplierLocalResult(result);
    state.selectedSupplierProductIds.clear();
    renderSupplierMaster();
    const createdRates = result.created.reduce((sum, row) => sum + Number(row.rateCount || 0), 0);
    const failures = result.failed || [];
    const summary = `${result.created.length} Product copy, ${createdRates} Rate copy, ${result.conflicts.length} conflict, ${failures.length} failed.`;
    const output = $("#supplier-copy-result");
    output.hidden = false;
    output.classList.toggle("attention", Boolean(result.conflicts.length || failures.length));
    output.innerHTML = `<strong>${escapeHtml(summary)}</strong><br>${[
      ...result.created.map((row) => ({
        ...row,
        reason: "Created in Local Pending",
        productName: row.sourceProductName || row.productName,
      })),
      ...result.conflicts,
      ...failures,
    ]
      .map((row) => `${escapeHtml(row.sourceProductName || row.productName || "Product")} → ${escapeHtml(row.supplierName || row.supplierId || "Supplier")}: ${escapeHtml(row.reason)}`)
      .join("<br>")}`;
    button.textContent = "Completed";
    $("#cancel-supplier-product-duplicate-dialog").textContent = "Close";
    toast(
      `${summary} Review successful copies in Local Pending before publishing.`,
      Boolean(result.conflicts.length || failures.length),
    );
  } catch (error) {
    button.disabled = false;
    button.textContent = "Save copies locally";
    toast(error.message, true);
  }
}

function contractRateMarkup(rate = {}) {
  const products = state.supplierMaster.products.filter((row) =>
    row.supplierId === state.selectedSupplierId && row.active !== false
  );
  const bases = ["PER_ADULT","PER_CHILD","PER_INFANT","PER_PAX","PER_SERVICE","PER_ITEM","PER_UNIT","PER_TRIP","PER_VEHICLE","PER_VAN","PER_GROUP","PER_HOUR","PER_DAY","CUSTOM"];
  return `
    <div class="supplier-contract-rate-row" data-contract-rate-id="${escapeHtml(rate.contractRateId || "")}">
      <label>Product<select data-contract-rate="productId">${products.map((row) => `<option value="${escapeHtml(row.productId)}"${row.productId === rate.productId ? " selected" : ""}>${escapeHtml(row.productName)}</option>`).join("")}</select></label>
      <label>Price basis<select data-contract-rate="priceBasis">${bases.map((value) => `<option${value === rate.priceBasis ? " selected" : ""}>${value}</option>`).join("")}</select></label>
      <label>Amount<input data-contract-rate="amount" type="number" min="0" step="0.01" value="${escapeHtml(rate.amount ?? "")}" /></label>
      <label>Min qty<input data-contract-rate="minQuantity" type="number" min="0" step="0.01" value="${escapeHtml(rate.minQuantity ?? "")}" /></label>
      <label>Max qty<input data-contract-rate="maxQuantity" type="number" min="0" step="0.01" value="${escapeHtml(rate.maxQuantity ?? "")}" /></label>
      <button class="supplier-repeatable-remove" data-remove-contract-rate type="button">×</button>
    </div>
  `;
}

function openSupplierContractDialog(contractId = "") {
  const supplier = state.supplierMaster.suppliers.find((row) => row.supplierId === state.selectedSupplierId);
  const products = state.supplierMaster.products.filter((row) => row.supplierId === state.selectedSupplierId && row.active !== false);
  if (!supplier) return toast("Select a supplier first.", true);
  if (!products.length) return toast("Add at least one Product before creating a Contract.", true);
  const contract = state.supplierMaster.contracts.find((row) => row.contractId === contractId) || {};
  const form = $("#supplier-contract-form");
  form.reset();
  form.elements.supplierId.value = supplier.supplierId;
  ["contractId","contractNumber","contractName","validFrom","validTo","currency","taxTreatment",
    "termsAndConditions","driveFileId","driveFileName","driveFileUrl","overlapReason"].forEach((field) => {
    if (form.elements[field]) form.elements[field].value = contract[field] || (field === "currency" ? "IDR" : "");
  });
  form.elements.allowOverlap.checked = Boolean(contract.allowOverlap);
  const link = $("#supplier-contract-file-link");
  link.hidden = !contract.driveFileUrl;
  link.href = contract.driveFileUrl || "#";
  const rates = state.supplierMaster.rates.filter((row) => row.contractId === contractId && row.active !== false);
  $("#supplier-contract-rate-list").innerHTML = (rates.length ? rates : [{}]).map(contractRateMarkup).join("");
  $("#supplier-contract-dialog-title").textContent = contract.contractId ? `Edit ${contract.contractNumber}` : "New Contract";
  $("#archive-supplier-contract").hidden = !contract.contractId;
  $("#supplier-contract-dialog").showModal();
  if (!contract.contractId) setTimeout(() => form.elements.contractNumber.focus(), 0);
}

function collectContractRates() {
  return [...document.querySelectorAll("#supplier-contract-rate-list .supplier-contract-rate-row")].map((row) => {
    const result = { contractRateId: row.dataset.contractRateId || "" };
    row.querySelectorAll("[data-contract-rate]").forEach((input) => {
      result[input.dataset.contractRate] = input.value;
    });
    return result;
  }).filter((row) => row.productId && row.priceBasis && row.amount !== "");
}

async function saveSupplierContractForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.allowOverlap = form.elements.allowOverlap.checked;
  payload.rates = collectContractRates();
  const existing = state.supplierMaster.contracts.find((row) => row.contractId === payload.contractId);
  payload.baseRecordVersion = existing?.recordVersion ?? null;
  try {
    const draft = applySupplierLocalResult(await window.erim.supplierMaster.saveContract(payload));
    $("#supplier-contract-dialog").close();
    renderSupplierMaster();
    state.vendorSuggestions = supplierSuggestionsFromCatalog(state.supplierMaster);
    renderVendorSuggestions(state.vendorSuggestions);
    toast(`${payload.contractNumber} and its rates saved locally.`);
    if (state.supplierFocusContext?.section === "RATE") {
      await window.erim.supplierMaster.completeFocused({
        kind: "RATE",
        entityId: draft?.entityId || payload.contractId,
        localStatus: "LOCAL_PENDING",
      });
    }
  } catch (error) { toast(error.message, true); }
}

async function uploadSupplierContract() {
  const form = $("#supplier-contract-form");
  const supplier = state.supplierMaster.suppliers.find((row) => row.supplierId === state.selectedSupplierId);
  try {
    const result = await window.erim.supplierMaster.uploadContract({
      supplierId: supplier?.supplierId,
      supplierName: supplier?.supplierName,
      contractNumber: form.elements.contractNumber.value.trim() || "Contract",
    });
    if (result.canceled) return;
    form.elements.driveFileId.value = result.driveFileId;
    form.elements.driveFileName.value = result.driveFileName;
    form.elements.driveFileUrl.value = result.driveFileUrl;
    const link = $("#supplier-contract-file-link");
    link.hidden = false;
    link.href = result.driveFileUrl;
    toast("Contract uploaded to the centralized Google Drive folder.");
  } catch (error) { toast(error.message, true); }
}

function archiveImpactText(entityKind, entityId) {
  if (entityKind === "SUPPLIER") {
    const products = state.supplierMaster.products.filter((row) =>
      row.supplierId === entityId && row.active !== false).length;
    const contracts = state.supplierMaster.contracts.filter((row) =>
      row.supplierId === entityId && row.active !== false).length;
    return `${products} active product(s) and ${contracts} active contract(s) will stop appearing through this supplier. Historical bookings, rates, and documents remain available.`;
  }
  if (entityKind === "PRODUCT") {
    const rates = state.supplierMaster.rates.filter((row) =>
      row.productId === entityId && row.active !== false).length;
    return `${rates} rate row(s) reference this product. It will stop appearing for new service selection; historical records remain available.`;
  }
  return "This contract and its rates will stop loading for new bookings. Historical bookings and the contract document remain available.";
}

function archiveSelectedSupplierEntity(entityKind, entityId, label) {
  state.supplierArchiveTarget = { entityKind, entityId, label };
  $("#supplier-archive-title").textContent = `Archive ${entityKind.toLowerCase().replaceAll("_", " ")}`;
  $("#supplier-archive-record").textContent = label;
  $("#supplier-archive-impact").textContent = archiveImpactText(entityKind, entityId);
  $("#supplier-archive-form").reset();
  $("#supplier-product-dialog").close();
  $("#supplier-contract-dialog").close();
  $("#supplier-archive-dialog").showModal();
  $("#supplier-archive-reason").focus();
}

async function submitSupplierArchive(event) {
  event.preventDefault();
  const target = state.supplierArchiveTarget;
  const reason = $("#supplier-archive-reason").value.trim();
  if (!target) return toast("Choose a Supplier Master record first.", true);
  if (!reason) return toast("Archive reason is required.", true);
  const button = $("#confirm-supplier-archive");
  button.disabled = true;
  button.textContent = "Saving locally...";
  try {
    applySupplierLocalResult(await window.erim.supplierMaster.archive({
      entityKind: target.entityKind,
      entityId: target.entityId,
      reason,
    }));
    if (target.entityKind === "SUPPLIER") state.selectedSupplierId = "";
    $("#supplier-archive-dialog").close();
    renderSupplierMaster();
    toast(`${target.label} archive queued locally. Historical booking snapshots remain available.`);
    state.supplierArchiveTarget = null;
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Queue archive locally";
  }
}

function draftActions(draft) {
  const buttons = [`<button data-action="edit" data-id="${draft.draft_id}">Open</button>`];
  if (draft.local_status === "LOCAL_DRAFT") buttons.push(`<button data-action="ready" data-id="${draft.draft_id}">Mark ready</button>`);
  if (draft.local_status === "READY_TO_POST" && draft.sync_status !== "PENDING_SYNC") buttons.push(`<button data-action="queue" data-id="${draft.draft_id}">Queue publish</button>`);
  return `<div class="row-actions">${buttons.join("")}</div>`;
}

const transportOperations = {
  "new-itinerary-check": {
    title: "New Itinerary Check",
    description: "Review kebutuhan kendaraan dari itinerary baru sebelum assignment dan costing.",
    note: "Read-only intake foundation; final validation rules will follow the Transport workflow discussion.",
    cards: [
      ["Source", "Published itinerary", "Customer, dates, pax, daywise route, pickup, and drop-off."],
      ["Transport check", "Vehicle requirements", "Vehicle type, quantity, capacity, luggage, route, and service duration."],
      ["Output", "Checked requirement", "Structured requirement ready for costing and driver assignment."],
    ],
  },
  "revise-itinerary-check": {
    title: "Revise Itinerary Check",
    description: "Compare itinerary revisions and identify changes affecting vehicles, drivers, routes, and costs.",
    note: "Historical assignments remain preserved; changes will require an explicit Transport decision.",
    cards: [
      ["Comparison", "Old vs new itinerary", "Highlight added, changed, removed, and unchanged transport requirements."],
      ["Impact", "Assignment review", "Flag affected vehicle, driver, supplier, timing, and TOC."],
      ["Output", "Revision decision", "Keep, revise, reassign, add, or cancel with an audit note."],
    ],
  },
  "add-cost": {
    title: "Add Cost to Itinerary",
    description: "Attach centralized Transport Product and Contract Rates to daywise requirements.",
    note: "Supplier Master remains the rate source; manual exceptions will retain reason and evidence.",
    cards: [
      ["Rate source", "Supplier Master", "Use valid Transport contracts and copied vehicle products."],
      ["Costing", "Per itinerary / per day", "Assign vehicle, basis, quantity, rate, surcharge, and operational extra cost."],
      ["Exception", "Pending or manual rate", "Allow controlled manual cost with source, reason, and reviewer trail."],
    ],
  },
  "driver-detail": {
    title: "Set Driver Detail",
    description: "Assign driver and vehicle details per itinerary or per day, including controlled revisions.",
    note: "Driver Master is intentionally lightweight: name, WhatsApp/phone number, and editable supplier.",
    cards: [
      ["Assignment", "Per itinerary", "Apply one driver and vehicle across the selected itinerary scope."],
      ["Assignment", "Per day", "Override driver, vehicle, pickup time, or contact on individual days."],
      ["Driver Master", "Save or revise driver", "Store name, international number, and supplier; preserve assignment history."],
    ],
  },
  "arrival-review": {
    title: "Review Arrival per Date",
    description: "Review arrivals by operating date for dispatch preparation and driver coordination.",
    note: "The final page will support filtered export without changing operational records.",
    cards: [
      ["Date board", "Arrival operations", "Arrival date/time, flight, guest, pax, vehicle, supplier, and driver."],
      ["Control", "Assignment status", "Show missing vehicle, missing driver, revision, and confirmed assignment."],
      ["Export", "Arrival manifest", "Export the filtered date view for operational distribution."],
    ],
  },
  "toc-review": {
    title: "Review TOC per Itinerary",
    description: "Prepare the Transport-side TOC review foundation per itinerary.",
    note: "Detailed TOC rules and exceptions remain reserved for the dedicated workflow discussion.",
    cards: [
      ["Scope", "Itinerary TOC", "Group TOC requirements by itinerary, day, location, and service."],
      ["Review", "Transport impact", "Connect TOC timing, access, parking, route, and vehicle constraints."],
      ["Export", "TOC review data", "Export the filtered itinerary review while preserving the source version."],
    ],
  },
  kpi: {
    title: "Cek KPI",
    description: "Prepare Transport KPI visibility for assignment, response, revision, and completion quality.",
    note: "Targets and scoring will only activate after the owner approves the KPI definitions.",
    cards: [
      ["Timeliness", "Assignment speed", "Time from published itinerary to checked and assigned transport."],
      ["Quality", "Revision and exception rate", "Track late revisions, missing detail, and avoidable reassignment."],
      ["Completion", "Operational closure", "Arrival/day-tour completion and invoice readiness."],
    ],
  },
  "day-tour": {
    title: "Review Day Tour",
    description: "Review daily tour movement, vehicle readiness, driver detail, and route notes.",
    note: "This foundation will later connect live operational status and day-tour completion evidence.",
    cards: [
      ["Daily board", "Day tour schedule", "Date, start time, route, pax, vehicle, supplier, and driver."],
      ["Readiness", "Operational checklist", "Driver confirmed, vehicle confirmed, contact shared, and special notes reviewed."],
      ["Follow-up", "Completion status", "Record exception, change, completion, and handoff for invoicing."],
    ],
  },
  invoicing: {
    title: "Invoicing",
    description: "Prepare transporter invoice matching against assigned services and approved costs.",
    note: "Accounting posting stays inactive until invoice, approval, and reconciliation rules are agreed.",
    cards: [
      ["Source", "Completed transport", "Use approved assignments, rate snapshots, extras, and completion status."],
      ["Matching", "Supplier invoice", "Match invoice lines to itinerary, day, vehicle, and agreed cost."],
      ["Handoff", "Accounting-ready", "Flag matched, disputed, missing, or approved lines with evidence."],
    ],
  },
};

function renderTransportOperation(action = state.transportAction) {
  const operation = transportOperations[action] || transportOperations["new-itinerary-check"];
  state.transportAction = action in transportOperations ? action : "new-itinerary-check";
  $("#transport-operation-title").textContent = operation.title;
  $("#transport-operation-description").textContent = operation.description;
  $("#transport-operation-heading").textContent = operation.title;
  $("#transport-operation-note").textContent = operation.note;
  $("#transport-operation-cards").innerHTML = operation.cards.map(([eyebrow, title, detail], index) => `
    <article class="transport-operation-card${index === operation.cards.length - 1 ? " ready" : ""}">
      <span>${escapeHtml(eyebrow)}</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `).join("");
}

function showView(view, module = null) {
  state.currentView = view;
  state.currentModule = module;
  $$(".view").forEach((node) => node.classList.toggle("active", node.id === `${view}-view`));
  $$(".nav-item").forEach((node) => node.classList.toggle("active", node.dataset.view === view && (!module || node.dataset.module === module)));
  $$("[data-vendor-action]").forEach((node) => {
    const map = {
      "itinerary-check": "vendor-itinerary-check",
      inbox: "vendor-inbox", generate: "vendor-generate", new: "vendor-new-itinerary",
      revise: "vendor-revise-itinerary", cancel: "vendor-cancel", kpi: "vendor-kpi",
    };
    node.classList.toggle("active", map[node.dataset.vendorAction] === view);
  });
  $$("[data-manager-action]").forEach((node) => {
    node.classList.toggle("active", node.dataset.managerAction === view);
  });
  $$("[data-transport-action]").forEach((node) => {
    node.classList.toggle("active",
      view === "transport-operation" && node.dataset.transportAction === state.transportAction);
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
    "vendor-itinerary-check": ["Vendor Booking", "Itinerary Check"],
    "vendor-inbox": ["Vendor Booking", "Inbox"],
    "vendor-generate": ["Vendor Booking", "Generate"],
    "vendor-new-itinerary": ["Vendor Booking intake", "New Itinerary"],
    "vendor-revise-itinerary": ["Vendor Booking", "Revise Itinerary"],
    "vendor-cancel": ["Vendor Booking", "Cancel All Service"],
    "vendor-kpi": ["Vendor Booking", "Cek KPI"],
    "transport-operation": ["Transport Operations", transportOperations[state.transportAction]?.title || "Transport"],
    "supplier-master": ["Manager / Admin", "Supplier Master & Contract Rates"],
    "supplier-excel": ["Manager / Admin", "Supplier Data Import / Export"],
  };
  $("#view-eyebrow").textContent = titles[view][0];
  $("#view-title").textContent = titles[view][1];
  renderWorkspace();
  renderReservationFollowups();
  renderPersonalKpi();
  if (view === "transport-operation") renderTransportOperation();
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
  const dayZero = existingDays.find((day) => Number(day.dayNumber) === 0);
  const existingByDate = new Map(existingDays
    .filter((day) => Number(day.dayNumber) !== 0)
    .map((day) => [day.serviceDate, day]));
  const rows = [];
  if (dayZero) rows.push({ ...dayZero, dayNumber: 0 });
  for (let cursor = start.getTime(), dayNumber = 1; cursor <= end.getTime(); cursor += 86_400_000, dayNumber += 1) {
    const serviceDate = new Date(cursor).toISOString().slice(0, 10);
    const existing = existingByDate.get(serviceDate) || {};
    rows.push({
      tourDayId: existing.tourDayId || "",
      dayNumber,
      serviceDate,
      dayTitle: existing.dayTitle || "",
      startTime: existing.startTime || "",
      finishTime: existing.finishTime || "",
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
      <label>Check-in date<input data-vendor-hotel-field="checkInDate" data-vendor-date-input
        value="${escapeHtml(formatVendorDate(hotel.checkInDate))}" placeholder="03/October/2026" /></label>
      <label>Check-out date<input data-vendor-hotel-field="checkOutDate" data-vendor-date-input
        value="${escapeHtml(formatVendorDate(hotel.checkOutDate))}" placeholder="03/October/2026" /></label>
      <button class="button ghost small" type="button" data-remove-vendor-hotel="${index}">Remove</button>
    </div>
  `).join("") : `<div class="empty-notifications">No hotel extracted. Add hotel manually if required.</div>`;
}

function collectVendorHotelRows() {
  return $$("#vendor-hotel-list .hotel-row").map((row, index) => ({
    hotelStayId: row.dataset.hotelStayId || "",
    staySequence: index + 1,
    hotelName: row.querySelector('[data-vendor-hotel-field="hotelName"]').value.trim(),
    checkInDate: vendorDateValue(row.querySelector('[data-vendor-hotel-field="checkInDate"]')),
    checkOutDate: vendorDateValue(row.querySelector('[data-vendor-hotel-field="checkOutDate"]')),
  }));
}

function vendorHotelsForDate(hotels = [], serviceDate = "") {
  if (!serviceDate) return [];
  return hotels
    .filter((hotel) => hotel.hotelName
      && hotel.checkInDate
      && hotel.checkOutDate
      && hotel.checkInDate <= serviceDate
      && serviceDate <= hotel.checkOutDate)
    .sort((left, right) => Number(left.staySequence || 0) - Number(right.staySequence || 0));
}

function vendorDayHotelMarkup(hotels = [], serviceDate = "") {
  const matches = vendorHotelsForDate(hotels, serviceDate);
  const currentHotel = matches[0]?.hotelName || "Hotel not assigned";
  const changeHotels = matches.slice(1).map((hotel) => hotel.hotelName).join(" / ");
  return `
    <div class="vendor-day-hotel-cell${matches.length ? "" : " warning"}${changeHotels ? "" : " full"}">
      <span>Hotel on this day</span>
      <strong>${escapeHtml(currentHotel)}</strong>
    </div>
    ${changeHotels ? `
      <div class="vendor-day-hotel-cell change">
        <span>Hotel change</span>
        <strong>${escapeHtml(changeHotels)}</strong>
      </div>
    ` : ""}
  `;
}

function updateVendorDayHotels() {
  const hotels = collectVendorHotelRows();
  $$("#vendor-day-list .vendor-day-card").forEach((card) => {
    const serviceDate = card.querySelector('[data-vendor-day-field="serviceDate"]').value;
    card.querySelector("[data-vendor-day-hotels]").innerHTML = vendorDayHotelMarkup(hotels, serviceDate);
  });
}

function vendorSplitCatalog(serviceType) {
  const type = normalizeVendorSplitType(serviceType);
  return (state.vendorSuggestions.allRates || state.vendorSuggestions.rates || [
    ...(state.vendorSuggestions.vendorRates || []),
    ...(state.vendorSuggestions.tocRates || []),
    ...(state.vendorSuggestions.transportRates || []),
    ...(state.vendorSuggestions.luggageVanRates || []),
  ]).filter((rate) => !rate.typeCode || rate.typeCode === type);
}

function vendorSplitProviderConfig(serviceType) {
  const type = (state.vendorSuggestions.supplierTypes || []).find((row) =>
    row.typeCode === normalizeVendorSplitType(serviceType)
  );
  return {
    label: type?.typeName ? `${type.typeName} Supplier` : "Supplier",
    placeholder: "Choose supplier",
  };
}

function vendorSplitServiceList(serviceType) {
  return normalizeVendorSplitType(serviceType);
}

function vendorSplitRate(serviceType, supplierId, productId, serviceDate = "") {
  if (!productId) return null;
  const date = serviceDate || $("#vendor-split-dialog")?.dataset.serviceDate || new Date().toISOString().slice(0, 10);
  const candidates = vendorSplitCatalog(serviceType).filter((rate) =>
    (!supplierId || rate.supplierId === supplierId)
    && (rate.productId || rate.serviceMasterId) === productId
    && (!rate.validFrom || date >= rate.validFrom)
    && (!rate.validTo || date <= rate.validTo)
  );
  if (!candidates.length) return null;
  const first = candidates[0];
  return candidates.reduce((combined, rate) => ({
    ...combined,
    adultRateIdr: hasKnownRate(rate.adultRateIdr) ? rate.adultRateIdr : combined.adultRateIdr,
    childRateIdr: hasKnownRate(rate.childRateIdr) ? rate.childRateIdr : combined.childRateIdr,
    infantRateIdr: hasKnownRate(rate.infantRateIdr) ? rate.infantRateIdr : combined.infantRateIdr,
    unitRateIdr: hasKnownRate(rate.unitRateIdr) ? rate.unitRateIdr : combined.unitRateIdr,
    contractRateId: combined.contractRateId || rate.contractRateId || "",
  }), {
    ...first,
    adultRateIdr: null,
    childRateIdr: null,
    infantRateIdr: null,
    unitRateIdr: null,
  });
}

function hasKnownRate(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function idr(value) {
  return hasKnownRate(value)
    ? new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(Number(value))
    : "";
}

function vendorSplitProductPriceLabel(product, serviceType, supplierId, serviceDate = "") {
  const rate = vendorSplitRate(serviceType, supplierId, product.productId, serviceDate);
  if (!rate) return "Pending rate";
  const parts = [
    hasKnownRate(rate.adultRateIdr) ? `Adult ${idr(rate.adultRateIdr)}` : "",
    hasKnownRate(rate.childRateIdr) ? `Child ${idr(rate.childRateIdr)}` : "",
    hasKnownRate(rate.infantRateIdr) ? `Infant ${idr(rate.infantRateIdr)}` : "",
    hasKnownRate(rate.unitRateIdr) ? idr(rate.unitRateIdr) : "",
    rate.priceBasis ? rate.priceBasis.replaceAll("_", " ") : "",
  ].filter(Boolean);
  return parts.join(" · ") || "Pending rate";
}

function vendorSplitPaxCounts() {
  const form = $("#vendor-intake-form");
  return {
    adult: Number(form?.elements.adultPax?.value || state.vendorIntake?.adultPax || 0),
    child: Number(form?.elements.childPax?.value || state.vendorIntake?.childPax || 0),
    infant: Number(form?.elements.infantPax?.value || state.vendorIntake?.infantPax || 0),
  };
}

function manualPerPaxReady(pax, rates) {
  const categories = [
    [pax.adult, rates.adultRateIdr],
    [pax.child, rates.childRateIdr],
    [pax.infant, rates.infantRateIdr],
  ];
  return categories.some(([count]) => count > 0)
    && categories.every(([count, rate]) => count <= 0 || hasKnownRate(rate));
}

function vendorManualRateDraft(row) {
  const value = (field) => row.querySelector(`[data-vendor-split-field="${field}"]`)?.value ?? "";
  return {
    priceSource: "MANUAL",
    priceBasis: value("priceBasis") || "PER_SERVICE",
    adultRateIdr: value("adultRateIdr"),
    childRateIdr: value("childRateIdr"),
    infantRateIdr: value("infantRateIdr"),
    unitRateIdr: value("unitRateIdr"),
    quantity: value("quantity") || 1,
    manualPriceReason: value("manualPriceReason"),
    manualRateSource: value("manualRateSource"),
    manualEvidenceRef: value("manualEvidenceRef"),
  };
}

function updateVendorManualRatePreview(row) {
  if (!row) return;
  const basis = row.querySelector('[data-vendor-split-field="priceBasis"]')?.value || "PER_SERVICE";
  const perPax = basis === "PER_PAX";
  const flat = basis === "PER_SERVICE";
  const paxPanel = row.querySelector("[data-manual-rate-per-pax]");
  const unitPanel = row.querySelector("[data-manual-rate-unit]");
  const quantityLabel = row.querySelector("[data-manual-quantity-field]");
  if (paxPanel) paxPanel.hidden = !perPax;
  if (unitPanel) unitPanel.hidden = perPax;
  if (quantityLabel) {
    quantityLabel.hidden = flat || perPax;
    const labels = {
      PER_ITEM: "Items",
      PER_UNIT: "Units",
      PER_VEHICLE: "Vehicles",
      PER_TRIP: "Trips",
    };
    const caption = quantityLabel.querySelector("span");
    if (caption) caption.textContent = labels[basis] || "Quantity";
  }
  const quantityInput = row.querySelector('[data-vendor-split-field="quantity"]');
  if (quantityInput && (flat || perPax)) quantityInput.value = "1";

  const draft = vendorManualRateDraft(row);
  const pax = vendorSplitPaxCounts();
  let ready;
  let total = 0;
  const missing = [];
  if (perPax) {
    ready = manualPerPaxReady(pax, draft);
    [
      ["Adult", pax.adult, draft.adultRateIdr],
      ["Child", pax.child, draft.childRateIdr],
      ["Infant", pax.infant, draft.infantRateIdr],
    ].forEach(([label, count, rate]) => {
      if (count <= 0) return;
      if (hasKnownRate(rate)) total += count * Number(rate);
      else missing.push(label);
    });
  } else {
    ready = hasKnownRate(draft.unitRateIdr);
    const quantity = flat ? 1 : Math.max(1, Number(draft.quantity || 1));
    if (ready) total = Number(draft.unitRateIdr) * quantity;
  }
  const badge = row.querySelector("[data-vendor-rate-status]");
  if (badge) {
    badge.textContent = ready ? "Manual rate ready" : "Pending rate";
    badge.className = `vendor-rate-status ${ready ? "ready" : "pending"}`;
  }
  const preview = row.querySelector("[data-manual-rate-total]");
  if (preview) {
    preview.innerHTML = `<strong>Estimated total ${ready || total ? escapeHtml(idr(total)) : "—"}</strong>`
      + `<small>${missing.length ? `Missing ${escapeHtml(missing.join(", "))} rate` : perPax
        ? `${pax.adult} Adult · ${pax.child} Child · ${pax.infant} Infant`
        : `${flat ? 1 : Math.max(1, Number(draft.quantity || 1))} × ${escapeHtml(idr(draft.unitRateIdr) || "rate pending")}`}</small>`;
  }
}

function vendorSplitRateMarkup(split = {}) {
  const type = normalizeVendorSplitType(split.serviceType || "VENDOR");
  const rate = vendorSplitRate(type, split.supplierId, split.productId || split.serviceMasterId, split.serviceDate);
  if (!rate) {
    const unitRate = split.priceSource === "MANUAL" ? (split.unitRateIdr ?? "") : "";
    const adultRate = split.priceSource === "MANUAL" ? (split.adultRateIdr ?? "") : "";
    const childRate = split.priceSource === "MANUAL" ? (split.childRateIdr ?? "") : "";
    const infantRate = split.priceSource === "MANUAL" ? (split.infantRateIdr ?? "") : "";
    const basis = split.priceBasis || "PER_SERVICE";
    const quantity = Math.max(1, Math.round(Number(split.quantity ?? 1) || 1));
    const pax = vendorSplitPaxCounts();
    const perPax = basis === "PER_PAX";
    const ready = perPax
      ? manualPerPaxReady(pax, {
        adultRateIdr: adultRate,
        childRateIdr: childRate,
        infantRateIdr: infantRate,
      })
      : hasKnownRate(unitRate);
    const estimatedTotal = perPax
      ? (hasKnownRate(adultRate) ? pax.adult * Number(adultRate) : 0)
        + (hasKnownRate(childRate) ? pax.child * Number(childRate) : 0)
        + (hasKnownRate(infantRate) ? pax.infant * Number(infantRate) : 0)
      : (hasKnownRate(unitRate) ? Number(unitRate) * (basis === "PER_SERVICE" ? 1 : quantity) : 0);
    return `
      <div class="vendor-split-rate-heading">
        <span class="vendor-rate-status ${ready ? "ready" : "pending"}" data-vendor-rate-status>
          ${ready ? "Manual rate ready" : "Pending rate"}
        </span>
        <small>No valid contract rate for this service date. Booking may continue; manual rate is booking-only.</small>
      </div>
      <div class="vendor-split-manual-rate">
        <label class="vendor-split-field">
          <span>Price basis</span>
          <select data-vendor-split-field="priceBasis">
            ${["PER_SERVICE", "PER_PAX", "PER_ITEM", "PER_UNIT", "PER_TRIP", "PER_VEHICLE"].map((value) =>
              `<option value="${value}"${value === basis ? " selected" : ""}>${value.replaceAll("_", " ")}</option>`
            ).join("")}
          </select>
        </label>
        <div class="vendor-manual-pax-rates" data-manual-rate-per-pax ${perPax ? "" : "hidden"}>
          ${[
            ["Adult", "adultRateIdr", pax.adult, adultRate],
            ["Child", "childRateIdr", pax.child, childRate],
            ["Infant", "infantRateIdr", pax.infant, infantRate],
          ].map(([label, field, count, value]) => `
            <label class="vendor-split-field">
              <span>${label} rate · ${count} pax</span>
              <input data-vendor-split-field="${field}" type="number" min="0" step="1"
                value="${escapeHtml(value)}" placeholder="${count ? "Required or 0 if free" : "No pax"}"
                ${count ? "" : "disabled"} />
            </label>
          `).join("")}
        </div>
        <div class="vendor-manual-unit-rate" data-manual-rate-unit ${perPax ? "hidden" : ""}>
          <label class="vendor-split-field">
            <span>Unit rate</span>
            <input data-vendor-split-field="unitRateIdr" type="number" min="0" step="1"
              value="${escapeHtml(unitRate)}" placeholder="Can be filled later" />
          </label>
          <label class="vendor-split-field" data-manual-quantity-field ${basis === "PER_SERVICE" ? "hidden" : ""}>
            <span>Quantity</span>
            <input data-vendor-split-field="quantity" type="number" min="1" step="1"
              value="${escapeHtml(quantity)}" />
          </label>
        </div>
        <div class="vendor-manual-rate-total" data-manual-rate-total>
          <strong>Estimated total ${ready || estimatedTotal ? escapeHtml(idr(estimatedTotal)) : "—"}</strong>
          <small>${perPax ? `${pax.adult} Adult · ${pax.child} Child · ${pax.infant} Infant`
            : `${basis === "PER_SERVICE" ? 1 : quantity} × ${escapeHtml(idr(unitRate) || "rate pending")}`}</small>
        </div>
        <label class="vendor-split-field">
          <span>Reason *</span>
          <input data-vendor-split-field="manualPriceReason" value="${escapeHtml(split.manualPriceReason || "")}"
            placeholder="Required when manual rate is filled" />
        </label>
        <label class="vendor-split-field">
          <span>Source</span>
          <select data-vendor-split-field="manualRateSource">
            ${["EMAIL","WHATSAPP","QUOTATION","PHONE","PORTAL","OTHERS"].map((value) =>
              `<option${value === split.manualRateSource ? " selected" : ""}>${value}</option>`
            ).join("")}
          </select>
        </label>
        <label class="vendor-split-field">
          <span>Evidence reference</span>
          <input data-vendor-split-field="manualEvidenceRef" value="${escapeHtml(split.manualEvidenceRef || "")}"
            placeholder="Email/thread/file/note reference" />
        </label>
      </div>
    `;
  }
  const adult = rate?.adultRateIdr ?? split.adultRateIdr;
  const child = rate?.childRateIdr ?? split.childRateIdr;
  const infant = rate?.infantRateIdr ?? split.infantRateIdr;
  const unit = rate?.unitRateIdr ?? split.unitRateIdr;
  const ready = hasKnownRate(adult) || hasKnownRate(child) || hasKnownRate(infant) || hasKnownRate(unit);
  const parts = [
    hasKnownRate(adult) ? `Adult ${idr(adult)}` : "",
    hasKnownRate(child) ? `Child ${idr(child)}` : "",
    hasKnownRate(infant) ? `Infant ${idr(infant)}` : "",
    hasKnownRate(unit) ? `Unit ${idr(unit)}` : "",
    rate?.priceBasis ? rate.priceBasis.replaceAll("_", " ") : "",
    rate?.contractNumber ? `Contract ${rate.contractNumber}` : "",
    rate?.validTo ? `valid to ${rate.validTo}` : "",
  ].filter(Boolean);
  return `
    <div class="vendor-split-rate-heading">
      <span class="vendor-rate-status ${ready ? "ready" : "pending"}">
        ${ready ? "Rate ready" : "Pending rate"}
      </span>
      <small>${escapeHtml(parts.join(" · ") || "Select a matching master service to load its rate.")}</small>
      ${rate?.localDraftStatus
        ? `<small class="supplier-draft-error">LOCAL RATE — SYNC APPROVAL REQUIRED · ${escapeHtml((rate.localRateApprovalStatus || "LOCAL_ONLY").replaceAll("_", " "))}</small>` : ""}
    </div>
  `;
}

function vendorSplitRow(split = {}, index = 0) {
  const normalizedType = normalizeVendorSplitType(split.serviceType || "VENDOR");
  const supplierTypes = (state.vendorSuggestions.supplierTypes || [
    { typeCode: "VENDOR", typeName: "Vendor" },
    { typeCode: "TOC", typeName: "TOC" },
    { typeCode: "TRANSPORT", typeName: "Transport" },
    { typeCode: "LUGGAGE_VAN", typeName: "Luggage Van" },
    { typeCode: "ADDITIONAL_SERVICE", typeName: "Additional Service" },
  ]).filter((row) => row.active !== false);
  const typeOptions = supplierTypes
    .map((row) => `
      <option value="${escapeHtml(row.typeCode)}" ${row.typeCode === normalizedType ? "selected" : ""}>
        ${escapeHtml(row.typeName)}
      </option>
    `).join("");
  const provider = vendorSplitProviderConfig(normalizedType);
  const suppliers = (state.vendorSuggestions.suppliers || []).filter((row) =>
    row.active !== false && row.typeCode === normalizedType
  );
  const selectedSupplierId = split.supplierId || split.vendorId
    || suppliers.find((row) => row.supplierName === split.vendorName)?.supplierId || "";
  const products = (state.vendorSuggestions.products || []).filter((row) =>
    row.active !== false && row.supplierId === selectedSupplierId
  );
  const selectedProductId = split.productId || split.serviceMasterId
    || products.find((row) => row.productName === split.activityText)?.productId || "";
  const selectedSupplier = suppliers.find((row) => row.supplierId === selectedSupplierId);
  const selectedProduct = products.find((row) => row.productId === selectedProductId);
  const suggestionKey = ++state.vendorSplitSuggestionSequence;
  const supplierListId = `vendor-supplier-suggestions-${suggestionKey}`;
  const productListId = `vendor-product-suggestions-${suggestionKey}`;
  const serviceDate = $("#vendor-split-dialog")?.dataset.serviceDate || "";
  return `
    <div class="vendor-split-row" data-service-id="${escapeHtml(split.serviceId || "")}"
      data-service-type="${normalizedType}"
      data-rate-snapshot-at="${escapeHtml(split.rateSnapshotAt || "")}">
      <label class="vendor-split-field">
        <span>Type</span>
        <select data-vendor-split-field="serviceType">
          ${typeOptions}
        </select>
      </label>
      <label class="vendor-split-field">
        <span data-vendor-provider-label>${provider.label}</span>
        <input data-vendor-split-suggestion="supplier" list="${supplierListId}"
          value="${escapeHtml(selectedSupplier?.supplierName || split.vendorName || "")}"
          placeholder="Type or choose supplier" autocomplete="off" />
        <input data-vendor-split-field="supplierId" type="hidden" value="${escapeHtml(selectedSupplierId)}" />
        <datalist id="${supplierListId}" data-vendor-supplier-list>
          ${suppliers.map((row) => `<option value="${escapeHtml(row.supplierName)}" label="${escapeHtml(row.supplierCode || row.typeCode || "")}"></option>`).join("")}
        </datalist>
      </label>
      <label class="vendor-split-field">
        <span>Supplier Service / Product</span>
        <input data-vendor-split-suggestion="product" list="${productListId}"
          value="${escapeHtml(selectedProduct?.productName || split.activityText || "")}"
          placeholder="Type or choose service/product" autocomplete="off"
          ${selectedSupplierId ? "" : "disabled"} />
        <input data-vendor-split-field="productId" type="hidden" value="${escapeHtml(selectedProductId)}" />
        <datalist id="${productListId}" data-vendor-product-list>
          ${products.map((row) => `<option value="${escapeHtml(row.productName)}" label="${escapeHtml(
            vendorSplitProductPriceLabel(row, normalizedType, selectedSupplierId, serviceDate)
          )}"></option>`).join("")}
        </datalist>
      </label>
      <div class="vendor-split-rate-panel" data-vendor-split-rate-panel>
        ${vendorSplitRateMarkup({
          ...split,
          serviceType: normalizedType,
          supplierId: selectedSupplierId,
          productId: selectedProductId,
          serviceDate,
        })}
      </div>
      <button class="vendor-split-remove" type="button" data-remove-vendor-split="${index}" aria-label="Remove service" title="Remove service">×</button>
    </div>
  `;
}

function collectVendorSplitRows(container) {
  return [...container.querySelectorAll(".vendor-split-row")].map((row, index) => {
    const serviceType = normalizeVendorSplitType(
      row.querySelector('[data-vendor-split-field="serviceType"]').value,
    );
    const supplierInput = row.querySelector('[data-vendor-split-field="supplierId"]');
    const productInput = row.querySelector('[data-vendor-split-field="productId"]');
    const supplierId = supplierInput.value;
    const productId = productInput.value;
    const vendorName = (state.vendorSuggestions.suppliers || [])
      .find((item) => item.supplierId === supplierId)?.supplierName
      || row.querySelector('[data-vendor-split-suggestion="supplier"]')?.value.trim() || "";
    const activityText = (state.vendorSuggestions.products || [])
      .find((item) => item.productId === productId)?.productName
      || row.querySelector('[data-vendor-split-suggestion="product"]')?.value.trim() || "";
    const matchedRate = vendorSplitRate(serviceType, supplierId, productId);
    const manualDraft = vendorManualRateDraft(row);
    const manualRate = manualDraft.unitRateIdr === "" ? null : Number(manualDraft.unitRateIdr);
    const manualAdultRate = manualDraft.adultRateIdr === "" ? null : Number(manualDraft.adultRateIdr);
    const manualChildRate = manualDraft.childRateIdr === "" ? null : Number(manualDraft.childRateIdr);
    const manualInfantRate = manualDraft.infantRateIdr === "" ? null : Number(manualDraft.infantRateIdr);
    const basis = matchedRate?.priceBasis || manualDraft.priceBasis || "PER_SERVICE";
    const pax = vendorSplitPaxCounts();
    const unitRateIdr = matchedRate?.unitRateIdr ?? manualRate;
    const adultRateIdr = matchedRate?.adultRateIdr ?? (basis === "PER_PAX" ? manualAdultRate : null);
    const childRateIdr = matchedRate?.childRateIdr ?? (basis === "PER_PAX" ? manualChildRate : null);
    const infantRateIdr = matchedRate?.infantRateIdr ?? (basis === "PER_PAX" ? manualInfantRate : null);
    const rateReady = basis === "PER_PAX"
      ? manualPerPaxReady(pax, { adultRateIdr, childRateIdr, infantRateIdr })
      : hasKnownRate(adultRateIdr) || hasKnownRate(childRateIdr)
        || hasKnownRate(infantRateIdr) || hasKnownRate(unitRateIdr);
    const manualFilled = [
      manualRate, manualAdultRate, manualChildRate, manualInfantRate,
    ].some(hasKnownRate);
    return {
      serviceId: row.dataset.serviceId || "",
      splitSequence: index + 1,
      serviceType,
      activityText,
      vendorId: "",
      vendorName,
      supplierId,
      productId,
      serviceMasterId: productId,
      contractId: matchedRate?.contractId || "",
      contractRateId: matchedRate?.contractRateId || "",
      adultRateIdr,
      childRateIdr,
      infantRateIdr,
      unitRateIdr,
      priceBasis: basis,
      quantity: basis === "PER_PAX" || basis === "PER_SERVICE"
        ? 1 : Math.max(1, Math.round(Number(manualDraft.quantity || 1))),
      currency: matchedRate?.currency || "IDR",
      rateStatus: rateReady ? "RATE_READY" : "PENDING_RATE",
      priceSource: matchedRate ? "CONTRACT" : (manualFilled ? "MANUAL" : "NONE"),
      manualPriceReason: manualDraft.manualPriceReason.trim(),
      manualRateSource: manualDraft.manualRateSource,
      manualEvidenceRef: manualDraft.manualEvidenceRef.trim(),
      rateValidTo: matchedRate?.validTo || "",
      rateSnapshotAt: row.dataset.rateSnapshotAt || new Date().toISOString(),
      status: "DRAFT",
    };
  });
}

function renderVendorDays(days = [], hotels = collectVendorHotelRows()) {
  $("#vendor-day-list").innerHTML = days.length ? days.map((day) => `
    <article class="vendor-day-card" data-tour-day-id="${escapeHtml(day.tourDayId || "")}" data-day-number="${Number(day.dayNumber)}">
      <div class="vendor-day-heading">
        <div class="vendor-day-primary">
          <strong class="vendor-day-number">Day ${Number(day.dayNumber)}</strong>
          <label class="vendor-day-date">
            <span>Date</span>
            <input data-vendor-day-field="serviceDate" data-vendor-date-input
              value="${escapeHtml(formatVendorDate(day.serviceDate))}" placeholder="03/October/2026" />
          </label>
          <label class="vendor-day-title">
            <span>Day Wise Header</span>
            <textarea data-vendor-day-field="dayTitle" data-auto-grow rows="4" placeholder="Tour day header">${escapeHtml(day.dayTitle || "")}</textarea>
          </label>
          <span class="muted-text" data-vendor-split-count>${escapeHtml((day.splits || []).length ? `${day.splits.length} split item` : "Not split")}</span>
          <button class="button ghost small" type="button" data-toggle-vendor-split>Split</button>
        </div>
        <div class="vendor-day-times">
          <label class="vendor-day-time">
            <span>Start time</span>
            <input data-vendor-day-field="startTime" inputmode="numeric" placeholder="HH:MM" data-hour-time value="${escapeHtml(day.startTime || "")}" />
          </label>
          <label class="vendor-day-time">
            <span>Finish time</span>
            <input data-vendor-day-field="finishTime" inputmode="numeric" placeholder="HH:MM" data-hour-time value="${escapeHtml(day.finishTime || "")}" />
          </label>
        </div>
      </div>
      <div class="vendor-day-hotels" data-vendor-day-hotels>
        ${vendorDayHotelMarkup(hotels, day.serviceDate)}
      </div>
      <textarea data-vendor-day-field="daywiseText" placeholder="Paste Day ${Number(day.dayNumber)} itinerary detail here">${escapeHtml(day.daywiseText || "")}</textarea>
      <div data-vendor-split-store hidden>${(day.splits || []).map(vendorSplitRow).join("")}</div>
    </article>
  `).join("") : `<div class="empty-notifications">Arrival and departure dates must form a valid range.</div>`;
  $("#add-vendor-day-zero").hidden = days.some((day) => Number(day.dayNumber) === 0);
  $("#delete-vendor-day-zero").hidden = !days.some((day) => Number(day.dayNumber) === 0);
  resizeVendorTextareas();
}

function refreshVendorSplitCard(card) {
  const rows = [...card.querySelectorAll("[data-vendor-split-store] .vendor-split-row")];
  rows.forEach((row, index) => {
    const remove = row.querySelector("[data-remove-vendor-split]");
    if (remove) remove.dataset.removeVendorSplit = String(index);
  });
  const count = card.querySelector("[data-vendor-split-count]");
  if (count) count.textContent = rows.length ? `${rows.length} split item` : "Not split";
}

function openVendorSplitDialog(card) {
  const dayNumber = Number(card.dataset.dayNumber);
  const serviceDate = vendorDateValue(card.querySelector('[data-vendor-day-field="serviceDate"]'));
  const dayTitle = card.querySelector('[data-vendor-day-field="dayTitle"]').value.trim();
  const startTime = card.querySelector('[data-vendor-day-field="startTime"]').value;
  const finishTime = card.querySelector('[data-vendor-day-field="finishTime"]').value;
  const daywiseText = card.querySelector('[data-vendor-day-field="daywiseText"]').value.trim();
  const stored = collectVendorSplitRows(card.querySelector("[data-vendor-split-store]"));
  const rows = stored.length ? stored : [{
    serviceId: "", serviceType: "VENDOR", activityText: "", vendorId: "", vendorName: "", status: "DRAFT",
  }];
  const dialog = $("#vendor-split-dialog");
  dialog.dataset.dayNumber = String(dayNumber);
  dialog.dataset.serviceDate = serviceDate || "";
  const hotelNames = [...new Set(
    vendorHotelsForDate(collectVendorHotelRows(), serviceDate)
      .map((hotel) => String(hotel.hotelName || "").trim())
      .filter(Boolean),
  )];
  $("#vendor-split-dialog-title").textContent = `Day ${dayNumber} micro split`;
  const timeRange = finishTime ? `${startTime}–${finishTime}` : `Start ${startTime}`;
  $("#vendor-split-dialog-meta").textContent = [serviceDate, timeRange, dayTitle].filter(Boolean).join(" · ") || "Date and tour header not filled";
  $("#vendor-split-context-hotel").textContent = hotelNames.join(" → ") || "Hotel not assigned";
  $("#vendor-split-context-start").textContent = startTime || "Not set";
  $("#vendor-split-context-finish").textContent = finishTime || "Not set";
  $("#vendor-split-evidence-title").textContent = dayTitle || `Day ${dayNumber}`;
  $("#vendor-split-evidence-detail").textContent = daywiseText || "No Day Wise detail has been pasted.";
  $("#vendor-split-dialog-list").innerHTML = rows.map(vendorSplitRow).join("");
  dialog.showModal();
}

async function applyVendorSplitDialog() {
  const dialog = $("#vendor-split-dialog");
  const card = $(`#vendor-day-list [data-day-number="${Number(dialog.dataset.dayNumber)}"]`);
  if (!card) return dialog.close();
  const button = $("#apply-vendor-split");
  const original = button.textContent;
  const splits = collectVendorSplitRows($("#vendor-split-dialog-list"));
  card.querySelector("[data-vendor-split-store]").innerHTML = splits.map(vendorSplitRow).join("");
  refreshVendorSplitCard(card);
  button.disabled = true;
  button.textContent = "Saving locally...";
  try {
    const payload = collectVendorIntake();
    const saved = await window.erim.vendor.saveIntakeDraft({
      ...payload,
      processSource: "MICRO_SPLIT_AUTOSAVE",
    });
    state.vendorIntake = { ...saved, suggestions: state.vendorSuggestions };
    $("#vendor-intake-form").elements.vendorDraftId.value = saved.vendorDraftId || "";
    dialog.close();
    toast(`Day ${dialog.dataset.dayNumber} split saved safely on this PC.`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function collectVendorIntake() {
  const form = $("#vendor-intake-form");
  const base = state.vendorIntake || {};
  return {
    ...base,
    vendorDraftId: form.elements.vendorDraftId.value,
    customerCode: form.elements.customerCode.value.trim().toUpperCase(),
    customerName: form.elements.customerName.value.trim(),
    clientTag: form.elements.clientTag.value.trim().toUpperCase(),
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
    totalPax: Number(form.elements.adultPax.value || 0)
      + Number(form.elements.childPax.value || 0)
      + Number(form.elements.infantPax.value || 0),
    arrivalDate: vendorDateValue(form.elements.arrivalDate),
    arrivalFlight: form.elements.arrivalFlight.value.trim(),
    arrivalSector: form.elements.arrivalSector.value.trim(),
    arrivalTime: normalizeHourTime(form.elements.arrivalTime.value),
    departureDate: vendorDateValue(form.elements.departureDate),
    departureFlight: form.elements.departureFlight.value.trim(),
    departureSector: form.elements.departureSector.value.trim(),
    departureTime: normalizeHourTime(form.elements.departureTime.value),
    hotels: collectVendorHotelRows(),
    days: $$("#vendor-day-list .vendor-day-card").map((card) => ({
      tourDayId: card.dataset.tourDayId || "",
      dayNumber: Number(card.dataset.dayNumber),
      serviceDate: vendorDateValue(card.querySelector('[data-vendor-day-field="serviceDate"]')),
      dayTitle: card.querySelector('[data-vendor-day-field="dayTitle"]').value.trim(),
      startTime: normalizeHourTime(card.querySelector('[data-vendor-day-field="startTime"]').value),
      finishTime: normalizeHourTime(card.querySelector('[data-vendor-day-field="finishTime"]').value),
      daywiseText: card.querySelector('[data-vendor-day-field="daywiseText"]').value,
      status: "DRAFT",
      splits: collectVendorSplitRows(card.querySelector("[data-vendor-split-store]")),
    })),
  };
}

function populateVendorIntake(context) {
  if (context.suggestions) {
    const incoming = context.suggestions;
    const current = state.vendorSuggestions || {};
    state.vendorSuggestions = {
      ...current,
      ...incoming,
      supplierTypes: incoming.supplierTypes?.length ? incoming.supplierTypes : current.supplierTypes || [],
      suppliers: incoming.suppliers?.length ? incoming.suppliers : current.suppliers || [],
      products: incoming.products?.length ? incoming.products : current.products || [],
      contracts: incoming.contracts?.length ? incoming.contracts : current.contracts || [],
      rates: incoming.rates?.length ? incoming.rates : current.rates || [],
      allRates: incoming.allRates?.length ? incoming.allRates : current.allRates || [],
    };
  }
  state.vendorIntake = { ...context, suggestions: state.vendorSuggestions };
  const form = $("#vendor-intake-form");
  const scalarFields = [
    "vendorDraftId", "customerCode", "customerName", "clientTag", "tourId", "sourcePublicationId",
    "sourceRecordVersion", "sourceRevisionId", "driveFileId", "driveFileName", "driveFileUrl",
    "adultPax", "childPax", "infantPax",
    "arrivalDate", "arrivalFlight", "arrivalSector", "arrivalTime",
    "departureDate", "departureFlight", "departureSector", "departureTime",
  ];
  scalarFields.forEach((field) => {
    if (form.elements[field]) {
      const value = context[field] ?? "";
      form.elements[field].value = ["arrivalDate", "departureDate"].includes(field)
        ? formatVendorDate(value) : value;
    }
  });
  refreshVendorDateDisplays(form);
  form.hidden = false;
  $("#vendor-extraction-status").textContent = context.extractionStatus || "NEEDS REVIEW";
  $("#vendor-itinerary-name").textContent = context.driveFileName || "Posted itinerary";
  $("#vendor-drive-link").href = context.driveFileUrl || "#";
  $("#vendor-itinerary-preview").innerHTML = context.documentHtml || `<div class="empty-notifications">No readable DOCX content.</div>`;
  renderVendorSuggestions(state.vendorSuggestions);
  renderVendorHotels(context.hotels || []);
  renderVendorDays((context.days || []).length
    ? context.days
    : vendorDateRange(context.arrivalDate, context.departureDate), context.hotels || []);
}

function renderVendorSuggestions(suggestions = {}) {
  const unique = (values) => [...new Set(
    values.map((value) => String(value || "").trim()).filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
  const options = (values) => unique(values)
    .map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  $("#vendor-name-options").innerHTML = (suggestions.vendorNames || [])
    .map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  $("#vendor-service-options").innerHTML = (suggestions.vendorServices || [])
    .map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  $("#toc-service-options").innerHTML = (suggestions.tocNames || [])
    .map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  $("#transport-name-options").innerHTML = options(
    (suggestions.transportRates || []).map((rate) => rate.vendorName),
  );
  $("#transport-service-options").innerHTML = options(
    (suggestions.transportRates || []).map((rate) => rate.serviceName),
  );
  $("#luggage-van-name-options").innerHTML = options(
    (suggestions.luggageVanRates || []).map((rate) => rate.vendorName),
  );
  $("#luggage-van-service-options").innerHTML = options(
    (suggestions.luggageVanRates || []).map((rate) => rate.serviceName),
  );
}

function refreshVendorServiceOptions(vendorName = "") {
  const normalizedVendor = String(vendorName || "").trim().toLowerCase();
  const rates = state.vendorSuggestions.vendorRates || [];
  const services = rates
    .filter((rate) =>
      !normalizedVendor || String(rate.vendorName || "").trim().toLowerCase() === normalizedVendor
    )
    .map((rate) => rate.serviceName);
  $("#vendor-service-options").innerHTML = [...new Set(services)]
    .sort((left, right) => left.localeCompare(right))
    .map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function refreshVendorSplitRow(row, { resetSupplier = false, resetProduct = false } = {}) {
  if (!row) return;
  const typeInput = row.querySelector('[data-vendor-split-field="serviceType"]');
  const supplierInput = row.querySelector('[data-vendor-split-field="supplierId"]');
  const supplierSearch = row.querySelector('[data-vendor-split-suggestion="supplier"]');
  const supplierList = row.querySelector("[data-vendor-supplier-list]");
  const productInput = row.querySelector('[data-vendor-split-field="productId"]');
  const productSearch = row.querySelector('[data-vendor-split-suggestion="product"]');
  const productList = row.querySelector("[data-vendor-product-list]");
  const type = normalizeVendorSplitType(typeInput?.value);
  if (!type) return;
  const provider = vendorSplitProviderConfig(type);
  row.dataset.serviceType = type;
  row.querySelector("[data-vendor-provider-label]").textContent = provider.label;
  const suppliers = (state.vendorSuggestions.suppliers || [])
    .filter((item) => item.active !== false && item.typeCode === type);
  const previousSupplierText = supplierSearch.value;
  const currentSupplierId = resetSupplier ? "" : supplierInput.value;
  const selectedSupplier = suppliers.find((item) => item.supplierId === currentSupplierId);
  supplierInput.value = selectedSupplier?.supplierId || "";
  supplierSearch.value = resetSupplier
    ? "" : selectedSupplier?.supplierName || previousSupplierText;
  supplierList.innerHTML = suppliers.map((item) =>
    `<option value="${escapeHtml(item.supplierName)}" label="${escapeHtml(item.supplierCode || item.typeCode || "")}"></option>`
  ).join("");
  const products = (state.vendorSuggestions.products || [])
    .filter((item) => item.active !== false && item.supplierId === supplierInput.value);
  const previousProductText = productSearch.value;
  const currentProductId = resetSupplier || resetProduct ? "" : productInput.value;
  const selectedProduct = products.find((item) => item.productId === currentProductId);
  productInput.value = selectedProduct?.productId || "";
  productSearch.value = resetSupplier || resetProduct
    ? "" : selectedProduct?.productName || previousProductText;
  productSearch.disabled = !supplierInput.value;
  const serviceDate = $("#vendor-split-dialog")?.dataset.serviceDate || "";
  productList.innerHTML = products.map((item) =>
    `<option value="${escapeHtml(item.productName)}" label="${escapeHtml(
      vendorSplitProductPriceLabel(item, type, supplierInput.value, serviceDate)
    )}"></option>`
  ).join("");
  const existingUnit = row.querySelector('[data-vendor-split-field="unitRateIdr"]')?.value ?? "";
  const existingAdult = row.querySelector('[data-vendor-split-field="adultRateIdr"]')?.value ?? "";
  const existingChild = row.querySelector('[data-vendor-split-field="childRateIdr"]')?.value ?? "";
  const existingInfant = row.querySelector('[data-vendor-split-field="infantRateIdr"]')?.value ?? "";
  const existingBasis = row.querySelector('[data-vendor-split-field="priceBasis"]')?.value || "PER_SERVICE";
  const existingQuantity = row.querySelector('[data-vendor-split-field="quantity"]')?.value || 1;
  const existingReason = row.querySelector('[data-vendor-split-field="manualPriceReason"]')?.value || "";
  const existingSource = row.querySelector('[data-vendor-split-field="manualRateSource"]')?.value || "";
  const existingEvidence = row.querySelector('[data-vendor-split-field="manualEvidenceRef"]')?.value || "";
  row.querySelector("[data-vendor-split-rate-panel]").innerHTML = vendorSplitRateMarkup({
    serviceType: type,
    supplierId: supplierInput.value,
    productId: productInput.value,
    priceSource: "MANUAL",
    adultRateIdr: existingAdult,
    childRateIdr: existingChild,
    infantRateIdr: existingInfant,
    unitRateIdr: existingUnit,
    priceBasis: existingBasis,
    quantity: existingQuantity,
    manualPriceReason: existingReason,
    manualRateSource: existingSource,
    manualEvidenceRef: existingEvidence,
  });
}

function resolveVendorSplitSuggestion(input) {
  const row = input.closest(".vendor-split-row");
  if (!row) return;
  const kind = input.dataset.vendorSplitSuggestion;
  const normalized = input.value.trim().toLocaleLowerCase();
  if (kind === "supplier") {
    const type = normalizeVendorSplitType(
      row.querySelector('[data-vendor-split-field="serviceType"]').value,
    );
    const supplier = (state.vendorSuggestions.suppliers || []).find((item) =>
      item.active !== false
      && item.typeCode === type
      && [item.supplierName, item.supplierCode].some((value) =>
        String(value || "").trim().toLocaleLowerCase() === normalized
      )
    );
    const supplierId = row.querySelector('[data-vendor-split-field="supplierId"]');
    const changed = supplierId.value !== (supplier?.supplierId || "");
    supplierId.value = supplier?.supplierId || "";
    if (supplier) input.value = supplier.supplierName;
    refreshVendorSplitRow(row, { resetProduct: changed });
    return;
  }
  if (kind === "product") {
    const supplierId = row.querySelector('[data-vendor-split-field="supplierId"]').value;
    const product = (state.vendorSuggestions.products || []).find((item) =>
      item.active !== false
      && item.supplierId === supplierId
      && [item.productName, item.productCode].some((value) =>
        String(value || "").trim().toLocaleLowerCase() === normalized
      )
    );
    row.querySelector('[data-vendor-split-field="productId"]').value = product?.productId || "";
    if (product) input.value = product.productName;
    refreshVendorSplitRow(row);
  }
}

function normalizeVendorSplitType(value) {
  const normalized = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "VEHICLE") return "TRANSPORT";
  return normalized === "ADDITIONAL_SERVICES" ? "ADDITIONAL_SERVICE" : normalized;
}

function vendorSplitTypeLabel(value) {
  const normalized = normalizeVendorSplitType(value);
  return (state.vendorSuggestions.supplierTypes || [])
    .find((row) => row.typeCode === normalized)?.typeName
    || normalized.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    || "Vendor";
}

function setVendorIntakeMode(mode = "NEW") {
  state.vendorIntakeMode = mode === "REVISE" ? "REVISE" : "NEW";
  $("#vendor-intake-mode-title").textContent = state.vendorIntakeMode === "REVISE"
    ? "Revise Itinerary"
    : "New Itinerary";
  $("#vendor-intake-mode-description").textContent = state.vendorIntakeMode === "REVISE"
    ? "Load the saved itinerary, edit affected days or Micro Split items, then save before generating supplier amendments."
    : "Review extraction, complete Day Wise, and split services before entering Generate Booking.";
  $("#save-vendor-draft").textContent = state.vendorIntakeMode === "REVISE"
    ? "Save revised local draft"
    : "Save local draft";
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
      : await window.erim.vendor.saveIntakeDraft({
        ...payload,
        processSource: "SAVE_LOCAL_DRAFT",
      });
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
    setVendorIntakeMode("REVISE");
    showView("vendor-new-itinerary", "VENDOR");
    $("#vendor-customer-code").value = code;
    return loadVendorItinerary(code);
  }
}

function bindEvents() {
  $("#sidebar-toggle").addEventListener("click", () => {
    state.navigation.sidebarHidden = !state.navigation.sidebarHidden;
    applyNavigationPreferences();
    saveNavigationPreferences();
  });
  $("#main-nav").addEventListener("click", (event) => {
    const collapseControl = event.target.closest("[data-menu-toggle]");
    if (collapseControl) {
      toggleMenuGroup(collapseControl.dataset.menuToggle);
      return;
    }
    const parent = event.target.closest(".nav-parent");
    if (parent) {
      const module = parent.dataset.module;
      if (module === "TRANSPORT") {
        renderTransportOperation(state.transportAction);
      }
      showView(parent.dataset.view, module);
      return;
    }
    const managerAction = event.target.closest("[data-manager-action]");
    if (managerAction?.dataset.managerAction === "supplier-master") {
      showView("supplier-master", "MANAGER_ADMIN");
      if (!state.supplierMasterLoaded) loadSupplierMaster({ refresh: true });
      return;
    }
    if (managerAction?.dataset.managerAction === "supplier-excel") {
      showView("supplier-excel", "MANAGER_ADMIN");
      loadSupplierExcel().catch((error) => toast(error.message, true));
      return;
    }
    const transportAction = event.target.closest("[data-transport-action]");
    if (transportAction) {
      state.transportAction = transportAction.dataset.transportAction;
      renderTransportOperation(state.transportAction);
      showView("transport-operation", "TRANSPORT");
      return;
    }
    const vendorAction = event.target.closest("[data-vendor-action]");
    if (vendorAction) {
      const views = {
        "itinerary-check": "vendor-itinerary-check",
        inbox: "vendor-inbox", generate: "vendor-generate", new: "vendor-new-itinerary",
        revise: "vendor-revise-itinerary", cancel: "vendor-cancel", kpi: "vendor-kpi",
      };
      showView(views[vendorAction.dataset.vendorAction], "VENDOR");
      if (vendorAction.dataset.vendorAction === "new") {
        setVendorIntakeMode("NEW");
        $("#vendor-customer-code").focus();
      }
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
  $("#close-vendor-split-dialog").addEventListener("click", () => $("#vendor-split-dialog").close());
  $("#cancel-vendor-split-dialog").addEventListener("click", () => $("#vendor-split-dialog").close());
  $("#apply-vendor-split").addEventListener("click", applyVendorSplitDialog);
  $("#vendor-split-dialog-add").addEventListener("click", () => {
    const list = $("#vendor-split-dialog-list");
    list.insertAdjacentHTML("afterbegin", vendorSplitRow({}, 0));
    [...list.querySelectorAll(".vendor-split-row")].forEach((row, index) => {
      const remove = row.querySelector("[data-remove-vendor-split]");
      if (remove) remove.dataset.removeVendorSplit = String(index);
    });
    list.querySelector(".vendor-split-row [data-vendor-split-suggestion='supplier']")?.focus();
  });
  $("#refresh-supplier-master").addEventListener("click", () => loadSupplierMaster({ refresh: true }));
  $("#close-supplier-archive-dialog").addEventListener("click", () => {
    state.supplierArchiveTarget = null;
    $("#supplier-archive-dialog").close();
  });
  $("#cancel-supplier-archive-dialog").addEventListener("click", () => {
    state.supplierArchiveTarget = null;
    $("#supplier-archive-dialog").close();
  });
  $("#supplier-archive-form").addEventListener("submit", submitSupplierArchive);
  $("#supplier-excel-template").addEventListener("click", async () => {
    try {
      const result = await window.erim.supplierExcel.downloadTemplate({
        typeCode: state.supplierExcel.typeCode,
      });
      if (!result.canceled) toast(`Template saved to ${result.filePath}`);
    } catch (error) {
      toast(error.message, true);
    }
  });
  $("#supplier-excel-open-pending").addEventListener("click", async () => {
    showView("supplier-master", "MANAGER_ADMIN");
    renderSupplierDraftStatus();
    await loadLatestSupplierPublishSession();
    $("#supplier-draft-dialog").showModal();
  });
  $("#supplier-excel-type-tabs").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-supplier-excel-type]");
    if (!button) return;
    state.supplierExcel.typeCode = button.dataset.supplierExcelType;
    state.supplierExcel.selectedSupplierIds.clear();
    state.supplierExcel.batch = null;
    renderSupplierExcelTypes();
    renderSupplierExcelBatch(null);
    try {
      await loadSupplierExcelSuggestions();
      renderSupplierExcelSelection();
    } catch (error) {
      toast(error.message, true);
    }
  });
  $("#supplier-excel-select-file").addEventListener("click", async () => {
    const button = $("#supplier-excel-select-file");
    button.disabled = true;
    $("#supplier-excel-import-status").textContent = "VALIDATING";
    try {
      const result = await window.erim.supplierExcel.analyzeImport({
        typeCode: state.supplierExcel.typeCode,
      });
      if (!result.canceled) {
        renderSupplierExcelBatch(result.batch);
        state.supplierExcel.batches = await window.erim.supplierExcel.listBatches();
        renderSupplierExcelBatches();
        toast("Workbook validated. Review the ready rows and issues before saving locally.");
      } else renderSupplierExcelBatch(state.supplierExcel.batch);
    } catch (error) {
      $("#supplier-excel-import-status").textContent = "FORMAT ERROR";
      $("#supplier-excel-import-status").className = "status failed";
      $("#supplier-excel-file-result").textContent = error.message;
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  $("#supplier-excel-stage").addEventListener("click", async () => {
    const batch = state.supplierExcel.batch;
    if (!batch) return;
    const button = $("#supplier-excel-stage");
    button.disabled = true;
    button.textContent = "Saving locally...";
    try {
      const result = await window.erim.supplierExcel.stageImport(batch.batchId);
      applySupplierLocalResult(result);
      renderSupplierMaster();
      renderSupplierExcelBatch(result.batch);
      state.supplierExcel.batches = await window.erim.supplierExcel.listBatches();
      renderSupplierExcelBatches();
      renderSupplierExcelSelection();
      toast(`${result.batch.summary.staged || 0} Pending item(s) saved locally.`);
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.textContent = "Save valid data locally";
      button.disabled = state.supplierExcel.batch?.status === "LOCAL_PENDING";
    }
  });
  $("#supplier-excel-export-conflicts").addEventListener("click", async () => {
    try {
      const result = await window.erim.supplierExcel.exportConflicts(state.supplierExcel.batch?.batchId);
      if (!result.canceled) toast(`${result.issues} issue(s) exported to ${result.filePath}`);
    } catch (error) {
      toast(error.message, true);
    }
  });
  $("#supplier-excel-preview-rows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-supplier-excel-open-record]");
    if (button) openSupplierExcelExistingRecord(button.dataset.supplierExcelOpenRecord);
  });
  $("#supplier-excel-batch-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-supplier-excel-batch]");
    if (!button) return;
    const batch = state.supplierExcel.batches.find((row) =>
      row.batchId === button.dataset.supplierExcelBatch);
    if (batch) {
      state.supplierExcel.typeCode = batch.typeCode;
      renderSupplierExcelTypes();
      renderSupplierExcelBatch(batch);
    }
  });
  [
    "#supplier-excel-search", "#supplier-excel-location", "#supplier-excel-product",
    "#supplier-excel-supplier-status", "#supplier-excel-contract-status",
    "#supplier-excel-rate-state", "#supplier-excel-channel",
    "#supplier-excel-valid-from", "#supplier-excel-valid-to",
  ].forEach((selector) => {
    $(selector).addEventListener("input", renderSupplierExcelSelection);
    $(selector).addEventListener("change", renderSupplierExcelSelection);
  });
  $("#supplier-excel-select-all").addEventListener("change", (event) => {
    filteredSupplierExcelSuppliers().forEach((supplier) => {
      if (event.target.checked) state.supplierExcel.selectedSupplierIds.add(supplier.supplierId);
      else state.supplierExcel.selectedSupplierIds.delete(supplier.supplierId);
    });
    renderSupplierExcelSelection();
  });
  $("#supplier-excel-supplier-list").addEventListener("change", (event) => {
    const input = event.target.closest("[data-supplier-excel-supplier]");
    if (!input) return;
    if (input.checked) state.supplierExcel.selectedSupplierIds.add(input.dataset.supplierExcelSupplier);
    else state.supplierExcel.selectedSupplierIds.delete(input.dataset.supplierExcelSupplier);
    renderSupplierExcelSelection();
  });
  $("#supplier-excel-clear-filters").addEventListener("click", () => {
    [
      "#supplier-excel-search", "#supplier-excel-location", "#supplier-excel-product",
      "#supplier-excel-supplier-status", "#supplier-excel-contract-status",
      "#supplier-excel-rate-state", "#supplier-excel-channel",
      "#supplier-excel-valid-from", "#supplier-excel-valid-to",
    ].forEach((selector) => { $(selector).value = ""; });
    renderSupplierExcelSelection();
  });
  $("#supplier-excel-export").addEventListener("click", async () => {
    const button = $("#supplier-excel-export");
    button.disabled = true;
    button.textContent = "Exporting...";
    try {
      const result = await window.erim.supplierExcel.exportCatalog({
        ...supplierExcelFilters(),
        supplierIds: [...state.supplierExcel.selectedSupplierIds],
      });
      if (!result.canceled) toast(`${result.counts.suppliers} supplier(s) exported to ${result.filePath}`);
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.textContent = "Export selected";
      button.disabled = !state.supplierExcel.selectedSupplierIds.size;
    }
  });
  $("#review-supplier-drafts").addEventListener("click", async () => {
    state.supplierRateApprovals =
      (await window.erim.supplierMaster.listRateApprovals()).approvals || [];
    renderSupplierDraftStatus();
    await loadLatestSupplierPublishSession();
    $("#supplier-draft-dialog").showModal();
  });
  $("#publish-supplier-drafts").addEventListener("click", () => publishSupplierDrafts());
  $("#close-supplier-draft-dialog").addEventListener("click", () => $("#supplier-draft-dialog").close());
  $("#cancel-supplier-draft-dialog").addEventListener("click", () => $("#supplier-draft-dialog").close());
  $("#select-all-supplier-drafts").addEventListener("change", (event) => {
    $$("[data-supplier-draft-select]:not(:disabled)").forEach((node) => { node.checked = event.target.checked; });
  });
  $("#supplier-draft-list").addEventListener("click", (event) => {
    const request = event.target.closest("[data-request-rate-approval]");
    if (request) return requestSupplierRateApproval(request.dataset.requestRateApproval);
    const review = event.target.closest("[data-review-rate-approval]");
    if (review) {
      return reviewSupplierRateApproval(
        review.dataset.reviewRateApproval,
        review.dataset.rateDecision,
      );
    }
  });
  $("#close-supplier-rate-approval").addEventListener("click", () =>
    $("#supplier-rate-approval-dialog").close());
  $("#cancel-supplier-rate-approval").addEventListener("click", () =>
    $("#supplier-rate-approval-dialog").close());
  $("#supplier-rate-approval-form").addEventListener("submit", submitSupplierRateApproval);
  $("#publish-selected-supplier-drafts").addEventListener("click", () => {
    const draftIds = $$("[data-supplier-draft-select]:checked").map((node) => node.value);
    if (!draftIds.length) return toast("Choose at least one pending change.", true);
    publishSupplierDrafts(draftIds);
  });
  $("#resume-supplier-publish-session").addEventListener("click", () => {
    const sessionId = state.supplierPublishSession?.sessionId;
    if (!sessionId) return;
    publishSupplierDrafts([], sessionId);
  });
  $("#open-supplier-maintenance").addEventListener("click", () => {
    $("#supplier-maintenance-confirmation").value = "";
    $("#initialize-supplier-master").disabled = true;
    $("#supplier-maintenance-dialog").showModal();
  });
  $("#close-supplier-maintenance").addEventListener("click", () => $("#supplier-maintenance-dialog").close());
  $("#cancel-supplier-maintenance").addEventListener("click", () => $("#supplier-maintenance-dialog").close());
  $("#supplier-maintenance-confirmation").addEventListener("input", (event) => {
    $("#initialize-supplier-master").disabled = event.target.value.trim() !== "INITIALIZE";
  });
  $("#initialize-supplier-master").addEventListener("click", async () => {
    $("#supplier-maintenance-dialog").close();
    await loadSupplierMaster({ initialize: true });
  });
  $("#add-supplier-type").addEventListener("click", () => {
    $("#supplier-type-form").reset();
    $("#supplier-type-dialog").showModal();
  });
  $("#close-supplier-type-dialog").addEventListener("click", () => $("#supplier-type-dialog").close());
  $("#cancel-supplier-type-dialog").addEventListener("click", () => $("#supplier-type-dialog").close());
  $("#supplier-type-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    payload.allowedPriceBases = String(payload.allowedPriceBases || "").split(",").map((x) => x.trim()).filter(Boolean);
    payload.defaultBookingChannels = String(payload.defaultBookingChannels || "").split(",").map((x) => x.trim()).filter(Boolean);
    try {
      applySupplierLocalResult(await window.erim.supplierMaster.saveType(payload));
      state.selectedSupplierTypeCode = String(payload.typeCode).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
      state.selectedSupplierId = "";
      $("#supplier-type-dialog").close();
      renderSupplierMaster();
      toast(`${payload.typeName} Type saved locally and available without a backend syntax change.`);
    } catch (error) { toast(error.message, true); }
  });
  $("#supplier-master-search").addEventListener("input", renderSupplierList);
  $("#add-supplier").addEventListener("click", () => {
    state.selectedSupplierId = "";
    renderSupplierMaster();
    $("#supplier-master-form").elements.supplierName.focus();
  });
  $("#add-supplier-contact").addEventListener("click", () =>
    $("#supplier-contact-list").insertAdjacentHTML("beforeend", supplierContactMarkup({})));
  $("#add-supplier-recipient").addEventListener("click", () =>
    $("#supplier-recipient-list").insertAdjacentHTML("beforeend", supplierRecipientMarkup({})));
  $("#supplier-master-form").addEventListener("submit", saveSupplierMasterForm);
  $("#archive-supplier").addEventListener("click", () => {
    const supplier = state.supplierMaster.suppliers.find((row) => row.supplierId === state.selectedSupplierId);
    if (supplier) archiveSelectedSupplierEntity("SUPPLIER", supplier.supplierId, supplier.supplierName);
  });
  $("#add-supplier-product").addEventListener("click", () => openSupplierProductDialog());
  $("#supplier-product-form").addEventListener("submit", saveSupplierProductForm);
  $("#close-supplier-product-dialog").addEventListener("click", () => $("#supplier-product-dialog").close());
  $("#cancel-supplier-product-dialog").addEventListener("click", () => $("#supplier-product-dialog").close());
  $("#supplier-product-duplicate-form").addEventListener("submit", duplicateSupplierProduct);
  $("#close-supplier-product-duplicate-dialog").addEventListener("click", () =>
    $("#supplier-product-duplicate-dialog").close());
  $("#cancel-supplier-product-duplicate-dialog").addEventListener("click", () =>
    $("#supplier-product-duplicate-dialog").close());
  $("#supplier-copy-select-all").addEventListener("change", (event) => {
    $$('#supplier-copy-target-list [name="targetSupplierIds"]').forEach((node) => {
      node.checked = event.target.checked;
    });
    renderSupplierCopyMatrix();
  });
  $("#supplier-copy-target-list").addEventListener("change", (event) => {
    if (!event.target.matches('[name="targetSupplierIds"]')) return;
    const targets = $$('#supplier-copy-target-list [name="targetSupplierIds"]');
    $("#supplier-copy-select-all").checked = Boolean(targets.length)
      && targets.every((node) => node.checked);
    renderSupplierCopyMatrix();
  });
  $("#supplier-product-duplicate-form").elements.includeContracts.addEventListener("change", (event) => {
    const rates = $("#supplier-product-duplicate-form").elements.includeRates;
    rates.disabled = !event.target.checked;
    if (!event.target.checked) rates.checked = false;
  });
  $("#archive-supplier-product").addEventListener("click", () => {
    const id = $("#supplier-product-form").elements.productId.value;
    const product = state.supplierMaster.products.find((row) => row.productId === id);
    if (product) archiveSelectedSupplierEntity("PRODUCT", id, product.productName);
  });
  $("#add-supplier-contract").addEventListener("click", () => openSupplierContractDialog());
  $("#supplier-contract-form").addEventListener("submit", saveSupplierContractForm);
  $("#close-supplier-contract-dialog").addEventListener("click", () => $("#supplier-contract-dialog").close());
  $("#cancel-supplier-contract-dialog").addEventListener("click", () => $("#supplier-contract-dialog").close());
  $("#add-contract-rate").addEventListener("click", () => {
    const list = $("#supplier-contract-rate-list");
    list.insertAdjacentHTML("afterbegin", contractRateMarkup({}));
    list.querySelector("[data-contract-rate='productId']")?.focus();
  });
  $("#upload-supplier-contract").addEventListener("click", uploadSupplierContract);
  $("#archive-supplier-contract").addEventListener("click", () => {
    const id = $("#supplier-contract-form").elements.contractId.value;
    const contract = state.supplierMaster.contracts.find((row) => row.contractId === id);
    if (contract) archiveSelectedSupplierEntity("CONTRACT", id, contract.contractNumber);
  });
  $("#supplier-master-view").addEventListener("click", (event) => {
    const type = event.target.closest("[data-supplier-type-code]");
    if (type) {
      state.selectedSupplierTypeCode = type.dataset.supplierTypeCode;
      state.selectedSupplierId = "";
      return renderSupplierMaster();
    }
    const supplier = event.target.closest("[data-supplier-id]");
    if (supplier) {
      state.selectedSupplierId = supplier.dataset.supplierId;
      return renderSupplierMaster();
    }
    const selectAllProducts = event.target.closest("[data-select-all-supplier-products]");
    if (selectAllProducts) {
      $$("#supplier-product-contract-list [data-select-supplier-product]").forEach((node) =>
        state.selectedSupplierProductIds.add(node.dataset.selectSupplierProduct));
      return renderSupplierProductsAndContracts();
    }
    const clearProducts = event.target.closest("[data-clear-supplier-products]");
    if (clearProducts) {
      state.selectedSupplierProductIds.clear();
      return renderSupplierProductsAndContracts();
    }
    const duplicateSelected = event.target.closest("[data-duplicate-selected-products]");
    if (duplicateSelected) {
      return openSupplierProductDuplicateDialog([...state.selectedSupplierProductIds]);
    }
    const removeContact = event.target.closest("[data-remove-supplier-contact]");
    if (removeContact) return removeContact.closest(".supplier-repeatable-row").remove();
    const removeRecipient = event.target.closest("[data-remove-supplier-recipient]");
    if (removeRecipient) return removeRecipient.closest(".supplier-repeatable-row").remove();
    const editProduct = event.target.closest("[data-edit-supplier-product]");
    if (editProduct) return openSupplierProductDialog(editProduct.dataset.editSupplierProduct);
    const duplicateProduct = event.target.closest("[data-duplicate-supplier-product]");
    if (duplicateProduct) {
      return openSupplierProductDuplicateDialog(duplicateProduct.dataset.duplicateSupplierProduct);
    }
    const editContract = event.target.closest("[data-edit-supplier-contract]");
    if (editContract) return openSupplierContractDialog(editContract.dataset.editSupplierContract);
  });
  $("#supplier-master-view").addEventListener("focusout", (event) => {
    const contactPhone = event.target.closest(
      '[data-supplier-contact="phone"], [data-supplier-contact="whatsapp"]',
    );
    const recipientAddress = event.target.closest('[data-supplier-recipient="address"]');
    if (contactPhone) contactPhone.value = normalizeInternationalPhone(contactPhone.value);
    if (recipientAddress) {
      const row = recipientAddress.closest(".supplier-repeatable-row");
      const channel = row.querySelector('[data-supplier-recipient="channel"]')?.value;
      const type = row.querySelector('[data-supplier-recipient="recipientType"]')?.value;
      if (channel === "WHATSAPP" || type === "WHATSAPP") {
        recipientAddress.value = normalizeInternationalPhone(recipientAddress.value);
      }
    }
  });
  $("#supplier-master-view").addEventListener("change", (event) => {
    const selectedProduct = event.target.closest("[data-select-supplier-product]");
    if (selectedProduct) {
      if (selectedProduct.checked) {
        state.selectedSupplierProductIds.add(selectedProduct.dataset.selectSupplierProduct);
      } else {
        state.selectedSupplierProductIds.delete(selectedProduct.dataset.selectSupplierProduct);
      }
      return renderSupplierProductsAndContracts();
    }
    if (!event.target.matches(
      '[data-supplier-recipient="channel"], [data-supplier-recipient="recipientType"]',
    )) return;
    const row = event.target.closest(".supplier-repeatable-row");
    const address = row.querySelector('[data-supplier-recipient="address"]');
    const channel = row.querySelector('[data-supplier-recipient="channel"]').value;
    const type = row.querySelector('[data-supplier-recipient="recipientType"]').value;
    const isWhatsApp = channel === "WHATSAPP" || type === "WHATSAPP";
    address.inputMode = isWhatsApp ? "tel" : "text";
    address.placeholder = isWhatsApp
      ? "+62 812-3916-9392" : "Email address, portal account, or number";
    if (isWhatsApp) address.value = normalizeInternationalPhone(address.value);
  });
  $("#supplier-contract-rate-list").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-contract-rate]");
    if (remove) remove.closest(".supplier-contract-rate-row").remove();
  });
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
  $("#vendor-booking-search").addEventListener("input", renderVendorBookingQueue);
  $("#vendor-booking-queue-list").addEventListener("click", (event) => {
    if (event.target.matches("input[type='checkbox']")) {
      event.stopPropagation();
      return;
    }
    const resume = event.target.closest("[data-resume-vendor-draft]");
    if (resume) return resumeVendorGeneratedDrafts(resume.dataset.resumeVendorDraft);
    const open = event.target.closest("[data-vendor-tree-open-package]");
    if (open) {
      return openVendorBookingPackage(open.dataset.vendorTreeOpenPackage, {
        serviceIds: [open.dataset.vendorTreeOpenService],
      });
    }
  });
  $("#vendor-booking-queue-list").addEventListener("change", (event) => {
    const service = event.target.closest("[data-vendor-tree-service-select]");
    if (service) {
      if (service.checked) state.selectedVendorServiceIds.add(service.dataset.vendorTreeServiceSelect);
      else state.selectedVendorServiceIds.delete(service.dataset.vendorTreeServiceSelect);
      return renderVendorBookingQueue();
    }
    const parent = event.target.closest(
      "[data-vendor-tree-client-select], [data-vendor-tree-day-select]",
    );
    if (!parent) return;
    parent.closest("details").querySelectorAll(
      "[data-vendor-tree-service-select]:not(:disabled)",
    ).forEach((node) => {
      if (parent.checked) state.selectedVendorServiceIds.add(node.dataset.vendorTreeServiceSelect);
      else state.selectedVendorServiceIds.delete(node.dataset.vendorTreeServiceSelect);
    });
    renderVendorBookingQueue();
  });
  $("#vendor-booking-queue-list").addEventListener("toggle", (event) => {
    const client = event.target.closest("[data-vendor-tree-client]");
    const day = event.target.closest("[data-vendor-tree-day]");
    if (day) {
      if (day.open) state.vendorExpandedDays.add(day.dataset.vendorTreeDay);
      else state.vendorExpandedDays.delete(day.dataset.vendorTreeDay);
    } else if (client) {
      if (client.open) state.vendorExpandedClients.add(client.dataset.vendorTreeClient);
      else state.vendorExpandedClients.delete(client.dataset.vendorTreeClient);
    }
  }, true);
  $("#vendor-tree-select-all").addEventListener("change", (event) => {
    $$("#vendor-booking-queue-list [data-vendor-tree-service-select]:not(:disabled)")
      .forEach((node) => {
        if (event.target.checked) state.selectedVendorServiceIds.add(node.dataset.vendorTreeServiceSelect);
        else state.selectedVendorServiceIds.delete(node.dataset.vendorTreeServiceSelect);
      });
    renderVendorBookingQueue();
  });
  $("#vendor-tree-clear").addEventListener("click", () => {
    state.selectedVendorServiceIds.clear();
    renderVendorBookingQueue();
  });
  $("#vendor-tree-resume").addEventListener("click", () => resumeVendorGeneratedDrafts());
  $("#vendor-tree-prepare").addEventListener("click", prepareSelectedVendorServices);
  $("#close-vendor-communication").addEventListener("click", async () => {
    if (!await confirmVendorCommunicationNavigation()) return;
    $("#vendor-communication-dialog").close();
    renderVendorPreparationDetails();
  });
  $("#vendor-communication-dialog").addEventListener("cancel", async (event) => {
    event.preventDefault();
    if (!await confirmVendorCommunicationNavigation()) return;
    $("#vendor-communication-dialog").close();
    renderVendorPreparationDetails();
  });
  $("#close-vendor-resend").addEventListener("click", () => $("#vendor-resend-dialog").close());
  $("#cancel-vendor-resend").addEventListener("click", () => $("#vendor-resend-dialog").close());
  $("#vendor-resend-form").addEventListener("submit", submitVendorResend);
  $("#vendor-communication-previous").addEventListener("click", () =>
    navigateVendorCommunication("PREVIOUS"));
  $("#vendor-communication-next").addEventListener("click", () =>
    navigateVendorCommunication("NEXT"));
  $("#vendor-communication-queue-list").addEventListener("click", (event) => {
    const item = event.target.closest("[data-vendor-communication-index]");
    if (item) openVendorCommunicationFromQueue(Number(item.dataset.vendorCommunicationIndex));
  });
  $("#vendor-communication-back-list").addEventListener("click", async () => {
    if (await confirmVendorCommunicationNavigation()) showVendorCommunicationBatchList();
  });
  $("#vendor-booking-service-summary").addEventListener("click", (event) => {
    const cancel = event.target.closest("[data-cancel-generated-service]");
    if (!cancel) return;
    return cancelVendorGeneratedService(
      cancel.dataset.cancelGeneratedBooking,
      cancel.dataset.cancelGeneratedService,
    );
  });
  $("#vendor-communication-batch-grid").addEventListener("click", (event) => {
    const review = event.target.closest("[data-vendor-batch-review]");
    if (review) {
      event.preventDefault();
      return openVendorCommunicationPackage(Number(review.dataset.vendorBatchReview));
    }
    const cancel = event.target.closest("[data-cancel-generated-service]");
    if (cancel) {
      event.preventDefault();
      return cancelVendorGeneratedService(
        cancel.dataset.cancelGeneratedBooking,
        cancel.dataset.cancelGeneratedService,
      );
    }
  });
  $("#vendor-prep-supplier-detail").addEventListener("change", (event) => {
    const channel = event.target.closest("[data-vendor-prep-channel]");
    if (!channel) return;
    state.vendorPackageChannels.set(state.selectedVendorPackageKey, channel.dataset.vendorPrepChannel);
    if (channel.dataset.vendorChannelConfigured !== "true"
      && channel.dataset.vendorPrepChannel !== "OTHERS") {
      const form = $("#vendor-channel-form");
      form.elements.supplierId.value = state.vendorBookingPreview?.supplierId || "";
      form.elements.channel.value = channel.dataset.vendorPrepChannel;
      form.elements.destination.value = "";
      $("#vendor-channel-notice").textContent =
        `${channel.dataset.vendorPrepChannel} is selectable, but its destination is incomplete. Save creates a local Supplier Master draft queued for approved online sync.`;
      $("#vendor-channel-destination-help").textContent =
        channel.dataset.vendorPrepChannel === "EMAIL" ? "Supplier booking email (TO)"
          : channel.dataset.vendorPrepChannel === "WHATSAPP" ? "Supplier WhatsApp number"
            : "Portal HTTPS address";
      form.elements.destination.placeholder =
        channel.dataset.vendorPrepChannel === "EMAIL" ? "booking@supplier.com"
          : channel.dataset.vendorPrepChannel === "WHATSAPP" ? "+62..."
            : "https://portal.supplier.com";
      $("#vendor-channel-dialog").showModal();
      return;
    }
    openVendorBookingPackage(state.selectedVendorPackageKey, {
      serviceIds: [state.selectedVendorInspectionServiceId],
      channel: channel.dataset.vendorPrepChannel,
    });
  });
  $("#close-vendor-channel").addEventListener("click", () => $("#vendor-channel-dialog").close());
  $("#cancel-vendor-channel").addEventListener("click", () => $("#vendor-channel-dialog").close());
  $("#vendor-channel-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await window.erim.vendor.saveChannelCompletion({
        supplierId: form.elements.supplierId.value,
        channel: form.elements.channel.value,
        destination: form.elements.destination.value.trim(),
      });
      $("#vendor-channel-dialog").close();
      await openVendorBookingPackage(state.selectedVendorPackageKey, {
        serviceIds: [state.selectedVendorInspectionServiceId],
        channel: form.elements.channel.value,
      });
      toast("Channel saved locally and queued for Supplier Master online approval.");
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  $("#close-vendor-generated-cancel").addEventListener("click", () => {
    state.vendorGeneratedCancelTarget = null;
    $("#vendor-generated-cancel-dialog").close();
  });
  $("#cancel-vendor-generated-cancel").addEventListener("click", () => {
    state.vendorGeneratedCancelTarget = null;
    $("#vendor-generated-cancel-dialog").close();
  });
  $("#vendor-generated-cancel-form").addEventListener("submit", submitVendorGeneratedServiceCancel);
  $("#vendor-register-search").addEventListener("input", renderVendorInbox);
  $("#vendor-register-state").addEventListener("change", renderVendorInbox);
  $("#vendor-register-channel").addEventListener("change", renderVendorInbox);
  $("#vendor-register-sort").addEventListener("change", renderVendorInbox);
  $("#vendor-delivery-report-search").addEventListener("input", renderVendorInbox);
  $("#vendor-delivery-report-status").addEventListener("change", renderVendorInbox);
  $("#vendor-delivery-report-channel").addEventListener("change", renderVendorInbox);
  $("#vendor-delivery-report-supplier").addEventListener("input", renderVendorInbox);
  $("#vendor-delivery-report-service-date").addEventListener("change", renderVendorInbox);
  $("#vendor-delivery-report-sent-date").addEventListener("change", renderVendorInbox);
  $("#vendor-delivery-report-evidence").addEventListener("change", renderVendorInbox);
  $("#vendor-delivery-report-sort").addEventListener("change", renderVendorInbox);
  $("#load-vendor-itinerary-check").addEventListener("click", () => loadVendorItineraryCheck());
  $("#vendor-itinerary-check-code").addEventListener("change", () => loadVendorItineraryCheck());
  $("#vendor-booking-action").addEventListener("change", () =>
    openVendorBookingPackage(state.selectedVendorPackageKey, {
      actionType: $("#vendor-booking-action").value,
      channel: $("#vendor-booking-channel").value,
    }));
  $("#vendor-booking-channel").addEventListener("change", () =>
    openVendorBookingPackage(state.selectedVendorPackageKey, {
      actionType: $("#vendor-booking-action").value,
      channel: $("#vendor-booking-channel").value,
    }));
  $("#vendor-booking-subject").addEventListener("input", (event) => {
    if ($("#vendor-final-message-subject")) {
      $("#vendor-final-message-subject").textContent = event.target.value;
    }
  });
  $("#vendor-booking-body").addEventListener("input", (event) => {
    if ($("#vendor-final-message-body")) {
      $("#vendor-final-message-body").textContent = event.target.value;
    }
  });
  $("#generate-vendor-booking").addEventListener("click", generateVendorBooking);
  $("#send-vendor-booking-email").addEventListener("click", sendVendorBookingEmail);
  $("#record-vendor-booking-sent").addEventListener("click", recordVendorBookingSent);
  $("#prepare-vendor-cancel").addEventListener("click", prepareVendorCancelAll);
  $("#open-vendor-revise-workspace").addEventListener("click", () => {
    setVendorIntakeMode("REVISE");
    showView("vendor-new-itinerary", "VENDOR");
    $("#vendor-customer-code").focus();
  });
  $("#add-vendor-hotel").addEventListener("click", () => {
    const payload = collectVendorIntake();
    payload.hotels.push({ hotelStayId: "", hotelName: "", checkInDate: "", checkOutDate: "" });
    state.vendorIntake = payload;
    renderVendorHotels(payload.hotels);
    updateVendorDayHotels();
  });
  $("#rebuild-vendor-days").addEventListener("click", async () => {
    const button = $("#rebuild-vendor-days");
    button.disabled = true;
    try {
      const payload = collectVendorIntake();
      const source = await window.erim.vendor.getIntakeContext(payload.customerCode);
      const programByDay = new Map((source.sourceProgramDays || [])
        .map((day) => [Number(day.dayNumber), day]));
      payload.days = vendorDateRange(payload.arrivalDate, payload.departureDate, payload.days)
        .map((day) => {
          const program = programByDay.get(Number(day.dayNumber)) || {};
          return {
            ...day,
            dayTitle: day.dayTitle || program.dayTitle || "",
            daywiseText: day.daywiseText || program.dayTitle || "",
          };
        });
      state.vendorIntake = { ...payload, sourceProgramDays: source.sourceProgramDays || [] };
      renderVendorDays(payload.days);
      toast(`${payload.days.length} Day Wise rows rebuilt from the latest posted Program.`);
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  $("#add-vendor-day-zero").addEventListener("click", () => {
    const payload = collectVendorIntake();
    if (payload.days.some((day) => day.dayNumber === 0)) return;
    const arrival = new Date(`${payload.arrivalDate || ""}T00:00:00Z`);
    const serviceDate = Number.isNaN(arrival.getTime())
      ? ""
      : new Date(arrival.getTime() - 86_400_000).toISOString().slice(0, 10);
    payload.days.unshift({
      tourDayId: "", dayNumber: 0, serviceDate, dayTitle: "Pre-arrival operation",
      startTime: "23:59", finishTime: "", daywiseText: "", status: "DRAFT", splits: [],
    });
    state.vendorIntake = payload;
    renderVendorDays(payload.days);
    toast("Day 0 added before Day 1. Review date, time, and transport split.");
  });
  $("#delete-vendor-day-zero").addEventListener("click", () => {
    const payload = collectVendorIntake();
    const dayZero = payload.days.find((day) => day.dayNumber === 0);
    if (!dayZero) return;
    const hasWork = Boolean(
      dayZero.dayTitle || dayZero.daywiseText || dayZero.startTime || dayZero.finishTime
      || (dayZero.splits || []).length
    );
    const warning = hasWork
      ? `Day 0 contains details or ${dayZero.splits.length} Micro Split item(s).\n\nDelete Day 0 and all of its local work?`
      : "Delete the empty Day 0 record?";
    if (!window.confirm(warning)) return;
    payload.days = payload.days.filter((day) => day.dayNumber !== 0);
    state.vendorIntake = payload;
    renderVendorDays(payload.days);
    toast("Day 0 removed.");
  });

  document.body.addEventListener("click", async (event) => {
    const notification = event.target.closest("[data-notification-action]");
    if (notification) return openVendorNotification(notification.dataset.notificationAction);
    const vendorPackage = event.target.closest("[data-vendor-package-key]");
    if (vendorPackage) return openVendorBookingPackage(vendorPackage.dataset.vendorPackageKey);
    const openCancel = event.target.closest("[data-open-vendor-cancel]");
    if (openCancel) {
      showView("vendor-generate", "VENDOR");
      return openVendorBookingPackage(openCancel.dataset.openVendorCancel, { actionType: "CANCEL" });
    }
    const vendorOpen = event.target.closest("[data-vendor-open-code]");
    if (vendorOpen) {
      if (vendorOpen.dataset.vendorOpenTarget === "ITINERARY_CHECK") {
        showView("vendor-itinerary-check", "VENDOR");
        $("#vendor-itinerary-check-code").value = vendorOpen.dataset.vendorOpenCode;
        return loadVendorItineraryCheck(vendorOpen.dataset.vendorOpenCode);
      }
      const matchingPackage = state.vendorBookingQueue.find((item) =>
        item.packageKey === vendorOpen.dataset.vendorOpenPackage
      ) || state.vendorBookingQueue.find((item) =>
        item.customerCode === vendorOpen.dataset.vendorOpenCode
      );
      if (matchingPackage) {
        showView("vendor-generate", "VENDOR");
        return openVendorBookingPackage(matchingPackage.packageKey);
      }
      setVendorIntakeMode("NEW");
      showView("vendor-new-itinerary", "VENDOR");
      $("#vendor-customer-code").value = vendorOpen.dataset.vendorOpenCode;
      return loadVendorItinerary(vendorOpen.dataset.vendorOpenCode);
    }
    const registerBooking = event.target.closest("[data-open-vendor-register]");
    if (registerBooking) {
      showView("vendor-generate", "VENDOR");
      return openVendorBookingPackage(registerBooking.dataset.openVendorRegister);
    }
    const gmailThread = event.target.closest("[data-open-gmail-thread]");
    if (gmailThread) {
      return window.erim.external.open(
        `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(gmailThread.dataset.openGmailThread)}`,
      );
    }
    const copyEvidence = event.target.closest("[data-copy-vendor-evidence]");
    if (copyEvidence) {
      try {
        await navigator.clipboard.writeText(copyEvidence.dataset.copyVendorEvidence);
        return toast("Gmail Message ID copied.");
      } catch (error) {
        return toast(`Unable to copy Message ID: ${error.message}`, true);
      }
    }
    const deliveryHistory = event.target.closest("[data-open-vendor-history]");
    if (deliveryHistory) {
      return openVendorDeliveryHistory(deliveryHistory.dataset.openVendorHistory);
    }
    const resendAttempt = event.target.closest("[data-open-vendor-resend-attempt]");
    if (resendAttempt) {
      return openVendorResendDialog(resendAttempt.dataset.openVendorResendAttempt);
    }
    if (event.target.closest("#open-vendor-resend")) return openVendorResendDialog();
    const portal = event.target.closest("[data-open-vendor-portal]");
    if (portal) {
      try {
        return await window.erim.external.open(portal.dataset.openVendorPortal);
      } catch (error) {
        return toast(error.message, true);
      }
    }
    const bookingPortal = event.target.closest("[data-open-vendor-booking-portal]");
    if (bookingPortal) {
      try {
        return await openVendorBookingPortal(bookingPortal.dataset.openVendorBookingPortal);
      } catch (error) {
        return toast(error.message, true);
      }
    }
    if (event.target.closest("[data-recheck-vendor-gmail]")) {
      return recheckVendorGmail();
    }
    const skipRate = event.target.closest("[data-skip-vendor-rate]");
    if (skipRate) {
      toast("Pending Rate retained. Generate remains available and the rate was not changed to zero or Ready.");
      return;
    }
    const retrySync = event.target.closest("[data-retry-vendor-sync]");
    if (retrySync) {
      retrySync.disabled = true;
      window.erim.vendor.retrySendSync(retrySync.dataset.retryVendorSync)
        .then(async () => {
          await refresh();
          toast("Official booking evidence synced. The email was not resent.");
        })
        .catch((error) => toast(error.message, true))
        .finally(() => { retrySync.disabled = false; });
      return;
    }
    const reconcileSend = event.target.closest("[data-reconcile-vendor-send]");
    if (reconcileSend) {
      reconcileSend.disabled = true;
      window.erim.vendor.reconcileSend(reconcileSend.dataset.reconcileVendorSend)
        .then(async (result) => {
          await refresh();
          await openVendorDeliveryHistory(result.booking.bookingId);
          toast(result.pendingSync
            ? "Gmail delivery was proven; official evidence sync remains pending."
            : "Gmail delivery was proven and reconciled.");
        })
        .catch((error) => toast(error.message, true))
        .finally(() => { reconcileSend.disabled = false; });
      return;
    }
    const supplierReadiness = event.target.closest("[data-open-supplier-readiness]");
    if (supplierReadiness) {
      await window.erim.supplierMaster.openFocused({
        supplierId: supplierReadiness.dataset.openSupplierReadiness,
        supplierName: supplierReadiness.dataset.openSupplierName,
        section: supplierReadiness.dataset.openSupplierSection,
        productId: supplierReadiness.dataset.openSupplierProduct,
        serviceId: supplierReadiness.dataset.openSupplierService,
        serviceDate: supplierReadiness.dataset.openSupplierDate,
        packageKey: supplierReadiness.dataset.openSupplierPackage,
      });
      return;
    }
    const removeHotel = event.target.closest("[data-remove-vendor-hotel]");
    if (removeHotel) {
      const payload = collectVendorIntake();
      payload.hotels.splice(Number(removeHotel.dataset.removeVendorHotel), 1);
      state.vendorIntake = payload;
      renderVendorHotels(payload.hotels);
      updateVendorDayHotels();
      return;
    }
    const splitToggle = event.target.closest("[data-toggle-vendor-split]");
    if (splitToggle) {
      const card = splitToggle.closest(".vendor-day-card");
      openVendorSplitDialog(card);
      return;
    }
    const removeSplit = event.target.closest("[data-remove-vendor-split]");
    if (removeSplit) {
      removeSplit.closest(".vendor-split-row")?.remove();
      return;
    }
    const email = event.target.closest("[data-recheck-thread-id]");
    if (email) {
      $$("#recheck-email-panel .selection-item").forEach((item) => item.classList.toggle("selected", item === email));
      return loadRecheckEmailTrail(email.dataset.recheckThreadId);
    }
    const vendorProcess = event.target.closest("[data-vendor-process-code]");
    if (vendorProcess) {
      showView("vendor-new-itinerary", "VENDOR");
      $("#vendor-customer-code").value = vendorProcess.dataset.vendorProcessCode;
      return loadVendorItinerary(vendorProcess.dataset.vendorProcessCode);
    }
    const action = event.target.closest("[data-action]");
    if (!action) return;
    if (action.dataset.action === "save-followup") return saveFollowup(action.dataset.id);
    if (action.dataset.action === "resolve-followup") return resolveFollowup(action.dataset.id);
    handleDraftAction(action.dataset.action, action.dataset.id);
  });
  document.body.addEventListener("input", (event) => {
    if (event.target.matches("#vendor-day-list textarea[data-auto-grow]")) autoGrowTextarea(event.target);
    if (event.target.matches("[data-vendor-hotel-field], [data-vendor-day-field=\"serviceDate\"]")) {
      updateVendorDayHotels();
      refreshVendorDateDisplays(event.target.closest("form") || document);
    }
    if (event.target.matches("input[data-flexible-input]")) {
      event.target.size = flexibleInputSize(
        event.target.value,
        Number(event.target.dataset.minSize || 12),
        Number(event.target.dataset.maxSize || 80),
      );
    }
    if (event.target.matches("[data-vendor-split-suggestion]")) {
      resolveVendorSplitSuggestion(event.target);
    } else if (event.target.matches(
      '[data-vendor-split-field="unitRateIdr"],'
      + '[data-vendor-split-field="adultRateIdr"],'
      + '[data-vendor-split-field="childRateIdr"],'
      + '[data-vendor-split-field="infantRateIdr"],'
      + '[data-vendor-split-field="quantity"]',
    )) {
      updateVendorManualRatePreview(event.target.closest(".vendor-split-row"));
    }
  });
  document.body.addEventListener("change", (event) => {
    if (event.target.matches('input[type="date"]')) {
      refreshVendorDateDisplays(event.target.closest("form") || document);
    }
  });
  document.body.addEventListener("focusout", (event) => {
    if (event.target.matches("[data-hour-time]")) {
      const normalized = normalizeHourTime(event.target.value);
      if (/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) event.target.value = normalized;
    }
    if (event.target.matches("[data-vendor-date-input]")) {
      const iso = parseVendorDate(event.target.value);
      if (iso) event.target.value = formatVendorDate(iso);
      else if (event.target.value.trim()) {
        toast("Date must use dd/MMMM/yyyy, for example 03/October/2026.", true);
      }
    }
  });
  document.body.addEventListener("change", (event) => {
    if (event.target.matches("[data-vendor-hotel-field], [data-vendor-day-field=\"serviceDate\"]")) {
      updateVendorDayHotels();
    }
    if (event.target.matches('[data-vendor-split-field="priceBasis"]')) {
      updateVendorManualRatePreview(event.target.closest(".vendor-split-row"));
    } else if (event.target.matches('[data-vendor-split-field="serviceType"]')) {
      const row = event.target.closest(".vendor-split-row");
      const type = normalizeVendorSplitType(event.target.value);
      if (type) {
        const typeChanged = row.dataset.serviceType !== type;
        refreshVendorSplitRow(row, {
          resetSupplier: typeChanged,
          resetProduct: typeChanged,
        });
      }
    } else if (event.target.matches("[data-vendor-split-suggestion]")) {
      resolveVendorSplitSuggestion(event.target);
    }
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

  $("#focused-supplier-close").addEventListener("click", () => window.close());

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

async function initializeSupplierFocusMode() {
  const context = await window.erim.supplierMaster.getFocusedContext();
  if (!context) return false;
  state.bootstrap = await window.erim.bootstrap();
  state.supplierFocusContext = context;
  document.body.classList.add(
    "supplier-focus-mode",
    `supplier-focus-section-${context.section.toLowerCase()}`,
  );
  $("#supplier-master-banner-note").textContent =
    `${context.section} correction for ${context.supplierName || "this supplier"}. Save locally to return to Generate.`;
  $("#focused-supplier-close").hidden = false;
  $("#save-supplier-master").textContent = "Save & return";
  await loadSupplierMaster({ refresh: false });
  const supplier = state.supplierMaster.suppliers.find((row) => row.supplierId === context.supplierId)
    || state.supplierMaster.suppliers.find((row) =>
      String(row.supplierName || "").toLowerCase() === String(context.supplierName || "").toLowerCase());
  if (supplier) {
    state.selectedSupplierTypeCode = supplier.typeCode;
    state.selectedSupplierId = supplier.supplierId;
    $("#supplier-master-search").value = supplier.supplierName;
  } else {
    state.selectedSupplierId = "";
    $("#supplier-master-search").value = context.supplierName || "";
  }
  showView("supplier-master", "MANAGER_ADMIN");
  renderSupplierMaster();
  if (context.section === "PRODUCT") {
    openSupplierProductDialog(context.productId || "");
  } else if (context.section === "RATE") {
    const validOnServiceDate = (row) => !context.serviceDate
      || (!row.validFrom || row.validFrom <= context.serviceDate)
      && (!row.validTo || row.validTo >= context.serviceDate);
    const matchingRate = state.supplierMaster.rates.find((row) =>
      row.productId === context.productId && row.active !== false && validOnServiceDate(row));
    const contract = state.supplierMaster.contracts.find((row) =>
      row.contractId === matchingRate?.contractId && row.active !== false)
      || state.supplierMaster.contracts.find((row) =>
        row.supplierId === state.selectedSupplierId && row.active !== false && validOnServiceDate(row));
    if (contract) openSupplierContractDialog(contract.contractId);
    else {
      openSupplierContractDialog();
      const productSelect = $("#supplier-contract-rate-list [data-contract-rate='productId']");
      if (productSelect && context.productId) productSelect.value = context.productId;
    }
  }
  return true;
}

window.erim.supplierMaster.onFocusedUpdated(async (payload) => {
  if (state.supplierFocusContext) return;
  await loadSupplierMaster({ refresh: false });
  [state.vendorBookingQueue, state.vendorBookings, state.vendorOperational] = await Promise.all([
    window.erim.vendor.listBookingQueue(),
    window.erim.vendor.listBookings(),
    window.erim.vendor.getOperationalModel(),
  ]);
  state.vendorDashboard = state.vendorOperational.dashboard || state.vendorDashboard;
  renderVendorBookingQueue();
  renderVendorDashboard();
  renderVendorInbox();
  if (state.selectedVendorPackageKey) {
    await openVendorBookingPackage(state.selectedVendorPackageKey, {
      serviceIds: state.vendorBookingPreview?.selectedServiceIds || [],
    });
  }
  toast(`${payload.supplierName || "Supplier"} saved locally; Generate readiness refreshed.`);
});

loadNavigationPreferences();
applyNavigationPreferences();
renderTransportOperation();
bindEvents();
window.erim.supplierMaster.onPublishProgress((session) => {
  renderSupplierPublishProgress(session);
});
window.erim.masterData.onStatus((payload) => {
  const supplierResult = payload?.supplierMaster;
  const catalog = supplierResult?.catalog;
  if (!catalog) return;
  state.supplierMaster = supplierCatalogFrom(supplierResult);
  state.supplierMasterLoaded = true;
  state.vendorSuggestions = supplierSuggestionsFromCatalog(state.supplierMaster);
  renderVendorSuggestions(state.vendorSuggestions);
  if (state.currentView === "supplier-master") renderSupplierMaster();
});
window.addEventListener("online", () => {
  state.vendorGmailReadiness = null;
  if ($("#vendor-communication-dialog")?.open) renderVendorBookingPreview();
});
window.addEventListener("offline", () => {
  state.vendorGmailReadiness = {
    state: "GMAIL_UNREACHABLE",
    ready: false,
    checkedAt: new Date().toISOString(),
    message: "This PC is offline.",
  };
  if ($("#vendor-communication-dialog")?.open) renderVendorBookingPreview();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.vendorGmailReadiness) {
    const age = Date.now() - Date.parse(state.vendorGmailReadiness.checkedAt || 0);
    if (age > 300_000) state.vendorGmailReadiness = null;
  }
});
initializeSupplierFocusMode()
  .then((focused) => focused || refresh())
  .catch((error) => toast(error.message, true));
