const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "desktop", "renderer", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "desktop", "renderer", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "desktop", "renderer", "styles.css"), "utf8");
const preload = fs.readFileSync(path.join(root, "desktop", "preload.cjs"), "utf8");
const main = fs.readFileSync(path.join(root, "desktop", "main.cjs"), "utf8");
const appsScript = fs.readFileSync(path.join(root, "apps-script", "Code.gs"), "utf8");

test("sidebar supports logo show-hide and independently collapsible text menu groups", () => {
  assert.match(html, /id="sidebar-toggle"/);
  assert.match(html, /data-menu-group="reservation"/);
  assert.match(html, /data-menu-group="vendor"/);
  assert.match(html, /data-menu-group="transport"/);
  assert.match(html, /data-menu-group="manager"/);
  assert.match(html, /data-menu-toggle="reservation"/);
  assert.match(html, /aria-label="Open Vendor Booking dashboard"/);
  assert.match(app, /NAVIGATION_PREFERENCE_KEY/);
  assert.match(app, /sidebarHidden/);
  assert.match(app, /toggleMenuGroup/);
  assert.match(app, /const collapseControl = event\.target\.closest\("\[data-menu-toggle\]"\)/);
  assert.doesNotMatch(app, /state\.currentModule === module[\s\S]{0,120}toggleMenuGroup/);
  assert.match(styles, /\.app-shell\.sidebar-hidden/);
  assert.match(styles, /\.nav-submenu\.collapsed/);
  assert.doesNotMatch(html, /data-nav-icon=/);
});

test("Transport navigation exposes every prepared operational submenu", () => {
  [
    "New Itinerary Check",
    "Revise Itinerary Check",
    "Add Cost to Itinerary",
    "Set Driver Detail",
    "Review Arrival per Date",
    "Review TOC per Itinerary",
    "Cek KPI",
    "Review Day Tour",
    "Invoicing",
  ].forEach((label) => assert.match(html, new RegExp(label)));
  assert.match(app, /const transportOperations =/);
  assert.match(app, /Driver Master/);
  assert.match(app, /Arrival manifest/);
  assert.match(app, /TOC review data/);
});

test("Product cards expose bulk duplicate workflow through the local pending bridge", () => {
  assert.match(app, /data-duplicate-supplier-product/);
  assert.match(app, /data-select-supplier-product/);
  assert.match(app, /data-select-all-supplier-products/);
  assert.match(app, /data-duplicate-selected-products/);
  assert.match(app, /selectedSupplierProductIds: new Set\(\)/);
  assert.match(html, /id="supplier-product-duplicate-dialog"/);
  assert.match(html, /Copy Product to Suppliers/);
  assert.match(html, /id="supplier-copy-matrix"/);
  assert.match(html, /name="includeContracts"/);
  assert.match(html, /name="includeRates"/);
  assert.match(preload, /duplicateProduct:.*supplier-master:product-duplicate/);
  assert.match(main, /supplier-master:product-duplicate/);
});

