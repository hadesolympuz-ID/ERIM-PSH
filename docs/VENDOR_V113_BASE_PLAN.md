# Vendor Booking v1.1.13 Base Plan

Status: `IMPLEMENTED AND PACKAGED IN v1.1.13 — LIVE APPS SCRIPT/UAT GATE PENDING`
Recorded: 2026-07-30
Target version: `v1.1.13`
Branch: `agent/desktop-v1`
Base release: `v1.1.12`

This is the authoritative base plan for the next Vendor Booking milestone. It
compiles the confirmed owner feedback previously recorded in Section 14 of
`docs/VENDOR_V119_UAT_FOLLOWUP_NOTES.md`.

No feature in this document is considered implemented until its acceptance
gate passes. Recording this plan does not authorize sending a real email,
publishing test Supplier data, or claiming an online sync that did not occur.

Implementation result (2026-07-30):

- Desktop schema, New Itinerary, compact Generate preparation, four-channel
  completion, per-Service Cancel Generate, generated batch grid, delivery
  report, IPC contracts, and Apps Script source changes are implemented.
- All 60 automated tests, desktop syntax checks, diff hygiene, packaged ASAR
  inspection, and the isolated eight-second executable smoke gate pass.
- NSIS installer `v1.1.13` is built. Real supplier delivery and representative
  Supplier online mutation were not used for verification.
- Apps Script source deployment is still pending because this workstation has
  no authenticated Apps Script deployment binding. Do not describe Day 0 or
  manual Total Pax as centrally live until that deployment and health check
  pass.

---

## 1. Milestone outcome

Deliver five focused Vendor Booking improvements:

1. a compact and safer New Itinerary Day Wise workspace, including an optional
   pre-arrival Day 0;
2. a compact Generate preparation tree with flexible, always-visible delivery
   channels and in-place completion of missing channel details;
3. an auditable `Cancel generate` action for each individual unsent generated
   service item in the maximized Generate & Send Supplier Booking popup.
4. a service-level Booking Delivery Report that makes every booking/delivery
   state, sent time, and required next action searchable and sortable.
5. a compact spreadsheet-style Generated Batch List as the first screen after
   Generate, with scrollable rows and clear List/Previous/Next navigation.

The implementation must preserve the v1.1.12 delivery ledger, stable Service
IDs, Gmail anti-double-send controls, Supplier Rate approval states, Portal
transaction evidence, and local-first Supplier Master behavior.

---

## 2. Confirmed scope A — Vendor Booking → New Itinerary

### 2.1 Day Wise Header from posted itinerary

Current condition:

- Rebuild Dates preserves an existing local Day Wise Header by service date.
- A newly rebuilt Day starts with a blank header.
- The posted itinerary `Program`/day heading is not currently mapped
  automatically into Day Wise Header.

Required behavior:

- Extract the matching posted itinerary `Program`/day heading into Day Wise
  Header.
- Bind by explicit Day/date relationship, not only by visual text order.
- Fill an empty Day Wise Header automatically.
- Preserve a non-empty locally edited header during Rebuild Dates.
- Never copy one Day's Program into another Day when source order changes.
- Keep the source itinerary preview read-only and available for comparison.

### 2.2 Faster time entry

- When staff enters only an hour, normalize it to `HH:00`.
- Examples: `9` → `09:00`; `09` → `09:00`.
- Preserve explicitly entered minutes, such as `09:35`.
- Apply the behavior consistently to Start, Finish, Arrival, and Departure time
  fields when staff edits them.
- Keep storage and validation in normalized 24-hour `HH:MM`.
- Empty time remains valid where the field is optional.

### 2.3 Compact New Itinerary layout

- Use standard system typography rather than dashboard-sized text.
- Reduce Day-card padding, gaps, input height, textarea minimum height, labels,
  buttons, and supporting metadata.
- Keep controls touch/click safe and readable at 100% and 125% Windows scaling.
- Do not reduce contrast for validation, rate, or hotel-change warnings.

### 2.4 Date presentation

- Display operational dates as `dd/MMMM/yyyy` with a full month name.
- Keep database, Apps Script payload, comparison, and sorting values in ISO
  `YYYY-MM-DD`.
- Calendar input and visible formatted date must represent the same value.
- Do not convert dates through local timezone math that can shift the day.

### 2.5 Optional Day 0

Purpose:

Support an operational pickup before the official arrival date. Example:
arrival on 03 January at 00:10 may require a pickup entry on 02 January at
23:59 so Transport sees it before ordinary Day 1 work.

Controls:

- Place `+ Add Day 0` directly below `Day Wise & micro split`.
- Do not create Day 0 automatically.
- Allow at most one Day 0.
- While Day 0 exists, hide or disable Add and show `Delete Day 0`.
- Day 0 exposes editable date, Day Wise Header, Start/Finish time, detail,
  hotel context, and Micro Split records.

Rebuild behavior:

- Rebuild Dates preserves an existing Day 0.
- Staff may adjust the Day 0 date independently.
- Rebuild Day 1 through Departure from the reviewed Arrival/Departure dates.
- Adding, adjusting, or deleting Day 0 never renumbers or overwrites Day 1+.
- Operational sorting uses Day 0 service date, time, Day number, and stable IDs
  so the earlier pickup is visible to downstream workflows.

Delete safety:

- `Delete Day 0` removes only Day 0.
- Always require a clear confirmation.
- Use a stronger summary when Day 0 contains a date, title, time, detail, or
  Micro Split records.
- Canceling confirmation preserves all Day 0 content.
- The removal becomes permanent only when the local itinerary draft is saved;
  ordinary unsaved-change protection remains active beforehand.

### 2.6 Pax and flight fields

- Total Pax is a direct manual input controlled by staff.
- Itinerary extraction and Rebuild Dates must not overwrite manual Total Pax.
- Keep Adult, Child, and Infant fields intact in this milestone.
- Their final relationship to manual Total Pax is deliberately deferred for a
  later owner decision; do not silently derive one from the other.
- Arrival date/time and Departure date/time populate automatically from the
  posted itinerary when available.
- The extracted values remain visible, reviewable, and editable.
- Day 0 never replaces the official Arrival date/time.

---

## 3. Confirmed scope B — Generate preparation submenu

### 3.1 Compact directory tree

Visual direction:

- Use a dense Windows Explorer/CMD-style hierarchy:
  `Client → Day → Vendor service`.
- Use a standard font stack: `Segoe UI`, Arial, sans-serif.
- Target approximately 12px primary row text, 11px secondary metadata, and
  restrained 13–14px working-section headings.
- Replace visually large cards with compact rows.
- Use aligned checkboxes, square expand/collapse controls, indentation,
  folder/item cues, and continuous branch lines.
- Use a subtle selected-row background/marker.
- Render Day Wise Header in solid black in normal, selected, and disabled rows.
- Keep status, rate, and supplier-result metadata secondary and muted.

The compact tree must still show:

- Customer Code and client name;
- Day number and formatted service date;
- Day Wise Header;
- Supplier and Product/service;
- booking state, rate state, and supplier-result state;
- eligibility and selection state.

### 3.2 Always-visible delivery-channel selection

For the selected item/package, the middle Supplier/SOP panel always shows four
single-choice options:

- Email;
- WhatsApp;
- Portal;
- Other.

Rules:

- Exactly one channel is selected per supplier package.
- Do not hide a channel because its destination data is incomplete.
- Default to the explicit current/default Supplier SOP channel stored in the
  database.
- For legacy SOP data without an explicit default, use the first active channel
  in stored SOP order and label it as a fallback.
- Preserve the staff selection while the same preparation session/package is
  active.
- Changing channel refreshes recipients, destination, readiness, preview,
  snapshot, and communication sort position.
- Never carry stale recipient data from the previously selected channel.

### 3.3 Channel readiness and destinations

Every option shows its data and readiness:

- Email: all configured TO addresses and a compact CC summary. Missing TO means
  `DATA MISSING`.
- WhatsApp: recipient name and international number. Missing number means
  `DATA MISSING`.
- Portal: portal host/URL and non-secret account reference. Missing URL means
  `DATA MISSING`.
- Other: method/instruction and destination/reference. Missing instructions
  mean `DATA MISSING`.

An incomplete channel remains selectable. Generate for that package is blocked
only until the selected channel has complete valid local data.

### 3.4 Complete delivery channel popup

Selecting a `DATA MISSING` channel immediately opens a compact in-place popup.
It must not navigate away from Generate or lose tree selection, package
selection, expanded branches, search text, or scroll position.

Popup context:

- Customer Code;
- stable Supplier identity and name;
- selected channel;
- missing-field count;
- concise reason the channel is incomplete.

Channel fields:

- Email: repeatable TO, optional CC, optional BCC;
- WhatsApp: recipient name and international phone number;
- Portal: portal URL and non-secret account reference;
- Other: method/instruction and destination/reference.

Validation:

- validate email addresses;
- normalize and validate international phone format;
- validate Portal URL;
- require the channel-specific minimum destination;
- never request or store passwords, OTPs, access tokens, cookies, recovery
  codes, or payment credentials.

Actions:

- `Save locally & queue online`;
- `Cancel`;
- optional `Open exact Supplier Master` for maintenance outside the compact
  missing-field scope.

Cancel behavior:

- keep the chosen channel selected;
- keep it visibly `DATA MISSING`;
- keep Generate blocked only for that package;
- preserve all unrelated preparation work.

Save behavior:

- create/update the exact local Supplier Booking SOP and/or Recipient draft;
- record actor, time, package context, stable Supplier identity, base online
  version, and changed fields;
- use stable IDs and idempotency so repeated Save does not duplicate records;
- immediately apply the local overlay to the selected package;
- refresh the destination and readiness without page reload;
- set `READY — LOCAL PENDING ONLINE` when locally complete;
- queue the dependency-ordered Supplier publication for online synchronization;
- do not falsely mark the detail online or `SYNCED`.

