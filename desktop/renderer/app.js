const state = {
  bootstrap: null,
  drafts: [],
  syncQueue: [],
  currentView: "dashboard",
  currentModule: null,
  updateStatus: "DEV_MODE",
  auth: { connected: false, email: "" },
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
  if (lower.includes("sync")) return "synced";
  if (lower.includes("fail")) return "failed";
  if (lower.includes("conflict")) return "conflict";
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

async function refresh() {
  state.bootstrap = await window.erim.bootstrap();
  state.drafts = await window.erim.drafts.list({});
  state.syncQueue = await window.erim.sync.list();
  state.auth = await window.erim.auth.status();
  renderChrome();
  renderDashboard();
  renderWorkspace();
  renderSync();
  renderSettings();
}

function renderChrome() {
  const { version, settings } = state.bootstrap;
  $("#version-label").textContent = `Version ${version}`;
  const dummyMode = settings.environment === "DEV";
  $("#environment-label").textContent = dummyMode ? "DEV DUMMY" : settings.environment;
  $("#user-name").textContent = settings.employeeName;
  $("#user-department").textContent = settings.department;
  $("#user-initials").textContent = settings.employeeName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  $("#sync-nav-count").textContent = state.syncQueue.filter((job) => !["SYNCED", "CANCELED"].includes(job.status)).length;
  $("#google-auth").hidden = dummyMode;
  $("#google-settings").hidden = dummyMode;
  $("#google-auth").textContent = state.auth.connected ? `Google: ${state.auth.email || "Connected"}` : "Connect Google";
}

function renderDashboard() {
  const metrics = state.bootstrap.dashboard;
  for (const key of ["total", "drafts", "ready", "attention", "synced"]) {
    $(`#metric-${key}`).textContent = metrics[key] || 0;
  }
  const search = $("#draft-search").value.trim().toLowerCase();
  const status = $("#draft-status-filter").value;
  const rows = state.drafts.filter((draft) => {
    const matchesSearch = !search || draft.customer_code.toLowerCase().includes(search) || draft.title.toLowerCase().includes(search);
    return matchesSearch && (!status || draft.local_status === status);
  });
  $("#draft-table").innerHTML = rows.length ? rows.map((draft) => `
    <tr>
      <td><strong>${escapeHtml(draft.customer_code)}</strong></td>
      <td>${escapeHtml(draft.module)}</td>
      <td>${escapeHtml(draft.title)}</td>
      <td>${statusPill(draft.local_status)}</td>
      <td>${statusPill(draft.sync_status)}</td>
      <td>${formatDate(draft.updated_at)}</td>
      <td>${draftActions(draft)}</td>
    </tr>
  `).join("") : `<tr><td class="empty" colspan="7">No local work yet. Create the first department draft.</td></tr>`;
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

function renderSync() {
  $("#sync-table").innerHTML = state.syncQueue.length ? state.syncQueue.map((job) => `
    <tr>
      <td><strong>${escapeHtml(job.customer_code)}</strong></td>
      <td>${escapeHtml(job.module)}</td>
      <td>${escapeHtml(job.operation)}</td>
      <td>${statusPill(job.status)}</td>
      <td>${job.attempts}</td>
      <td>${escapeHtml(job.last_error_message || "—")}</td>
      <td>${formatDate(job.updated_at)}</td>
    </tr>
  `).join("") : `<tr><td class="empty" colspan="7">Nothing is queued for publication.</td></tr>`;
}

function renderSettings() {
  const { settings, databasePath } = state.bootstrap;
  const form = $("#settings-form");
  for (const [key, value] of Object.entries(settings)) {
    if (form.elements[key]) form.elements[key].value = value || "";
  }
  $("#database-path").textContent = databasePath;
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
    settings: ["Application configuration", "Desktop settings"],
  };
  $("#view-eyebrow").textContent = titles[view][0];
  $("#view-title").textContent = titles[view][1];
  renderWorkspace();
}

function openDraftDialog(module = null) {
  const form = $("#draft-form");
  form.reset();
  form.elements.draftId.value = "";
  form.elements.module.value = module || state.bootstrap.settings.department;
  $("#draft-dialog-title").textContent = "New local draft";
  $("#draft-dialog").showModal();
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
    const button = event.target.closest(".nav-item");
    if (button) showView(button.dataset.view, button.dataset.module || null);
  });
  ["#new-draft", "#new-draft-hero"].forEach((selector) => $(selector).addEventListener("click", () => openDraftDialog()));
  $("#workspace-new-draft").addEventListener("click", () => openDraftDialog(state.currentModule));
  $("#close-dialog").addEventListener("click", () => $("#draft-dialog").close());
  $("#cancel-dialog").addEventListener("click", () => $("#draft-dialog").close());
  $("#draft-search").addEventListener("input", renderDashboard);
  $("#draft-status-filter").addEventListener("change", renderDashboard);

  document.body.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    if (action) handleDraftAction(action.dataset.action, action.dataset.id);
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

  $("#google-auth").addEventListener("click", async () => {
    try {
      if (state.auth.connected) await window.erim.auth.logout();
      else await window.erim.auth.login();
      await refresh();
      toast(state.auth.connected ? "Google account connected." : "Google account disconnected.");
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
