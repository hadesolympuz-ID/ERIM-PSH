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

test("sidebar supports logo show-hide and independently collapsible text menu groups", () => {
  assert.match(html, /id="sidebar-toggle"/);
  assert.match(html, /data-menu-group="reservation"/);
  assert.match(html, /data-menu-group="vendor"/);
  assert.match(html, /data-menu-group="transport"/);
  assert.match(html, /data-menu-group="manager"/);
  assert.match(app, /NAVIGATION_PREFERENCE_KEY/);
  assert.match(app, /sidebarHidden/);
  assert.match(app, /toggleMenuGroup/);
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
  assert.match(html, /id="supplier-product-duplicate-dialog"/);
  assert.match(html, /Copy Product to Suppliers/);
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
  assert.match(app, /newestLocalFirst/);
  assert.match(app, /insertAdjacentHTML\("afterbegin", contractRateMarkup/);
});