Visible sync states:

- `READY — LOCAL PENDING ONLINE`;
- `SYNC QUEUED`;
- `SYNCED`;
- `CONFLICT`;
- `FAILED`.

The existing Supplier refresh must preserve local pending detail. A base-version
conflict never silently overwrites local or online values. Generate may use
complete local-pending detail, but the booking snapshot must record local
provenance and pending-online state.

---

## 4. Confirmed scope C — Generate & Send Supplier Booking popup

### 4.1 Cancel Generate positioning

Scope this action to the maximized `Generate & Send Supplier Booking` popup
opened after staff generates the selected booking items.

- Keep the left list grouped by supplier package, but expose its generated
  service items as compact child rows.
- Add a compact `Cancel generate` button beside every individual generated
  service child row.
- Keep package selection, service-item selection/preview, and Cancel action
  separate.
- Show the action only while the containing package is
  `GENERATED / DRAFT READY — NOT SENT` and no Send Attempt or external delivery
  evidence exists.
- Do not show it for a service inside Sent, Sent Pending Sync, unknown Gmail
  outcome, or any package with proven external-channel delivery.

### 4.2 Cancel confirmation and state

Before cancellation, show:

- Customer Code;
- Supplier;
- channel;
- the one exact stable Service ID and its Day/date/Product summary;
- remaining service-item count in the generated supplier package;
- explicit `NOT SENT` statement;
- explanation that this is not a supplier cancellation.

Require:

- operational reason;
- explicit final confirmation.

On confirmation:

- create an immutable `GENERATE_ITEM_CANCELED` audit event for the one selected
  Service ID with actor, time, reason, previous channel, package key, and
  before-change generated snapshot hash;
- create no Gmail Send Attempt;
- create no Gmail Message/Thread ID;
- create no Supplier Booking delivery evidence;
- create no WhatsApp/Portal/Other delivery evidence;
- create no supplier cancellation action;
- release only the one selected stable Service ID to `NOT_GENERATED`;
- make only that service selectable again in the main Generate tree;
- preserve every other generated service in the same package;
- rebuild the remaining generated package's ordered Service ID array, service
  snapshot, body, Portal transaction membership where applicable, rate
  provenance, updated time, and snapshot hash using the deterministic
  comparator;
- never retain the removed service in Subject/body, Portal evidence preview,
  attachment plan, or the next Send Attempt snapshot;
- keep the package `GENERATED / DRAFT READY — NOT SENT` when at least one
  generated service remains;
- mark the package `GENERATE_CANCELED` only when staff cancels its final
  remaining service;
- allow the released service to be corrected and generated again into the same
  supplier package or a different package/channel according to its corrected
  data.

For a combined Portal return ticket, removing one unsent segment must refresh
the Portal transaction and display the existing possible-return/transaction-
impact notice. Nothing is sent and no ticket reference is invented.

### 4.3 Popup navigation after cancellation

- Remove only the canceled service child row from its active popup package.
- Do not close the maximized workspace automatically.
- When sibling services remain, keep the same supplier package selected and
  move service focus to the next sibling; otherwise use the previous sibling.
- When no service remains, remove the empty package from the active popup batch
  and move to the next package, otherwise the previous package.
- Update both service-item and supplier-package progress counts immediately.
- Do not affect sibling services or adjacent generated packages.
- Persist per-item canceled generation history across application restart.

### 4.4 Generated Batch List landing view

After Generate finishes, the maximized `Generate & Send Supplier Booking`
popup opens on a compact `Generated Batch List`, not directly on an arbitrary
package detail.

Visual model:

- spreadsheet-style grid inspired by Excel, without attempting to reproduce
  Excel controls or appearance exactly;
- standard system font at approximately 11–12px;
- compact 30–34px package rows;
- sticky column headings;
- subtle row borders, selected-row highlight, and frozen action/navigation
  areas where practical;
- vertical and horizontal scrolling for large batches;
- no oversized cards or headings inside the grid.

Use one primary row per generated supplier package because Send/Portal/
WhatsApp/Other delivery occurs at package level. Each package row is expandable
to show its individual service-item child rows and their per-item
`Cancel generate` controls.

Primary package columns:

- sequence number;
- Customer Code;
- Client Name;
- Supplier;
- channel;
- item count;
- first/last service date;
- package status;
- action needed;
- `Open / Review`.

Expanded service child columns:

- Day;
- service date;
- Product/service;
- Day Wise Header;
- rate state;
- item generation state;
- `Cancel generate` when allowed.

### 4.5 List and detail navigation

Landing-list actions:

- `Back to Preparation`;
- `Open / Review selected`;
- `Next Pending`;
- `Close`.

Package communication-detail actions:

- `Back to List`;
- `Previous Package`;
- position indicator `Package X of N`;
- `Next Package`;
- `Next Pending`;
- existing channel-specific controlled action.

Navigation rules:

- `Previous/Next Package` follows the same deterministic package sort used at
  Generate and Resume.
- `Next Pending` skips completed or non-actionable packages.
- Returning to List preserves selected row, expanded package, scroll position,
  and filters/sort.
- Opening detail highlights the exact package row when staff returns.
- Canceling one service refreshes only its package row/item count and preserves
  list position.
- Canceling the final service removes the empty package from the active grid
  with a visible notice and selects the next available package.
- Closing and resuming generated drafts returns to the batch list rather than
  choosing a package silently.

---

## 5. Confirmed scope D — Booking Delivery Report

### 5.1 Report identity and placement

- Add a `Booking Delivery Report` list view under Vendor Booking monitoring,
  with a direct shortcut from the maximized Generate & Send Supplier Booking
  popup.
- Use one row per stable Service ID, not one row per package.
- When several service rows share one supplier email/package, show the shared
  Package/Booking reference in row detail and open the same controlled package
  workspace from each linked row.
- Never use a report-row button to bypass confirmation, Gmail preflight,
  recipient review, resend reason, reconciliation, or delivery-evidence rules.

### 5.2 Compact list columns

Primary visible columns:

- Customer Code;
- Client Name;
- service date;
- Day number;
- Product/service;
- Supplier;
- delivery channel;
- booking/delivery status;
- Sent date and time;
- contextual action.

Use `dd/MMMM/yyyy HH:mm WITA` for visible Sent time. Keep stored timestamps in
the existing ISO/UTC contract and convert only for display.

Expandable row detail:

- Day Wise Header;
- Package/Booking ID and stable Service ID;
- action type: New, Amendment, or Cancellation;
- rate/provenance state;
- destination summary: Email TO/CC, WhatsApp number, Portal host/reference, or
  Other destination;
- sender/actor;
- Gmail Message ID and Thread ID, when applicable;
- official evidence state;
- last attempt/action time;
- latest error, conflict, or pending reason;
- reply/confirmation state;
- generated, sent, and last-updated times.

### 5.3 Search, filters, and sort

Default view:

- preset `Needs Action`;
- highest-risk/most-actionable state first;
- then oldest unresolved action first;
- then service date, Supplier, Customer Code, and stable Service ID.

Free-text search must match, case-insensitively:

- Customer Code;
- Client Name;
- Supplier;
- Product/service;
- Day Wise Header;
- channel;
- status;
- destination/reference;
- Package/Booking reference.

Examples:

- typing `dinner` returns every matching Product/service or Day Wise Header;
- typing a Supplier name returns that Supplier's rows;
- typing a Customer Code returns all exact linked services.

Filters:

- action preset: Needs Action, All, Not Generated, Draft/Not Sent, Sent,
  Sync Problem, Reply/Review, Confirmed, Canceled;
- exact booking/delivery status;
- delivery channel;
- Supplier;
- service-date From/To;
- Sent-date From/To;
- has/does-not-have delivery evidence;
- has/does-not-have supplier reply.

Sort dropdown:

- Action priority;
- Booking status;
- Supplier name;
- Customer Code;
- Client Name;
- service date;
- Sent date/time, newest or oldest;
- Product/service;
- channel;
- last updated.

Show active filter chips and provide `Clear filters`. Search, filter, sort, and
expanded-row state should remain stable while staff performs an action and the
report refreshes.

### 5.4 Derived status labels

Use staff-readable derived labels without changing the underlying ledger:

- `NOT GENERATED`;
- `DRAFT READY — NOT SENT`;
- `EMAIL PREFLIGHT REQUIRED`;
- `SENT — SYNC PENDING`;
- `SENT — SYNCED`;
- `EMAIL OUTCOME UNKNOWN`;
- `EXTERNAL ACTION PENDING`;
- `EXTERNAL EVIDENCE RECORDED`;
- `REPLY — REVIEW REQUIRED`;
- `CONFIRMED`;
- `GENERATE ITEM CANCELED`;
- `AMENDMENT REQUIRED`.

Status is calculated from the stable service link, active booking snapshot,
Send Attempt ledger, external evidence, reply evidence, and official sync
state. A gray pill alone is not sufficient; the text must also appear in the
Status column and expanded detail.

### 5.5 Contextual per-item actions

Every row shows only actions valid for that exact item/state:

| Derived state | Primary action | Supporting actions |
| --- | --- | --- |
| `NOT GENERATED` | `Open Generate` | `Open itinerary item` |
| `DRAFT READY — NOT SENT` | `Review & Send` | `Cancel Generate`, `Open draft` |
| `EMAIL PREFLIGHT REQUIRED` | `Recheck Gmail` | `Reconnect Google`, `Open draft` |
| `SENT — SYNC PENDING` | `Retry Sync` | `Delivery History`, `Open Gmail` |
| `SENT — SYNCED` | `Delivery History` | `Open Gmail`, `Prepare Amendment` |
| `EMAIL OUTCOME UNKNOWN` | `Reconcile Gmail` | `Delivery History` |
| `EXTERNAL ACTION PENDING` | `Open Channel` | `Record Evidence` |
| `REPLY — REVIEW REQUIRED` | `Review Reply` | `Open Gmail`, `Delivery History` |
| `GENERATE ITEM CANCELED` | `Generate Again` | `Generation History` |
| `AMENDMENT REQUIRED` | `Prepare Amendment` | `Delivery History` |

