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
  selectedSupplierTypeCode: "VENDOR",
  selectedSupplierId: "",
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

function supplierCatalogFrom(payload) {
  return payload?.catalog || payload || {
    supplierTypes: [], suppliers: [], contacts: [], recipients: [],
    sops: [], products: [], contracts: [], rates: [],
  };
}

async function loadSupplierMaster({ refresh = true, initialize = false } = {}) {
  const status = $("#supplier-master-sync-status");
  status.textContent = initialize ? "INITIALIZING" : "LOADING";
  try {
    const result = initialize
      ? await window.erim.supplierMaster.initialize()
      : await window.erim.supplierMaster.list({ refresh });
    state.supplierMaster = supplierCatalogFrom(result);
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
    state.vendorSuggestions = supplierSuggestionsFromCatalog(state.supplierMaster);
    renderVendorSuggestions(state.vendorSuggestions);
  } catch (error) {
    status.textContent = "FAILED";
    status.className = "status failed";
    toast(error.message, true);
  }
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
  const rates = (catalog.rates || []).filter((row) => row.active !== false).filter((rate) => {
    const contract = contractById.get(rate.contractId);
    return contract && valid(
      serviceDate,
      rate.validFrom || contract.validFrom,
      rate.validTo || contract.validTo,
    );
  }).map((rate) => {
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
      unitRateIdr: !["PER_ADULT", "PER_CHILD"].includes(basis) ? amount : null,
      priceBasis: basis,
      currency: rate.currency || contract.currency || "IDR",
      validFrom: rate.validFrom || contract.validFrom || "",
      validTo: rate.validTo || contract.validTo || "",
      priceSource: "CONTRACT",
      contractNumber: contract.contractNumber || "",
    };
  });
  const byType = (code) => rates.filter((rate) => rate.typeCode === code);
  const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    ...catalog,
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
    "accountReference", "subjectTemplate", "bodyTemplate"].forEach((field) => {
    form.elements[field].value = sop[field] || "";
  });
  $("#supplier-form-title").textContent = supplier.supplierName;
  $("#supplier-form-status").textContent = supplier.status || "ACTIVE";
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
  const transportPayload = {
    ...payload,
    contacts: payload.contacts.map((row) => ({
      ...row,
      phone: supplierPhoneForTransport(row.phone),
      whatsapp: supplierPhoneForTransport(row.whatsapp),
    })),
    recipients: payload.recipients.map((row) => ({
      ...row,
      address: row.channel === "WHATSAPP" || row.recipientType === "WHATSAPP"
        ? supplierPhoneForTransport(row.address) : row.address,
    })),
  };
  try {
    state.supplierMaster = supplierCatalogFrom(
      await window.erim.supplierMaster.saveSupplier(transportPayload),
    );
    const saved = state.supplierMaster.suppliers.find((row) =>
      row.supplierName === payload.supplierName && row.typeCode === payload.typeCode
    );
    state.selectedSupplierId = saved?.supplierId || payload.supplierId;
    renderSupplierMaster();
    toast(`${payload.supplierName} saved, activated, and notified to all users.`);
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
  const products = state.supplierMaster.products.filter((row) => row.supplierId === supplier.supplierId && row.active !== false);
  const contracts = state.supplierMaster.contracts.filter((row) => row.supplierId === supplier.supplierId && row.active !== false);
  const rates = state.supplierMaster.rates.filter((row) => row.active !== false);
  const productCards = products.map((product) => `
    <article class="supplier-product-card">
      <div class="supplier-product-card-heading">
        <div><strong>${escapeHtml(product.productName)}</strong><small>${escapeHtml(product.productCode || "No code")} · ${escapeHtml(product.category || supplier.typeCode)}</small></div>
        <button class="button ghost small" data-edit-supplier-product="${escapeHtml(product.productId)}" type="button">Edit</button>
      </div>
      <div class="supplier-product-detail">${escapeHtml(product.description || "No description")}</div>
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
    <div class="section-heading"><div><p class="eyebrow">Catalogue</p><h3>Products (${products.length})</h3></div></div>
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
}

async function saveSupplierProductForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.destinations = String(payload.destinations || "").split(",").map((x) => x.trim()).filter(Boolean);
  try {
    state.supplierMaster = supplierCatalogFrom(await window.erim.supplierMaster.saveProduct(payload));
    $("#supplier-product-dialog").close();
    renderSupplierMaster();
    toast(`${payload.productName} saved and activated.`);
  } catch (error) { toast(error.message, true); }
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
  try {
    state.supplierMaster = supplierCatalogFrom(await window.erim.supplierMaster.saveContract(payload));
    $("#supplier-contract-dialog").close();
    renderSupplierMaster();
    state.vendorSuggestions = supplierSuggestionsFromCatalog(state.supplierMaster);
    renderVendorSuggestions(state.vendorSuggestions);
    toast(`${payload.contractNumber} saved; contract rates are immediately available by service date.`);
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

async function archiveSelectedSupplierEntity(entityKind, entityId, label) {
  const reason = window.prompt(`Reason for archiving ${label}:`);
  if (reason === null) return;
  if (!reason.trim()) return toast("Archive reason is required.", true);
  try {
    state.supplierMaster = supplierCatalogFrom(await window.erim.supplierMaster.archive({
      entityKind, entityId, reason: reason.trim(),
    }));
    if (entityKind === "SUPPLIER") state.selectedSupplierId = "";
    $("#supplier-product-dialog").close();
    $("#supplier-contract-dialog").close();
    renderSupplierMaster();
    toast(`${label} archived. Historical booking snapshots remain available.`);
  } catch (error) { toast(error.message, true); }
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
  $$("[data-manager-action]").forEach((node) => {
    node.classList.toggle("active", view === "supplier-master");
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
    "supplier-master": ["Manager / Admin", "Supplier Master & Contract Rates"],
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
      <label>Check-in date<input data-vendor-hotel-field="checkInDate" type="date" value="${escapeHtml(hotel.checkInDate || "")}" /></label>
      <label>Check-out date<input data-vendor-hotel-field="checkOutDate" type="date" value="${escapeHtml(hotel.checkOutDate || "")}" /></label>
      <button class="button ghost small" type="button" data-remove-vendor-hotel="${index}">Remove</button>
    </div>
  `).join("") : `<div class="empty-notifications">No hotel extracted. Add hotel manually if required.</div>`;
}