test("Supplier publishing exposes confirmed live progress and top-positioned new records", () => {
  assert.match(html, /id="supplier-publish-progress"/);
  assert.match(html, /id="supplier-publish-progress-bar"/);
  assert.match(html, /records confirmed/);
  assert.match(preload, /supplier-master:publish-progress/);
  assert.match(main, /supplier-master:publish-progress/);
  assert.match(app, /renderSupplierPublishProgress/);
  assert.match(app, /supplierPublishActive: false/);
  assert.match(app, /Resume interrupted session/);
  assert.match(app, /unresolvedItems\.length/);
  assert.match(app, /newestLocalFirst/);
  assert.match(app, /insertAdjacentHTML\("afterbegin", contractRateMarkup/);
});

test("Micro Split suggestions preserve Supplier IDs and independently refresh Product choices", () => {
  assert.match(app, /data-vendor-split-suggestion="supplier"/);
  assert.match(app, /data-vendor-split-suggestion="product"/);
  assert.match(app, /data-vendor-split-field="supplierId" type="hidden"/);
  assert.match(app, /data-vendor-split-field="productId" type="hidden"/);
  assert.match(app, /function resolveVendorSplitSuggestion/);
  assert.match(app, /function vendorSplitProductPriceLabel/);
  assert.match(app, /vendorSplitProductPriceLabel\(item, type, supplierInput\.value, serviceDate\)/);
  assert.match(app, /resetSupplier = false, resetProduct = false/);
  assert.match(app, /refreshVendorSplitRow\(row, \{ resetProduct: changed \}\)/);
  assert.doesNotMatch(app, /<select data-vendor-split-field="supplierId"/);
  assert.doesNotMatch(app, /label="\$\{escapeHtml\(item\.productCode \|\| item\.category/);
});

test("Micro Split window shows the selected Day hotel and operating times", () => {
  assert.match(html, /id="vendor-split-context-hotel"/);
  assert.match(html, /id="vendor-split-context-start"/);
  assert.match(html, /id="vendor-split-context-finish"/);
  assert.match(app, /vendorHotelsForDate\(collectVendorHotelRows\(\), serviceDate\)/);
  assert.match(app, /vendor-split-context-hotel/);
  assert.match(app, /vendor-split-context-start/);
  assert.match(app, /vendor-split-context-finish/);
  assert.match(styles, /\.vendor-split-day-context/);
});

test("Vendor Booking exposes a live supplier queue, controlled sending, revise reuse, and cancellation preparation", () => {
  assert.match(html, /Generate preparation/);
  assert.match(html, /Generate & Send Supplier Booking/);
  assert.match(html, /id="vendor-booking-queue-list"/);
  assert.match(html, /id="vendor-prep-supplier-detail"/);
  assert.match(html, /id="vendor-prep-product-detail"/);
  assert.match(html, /id="vendor-communication-dialog"/);
  assert.match(html, /id="vendor-communication-previous"/);
  assert.match(html, /id="vendor-communication-next"/);
  assert.match(html, /id="send-vendor-booking-email"/);
  assert.match(html, /id="prepare-vendor-cancel"/);
  assert.match(html, /id="open-vendor-revise-workspace"/);
  assert.match(app, /listBookingQueue/);
  assert.match(app, /function renderVendorBookingQueue/);
  assert.match(app, /function sendVendorBookingEmail/);
  assert.match(app, /window\.confirm/);
  assert.match(app, /setVendorIntakeMode\("REVISE"\)/);
  assert.match(preload, /vendor:booking-email-send/);
  assert.match(main, /vendor:booking-email-send/);
  assert.match(styles, /\.vendor-generate-prep-layout/);
  assert.match(styles, /\.vendor-communication-dialog/);
  assert.match(styles, /@media \(max-width: 1180px\)[\s\S]*\.vendor-generate-prep-layout/);
});

test("Vendor milestone exposes stable dashboard, two-section Inbox, Itinerary Check, and safe sync controls", () => {
  [
    "New Itinerary — Not Split",
    "Split — Not Generated",
    "Email Replied — Check Thread",
    "Upcoming Arrival Recheck",
    "Booking Register",
    "Work Inbox",
  ].forEach((label) => assert.match(html, new RegExp(label)));
  assert.match(html, /data-vendor-action="itinerary-check"/);
  assert.match(html, /id="vendor-itinerary-check-view"/);
  assert.match(html, /id="vendor-email-context-content"/);
  assert.match(app, /function loadVendorItineraryCheck/);
  assert.match(app, /data-retry-vendor-sync/);
  assert.match(app, /data-open-gmail-thread/);
  assert.match(preload, /vendor:booking-send-sync-retry/);
  assert.match(main, /vendor:booking-send-sync-retry/);
  assert.match(styles, /\.vendor-inbox-layout/);
  assert.match(styles, /\.vendor-email-popup-layout/);
});

test("Manual rates use pax categories or whole quantities and Generate follows a selectable client tree", () => {
  assert.match(app, /"Adult", "adultRateIdr"/);
  assert.match(app, /"Child", "childRateIdr"/);
  assert.match(app, /"Infant", "infantRateIdr"/);
  assert.match(app, /manualPerPaxReady/);
  assert.match(app, /Math\.round\(Number\(manualDraft\.quantity/);
  assert.match(html, /id="vendor-tree-select-all"/);
  assert.match(html, /id="vendor-tree-clear"/);
  assert.match(html, /id="vendor-tree-prepare"/);
  assert.match(app, /selectedVendorServiceIds: new Set\(\)/);
  assert.match(app, /vendor-tree-client/);
  assert.match(app, /vendor-tree-day/);
  assert.match(app, /serviceIds: preview\.selectedServiceIds/);
  assert.match(styles, /\.vendor-tree-client/);
});

test("Generate supports a single channel, full-screen package navigation, and intentional resend", () => {
  assert.match(app, /name="vendor-prep-channel"/);
  assert.match(html, /Kirim ulang \/ Ganti penerima/);
  assert.match(html, /Previous/);
  assert.match(html, /Next pending/);
  assert.match(app, /function renderVendorPreparationDetails/);
  assert.match(app, /function renderVendorCommunicationQueue/);
  assert.match(app, /function navigateVendorCommunication/);
  assert.match(app, /function resumeVendorGeneratedDrafts/);
  assert.match(app, /DRAFT READY — NOT SENT/);
  assert.match(app, /addEventListener\("cancel", async \(event\)/);
  assert.match(html, /id="vendor-tree-resume"/);
  assert.match(app, /function openVendorResendDialog/);
  assert.match(app, /resendOfAttemptId/);
  assert.match(preload, /listSendAttempts/);
  assert.match(main, /vendor:booking-send-attempt-list/);
});

test("Generate list navigation does not report false unsaved changes and cancellation stays per item", () => {
  assert.match(app, /state\.vendorCommunicationIndex < 0/);
  assert.match(app, /!state\.vendorBookingPreview\) return true/);
  assert.match(app, /No package selected/);
  assert.match(app, /STAFF_CANCELED_BEFORE_SEND/);
  assert.match(app, /Cancel sending item/);
  assert.match(styles, /#vendor-communication-work-view\[hidden\] \{ display: none !important; \}/);
  assert.doesNotMatch(html, /vendor-generated-cancel-dialog/);
});

test("Vendor follow-up keeps Day times optional and inserts a new Micro Split item at the top", () => {
  assert.doesNotMatch(html, /Start time \*/);
  assert.doesNotMatch(app, /missingStart/);
  assert.match(app, /insertAdjacentHTML\("afterbegin", vendorSplitRow/);
  assert.match(html, /name="clientTag"/);
  assert.match(appsScript, /day\.startTime && !timePattern\.test/);
  assert.match(appsScript, /"client_tag", "pax_adult"/);
});

test("Supplier readiness opens a focused child window and returns after a local save", () => {
  assert.match(html, /id="focused-supplier-close"/);
  assert.match(app, /supplierFocusContext: null/);
  assert.match(app, /initializeSupplierFocusMode/);
  assert.match(app, /openFocused/);
  assert.match(app, /completeFocused/);
  assert.match(preload, /supplier-master:focused-open/);
  assert.match(preload, /supplier-master:focused-complete/);
  assert.match(main, /openFocusedSupplierWindow/);
  assert.match(main, /supplier-master:focused-updated/);
  assert.match(styles, /\.supplier-focus-mode/);
  assert.match(styles, /\.supplier-focus-section-recipients/);
});