Rules:

- A report action targets the row's stable Service ID and resolves the exact
  current package/booking before opening its workspace.
- Package-level actions such as Send, Resend, Retry Sync, or Reconcile must
  clearly show every linked service before confirmation.
- `Resend / Ganti penerima` remains inside Delivery History and is not a
  one-click report action.
- After a successful action, refresh only the affected rows/counters where
  practical and preserve report position.
- Disable the initiating button while an action is running and keep existing
  idempotency/anti-double-click protection.

### 5.6 Scale and list behavior

- Support at least 100 operational service rows without oversized cards.
- Use compact sticky column headings.
- Provide practical page sizes such as 50 and 100 rows, or equivalent
  virtualization.
- Show total result count and Needs Action count.
- Keep loading, empty, offline, failed-refresh, and stale-data states explicit.
- Do not silently remove a row after action; update its status or move it only
  when the active filter no longer includes it, with a visible confirmation.

---

## 6. Data and state changes

### 6.1 Day 0

- Desktop validation must permit `dayNumber = 0` only for the single optional
  Day 0 record.
- Apps Script validation and online Day storage must accept the same controlled
  value.
- Day 1 remains the official Arrival Day for arrival/departure flags and
  itinerary semantics.
- Day 0 uses a stable `tourDayId` and stable Micro Split Service IDs.
- Migration must not reinterpret legacy missing/invalid Day numbers as Day 0.

### 6.2 Manual Total Pax

- Add/preserve an explicit manual Total Pax value without removing
  Adult/Child/Infant fields.
- Local and online payloads must distinguish manual Total Pax from component
  pax.
- No automatic reconciliation rule is introduced in this milestone.

### 6.3 Channel detail staging

- Reuse local Supplier Master draft/version/conflict controls.
- Stage SOP and Recipient entities separately when their dependencies differ.
- Queue online publication only after valid local save.
- Use stable draft IDs and queue idempotency keys.
- Expose local provenance to Vendor preview/generation.

### 6.4 Generate cancellation

- Add an auditable item event/state `GENERATE_ITEM_CANCELED`.
- Use package terminal state `GENERATE_CANCELED` only after its final service is
  removed.
- Preserve the before-change snapshot/hash in item cancellation history and the
  rebuilt current snapshot/hash on the active package.
- Active generated-draft queries exclude canceled service links and fully
  canceled package snapshots.
- Queue eligibility derives from exact active booking-service links, not only
  from the latest package display name.

---

### 6.5 Delivery report read model

- Build the report from one service-level read model joining active
  booking-service links, generated snapshots, Send Attempts, external evidence,
  reply evidence, and Supplier/itinerary context.
- Derive effective status and available actions in the backend so renderer
  labels/buttons cannot drift from authoritative state.
- Add deterministic query/filter/sort fields and stable Service ID tie-breaker.
- Keep timestamps in ISO/UTC and return an explicit display timezone contract.

---

## 7. Required implementation sequence

1. Add failing automated tests for Day 0, manual Total Pax, Program-header
   mapping, time normalization, channel readiness, local channel completion,
   queue idempotency, and Cancel Generate.
2. Implement SQLite/schema migrations and Apps Script validation contracts.
3. Implement posted Program-to-Day mapping and New Itinerary field behavior.
4. Implement Add/Delete Day 0 and Rebuild preservation.
5. Apply compact New Itinerary typography and formatted date presentation.
6. Implement compact Generate directory tree.
7. Implement always-visible channel options and deterministic defaulting.
8. Implement the in-place channel completion popup, local overlay, and
   idempotent online queue.
9. Implement `GENERATE_ITEM_CANCELED`, one-Service-ID release, deterministic
   remaining-package rebuild, audit history, and the per-service popup action.
10. Implement the Generated Batch spreadsheet grid, expandable service items,
    preserved List/Detail navigation, and Previous/Next/Next Pending behavior.
11. Implement the service-level Delivery Report read model, filters/sort,
    expandable detail, and authoritative per-item actions.
12. Run full regression, Apps Script syntax, database migration, packaged ASAR,
    Windows scaling/visual, and isolated smoke checks.
13. Deploy a new Apps Script version before live channel-completion sync UAT.
14. Publish v1.1.13 only after automated/package gates pass; keep real external
    messages and representative Supplier Master mutations within controlled
    owner-approved UAT.

---

## 8. Milestone acceptance gates

### 8.1 New Itinerary

- [ ] Posted Program fills the matching empty Day Wise Header.
- [ ] Manual Day Wise Header survives Rebuild Dates.
- [ ] Program mapping remains correct when source order changes.
- [ ] Hour-only input becomes `HH:00`; explicit minutes remain unchanged.
- [ ] Dates show `dd/MMMM/yyyy` while stored values remain ISO.
- [ ] `+ Add Day 0` creates exactly one Day 0 only after staff action.
- [ ] Add cannot create a duplicate Day 0.
- [ ] Day 0 survives Rebuild Dates and remains independently adjustable.
- [ ] Day 0 sorts before Day 1 according to operational date/time.
- [ ] Delete Day 0 removes only Day 0 and honors Cancel confirmation.
- [ ] Populated Day 0 receives the stronger deletion warning.
- [ ] Day 1+ IDs, numbering, details, and Micro Splits remain unchanged.
- [ ] Manual Total Pax survives extraction, rebuild, save, restart, and sync.
- [ ] Adult/Child/Infant values remain intact.
- [ ] Arrival/Departure date and time match posted extraction and remain
  editable.
- [ ] Compact layout remains readable at minimum desktop width and 125% scaling.

### 8.2 Generate preparation

- [ ] Tree hierarchy is visually clear without large cards.
- [ ] Standard font sizing is consistent; Day Wise Header remains black.
- [ ] Selection, expansion, search, and scroll survive detail refresh.
- [ ] Email, WhatsApp, Portal, and Other are always visible.
- [ ] Default channel matches stored Supplier/SOP data.
- [ ] Each channel shows the correct destination and readiness.
- [ ] Selecting `DATA MISSING` opens only the relevant completion fields.
- [ ] Canceling completion loses no unrelated work.
- [ ] Local Save refreshes readiness without reload.
- [ ] One Save produces one stable local draft and one online queue item.
- [ ] Repeated clicks do not duplicate local or online queue records.
- [ ] Online success becomes `SYNCED`.
- [ ] Offline, conflict, and failed publication preserve local detail.
- [ ] Complete local-pending detail can Generate with provenance recorded.
- [ ] Switching channels carries no stale recipients or destination.
- [ ] No credentials or secrets enter local/online operational storage.

### 8.3 Cancel Generate

- [ ] Every generated/not-sent service child row has one Cancel Generate
  button.
- [ ] Selecting a package or service row never triggers cancellation.
- [ ] Confirmation shows the one exact Service ID and remaining-package impact.
- [ ] Reason and explicit confirmation are required.
- [ ] Cancellation creates no Send Attempt or delivery evidence.
- [ ] Only the selected Service ID returns to `NOT_GENERATED`.
- [ ] Every sibling service remains generated and selectable in the same popup
  package.
- [ ] Remaining Subject/body/service snapshot and hash exclude the canceled
  item and remain deterministic.
- [ ] Portal transaction membership and warnings refresh after one segment is
  removed.
- [ ] The final remaining item cancellation changes the empty package to
  `GENERATE_CANCELED`.
- [ ] The released service can be corrected and generated again.
- [ ] Adjacent services and popup packages remain unchanged.
- [ ] Service and package progress/navigation update correctly.
- [ ] Per-item canceled history survives restart.
- [ ] Sent, pending-sync, and unknown-outcome packages cannot Cancel Generate.

### 8.4 Generated Batch List

- [ ] Generate opens the maximized popup on the Generated Batch List.
- [ ] Grid uses one compact primary row per supplier package.
- [ ] Expanding a package shows every exact service child item.
- [ ] Every eligible child item exposes its own Cancel Generate action.
- [ ] Sticky headings and scrolling remain usable for 100+ service items.
- [ ] `Open / Review` opens the exact selected package detail.
- [ ] Back to List restores selected row, expansion, scroll, filter, and sort.
- [ ] Previous/Next Package follows deterministic Generate order.
- [ ] Next Pending skips completed/non-actionable packages.
- [ ] Position indicator remains correct after item cancellation.
- [ ] Canceling one item refreshes only its package membership/count.
- [ ] Canceling the final item removes only the empty package and selects a
  predictable adjacent package.
- [ ] Resume drafts returns to the batch list with the same deterministic order.

### 8.5 Booking Delivery Report

- [ ] One row represents one stable Service ID.
- [ ] Shared-package services show the same package reference without losing
  item identity.
- [ ] Default Needs Action ordering is deterministic.
- [ ] Free-text search finds Customer, Client, Supplier, Product, Day Header,
  status, destination, and reference words.
- [ ] `dinner` search returns all matching service/header rows.
- [ ] Status, channel, Supplier, service-date, and Sent-date filters work
  independently and together.
- [ ] Every approved sort uses stable Service ID as the final tie-breaker.
- [ ] Sent date/time displays in `dd/MMMM/yyyy HH:mm WITA`.
- [ ] Expanded detail shows destination, sender, evidence, IDs, errors, reply,
  and operational timestamps.
- [ ] Derived status matches the authoritative backend ledger/read model.
- [ ] Every state exposes only its valid actions.
- [ ] Row actions resolve the exact current booking/package before opening.
- [ ] Package-level action confirmation lists every linked service.
- [ ] Resend remains controlled through Delivery History.
- [ ] Successful actions refresh affected rows without losing search/filter/
  sort context.