function collectVendorHotelRows() {
  return $$("#vendor-hotel-list .hotel-row").map((row, index) => ({
    hotelStayId: row.dataset.hotelStayId || "",
    staySequence: index + 1,
    hotelName: row.querySelector('[data-vendor-hotel-field="hotelName"]').value.trim(),
    checkInDate: row.querySelector('[data-vendor-hotel-field="checkInDate"]').value,
    checkOutDate: row.querySelector('[data-vendor-hotel-field="checkOutDate"]').value,
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
  return (state.vendorSuggestions.rates || [
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
    unitRateIdr: hasKnownRate(rate.unitRateIdr) ? rate.unitRateIdr : combined.unitRateIdr,
    contractRateId: combined.contractRateId || rate.contractRateId || "",
  }), {
    ...first,
    adultRateIdr: null,
    childRateIdr: null,
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

function vendorSplitRateMarkup(split = {}) {
  const type = normalizeVendorSplitType(split.serviceType || "VENDOR");
  const rate = vendorSplitRate(type, split.supplierId, split.productId || split.serviceMasterId, split.serviceDate);
  if (!rate) {
    const unitRate = split.priceSource === "MANUAL" ? (split.unitRateIdr ?? "") : "";
    const ready = hasKnownRate(unitRate);
    const basis = split.priceBasis || "PER_SERVICE";
    const quantity = Number(split.quantity ?? 1) || 1;
    return `
      <div class="vendor-split-rate-heading">
        <span class="vendor-rate-status ${ready ? "ready" : "pending"}" data-vendor-rate-status>
          ${ready ? "Manual rate ready" : "Pending rate"}
        </span>
        <small>No valid contract rate for this service date. Booking may continue; manual rate is booking-only.</small>
      </div>
      <div class="vendor-split-manual-rate">
        <label class="vendor-split-field">
          <span>Manual rate</span>
          <input data-vendor-split-field="unitRateIdr" type="number" min="0" step="1"
            value="${escapeHtml(unitRate)}" placeholder="Can be filled later" />
        </label>
        <label class="vendor-split-field">
          <span>Price basis</span>
          <select data-vendor-split-field="priceBasis">
            ${["PER_SERVICE", "PER_PAX", "PER_ITEM", "PER_UNIT", "PER_TRIP", "PER_VEHICLE"].map((value) =>
              `<option value="${value}"${value === basis ? " selected" : ""}>${value.replaceAll("_", " ")}</option>`
            ).join("")}
          </select>
        </label>
        <label class="vendor-split-field">
          <span>Quantity</span>
          <input data-vendor-split-field="quantity" type="number" min="0.01" step="0.01"
            value="${escapeHtml(quantity)}" />
        </label>
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
  const unit = rate?.unitRateIdr ?? split.unitRateIdr;
  const ready = hasKnownRate(adult) || hasKnownRate(child) || hasKnownRate(unit);
  const parts = [
    hasKnownRate(adult) ? `Adult ${idr(adult)}` : "",
    hasKnownRate(child) ? `Child ${idr(child)}` : "",
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
  const supplierOptions = [
    `<option value="">Choose supplier</option>`,
    ...suppliers.map((row) => `<option value="${escapeHtml(row.supplierId)}"${row.supplierId === selectedSupplierId ? " selected" : ""}>${escapeHtml(row.supplierName)}</option>`),
  ].join("");
  const productOptions = [
    `<option value="">Choose service/product</option>`,
    ...products.map((row) => `<option value="${escapeHtml(row.productId)}"${row.productId === selectedProductId ? " selected" : ""}>${escapeHtml(row.productName)}</option>`),
  ].join("");
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
        <select data-vendor-split-field="supplierId">${supplierOptions}</select>
      </label>
      <label class="vendor-split-field">
        <span>Supplier Service / Product</span>
        <select data-vendor-split-field="productId">${productOptions}</select>
      </label>
      <div class="vendor-split-rate-panel" data-vendor-split-rate-panel>
        ${vendorSplitRateMarkup({
          ...split,
          serviceType: normalizedType,
          supplierId: selectedSupplierId,
          productId: selectedProductId,
          serviceDate: $("#vendor-split-dialog")?.dataset.serviceDate || "",
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
    const vendorName = supplierInput.selectedOptions[0]?.textContent.trim() || "";
    const activityText = productInput.selectedOptions[0]?.textContent.trim() || "";
    const matchedRate = vendorSplitRate(serviceType, supplierId, productId);
    const manualRateInput = row.querySelector('[data-vendor-split-field="unitRateIdr"]');
    const manualRate = manualRateInput?.value === "" || manualRateInput === null
      ? null : Number(manualRateInput.value);
    const unitRateIdr = matchedRate?.unitRateIdr ?? manualRate;
    const adultRateIdr = matchedRate?.adultRateIdr ?? null;
    const childRateIdr = matchedRate?.childRateIdr ?? null;
    const rateReady = hasKnownRate(adultRateIdr)
      || hasKnownRate(childRateIdr)
      || hasKnownRate(unitRateIdr);
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
      priceSource: matchedRate ? "CONTRACT" : (hasKnownRate(manualRate) ? "MANUAL" : "NONE"),
      adultRateIdr,
      childRateIdr,
      unitRateIdr,
      priceBasis: matchedRate?.priceBasis
        || row.querySelector('[data-vendor-split-field="priceBasis"]')?.value || "PER_SERVICE",
      quantity: Number(row.querySelector('[data-vendor-split-field="quantity"]')?.value || 1),
      currency: matchedRate?.currency || "IDR",
      rateStatus: rateReady ? "RATE_READY" : "PENDING_RATE",
      manualPriceReason: row.querySelector('[data-vendor-split-field="manualPriceReason"]')?.value.trim() || "",
      manualRateSource: row.querySelector('[data-vendor-split-field="manualRateSource"]')?.value || "",
      manualEvidenceRef: row.querySelector('[data-vendor-split-field="manualEvidenceRef"]')?.value.trim() || "",
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
            <input data-vendor-day-field="serviceDate" type="date" value="${escapeHtml(day.serviceDate || "")}" />
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
            <span>Start time *</span>
            <input data-vendor-day-field="startTime" type="time" value="${escapeHtml(day.startTime || "")}" required />
          </label>
          <label class="vendor-day-time">
            <span>Finish time</span>
            <input data-vendor-day-field="finishTime" type="time" value="${escapeHtml(day.finishTime || "")}" />
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
  const serviceDate = card.querySelector('[data-vendor-day-field="serviceDate"]').value;
  const dayTitle = card.querySelector('[data-vendor-day-field="dayTitle"]').value.trim();
  const startTime = card.querySelector('[data-vendor-day-field="startTime"]').value;
  const finishTime = card.querySelector('[data-vendor-day-field="finishTime"]').value;
  if (!startTime) {
    const input = card.querySelector('[data-vendor-day-field="startTime"]');
    input.focus();
    return toast(`Day ${dayNumber} Start Time is required before split.`, true);
  }
  const daywiseText = card.querySelector('[data-vendor-day-field="daywiseText"]').value.trim();
  const stored = collectVendorSplitRows(card.querySelector("[data-vendor-split-store]"));
  const rows = stored.length ? stored : [{
    serviceId: "", serviceType: "VENDOR", activityText: "", vendorId: "", vendorName: "", status: "DRAFT",
  }];
  const dialog = $("#vendor-split-dialog");
  dialog.dataset.dayNumber = String(dayNumber);
  dialog.dataset.serviceDate = serviceDate || "";
  $("#vendor-split-dialog-title").textContent = `Day ${dayNumber} micro split`;
  const timeRange = finishTime ? `${startTime}–${finishTime}` : `Start ${startTime}`;
  $("#vendor-split-dialog-meta").textContent = [serviceDate, timeRange, dayTitle].filter(Boolean).join(" · ") || "Date and tour header not filled";
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
    const saved = await window.erim.vendor.saveIntakeDraft(payload);
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
    hotels: collectVendorHotelRows(),
    days: $$("#vendor-day-list .vendor-day-card").map((card) => ({
      tourDayId: card.dataset.tourDayId || "",
      dayNumber: Number(card.dataset.dayNumber),
      serviceDate: card.querySelector('[data-vendor-day-field="serviceDate"]').value,
      dayTitle: card.querySelector('[data-vendor-day-field="dayTitle"]').value.trim(),
      startTime: card.querySelector('[data-vendor-day-field="startTime"]').value,
      finishTime: card.querySelector('[data-vendor-day-field="finishTime"]').value,
      daywiseText: card.querySelector('[data-vendor-day-field="daywiseText"]').value,
      status: "DRAFT",
      splits: collectVendorSplitRows(card.querySelector("[data-vendor-split-store]")),
    })),
  };
}

function populateVendorIntake(context) {
  if (context.suggestions) state.vendorSuggestions = context.suggestions;
  state.vendorIntake = { ...context, suggestions: state.vendorSuggestions };
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

function refreshVendorSplitRow(row, { resetSelection = false } = {}) {
  if (!row) return;
  const typeInput = row.querySelector('[data-vendor-split-field="serviceType"]');
  const supplierInput = row.querySelector('[data-vendor-split-field="supplierId"]');
  const productInput = row.querySelector('[data-vendor-split-field="productId"]');
  const type = normalizeVendorSplitType(typeInput?.value);
  if (!type) return;
  const provider = vendorSplitProviderConfig(type);
  row.dataset.serviceType = type;
  row.querySelector("[data-vendor-provider-label]").textContent = provider.label;
  const suppliers = (state.vendorSuggestions.suppliers || [])
    .filter((item) => item.active !== false && item.typeCode === type);
  const currentSupplierId = resetSelection ? "" : supplierInput.value;
  supplierInput.innerHTML = [
    `<option value="">Choose supplier</option>`,
    ...suppliers.map((item) => `<option value="${escapeHtml(item.supplierId)}">${escapeHtml(item.supplierName)}</option>`),
  ].join("");
  supplierInput.value = suppliers.some((item) => item.supplierId === currentSupplierId)
    ? currentSupplierId : "";
  const products = (state.vendorSuggestions.products || [])
    .filter((item) => item.active !== false && item.supplierId === supplierInput.value);
  const currentProductId = resetSelection ? "" : productInput.value;
  productInput.innerHTML = [
    `<option value="">Choose service/product</option>`,
    ...products.map((item) => `<option value="${escapeHtml(item.productId)}">${escapeHtml(item.productName)}</option>`),
  ].join("");
  productInput.value = products.some((item) => item.productId === currentProductId)
    ? currentProductId : "";
  const existingUnit = row.querySelector('[data-vendor-split-field="unitRateIdr"]')?.value ?? "";
  const existingBasis = row.querySelector('[data-vendor-split-field="priceBasis"]')?.value || "PER_SERVICE";
  const existingQuantity = row.querySelector('[data-vendor-split-field="quantity"]')?.value || 1;
  const existingReason = row.querySelector('[data-vendor-split-field="manualPriceReason"]')?.value || "";
  const existingSource = row.querySelector('[data-vendor-split-field="manualRateSource"]')?.value || "";
  const existingEvidence = row.querySelector('[data-vendor-split-field="manualEvidenceRef"]')?.value || "";
  row.querySelector("[data-vendor-split-rate-panel]").innerHTML = vendorSplitRateMarkup({
    serviceType: type,
    supplierId: supplierInput.value,
    productId: productInput.value,
    unitRateIdr: existingUnit,
    priceBasis: existingBasis,
    quantity: existingQuantity,
    manualPriceReason: existingReason,
    manualRateSource: existingSource,
    manualEvidenceRef: existingEvidence,
  });
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
  if (publish) {
    const missingStart = payload.days.find((day) => !day.startTime);
    if (missingStart) {
      return toast(`Day ${missingStart.dayNumber} Start Time is required before online posting.`, true);
    }
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
    const managerAction = event.target.closest("[data-manager-action]");
    if (managerAction?.dataset.managerAction === "supplier-master") {
      showView("supplier-master", "MANAGER_ADMIN");
      if (!state.supplierMasterLoaded) loadSupplierMaster({ refresh: true });
      return;
    }
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
  $("#close-vendor-split-dialog").addEventListener("click", () => $("#vendor-split-dialog").close());
  $("#cancel-vendor-split-dialog").addEventListener("click", () => $("#vendor-split-dialog").close());
  $("#apply-vendor-split").addEventListener("click", applyVendorSplitDialog);
  $("#vendor-split-dialog-add").addEventListener("click", () => {
    const list = $("#vendor-split-dialog-list");
    const index = list.querySelectorAll(".vendor-split-row").length;
    list.insertAdjacentHTML("beforeend", vendorSplitRow({}, index));
  });
  $("#refresh-supplier-master").addEventListener("click", () => loadSupplierMaster({ refresh: true }));
  $("#initialize-supplier-master").addEventListener("click", () => loadSupplierMaster({ initialize: true }));
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
      state.supplierMaster = supplierCatalogFrom(await window.erim.supplierMaster.saveType(payload));
      state.selectedSupplierTypeCode = String(payload.typeCode).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
      state.selectedSupplierId = "";
      $("#supplier-type-dialog").close();
      renderSupplierMaster();
      toast(`${payload.typeName} Type saved and available without a backend syntax change.`);
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
  $("#archive-supplier-product").addEventListener("click", () => {
    const id = $("#supplier-product-form").elements.productId.value;
    const product = state.supplierMaster.products.find((row) => row.productId === id);
    if (product) archiveSelectedSupplierEntity("PRODUCT", id, product.productName);
  });
  $("#add-supplier-contract").addEventListener("click", () => openSupplierContractDialog());
  $("#supplier-contract-form").addEventListener("submit", saveSupplierContractForm);
  $("#close-supplier-contract-dialog").addEventListener("click", () => $("#supplier-contract-dialog").close());
  $("#cancel-supplier-contract-dialog").addEventListener("click", () => $("#supplier-contract-dialog").close());
  $("#add-contract-rate").addEventListener("click", () =>
    $("#supplier-contract-rate-list").insertAdjacentHTML("beforeend", contractRateMarkup({})));
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
    const removeContact = event.target.closest("[data-remove-supplier-contact]");
    if (removeContact) return removeContact.closest(".supplier-repeatable-row").remove();
    const removeRecipient = event.target.closest("[data-remove-supplier-recipient]");
    if (removeRecipient) return removeRecipient.closest(".supplier-repeatable-row").remove();
    const editProduct = event.target.closest("[data-edit-supplier-product]");
    if (editProduct) return openSupplierProductDialog(editProduct.dataset.editSupplierProduct);
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
  $("#add-vendor-hotel").addEventListener("click", () => {
    const payload = collectVendorIntake();
    payload.hotels.push({ hotelStayId: "", hotelName: "", checkInDate: "", checkOutDate: "" });
    state.vendorIntake = payload;
    renderVendorHotels(payload.hotels);
    updateVendorDayHotels();
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
    }
    if (event.target.matches("input[data-flexible-input]")) {
      event.target.size = flexibleInputSize(
        event.target.value,
        Number(event.target.dataset.minSize || 12),
        Number(event.target.dataset.maxSize || 80),
      );
    }
    if (event.target.matches('[data-vendor-split-field="serviceType"]')) {
      const row = event.target.closest(".vendor-split-row");
      const type = normalizeVendorSplitType(event.target.value);
      if (type) refreshVendorSplitRow(row, { resetSelection: row.dataset.serviceType !== type });
    } else if (event.target.matches(
      '[data-vendor-split-field="supplierId"], [data-vendor-split-field="productId"]',
    )) {
      const row = event.target.closest(".vendor-split-row");
      refreshVendorSplitRow(row, {
        resetSelection: event.target.matches('[data-vendor-split-field="supplierId"]'),
      });
    } else if (event.target.matches('[data-vendor-split-field="unitRateIdr"]')) {
      const badge = event.target.closest(".vendor-split-row")?.querySelector("[data-vendor-rate-status]");
      const ready = hasKnownRate(event.target.value);
      if (badge) {
        badge.textContent = ready ? "Rate ready" : "Pending rate";
        badge.className = `vendor-rate-status ${ready ? "ready" : "pending"}`;
        badge.dataset.vendorRateStatus = "";
      }
    }
  });
  document.body.addEventListener("change", (event) => {
    if (event.target.matches("[data-vendor-hotel-field], [data-vendor-day-field=\"serviceDate\"]")) {
      updateVendorDayHotels();
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