- [ ] 100+ rows remain compact and usable at 125% Windows scaling.
- [ ] Loading, empty, offline, stale, and failed-refresh states are explicit.

### 8.6 Release

- [ ] All source and Apps Script syntax checks pass.
- [ ] Full automated regression passes.
- [ ] Fresh and migrated SQLite profiles pass.
- [ ] Packaged ASAR contains the milestone controls.
- [ ] Packaged Windows application passes isolated smoke launch.
- [ ] Apps Script deployment health returns HTTP 200 with `ok: true`.
- [ ] Connected local/online channel-detail sync UAT passes without duplicate
  Supplier SOP/Recipient rows.
- [ ] Installer, blockmap, and `latest.yml` are internally consistent.
- [ ] GitHub release digest matches the local installer digest.

---

## 9. Explicit non-goals

- Sending a real supplier email automatically during Generate.
- Storing Portal passwords or browser credentials in ERIM-PSH.
- Bulk package cancellation that silently returns all services without
  individual staff selection.
- Redefining the final relationship among Total Pax, Adult, Child, and Infant.
- Replacing Amendment, Resend, supplier Cancellation, or Gmail reconciliation
  with Cancel Generate.
- Changing non-Vendor workflow ownership.
- Implementing mobile/PWA scope in the same desktop release.
- Turning the report into a one-click Send or Resend bypass.
- Building a general analytics/export module beyond this operational list.

---

## 10. Completion definition

The milestone is complete only when:

- all five confirmed workspaces meet their acceptance gates;
- automated and packaged verification pass;
- required Apps Script changes are deployed and healthy;
- v1.1.13 updater assets are published with matching hashes;
- the progress record distinguishes completed local/package gates from any
  connected operational UAT that remains.

---

## 11. Next-step kickoff boundary

When the owner authorizes implementation, start from this exact sequence:

1. verify branch `agent/desktop-v1`, Git status, remote synchronization, and
   the v1.1.12 base release;
2. commit/push this base-plan record separately from application implementation
   if it has not yet been published;
3. create failing tests and migration/read-model contracts before renderer
   changes;
4. implement the five confirmed phases in the Required Implementation Sequence
   defined above;
5. keep each phase locally verifiable before proceeding to packaging;
6. run the complete 86-gate milestone checklist and regression suite;
7. deploy Apps Script only after source/package checks pass;
8. publish v1.1.13 only after the installer/updater/hash gates pass.

Kickoff does not authorize:

- sending a real supplier email;
- recording invented delivery evidence;
- entering representative Supplier data into the online database without a
  controlled UAT case;
- changing the approved scope without recording the owner decision.

Until the owner explicitly starts implementation, changes remain limited to
this base plan and its progress references.

---

## 12. Owner correction after v1.1.13 trial

Status: `RECORDED — FOLLOW-UP IMPLEMENTATION NOT STARTED`

Recorded from the owner's installed v1.1.13 trial on 2026-07-30. These points
correct the interpretation of the released implementation and supersede any
conflicting wording above.

### 12.1 Pax entry correction

- `Adult`, `Child`, and `Infant` are the three values staff must enter
  manually.
- Do not ask staff to enter a separate independent `Total Pax`.
- Remove the Total Pax column from the form entirely.
- When a compatibility payload or message calculation needs Total Pax, derive
  it internally as `Adult + Child + Infant`; staff never enters or edits it.

### 12.2 Visible date format correction

- The actual date presentation used by staff must visibly read
  `dd/MMMM/yyyy`, for example `03/October/2026`.
- A small formatted helper below a native date input is not sufficient while
  the primary control still displays the browser/Windows locale format.
- Database and online payload storage remain compact ISO `yyyy-MM-dd`.
- Date picking/editing must remain practical while the visible office-facing
  value uses the required long-month format.

### 12.3 Rebuild Dates and Day Wise Header correction

- Clicking `Rebuild dates` must resolve the current posted itinerary again and
  populate each matching Day Wise Header directly from that Day's `Program`.
- A Day must not remain blank when the matching posted Program is available.
- Matching must use explicit Day/date context and must never shift one Day's
  Program into another.
- The populated header remains editable after rebuild.
- An intentional non-empty manual edit remains protected; rebuild fills an
  empty or source-derived header without silently erasing a later staff edit.

### 12.4 Vendor Daily Control — Online Process Report

Add a new operational item/card to the Vendor Booking Daily Control Dashboard
for local-save and online-post processing progress.

The report must:

- create/update a process row after `Save local draft`, after a Micro Split
  autosave, and after `Post structured data online`;
- distinguish local persistence from online completion;
- show at least Customer Code, Client, action/source, latest time, progress
  state, result, and required action;
- expose explicit states such as `LOCAL_SAVED`, `QUEUED`, `POSTING`,
  `PENDING_SYNC`, `POSTED_ONLINE`, `FAILED`, and `CONFLICT`;
- never label a locally saved draft as posted online;
- retain failed/pending rows for retry and investigation;
- provide the valid contextual action, such as Open Draft, Retry Post, Review
  Conflict, or View Posted Result;
- update from the real local queue/publication result rather than a visual-only
  progress counter.

This record does not authorize implementation, a new version, Apps Script
deployment, or a real supplier communication until the owner says to proceed.

### 12.5 Generated item detail — Back to List versus Cancel Generate

Owner clarification:

- `Back to list` and `Cancel Generate item` are two different actions.
- They may be positioned together near the currently selected generated
  Service item, but they must never share the same state-changing behavior.
- Do not place `Back to list` only as a distant global header action when staff
  are working on one Service item.

Required layout:

- the selected Service-item area exposes one contextual `Cancel Generate item`
  action;
- the same local work area exposes one `Back to list` navigation action;
- if a package contains several Services, each Service has its own
  `Cancel Generate item`;
- `Back to list` appears once for the selected/detail area and is not repeated
  as though it were a per-Service business action;
- the popup header may retain batch progress and `Close`, but does not need the
  primary `Back to list` action.

Required `Back to list` behavior:

- it performs navigation only;
- it must not change `GENERATED`, delivery, Send Attempt, or evidence state;
- it clears the active detail selection/highlight for Item A;
- it clears any stale Item A detail context before another item is opened;
- after staff points to or opens Item B, the middle/right panels must show only
  Item B context;
- reopening Item A is allowed only when Item A remains an active generated
  item;
- Item A must not remain visually `ON`, selected, or active merely because it
  was the previously opened item;
- list filter, sort, expansion, and scroll context remain preserved.

Required `Cancel Generate item` behavior:

1. staff selects the exact stable Service item;
2. staff clicks `Cancel Generate item`;
3. the application requests a required revision reason and explicit
   confirmation;
4. the backend verifies that this exact Service is still `GENERATED` and has
   no delivery attempt/evidence that prohibits cancellation;
5. only that Service returns to `NOT_GENERATED`;
6. the Service is removed immediately from the active generated batch list;
7. the parent package service count and generated progress refresh
   immediately;
8. all sibling Services remain generated;
9. the remaining package Subject/body/Portal membership/snapshot hash are
   rebuilt;
10. `GENERATE_ITEM_CANCELED` is recorded with Service ID, reason, actor,
    previous hash, new hash, and time;
11. if the removed Service was the final active Service, the empty package is
    marked `GENERATE_CANCELED` and its package row disappears from the active
    generated batch;
12. the UI selects the next valid pending generated item when practical, or
    returns to the refreshed batch list when none remains.

Refresh and return rules:

- after successful Cancel Generate, the generated batch must be re-read from
  authoritative local state rather than only hiding the DOM row;
- returning to the list must therefore show the same result after reopening
  the popup or restarting the application;
- an item returned to `NOT_GENERATED` may appear again only in the Generate
  preparation tree, where staff can correct and explicitly generate it again;
- it must not reappear in the active generated batch until a new Generate
  succeeds;
- failure or conflict during cancellation keeps the item visible and shows the
  error; the UI must not pretend it was removed.

Example:

- Package P contains generated Item A and Item B.
- Opening A and clicking only `Back to list` leaves A and B generated, but
  removes A's active highlight.
- Opening A and completing `Cancel Generate item` removes A from Package P,
  returns A to `NOT_GENERATED`, preserves B as generated, and refreshes Package
  P to one active item.
- If B is later canceled successfully, Package P has no active generated item
  and disappears from the generated batch.

Acceptance checks:

- [ ] Back to List never changes business state.
- [ ] Back to List clears stale item selection and detail context.
- [ ] Opening B after A cannot display A's message, supplier, channel, or
  actions.
- [ ] Cancel Generate removes only the confirmed stable Service ID.
- [ ] Successful cancellation immediately delists that Service from the active
  generated batch.
- [ ] Sibling generated Services remain visible and unchanged.
- [ ] The final removed Service also removes the empty package row.
- [ ] Reopening/restarting reproduces the refreshed list from SQLite.
- [ ] The canceled Service is available in Generate preparation as
  `NOT_GENERATED`.
- [ ] Failed cancellation never hides the item or records a false success.

### 12.6 v1.1.14 correction implementation

Status: `IMPLEMENTED IN SOURCE — PACKAGE AND CONTROLLED UAT PENDING`

The owner authorized implementation after confirming that the Total Pax column
must be removed. The v1.1.14 source now implements:

- Adult, Child, and Infant as the only manual pax columns; compatibility Total
  Pax is derived internally and ignores any caller-supplied independent total;
- primary Vendor intake, hotel, and Day Wise date text in `dd/MMMM/yyyy`, with
  ISO conversion at the database and online boundaries;
- latest posted Program exposure and Rebuild Dates fill for blank matching Day
  Wise Headers while preserving non-empty staff edits;
- exact Product/Service-only STANDARD_V1 booking lines, excluding the broad
  multi-product Day Wise Header from supplier communications;
- Back to List inside the selected-item work area with selection/detail reset;
- per-Service Cancel Generate controls in both batch and selected detail views;
- authoritative active Generated-batch refresh after cancellation and after
  Gmail or external delivery, so Sent records move to history/report;
- a persisted Vendor Daily Control Online Process Report for local save, Micro
  Split autosave, posting, posted-online, and failed results.

Automated status:

- 60 tests pass;
- JavaScript syntax checks pass;
- `git diff --check` passes.

Remaining gates:

- [x] build and inspect the v1.1.14 Windows artifact;
- [x] run the packaged desktop smoke test;
- [x] publish the desktop updater only after artifact/hash verification;
- deploy the Apps Script source separately from the desktop release;
- use controlled UAT for representative online posting and real supplier
  delivery.

Verified package:

- installer: `release/ERIM-PSH-Setup-1.1.14.exe`;
- size: `111,083,314` bytes;
- SHA-256:
  `EA56ED59041F992903E19EF6D27F9665F27B1540D0754F993A37D06F6DF74A17`;
- ASAR reports version `1.1.14` and contains the corrected queue, date, and
  exact-product email source;
- the packaged executable stayed alive through the isolated eight-second smoke
  gate without using the staff database.
- GitHub Release `v1.1.14` is published with the installer, blockmap, and
  `latest.yml`; GitHub's installer digest matches the verified local SHA-256.

### 12.7 v1.1.15 navigation and pre-send cancellation hotfix

Owner trial exposed two connected UI-state faults in v1.1.14:

- returning to the batch list set the active package index to `-1`, but the
  hidden work panel remained in the CSS grid and rendered `Package 0 of N`;
- stale hidden message fields were compared against an empty baseline, causing
  Back, Previous, Next, Close, and window-close to all show the same false
  Unsaved warning.

The hotfix contract is:

- dirty checking runs only while a real package detail is open and selected;
- returning to list clears stale recipients, subject, body, preview, selection,
  and establishes a clean list baseline;
- hidden batch/work views use `display: none !important`;
- list mode displays `No package selected`, not `Package 0`;
- Previous and Next remain disabled without an active package;
- a genuine staff edit to Action, Recipients, Subject, or Body still receives
  the save/discard protection.

Owner terminology and flow:

- rename the staff action to `Cancel sending item`;
- use one standard `Are you sure?` confirmation;
- OK returns only that stable Service ID to `NOT_GENERATED` and delists it from
  the active sending queue;
- Cancel makes no change;
- use automatic audit reason `STAFF_CANCELED_BEFORE_SEND`, so staff does not
  fill a second reason form;
- preserve backend security: the Service must still be `GENERATED`, have no
  Send Attempt or delivery evidence, and belong to the exact booking/package;
- siblings remain generated and the remaining snapshot/hash are rebuilt.

Automated status:

- 61 tests pass, including a dedicated false-unsaved/navigation regression;
- syntax and diff checks pass;
- Windows installer, ASAR content, and isolated eight-second packaged-app smoke
  gate pass.
- installer: `release/ERIM-PSH-Setup-1.1.15.exe`;
- size: `111,083,225` bytes;
- SHA-256:
  `30E0F1639434C2253120963D4AAADF50DFEE7EF34516ABA415E0ADF1671E6E1C`;
- GitHub Release `v1.1.15` is published as Latest with installer, blockmap, and
  `latest.yml`; GitHub's installer digest matches the local verified SHA-256.

### 12.8 v1.1.16 legacy Generated-message migration

Owner retest showed a Day Wise `Header:` inside messages that had already been
Generated before the exact-product template correction. This is persisted
snapshot data, not output from the corrected generator.

The compatibility migration:

- runs when a booking snapshot is read;
- applies only when `communication_status = GENERATED`;
- refuses to mutate any booking that has a Send Attempt;
- removes only the legacy `| Header: ...` segment on a `- Day ...` line;
- retains the following exact Product/Service and operational context;
- recalculates `current_snapshot_hash` using the existing Service IDs, channel,
  recipients, subject, and cleaned body;
- updates the stored draft so Send cannot use the hidden legacy body;
- records `VENDOR_GENERATED_BODY_MIGRATED` with old/new hash and Service count;
- never rewrites `SENT`, `SENT_PENDING_SYNC`, `SEND_OUTCOME_UNKNOWN`, or other
  delivery history.

Automated status:

- 62 tests pass, including generated-not-sent migration and sent-history
  immutability;
- syntax and diff checks pass;
- v1.1.16 Windows package, ASAR, and isolated eight-second smoke gate pass;
- installer: `release/ERIM-PSH-Setup-1.1.16.exe`;
- size: `111,083,432` bytes;
- SHA-256:
  `02A9EEBB62FE0286CEDCA2BA2CF29673ADE19AD66244882E153E0F39C0818F28`;
- GitHub Release `v1.1.16` is published as Latest with installer, blockmap, and
  `latest.yml`; GitHub's installer digest matches the local verified SHA-256.

### 12.9 Follow-up patch backlog — Point 1: booking-facing date format

Status: `RECORDED — NOT IMPLEMENTED`

Owner retest confirmed that the maximized Generate & Send Supplier Booking
workspace still exposes ISO service dates. All staff-visible and
supplier-facing service dates in this workflow must use the unambiguous
`dd/MMMM/yyyy` presentation with English full month names, for example
`30/September/2026`.

The required presentation change covers:

1. the editable Booking message in the middle panel;
2. the generated final-message preview in the channel panel;
3. each generated Service summary card/list row;
4. any other Package/Day label in this communication workspace that exposes a
   service date.

The generated service context must therefore read, for example,
`- Day 4 | 30/September/2026`, rather than
`- Day 4 | 2026-09-30`.

This is a presentation/template correction only:

- SQLite values, chronological sorting, snapshot service data, portal grouping,
  Apps Script payloads, and other machine contracts remain ISO `yyyy-MM-dd`;
- Subject formatting is unchanged unless a date is explicitly introduced into
  the Subject by a later approved template;
- new snapshots must use the corrected display format consistently in the
  editor and preview;
- existing `GENERATED — NOT SENT` snapshots containing ISO dates require a
  safe compatibility/regeneration decision during implementation;
- `SENT`, delivery history, and immutable attempt evidence must never be
  rewritten only to change date presentation.

Minimum UAT must cover a September/October boundary, a multi-day Portal package
containing outbound and return services, exact consistency between editor,
preview, and Service cards, unchanged chronological sort order, and immutable
Sent history.

### 12.10 Follow-up patch backlog — Point 2: recoverable orphan Generated items

Status: `ROOT CAUSE CONFIRMED — RECORDED, NOT IMPLEMENTED`

Owner retest found two TOC items, `PANDAWA` and `ULUWATU - KECAK`, that remain
in the Generated batch but cannot be removed with `Cancel sending item`.

The live SQLite audit confirmed:

- the stored booking package is still `GENERATED`;
- both stored Service rows are `REQUIRED`;
- there is no Send Attempt, Gmail evidence, external reference, or cancellation
  event for either item;
- the booking was generated on 29 July 2026 from package `NAME:TOC`;
- both stored stable Service IDs are now absent from the active
  `vendor_service_splits` source.

This makes the booking an orphan Generated snapshot, most likely after the
underlying itinerary/Micro Split was rebuilt or replaced. The existing cancel
handler first validates the stored booking correctly, but then calls the normal
preview generator to rebuild the remaining package. That generator requires the
old package and every requested Service ID to still exist in the current
Micro Split queue. The orphan therefore fails before its cancellation tombstone
can be committed.

Required correction:

1. `Cancel sending item` for a `GENERATED`, not-sent booking must use the stored
   booking and stored Service snapshot as its authority; it must not require the
   original live Micro Split row merely to release the draft.
2. The mutation remains restricted to the exact stable Service ID and must stay
   blocked after any Send Attempt or delivery evidence exists.
3. If siblings remain, rebuild package membership, body, evidence metadata, and
   snapshot hash deterministically from the remaining stored snapshots inside
   one transaction.
4. If the final item is canceled, move the booking to `GENERATE_CANCELED`, clear
   its active generated content, and remove the package from the active batch.
5. Write the existing immutable `GENERATE_ITEM_CANCELED` event with actor,
   reason, before/after hash, and explicit recovery provenance such as
   `ORPHAN_SOURCE_RELEASE`.
6. After authoritative success, reload the SQLite-backed queue and immediately
   delist only the canceled row. A failed transaction leaves the row and its
   previous snapshot unchanged.
7. Repeated clicks or stale UI events must be idempotent: report
   `already returned to NOT GENERATED` and refresh, rather than create duplicate
   tombstones or a generic failure.

Prevention and recurrence handling:

- reconcile every active Generated package against the current Micro Split
  Service IDs when the batch is loaded or refreshed;
- reconcile the complete active parent chain for every stored Service:
  Micro Split Service → Supplier → Product → Contract/Rate where applicable;
- visibly label missing/changed source rows as
  `SOURCE CHANGED — REVIEW BEFORE SEND`;
- distinguish the exact dependency condition instead of using one generic
  orphan label:
  `SERVICE SOURCE MISSING`, `SUPPLIER MISSING`, `SUPPLIER ARCHIVED`,
  `PRODUCT MISSING`, `PRODUCT ARCHIVED`, `CONTRACT/RATE ARCHIVED`, or
  `PARENT RELATION CHANGED`;
- never allow an orphan/stale snapshot to be sent silently;
- keep per-item `Cancel sending item` available for every orphan that has no
  Send Attempt;
- offer a separate controlled Review/Regenerate path when a current replacement
  Service can be identified; never relink by Product name alone;
- show a specific blocking reason and valid next action when a Send Attempt
  exists, rather than presenting a button that can only fail;
- surface orphan/stale Generated counts in Daily Control/Online Process Report
  so abandoned drafts do not remain hidden indefinitely;
- preserve Sent history and delivery evidence as immutable even when its source
  itinerary is later rebuilt.

Generated-list parent-integrity guard:

1. The active Generated batch list must never hide or blank a row merely because
   its live Supplier/Product parent is missing or archived.
2. Continue displaying the immutable stored snapshot label, Supplier name,
   Product name, Customer/Day/date, and stable IDs so staff can identify what
   was originally generated.
3. Replace the normal actionable state with
   `PARENT CHANGED — REVIEW REQUIRED` and show the exact broken/archived parent.
4. Recheck the parent chain when the list opens, when Supplier Master changes,
   and again immediately before Send.
5. A parent-integrity failure blocks Send but does not automatically cancel,
   relink, regenerate, restore, or archive anything.
6. Valid per-item actions are:
   - `Review stored snapshot`;
   - `Open Supplier/Product Master`, including an exact archived record when it
     still exists locally;
   - `Cancel sending item` and return the Service to correction/rebuild;
   - a role-controlled `Reactivate parent` where the master workflow permits;
   - a controlled `Continue with stored snapshot` only after explicit
     Manager/Admin confirmation, a displayed before/current comparison, and an
     immutable override reason.
7. Relinking to another Supplier/Product is a content change. It must cancel the
   existing Generated item, correct the Micro Split, and create a new snapshot;
   it must never modify the Generated snapshot in place.
8. Archived is not treated as deleted: the application retains and exposes its
   historical label/ID and archive status.
9. Parent-integrity issues appear in Needs Action and Daily Control with filters
   for missing/archived Supplier, Product, and Rate dependencies.
10. Sent/history rows remain readable from their immutable snapshots and are
    never reclassified as unsent merely because a master record is archived
    later.

Minimum UAT:

1. cancel the first of two orphan Generated items and retain only the sibling;
2. cancel the final orphan and remove its package;
3. restart the application and prove both releases persist;
4. repeat a stale cancel event without duplicate audit data;
5. simulate one valid current Service plus one deleted source Service;
6. rebuild itinerary dates/splits after Generate and show the stale-source
   warning before Send;
7. confirm a package with any prepared/accepted Send Attempt cannot be released;
8. confirm atomic rollback after an injected snapshot/hash rebuild failure;
9. confirm unrelated packages and current Micro Split rows are unchanged;
10. confirm Daily Control exposes the stale/orphan state and recovery result;
11. archive Supplier after Generate and block Send with the exact reason;
12. archive Product after Generate and preserve its stored snapshot label;
13. archive Contract/Rate and expose the dependency without changing price
    history;
14. delete/miss one parent and keep the Generated item visible and recoverable;
15. reactivate the exact parent and clear the guard after authoritative refresh;
16. cancel/rebuild through a replacement parent without mutating the old
    snapshot;
17. approve Continue with stored snapshot only through Manager/Admin reasoned
    override;
18. archive a parent after Sent and preserve immutable delivery history.

### 12.11 Follow-up patch backlog — Point 3: continuous Process mode

Status: `RECORDED — NOT IMPLEMENTED`

The generated-batch spreadsheet/list design remains approved. The owner needs
one additional primary action in its top header:

`Process`

This button starts a continuous delivery work session instead of requiring
staff to open every package through its individual `Review` button.

Required behavior:

1. `Process` opens the first actionable Generated package using the existing
   authoritative deterministic SOP/channel/package sort order.
2. It enters the same detailed channel-adaptive delivery workspace used by
   package Review; it does not create a second sending implementation.
3. Email opens its Gmail Send/evidence controls, while WhatsApp, Portal, and
   Others open their corresponding external-action/evidence panels.
4. Sending or recording one package must not automatically return staff to the
   generated-batch spreadsheet.
5. After an authoritative result, keep the detailed workspace open and move to
   the next actionable package through a prominent `Next pending` action.
6. `Previous` and `Next pending` navigate the same stable Process session;
   neither action sends automatically.
7. `Back to list` remains available whenever staff wants the overview. Returning
   to the list must preserve expansion, scroll position, filters, and the last
   active package.
8. The existing package-level `Review` button remains available for opening one
   exact package without changing the batch order.
9. The header action should expose useful progress, preferably
   `Process (N pending)`, and becomes disabled with an explicit
   `No actionable package` state when none remain.
10. Successfully Sent/recorded or per-item canceled rows are removed from the
    active pending sequence after authoritative SQLite refresh, while remaining
    visible in the appropriate Delivery Report/history.
11. Blocked packages are never skipped silently. The workspace must show the
    exact reason and permitted action; `Next pending` may continue to the next
    actionable package while the blocked package remains in Needs Action.
12. Closing the popup or application preserves all generated unsent snapshots.
    Resume returns to the batch list with the Process control and current
    progress, not directly to an arbitrary package.

The intended operating loop is:

`Generated batch list → Process → package/channel workspace → Send or record
evidence → Next pending → next package`

This is a guided manual sequence only. It must never become bulk send,
automatic Gmail send, or automatic external-channel confirmation.

Minimum UAT:

1. start a mixed Email/WhatsApp/Portal/Others batch with the top Process button;
2. prove the first package follows the deterministic channel/SOP sort;
3. complete one Email package and continue directly to Next pending;
4. complete an external-channel package and continue without returning to list;
5. navigate Previous/Next without sending;
6. encounter a blocked package, expose its cause, and continue safely;
7. return to list and preserve the previous list context;
8. cancel one Service during Process and refresh only the affected package;
9. close/reopen and resume with the correct remaining count;
10. reach zero actionable packages without `Package 0 of N`, stale detail, or
    false unsaved-change warnings.

### 12.12 Follow-up patch backlog — Point 4: compact Generate preparation tree

Status: `RECORDED — NOT IMPLEMENTED`

The Generate preparation left panel must be restyled as a compact
Windows Explorer-style directory tree. Its authoritative hierarchy is:

`Customer Code → Daywise → Vendor Service`

Grouping and row contract:

1. The root node is one Customer Code. Customer name and Client Tag/occasion
   remain available as smaller secondary context, not as an oversized heading.
2. The second level is the exact Daywise node, sorted by Day number and service
   date. Its compact label includes Day number, `dd/MMMM/yyyy`, and a clearly
   readable Day Wise Header.
3. The leaf level is one stable Vendor Service ID. Its primary label exposes
   the exact Product/Service and Supplier without replacing Product with the
   broad Day Wise Header.
4. Booking, rate, Supplier readiness, and draft state remain visible as compact
   secondary text or restrained status markers.
5. Customer and Day nodes are collapsible using familiar disclosure controls,
   connector lines, indentation, and folder/leaf visual hierarchy comparable to
   Windows Explorer.
6. Use standard compact desktop typography and row height; avoid large cards,
   excessive blank space, oversized headings, and repeated labels.

Interaction requirements:

- Customer, Day, and eligible Service checkboxes retain the existing
  descendant-selection behavior;
- only eligible normalized Vendor Service leaves can be selected for Generate;
- partial parent selection must be visibly distinct from fully selected and
  unselected;
- filtering by Customer, Day, Supplier, Product, or free word keeps matching
  leaves visible together with their Customer/Day ancestors;
- clearing the filter restores the staff's previous expansion state;
- `Select all eligible`, Clear, selected count, `Generate Booking`, Resume
  Draft, and exact Open actions remain available;
- Generate uses stable selected Service IDs and the existing deterministic
  regrouping/sorting contract;
- refresh after Generate, Cancel sending, source change, or local Supplier
  completion updates only the affected branches where possible and preserves
  scroll/selection/expansion context;
- Customer roots sort by Customer Code; Day nodes sort by Day number then ISO
  service date; Service leaves use the existing stable service sort;
- the tree must remain usable for 100+ Service leaves with one panel scrollbar
  and no nested horizontal overflow.

Suggested compact visible form:

```text
▾ ND/PSHBALI7661
  ▾ Day 3 · 29/September/2026
    ├─ [ ] Product A · Supplier X
    └─ [ ] Product B · Supplier Y
  ▸ Day 4 · 30/September/2026
```

Minimum UAT:

1. multiple customers with repeated Day numbers stay in separate roots;
2. multiple Services on one Day remain individually selectable;
3. parent checkbox correctly selects only eligible descendant leaves;
4. partial parent state survives collapse and expand;
5. keyword search for Product, Supplier, and Day Header reveals full ancestry;
6. clear search restores previous expansion and scroll context;
7. Resume Draft opens the exact stored package without changing selections;
8. Cancel one generated item and refresh only its corresponding branch;
9. verify `dd/MMMM/yyyy` at the Day node while database sorting remains ISO;
10. verify compact and responsive operation with at least 100 Service leaves.

### 12.13 Follow-up patch backlog — Point 5: controlled Reset Daywise

Status: `OWNER CLARIFIED — RECORDED, NOT IMPLEMENTED`

Add a secondary `Reset Daywise` button beside the existing `Rebuild dates`
control in Vendor Booking → New Itinerary.

The owner clarified that Reset Daywise is an intentional full restart of the
Daywise working area when correcting individual rows would be slower or more
confusing.

Reset scope:

- remove every local Day row, including an explicit Day 0;
- remove every Day date, Day Wise Header, Start/Finish, pasted detail, and
  Day-level working state;
- remove every linked Micro Split row, stable Service ID, Supplier/Product/Rate
  selection, quantity, and local split detail;
- cancel and delist every Generated-but-not-sent booking draft that depends on
  those Services;
- preserve only the itinerary-level source and identity needed to start again:
  Customer Code/name, Client Tag, Adult/Child/Infant, Arrival/Departure and
  flights, hotel source, Drive/source revision reference, and itinerary preview;
- after Reset, staff explicitly clicks `Rebuild dates` to reconstruct fresh Day
  rows from Arrival/Departure and the latest posted itinerary.

Reset does not post or queue a replacement online automatically. Daily Control
must show `LOCAL DAYWISE RESET — REBUILD/REPOST REQUIRED` until the replacement
Daywise is saved and, when applicable, posted again.

Hard safety gate:

- if any affected Service/package has a recorded delivery, Reset is forbidden;
- recorded delivery includes `SENT`, `SENT_PENDING_SYNC`,
  `SEND_OUTCOME_UNKNOWN`, a prepared Send Attempt whose final outcome is not
  safely proven absent, a Gmail message/thread ID, external-channel evidence,
  Portal/WhatsApp/Other booking reference, or equivalent immutable delivery
  ledger;
- the entire reset is blocked rather than deleting only the unsent remainder;
- the blocking notice identifies the affected Customer, Supplier/Product, sent
  time/evidence state, and provides Open Delivery Report/Open Gmail Thread where
  applicable;
- Sent and delivery evidence remain immutable.

Generated snapshots with no Send Attempt or delivery evidence do not block the
reset. They are atomically moved to `GENERATE_CANCELED`, delisted from the
active batch, and audited before their underlying Service rows are removed.

The action requires a blocking confirmation dialog:

```text
Reset all Daywise data for {Customer Code}?

This will remove:
- {N} Day rows, including Day 0 when present
- {N} Micro Split items
- {N} Generated drafts that have not been sent

Customer, flight, pax, hotel, and source-itinerary data will remain.
You must run Rebuild dates afterward.

[OK] [Cancel]
```

Behavior:

1. `Cancel` closes the prompt and changes nothing.
2. Before showing the final confirmation, the backend performs the authoritative
   delivery-ledger safety check; the UI count alone is never sufficient.
3. `OK` performs one atomic local transaction in dependency order: cancel
   eligible Generated drafts, record cancellation/reset evidence, remove
   Micro Split rows, then remove Day rows.
4. Write one auditable `VENDOR_DAYWISE_RESET` event with Customer Code,
   affected Day/Service/booking IDs and counts, actor, time, source revision,
   previous snapshot hash, and reason `STAFF_FULL_DAYWISE_RESTART`.
5. Successful reset refreshes only the current New Itinerary workspace,
   displays a clear completion notice, and leaves a prominent
   `Rebuild dates` next action.
6. Failure rolls back every booking, Service, Day, event, and status change;
   partial reset is forbidden.
7. Repeated Reset on an already-empty Daywise is idempotent and reports
   `Daywise is already empty`.
8. Rebuild creates new stable Day/Service identities; removed Service IDs must
   never be reused or silently relinked by Product name.
9. Existing central/online Daywise data is not silently deleted. The local
   reset remains visibly pending rebuild/repost until staff completes the
   controlled online publication flow.

Minimum UAT:

1. Cancel the confirmation and prove no value changes;
2. reset several Days, Day 0, Micro Splits, and Generated drafts with no attempt;
3. prove all affected Generated drafts are delisted and audited;
4. preserve Customer, pax, flight, hotel, and itinerary-source data;
5. run Rebuild Dates afterward and create fresh Day rows;
6. confirm old Day/Service IDs are not reused;
7. repeat Reset and receive an idempotent already-empty result;
8. inject a database failure and prove complete atomic rollback;
9. block Reset for Gmail `SENT`;
10. block Reset for `SENT_PENDING_SYNC` and `SEND_OUTCOME_UNKNOWN`;
11. block Reset for Portal/WhatsApp/Other external evidence;
12. block Reset for a prepared attempt whose outcome is ambiguous;
13. show the exact blocking delivery and its valid evidence/history action;
14. show Daily Control `REBUILD/REPOST REQUIRED` after successful reset;
15. restart the app and confirm the reset, audit, and blocking rules persist.

### 12.14 Follow-up patch backlog — Point 6: efficient Gmail send critical path

Status: `CURRENT BOTTLENECK CONFIRMED — RECORDED, NOT IMPLEMENTED`

Owner UAT found that the Send Email button remains in `Sending...` for too long.
The source audit confirmed that the current foreground path performs:

1. a renderer Gmail and central-readiness preflight;
2. the final confirmation;
3. a second backend Gmail and central-readiness preflight;
4. immutable Send Attempt preparation;
5. the Gmail API send;
6. local Gmail Message/Thread ID persistence;
7. synchronous Apps Script evidence publication;
8. a broad application refresh;
9. return to the generated batch list.

The duplicate preflight, synchronous central evidence call, and broad refresh
extend perceived Send time beyond the Gmail operation itself.

Required optimized critical path:

`final authoritative pre-send validation → immutable PREPARED ledger →
Gmail send → persist Gmail Message/Thread ID as SENT_PENDING_SYNC →
immediate staff acknowledgement/Next pending`

Efficiency contract:

1. Keep exactly one authoritative backend pre-send validation at the final Send
   boundary. The renderer readiness card may use a recent cached result for
   display but cannot authorize Send.
2. The final check must still validate the exact connected employee Gmail
   account, usable OAuth session/token, TO recipient, unchanged snapshot hash,
   current booking state, and absence of another active attempt.
3. Central/Apps Script readiness is displayed separately and must not delay or
   block Gmail when Gmail itself is valid. Its result controls evidence-sync
   state, not whether the supplier email may leave.
4. Preserve the immutable `PREPARED` Send Attempt before the Gmail network call,
   unique active-attempt constraint, disabled Send button, and double-click
   protection.
5. As soon as Gmail returns both Message ID and Thread ID, persist them
   transactionally, mark the booking `SENT_PENDING_SYNC`, and release the UI
   from the Sending state.
6. Start official Apps Script evidence sync through the persistent background
   queue. Success promotes the booking to `SENT`; failure remains visible as
   `SENT_PENDING_SYNC` and retries only evidence sync, never Gmail.
7. Replace the broad foreground `refresh()` with an exact affected-booking/
   package refresh. Other Dashboard/Inbox refreshes may run asynchronously.
8. Integrate Patch Point 3: after Gmail acceptance, keep Process mode open and
   enable `Next pending`; do not force staff back to the batch list.
9. Never report `Email sent` before Gmail Message/Thread ID has been durably
   stored locally.
10. Gmail timeout or broken connection after PREPARED becomes
    `SEND_OUTCOME_UNKNOWN`; it must never trigger an automatic Gmail retry.

Staff-visible stages:

- `Checking Gmail...`
- `Locking booking snapshot...`
- `Sending via Gmail...`
- `Email accepted by Gmail`
- `Evidence syncing in background` or `Evidence synced`

Progress checklist presentation:

- reuse the clear progress/check pattern already used by Supplier Master;
- show one persistent row for each stage:
  `Gmail connection`, `Snapshot locked`, `Gmail delivery`,
  `Local evidence saved`, `Central evidence sync`, and `Package refreshed`;
- each row has one explicit state:
  `WAITING`, `RUNNING`, `DONE`, `FAILED`, `SKIPPED`, or `BLOCKED`;
- completed rows retain a visible check mark and completion time;
- the active row shows an in-progress indicator without hiding previously
  completed stages;
- failed/blocked rows show a short safe error, attempt number, last attempt
  time, and only the actions valid for that exact stage;
- progress is derived from the persisted Send Attempt/booking/background job,
  not from temporary renderer state, so closing/reopening shows the same truth;
- a compact overall progress indicator may remain visible while staff continues
  to another package, making background evidence sync observable.

Failure action matrix:

1. Gmail connection/preflight failure:
   `Retry check` or `Skip for now`.
2. Local snapshot/ledger failure before Gmail:
   `Retry preparation` or `Skip for now`; no email has left.
3. Gmail definitively rejects the request before acceptance:
   expose a controlled user-confirmed `Retry send` only when the backend can
   prove Gmail did not accept the message.
4. Gmail outcome is ambiguous:
   mark `BLOCKED — OUTCOME UNKNOWN`; allow only `Recheck/Reconcile` or
   `Skip for now`. Never offer automatic Retry send.
5. Gmail accepted but local Message/Thread evidence cannot be committed:
   keep the attempt blocked for recovery/reconciliation; never resend.
6. Gmail accepted and central sync fails:
   show `Retry evidence sync` or `Skip for now`. Retry calls only Apps Script
   and never Gmail.
7. Package refresh fails after durable Gmail acceptance:
   show `Retry refresh` or `Skip for now`; the email remains Sent.

`Skip for now` semantics:

- Skip advances the Process session to the next actionable package;
- it does not delete the Send Attempt, change Failed/Blocked into Done, discard
  evidence, mark an email as Sent, or silently cancel the package;
- the skipped issue remains in Needs Action, Delivery Report, and the progress
  monitor with its exact recovery action;
- staff can reopen it later from the list/report;
- an intentional Resend remains a separate user interaction requiring proven
  original delivery, recipient review, reason, and final confirmation. It is
  never a generic retry button for a failed stage.

The UI must remain responsive, but navigation away from a PREPARED in-flight
attempt must show its exact state. Repeated clicks, window close, or application
restart cannot create a second send.

Performance and observability:

- record local monotonic duration for preflight, ledger preparation, Gmail API,
  local acceptance persistence, evidence sync, and UI refresh;
- do not log recipients, body, OAuth data, or other message content in
  performance telemetry;
- local processing overhead before/after the Gmail network call should target
  less than 500 ms on the supported office PC;
- UI acknowledgement should occur within 500 ms after a successful Gmail API
  response and local evidence commit;
- network duration is reported separately so staff can distinguish Gmail delay
  from central-sync delay;
- use bounded timeouts with explicit state transitions, never an indefinite
  spinner.

Minimum UAT:

1. prove only one authoritative final Gmail preflight occurs per Send;
2. send with central sync healthy and persist one Message/Thread ID;
3. send with central sync slow/unavailable and release UI at Gmail acceptance;
4. retry pending evidence without a second Gmail call;
5. double-click Send and create exactly one Send Attempt/email;
6. close the popup during Gmail in-flight and recover the same attempt;
7. restart after Gmail acceptance but before evidence sync and resume sync only;
8. simulate Gmail timeout and enter `SEND_OUTCOME_UNKNOWN` without auto-retry;
9. change snapshot or TO after readiness check and block at final validation;
10. confirm exact package refresh and immediate Next pending navigation;
11. verify stage timings contain no recipient/body/token data;
12. close/reopen during every stage and reconstruct the same checklist state;
13. Retry each safely retryable stage without repeating completed stages;
14. Skip each failed/blocked stage and retain it in Needs Action;
15. prove central-sync Retry never calls Gmail;
16. prove ambiguous outcome never exposes automatic Retry send;
17. test a mixed 50-package Process session without accumulating full-refresh
    delays after each accepted email.

### 12.15 Follow-up patch backlog — Point 7: cross-PC Approval Center

Status: `OWNER DIRECTION CONFIRMED — RECORDED, NOT IMPLEMENTED`

Add a Manager/Admin submenu:

`Manager / Admin → Approval Center`

The initial queue is `Supplier Contract/Rate Approvals`. The architecture must
support maker and checker working on different PCs.

Cross-PC authority model:

1. Staff saves a Contract/Rate draft locally as `LOCAL_ONLY`.
2. `Request approval` creates the local immutable approval snapshot and sends a
   central request through Apps Script.
3. The central request contains the normalized Contract/Rate payload, snapshot
   hash, Supplier/Product/Contract IDs and readable labels, previous central
   version/hash, before/proposed values, validity, maker identity, request
   reason, evidence reference, affected-booking references, origin device ID,
   and timestamps.
4. Never include OAuth tokens, passwords, local filesystem paths, Gmail body,
   or unrelated local database content.
5. The Manager PC loads the central Approval Queue; it never needs direct access
   to the staff PC or its SQLite file.
6. The Manager decision applies only to the exact central snapshot hash.
7. The staff PC polls approval state on app start, Supplier Master open, Sync
   Center refresh, and a bounded background interval.

Approval Center layout:

- top counts: Pending, Changes requested, Approved waiting sync, Failed/conflict;
- searchable/filterable compact table:
  `Requested | Supplier | Product | Contract | Old Rate | Proposed Rate |
  Difference | Validity | Maker | Status | Action`;
- detail view shows full old-versus-proposed field diff, source/evidence link,
  affected bookings, dependency state, overlap/validity warnings, request
  reason, maker identity, and snapshot hash;
- actions:
  `Approve`, `Request changes`, `Reject`, and `Open evidence`;
- Manager cannot edit price values inside the approval decision. Data correction
  returns to the maker through Request Changes.

Maker-checker and permission rules:

- only Manager/Admin may decide;
- the maker cannot approve the same snapshot, even when the maker also has an
  administrative role;
- Approve is disabled until required evidence and dependencies are readable;
- Request Changes and Reject require a reason;
- every request/decision is centrally and locally audited with employee email,
  employee ID, time, decision, reason, and snapshot hash.

Status lifecycle:

`LOCAL_ONLY → APPROVAL_REQUESTED → APPROVED_TO_SYNC → SYNCING → SYNCED`

Alternative branches:

- `APPROVAL_REQUESTED → CHANGES_REQUESTED → LOCAL_ONLY/new snapshot`;
- `APPROVAL_REQUESTED → REJECTED`;
- payload changes after request:
  `CANCELED_PAYLOAD_CHANGED → LOCAL_ONLY/new request`;
- approved snapshot conflicts with a newer central version:
  `APPROVED_TO_SYNC → VERSION_CONFLICT → REVIEW_REQUIRED`.

Cross-PC completion:

1. Normal path: approval is recorded centrally; the originating staff PC pulls
   `APPROVED_TO_SYNC`, queues the exact local draft, and resumes its blocked
   publish session without repeating already-synced items.
2. The staff PC does not need to remain open while the Manager reviews.
3. If the staff PC later reconnects, it must validate that its local payload
   still matches the approved hash before publishing.
4. If the originating PC is unavailable, Manager/Admin may use
   `Take over approved sync`. This imports only the centrally stored approved
   snapshot into a controlled publish session on the Manager PC.
5. Takeover requires confirmation, records both origin and takeover devices/
   actors, revalidates Supplier/Product dependencies and central record version,
   and publishes only the approved hash.
6. A successful central publish is pulled back by every PC on its next Supplier
   Master refresh; the original local draft becomes `SYNCED` when its entity ID
   and approved hash are confirmed online.
7. Approval itself must not be confused with publication. The UI displays
   `Approved — waiting sync`, `Syncing`, or `Synced` separately.

Offline behavior:

- a request that cannot reach Apps Script remains
  `LOCAL_PENDING_APPROVAL_SYNC` and is not yet visible to Manager;
- staff sees `Manager cannot see this request yet` with Retry request sync;
- Manager decisions already stored centrally remain durable while the staff PC
  is offline;
- no device may invent central approval from a local-only status.

Publish/conflict presentation:

- an unapproved Contract/Rate must become an item-level
  `BLOCKED_APPROVAL`, not a generic remote-method error;
- the publish session continues safe unrelated items;
- the blocked row identifies Supplier, Product, Contract, Rate, validity, and
  current approval status with exact Request/Open/Resume actions;
- `VERSION_CONFLICT` remains distinct from `APPROVAL REQUIRED`;
- after approval, Resume/Takeover continues only remaining dependency-safe
  stages.

Minimum UAT:

1. staff PC requests approval and Manager PC sees the exact snapshot;
2. Manager PC approves and staff PC receives `APPROVED_TO_SYNC`;
3. maker with Manager/Admin role cannot approve their own snapshot;
4. Request Changes returns reason and exact record link to staff;
5. staff edit after request invalidates the old approval hash;
6. Manager approves while staff PC is closed, then staff resumes later;
7. Manager takes over approved sync while origin PC is unavailable;
8. two PCs attempt Resume/Takeover and publish the approved hash once;
9. newer central version creates VERSION_CONFLICT rather than overwrite;
10. request offline remains visibly local and invisible to Manager;
11. evidence permission failure blocks decision with a clear reason;
12. unrelated publish-session items continue around BLOCKED_APPROVAL;
13. all PCs reconcile to SYNCED after central readback;
14. audit identifies maker, checker, origin/takeover device, and exact hash;
15. verify no token, password, local path, or unrelated data enters the central
    approval record.

### 12.16 v1.1.17 implementation result

Implemented and locally verified:

- booking-facing dates are rendered as `dd/MMMM/yyyy` while persisted values
  remain ISO;
- generated Email Send validates the current Service, Supplier, Product,
  Contract, and Rate parent chain and blocks changed/archived parents with an
  exact `PARENT CHANGED — REVIEW REQUIRED` notice;
- Cancel sending is snapshot-based and recovers an orphan Generated service
  even when its live Micro Split parent has disappeared;
- Reset Daywise clears Day 0, all Daywise and Micro Split records, and every
  unsent/no-attempt Generated snapshot; any Send Attempt or delivery evidence
  hard-blocks the reset;
- Rebuild Dates fills blank posted Program headers and available Start/Finish
  times, with arrival/departure time fallback, without overwriting manual input;
- Generated Batch exposes `Process (N pending)` and continues directly to the
  next pending package after a proven delivery;
- Gmail Send returns immediately after Message ID and Thread ID are stored
  durably, then official evidence sync continues in the background with a
  five-stage status display and existing Retry path;
- Manager/Admin has a cross-PC Approval Center for review and a hash-verified
  `Take over sync` path for an approved central Contract/Rate snapshot;
- `docs/POST_NOTIFICATION_MATRIX_PLAN.md` remains an official planning record
  only and does not activate new notification routes.

Verification:

- version: `1.1.17`;
- automated tests: `65/65` pass;
- source syntax and diff hygiene: pass;
- installer and unpacked executable metadata: `1.1.17` / `1.1.17.0`;
- packaged ASAR contains the reset, orphan, parent-integrity, Process,
  background Gmail stages, Approval Center, and takeover controls;
- isolated packaged application remains alive through the eight-second smoke
  gate;
- installer: `release/ERIM-PSH-Setup-1.1.17.exe`;
- size: `111,087,733` bytes;
- SHA-256:
  `AB2B548A53006131A2D4C54CED7389BD8F02FD31560D8938E0339AB11F400BC5`.

Still gated:

- no Git commit, push, GitHub release, or updater publication has been made;
- Portal/WhatsApp delivery remains manual operational UAT;
- representative two-PC Manager approval/takeover remains blocked until the
  active Apps Script approval route/schema is redeployed and health-checked.

Controlled live dummy evidence:

- Gmail preflight: `GMAIL_READY`, exact staff profile confirmed, central
  evidence endpoint ready;
- booking: `ND/PSHBALI7661 / TARANTULA / ATV TANDEM B`;
- Gmail Message/Thread ID: `19fb6681308934f2`;
- local Send Attempt:
  `VSEND-6b4e8b1e-0113-4dce-96b2-b49306c9c8ba`;
- central Communication ID:
  `COMM-2b0646c7-6125-41b2-87e6-bbae73f59b4a`;
- final status: `SYNCED`, one official sync attempt, no error;
- Gmail readback confirms exact Product, `03/October/2026`, Hotel,
  Start/Finish, and no Day Wise Header;
- a separate stale item was correctly marked `PRODUCT_MISSING` and was not
  sent;
- a central Contract/Rate approval request remained
  `LOCAL_PENDING_SYNC` after the live Apps Script returned a generic failure;
  the local request, exact hash, reason, and evidence reference remain durable
  for retry after backend deployment.
