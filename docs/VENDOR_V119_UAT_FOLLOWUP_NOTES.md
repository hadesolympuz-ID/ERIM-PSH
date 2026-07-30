# Vendor v1.1.9 UAT Follow-up Notes

Status: `IMPLEMENTED THROUGH v1.1.11 — WINDOWS UAT BUILD READY`

Recorded: 2026-07-30

This record captures owner feedback after the v1.1.9 release. It does not
activate new behavior yet. Where it conflicts with an earlier Vendor design,
this record is the newer direction.

## 1. Day time fields must not block online posting

- `Start Time` and `Finish Time` are optional Day context.
- A Leisure Day or another activity without a defined operating time may leave
  both fields blank.
- `Post structured data online` must not reject a Day only because Start Time
  or Finish Time is blank.
- Blank time remains blank/`Not set`; the application must not invent `00:00`
  or copy another Day's time.
- The required asterisk and validation message must be removed from the online
  posting gate.
- Hotel-on-this-Day context remains independent from the time fields.

This supersedes the earlier rule that every posted Day required Start Time.

## 2. New Micro Split item placement

- `Add item` inserts one new blank Micro Split card at the top of the current
  Day's item list.
- The new card receives focus immediately so the operator can start typing
  without scrolling.
- Existing saved items retain their stable IDs and relative order.
- Adding a blank card must not change the status or data of existing items.

## 3. Vendor Generate ownership filter

- Vendor Generate contains only Micro Split rows whose normalized Type is
  exactly `VENDOR`.
- `ADDITIONAL_SERVICE`, `TRANSPORT`, `TOC`, `LUGGAGE_VAN`, and every future
  non-Vendor Type are excluded from Vendor Generate.
- Exclusion is enforced in the backend read model as well as the interface.
- Existing generated/sent history remains readable even if an older package
  was created under the previous routing rule.

This supersedes the earlier rule that `ADDITIONAL_SERVICE` entered Vendor
Generate.

## 4. Standard booking subject

The default New Booking subject is standardized as:

```text
Booking {CUSTOMER_CODE} - {CLIENT_DISPLAY_NAME} - {CLIENT_TAG} - {SUPPLIER_NAME}
```

Approved example:

```text
Booking RA/PSHBALI539 - MS LIZA MITTAL - HONEYMOONERS - {SUPPLIER NAME}
```

Rules:

- Customer Code and Supplier Name come from stable package/master data.
- Client Display Name preserves the approved salutation and client name.
- `CLIENT_TAG` is the applicable client/occasion label, such as
  `HONEYMOONERS`.
- Values are trimmed and normalized to one space around each hyphen.
- A genuinely absent optional Client Tag is omitted cleanly; the subject must
  not contain an empty `-  -` segment.
- Amendment and cancellation prefixes remain separate decisions and must not
  silently reuse `Booking` if the action type differs.
- The generated subject remains reviewable before send.

## 5. Clearer Daywise tree labels

The Generate tree must make the Daywise source readable without opening every
service. Recommended compact Day header:

```text
Day 7 | 03 Oct 2026 | Floating Breakfast + ATV and Ubud activities
```

Each expanded service row should show:

```text
├─ Supplier | Product/service | booking state | rate state
```

Required display behavior:

- show Day number, formatted service date, and Day Wise Header as separate
  visual parts;
- label the description explicitly as `Day Wise Header`, not as an unlabeled
  secondary line;
- allow the header to wrap to two readable lines before truncation;
- show selected/eligible/total service counts on the Day row;
- keep supplier and Product/service visible on the service row;
- keep booking state separate from rate readiness;
- show `No Day Wise Header` explicitly when empty rather than leaving an
  ambiguous blank line.

## 6. Portal booking workspace and credentials

The Supplier Master portal URL may open directly from Generate.

### Recommended first behavior

- Validate and allow only `https://` portal URLs.
- Open the exact portal in the user's normal system browser.
- Let the browser's own password manager, MFA, and security controls handle
  credentials.
- Return to ERIM-PSH for manual portal reference/status/evidence recording.

This is the preferred first release because supplier portals may use MFA,
CAPTCHA, redirects, downloads, or browser policies that do not work reliably
inside an embedded window.

### Optional focused portal popup

A later desktop child-browser window is technically possible. If approved, it
must:

- use an isolated per-user browser session;
- keep `contextIsolation` enabled and Node integration disabled;
- restrict navigation and new windows to the approved portal origin;
- show the real URL and block non-HTTPS credential submission;
- never expose portal content to renderer IPC, logs, screenshots, or booking
  payloads;
- close back to the unchanged Generate selection and scroll context.

### Credential storage rule

- Portal username/password must never be stored in SQLite, Google Sheets,
  Apps Script properties, GitHub, logs, evidence, or generated packages.
- If ERIM-PSH later owns credential storage, secrets must use the current
  Windows user's OS credential vault, be scoped to Supplier + portal origin,
  and require explicit reveal/update/delete controls.
- Automatic password injection is deferred until a dedicated security and
  portal-compatibility UAT. The system browser password manager remains the
  recommended initial solution.

## 7. Exact Supplier Master for Special/Pending Rates

`Open exact Supplier Master` also applies when the selected service has a
missing Special Rate or remains `PENDING_RATE`.

From Generate, the operator receives two clear actions:

1. `Isi harga` — open the focused Supplier Master/Rate context for the exact
   Supplier, Product, service date, Contract/Rate, and service ID.
2. `Skip untuk sekarang` — continue Generate while visibly retaining
   `PENDING_RATE`.

Safety and ownership:

- Missing price does not block Generate or booking communication.
- Manager/Admin may save and publish an official Contract/Special Rate through
  the existing controlled Supplier Master publication flow.
- An authorized booking-only manual rate remains separate from the official
  master rate and keeps its reason, source, evidence, and immutable snapshot.
- Skipping a rate must not convert it to zero, `RATE_READY`, or an approved
  Contract Rate.
- Returning from the focused rate editor refreshes only the affected service
  and preserves the active Client, Day, selections, and scroll position.

## 8. Implementation and UAT gates

- Online posting succeeds for a Leisure Day with blank Start/Finish Time.
- Add item creates and focuses the top blank Micro Split card.
- Vendor Generate returns zero non-`VENDOR` current rows.
- The standard subject matches the approved segment order and spacing.
- Day rows clearly expose Day number, date, and labeled Day Wise Header.
- Portal links reject non-HTTPS destinations and do not store credentials in
  application data.
- `PENDING_RATE` exposes both `Isi harga` and `Skip untuk sekarang`.
- Skipping preserves `PENDING_RATE` while generation remains available.
- Focused Supplier Master return preserves the Generate work context.

## 9. Three-panel Generate workspace

The next Generate workspace uses three coordinated panels:

```text
Daywise tree | Generated booking message | Selected channel workspace
```

### 9.1 Left panel — Daywise tree and readiness

- Render Client → Day → Vendor split service in source Daywise order.
- Each service row shows Supplier, Product/service, booking state, rate state,
  and readiness notices.
- Each relevant row exposes `Open Supplier Master`, opening the focused popup
  at the exact Supplier, Product, Recipient/SOP, or Special/Pending Rate
  section.
- The focused popup returns to the same Client, Day, selection, package, and
  scroll position.

Communication channel is a single-choice control, not a multi-select checklist:

```text
( ) Email
( ) WhatsApp
( ) Portal
( ) Other
```

- Exactly one channel may be active for one supplier package/action.
- The active Supplier Booking SOP determines which choices are available.
- Channel is selected at supplier-package level, not independently per service.
- Changing channel before send changes the unsent working package only.
- A sent attempt remains immutable; a later channel change creates a new
  explicit attempt or action rather than rewriting history.

### 9.2 Middle panel — generated booking

The middle panel contains the outgoing communication snapshot:

- standardized Subject;
- editable generated booking message;
- selected Day/service summary;
- pax and operational context;
- attachment preview/selection;
- visible readiness and `PENDING_RATE` warnings;
- Generate/Regenerate while the package is still unsent.

Generation never sends. The exact subject, body, recipient set, selected
services, attachments, source revision, template version, and channel are
snapshotted before a send attempt.

### 9.3 Right panel — selected channel workspace

The right panel changes according to the one selected channel:

#### Email

- Render an ERIM-PSH Gmail composer using the connected staff Gmail account.
- Show From, TO, CC, BCC, Subject, message, attachments, and permitted Gmail
  conversation context.
- Provide the final `Send via Gmail` action inside ERIM-PSH.
- Gmail send remains behind the immutable pre-send ledger, final confirmation,
  idempotency protection, and connected-account permission checks.
- Store the returned Gmail message ID and thread ID and expose the exact thread
  link after send.
- Do not embed or imitate the complete Gmail website; use the controlled
  ERIM-PSH composer and Gmail integration.

#### WhatsApp

- Open the exact WhatsApp destination/message.
- Require manual sent time/reference/evidence because opening WhatsApp does not
  prove delivery.

#### Portal

- Open the approved HTTPS supplier portal using the portal security rules in
  Section 6.
- Return to ERIM-PSH for booking reference, status, actor, time, and evidence.

#### Other

- Require channel name, destination/reference, actor, time, status, and
  evidence/note.

## 10. Intentional email resend / alternate recipient SOP

Anti-double-send prevents accidental duplicate delivery but must allow a
controlled operational resend when, for example, the original mailbox has a
problem and the same booking email must be sent to another address.

### 10.1 Action and notice

A sent Email package exposes:

```text
Kirim ulang / Ganti penerima
```

Before any new Gmail call, show a notice containing:

- previous sent time and sender;
- previous TO/CC/BCC;
- Subject;
- Gmail message/thread link when available;
- warning that the supplier may receive the booking more than once.

The notice has exactly:

```text
Continue | Cancel
```

`Cancel` performs no mutation. `Continue` opens the controlled resend form; it
does not send immediately.

### 10.2 Resend form

After Continue:

- show old and proposed new recipient sets side by side;
- allow an alternate recipient from Supplier Master or a permitted manually
  entered operational address;
- visibly warn when an address is not in Supplier Master;
- require a resend reason;
- re-display the exact Subject, body, and attachments;
- require one final `Send via Gmail` confirmation.

DEV recipient restrictions and role/permission rules remain active. Resend
cannot bypass recipient validation, connected-account authorization, or the
send ledger.

### 10.3 Snapshot and ledger behavior

- Same content with a changed recipient is a Resend Attempt, not a regenerated
  booking.
- The original generated snapshot and original Send Attempt remain immutable.
- The new attempt records `resend_of_attempt_id`, reason, old/new recipient
  snapshots, actor, time, message hash, Gmail message ID, and Gmail thread ID.
- The new attempt receives its own idempotency key so an intentional resend is
  allowed once but repeated button clicks are still blocked.
- The booking remains `SENT` and displays the number and outcome of all
  delivery attempts.
- Do not assume Gmail uses the original thread for an alternate recipient;
  retain every returned thread ID separately.
- Same content to the same recipients requires a stronger duplicate warning
  and a mandatory reason but may still be continued by an authorized user.
- If booking content or selected services change, use Generate Amendment/new
  revision rather than Resend.
- If the previous send outcome is unknown, show that state prominently before
  allowing the same intentional-resend notice and audit path.

### 10.4 Additional UAT gates

- Only one communication channel can be active per supplier package/action.
- Selecting Email opens the connected Gmail composer in the right panel.
- Generate alone never calls Gmail.
- Final Gmail Send creates one immutable attempt and returns its message/thread
  IDs.
- Resend notice shows previous delivery details and Continue/Cancel.
- Cancel creates no attempt and sends nothing.
- Continue requires a new recipient review and resend reason.
- One intentional resend creates exactly one linked Send Attempt.
- Repeated clicks on that resend attempt do not create another Gmail send.
- Original and alternate-recipient Gmail threads remain independently
  accessible from delivery history.

## 11. Latest Generate workspace revision

Status: `IMPLEMENTED THROUGH v1.1.11 — WINDOWS UAT BUILD READY`

This is the latest owner direction and supersedes the main three-panel
arrangement described in Section 9. The single-channel, snapshot, Gmail ledger,
and intentional-resend rules from Sections 9 and 10 remain applicable.

The flow is separated into:

1. the main Generate preparation workspace; and
2. a full-screen communication popup after `Generate Booking`.

### 11.1 Main Generate preparation workspace

#### Left panel — Daywise tree

- Show Client → Day → Vendor split service in source Daywise order.
- Keep eligible service selection in the tree.
- Selecting one service makes it the current inspection item without losing
  the wider selected-service set.
- Keep the clearer Day number, date, labeled Day Wise Header, supplier,
  Product/service, booking state, and rate state.
- Place the sticky `Generate Booking` action in the left panel.
- The button shows the selected service count and resulting supplier-package
  count before opening the communication popup.

#### Middle panel — exact Supplier Master detail

For the service currently selected in the Daywise tree, show the relevant
Supplier Master context:

- Supplier name, Type, status, and stable ID;
- available communication channels from the active Booking SOP;
- exactly one selected channel: Email, WhatsApp, Portal, or Other;
- booking recipients/contact destination;
- lead time, cut-off, confirmation, amendment, and cancellation procedures;
- portal URL/account reference where permitted;
- readiness notices and missing-master information.

The panel exposes focused correction actions to the exact Supplier profile,
Recipients, SOP, Portal, or other missing section. Saving in the focused popup
returns to the unchanged tree selection and refreshes only the affected
Supplier/service.

#### Right panel — exact Product/rate detail

For the same current service, show:

- Product/service name and stable Product ID;
- activity/split description;
- Day number and service date;
- applicable Contract and Rate validity;
- Price Basis, Quantity, Adult/Child/Infant or unit rates;
- `RATE_READY`, Special Rate, Manual Rate, or `PENDING_RATE`;
- rate source, reason, and evidence reference when applicable.

The panel exposes focused Product/Contract/Rate correction. A missing
Special/Pending Rate keeps both `Isi harga` and `Skip untuk sekarang`; skipping
does not block Generate or convert the rate to zero/Ready.

### 11.2 Generate Booking transition

`Generate Booking` performs no delivery. It:

1. validates the selected stable Vendor service IDs;
2. regroups them in the backend into supplier packages;
3. snapshots source revision, services, Supplier/SOP, channel, recipients,
   Product/rate context, Subject, body, and attachments;
4. opens the full-screen communication popup.

If 50 selected services become fewer supplier packages, the popup navigates the
supplier packages rather than forcing the operator through 50 individual
service rows.

Example:

```text
50 selected services → 18 supplier packages
```

### 11.3 Full-screen communication popup

#### Left panel — outgoing package queue

Show every generated supplier package that belongs to the current preparation
batch. Each row displays:

- sequence and current/total position;
- channel required by the selected Supplier SOP;
- Customer Code;
- Supplier/package name;
- selected service count;
- state: Not Generated, Generated/Ready, Sent, Pending Sync, or Attention.

Default sort:

1. Booking SOP/channel order;
2. Supplier name;
3. Customer Code;
4. first Day/service date and original service order.

The operator may click any package directly. Sent rows remain visible and are
not silently regenerated.

#### Middle panel — booking message

Show the generated communication for the current package:

- action type;
- standardized Subject;
- editable booking message while unsent;
- selected Day/service summary;
- attachment list;
- readiness/rate notices.

For Email, clearly show:

- connected sender account;
- TO;
- CC;
- BCC where applicable;
- Subject and message preview.

Navigation is always visible:

```text
Previous | Package X of N | Next pending
```

Recommended behavior:

- `Previous` moves to the previous package in the displayed queue.
- `Next pending` moves to the next package that still needs Generate, Send, or
  Attention; it skips completed Sent packages.
- Clicking a queue row may still open any specific package.
- Navigation never sends automatically.
- Unsaved message edits trigger `Save & Next`, `Discard & Next`, or `Cancel`.

#### Right panel — channel action

For Email:

- show final Gmail readiness and connected account;
- expose the explicit `Send via Gmail` button;
- keep the final confirmation and immutable pre-send ledger;
- show the result, Gmail message ID, thread link, sync state, and resend action.

For WhatsApp, Portal, or Other, the same panel changes to the applicable
Open/Record Evidence action. Exactly one channel remains active for the
supplier package.

After successful Send, do not auto-advance. Show:

```text
Open Gmail Thread | Next pending
```

This lets the operator verify the result before moving while still supporting
large queues efficiently.

### 11.4 Queue progress

Keep a sticky batch summary in the popup:

```text
18 Packages | 5 Sent | 2 Ready to Send | 10 Not Generated | 1 Attention
```

Generation, delivery, official sync, and supplier confirmation remain separate
states. Closing the popup preserves the generated queue and returns to the same
main Generate tree context.

### 11.5 UAT gates for the revised layout

- Clicking a tree service updates both Supplier and Product panels to the same
  stable service ID.
- `Generate Booking` is available from the left panel and never sends.
- Selected services are regrouped into the correct supplier packages.
- Popup queue sorting follows SOP/channel then Supplier/package name.
- Email package middle panel shows sender, TO, CC/BCC, Subject, and message.
- Previous and Next pending never trigger Gmail automatically.
- Sent success leaves the result visible until the operator chooses Next.
- A batch with 50 selected services can be completed without returning to the
  top of the tree between packages.
- Closing/reopening the popup preserves package states and main-tree context.

## 12. Generate-to-Email real-flow audit and follow-up checklist

Status: `AUDITED BY LOCAL END-TO-END SIMULATION — FOLLOW-UP ITEMS RECORDED`

This section is the authoritative checklist for the audit performed after the
v1.1.11 generated-draft recovery hotfix. The audit executed the real database,
Generate, Send Attempt, Gmail MIME, Gmail-acceptance, evidence-sync, resend, and
sync-retry application paths. Gmail and Apps Script responses were simulated
locally so no external email or official record was created.

### 12.1 Generate source records

- [x] Read Customer and itinerary identity from the local Vendor Intake:
  Customer Code, Customer Name, Client Tag, pax, Tour ID, source revision,
  arrival, and departure.
- [x] Read Day and Micro Split records from the local structured itinerary.
- [x] Include only normalized Micro Split Type `VENDOR`.
- [x] Exclude Additional Service, Transport, TOC, Luggage Van, and every other
  Type from Vendor Generate.
- [x] Read active Supplier, Product, SOP, Contact, and Recipient records from
  the Supplier Master cache.
- [x] Match Supplier by stable Supplier ID first.
- [x] Use Supplier Name only as a legacy fallback when a stable ID is absent.
- [x] Build one package key from `Customer Code + Supplier identity`.
- [x] Preserve every selected stable Service ID in the generated snapshot.
- [x] Use Product Master name when linked; use Micro Split Activity Text only
  as the fallback service name.

### 12.2 Field-by-field processing

| Field | Source | Current Generate result | Follow-up |
| --- | --- | --- | --- |
| Customer Code | Vendor Intake | Package key, Subject, body, ledger, official evidence | Keep |
| Customer Name | Vendor Intake | Subject and body | Keep |
| Client Tag / Occasion | Vendor Intake | Subject | Keep |
| Adult / Child / Infant | Vendor Intake | Body and immutable snapshot | Keep |
| Tour ID | Vendor Intake | Send snapshot and evidence | Keep |
| Source Revision ID | Vendor Intake | Send snapshot and evidence | Keep |
| Day number | Day Wise | Service line and snapshot | Keep |
| Service date | Day Wise | Service line and snapshot | Keep |
| Day Wise Header | Day Wise | Tree/detail and snapshot, not standard email body | Decide whether to add to standard body |
| Start Time | Day Wise | Not used by Generate or standard email | Keep optional; decide whether Email should display it only when present |
| Finish Time | Day Wise | Not used by Generate or standard email | Keep optional; decide whether Email should display it only when present |
| Hotel on this Day | itinerary/hotel stay | Visible in Micro Split context, not standard email body | Decide whether to add to standard body |
| Supplier ID | Micro Split / Supplier Master | Package identity and evidence | Keep authoritative |
| Supplier Name | Supplier Master | Subject, greeting, queue, evidence | Keep |
| Product ID | Micro Split | Snapshot and focused correction | Keep |
| Product Name | Product Master | Standard email service line | Keep |
| Activity Text | Micro Split | Product-name fallback | Keep |
| Quantity | Micro Split | Added to service line only when not equal to one | Keep |
| Price Basis | Micro Split / Rate | Snapshot and Product/Rate panel | Keep out of standard email unless template requests it |
| Rate amounts | Rate / manual rate | Snapshot and Product/Rate panel | Keep out of standard supplier email |
| Rate Status | Rate resolution | Readiness notice and evidence; Pending Rate does not block | Keep visibly separate |
| Channel | Supplier SOP / Recipient / Contact | One active channel per package | Keep |
| TO / CC / BCC | Supplier Recipient, Contact fallback, operator review | MIME headers and immutable Send Attempt snapshot | Keep |
| SOP body template | Supplier SOP | Overrides the standard body when present | Keep |
| SOP subject template | Supplier SOP | Not used; Subject remains standardized | Keep standardized |

### 12.3 Standard Email generation result

- [x] Standard Subject:

  ```text
  Booking {Customer Code} - {Customer Name} - {Client Tag} - {Supplier Name}
  ```

- [x] Remove empty Subject components without leaving repeated separators.
- [x] Standard body includes greeting, Customer, Customer Code, pax, and each
  selected Day/date/Product line.
- [x] Quantity is included only when it is not one.
- [x] A generated snapshot records `bookingStatus = READY`.
- [x] A generated snapshot records `communicationStatus = GENERATED`.
- [x] Generate leaves Gmail Message ID and Gmail Thread ID empty.
- [x] Generate never calls Gmail and never creates Sent evidence.
- [x] Generated work is labeled `DRAFT READY — NOT SENT`.
- [x] Generated work can be restored with `Resume draft` or `Resume drafts`
  after popup close or application restart.

### 12.4 Email send pipeline

- [x] Require explicit operator confirmation immediately before real Gmail
  Send.
- [x] Create an immutable Send Attempt before the Gmail request.
- [x] Store actor, recipients, Subject, body, services, action type, rate
  status, source revision, snapshot hash, and prepared time.
- [x] Build a UTF-8 plain-text MIME message with TO, optional CC/BCC, encoded
  Subject, and the frozen body.
- [x] Send through Gmail API `users/me/messages/send`.
- [x] Require Gmail to return both Message ID and Thread ID.
- [x] Store returned Gmail IDs on the Send Attempt.
- [x] Store the latest returned Gmail IDs on the booking.
- [x] Change the booking to `SENT_PENDING_SYNC` immediately after proven Gmail
  acceptance.
- [x] Post the immutable evidence to Apps Script.
- [x] Change the booking to `SENT` and attempt to `SYNCED` only after official
  evidence sync succeeds.
- [x] Reject a normal second Send after the booking is Sent.
- [x] Treat a content or service change as Amendment, not Resend.

### 12.5 Gmail ID evidence marks

Add an automatic Email-evidence mark. It must be derived from the ledger and
must never be a manually editable checkbox.

- [ ] `EMAIL ID — NOT CREATED`: generated draft; Message ID and Thread ID are
  empty.
- [ ] `EMAIL ID — RECORDED / SYNC PENDING`: Gmail accepted and both IDs exist,
  but official evidence has not synced.
- [ ] `EMAIL ID — RECORDED / SYNCED`: both IDs exist and official evidence is
  synced.
- [ ] `EMAIL OUTCOME UNKNOWN`: Gmail outcome cannot be proven; block another
  Send until reconciliation.
- [ ] `NON-EMAIL CHANNEL`: use external evidence instead of Gmail ID.
- [ ] Display Gmail Message ID, Thread ID, sender, recipients, accepted time,
  and evidence-sync state in Delivery History.
- [ ] Provide Copy Message ID and Open Gmail Thread actions where useful.

### 12.6 Failure and anti-double-send branches

- [x] If Gmail returns Message ID and Thread ID but Apps Script fails, retain
  both IDs and use `SENT_PENDING_SYNC`.
- [x] Retry only Apps Script evidence sync; never call Gmail again.
- [x] Local simulation verified that the Gmail call count does not increase
  during evidence-sync retry.
- [x] An unresolved active Send Attempt blocks a new Send Attempt.
- [x] An unknown Gmail outcome becomes `SEND_OUTCOME_UNKNOWN` and blocks
  automatic retry.
- [ ] Move the final TO-recipient invariant before Send Attempt insertion so a
  malformed direct IPC/API request cannot leave a `PREPARED` attempt with no TO
  recipient. The UI already validates TO, but the backend invariant should be
  authoritative.
- [ ] Add an automated test for the no-TO backend invariant and confirm that no
  Send Attempt row is inserted on rejection.

### 12.7 Intentional resend / alternate recipient

- [x] Resend requires a proven earlier Gmail Send Attempt.
- [x] Resend requires reviewed replacement recipients.
- [x] Resend requires at least one TO recipient.
- [x] Resend requires an operational reason.
- [x] Resend requires final confirmation.
- [x] Resend creates a new Send Attempt and idempotency key.
- [x] Resend links `resend_of_attempt_id` to the immutable original attempt.
- [x] Resend stores a new Gmail Message ID and Thread ID.
- [x] Resend preserves the original attempt, IDs, recipients, snapshot, and
  official evidence.
- [x] Local simulation verified two separate synced attempts and two separate
  Gmail ID pairs.

### 12.8 Resend positioning gap

The owner correctly identified that Resend is currently difficult to find
after leaving the communication popup.

Current condition:

- [x] `Kirim ulang / Ganti penerima` appears in the right communication panel
  only when Channel is Email and the latest booking status is `SENT`.
- [x] The button is visible immediately after a successful Send while the
  communication popup remains open.
- [x] `Resume drafts` intentionally restores only `GENERATED` work.
- [x] A Sent tree row currently exposes Gmail but has no route back to the Sent
  communication package.
- [x] Therefore Resend becomes effectively unreachable later from the normal
  Generate working area.

Required positioning:

- [ ] Add `Delivery history / Resend` beside `Open Gmail` on a Sent Email
  service in the Daywise tree.
- [ ] Add the same action to the Booking Register / Vendor Inbox Sent row.
- [ ] Open the full-screen communication workspace directly on the selected
  Sent booking in read-only Delivery History mode.
- [ ] Keep Subject/body/service snapshot read-only for Resend.
- [ ] Position `Kirim ulang / Ganti penerima` under the original delivery
  evidence in the right panel.
- [ ] Do not show Resend for `GENERATED`.
- [ ] Show `Retry evidence sync` instead of Resend for
  `SENT_PENDING_SYNC`.
- [ ] Show `Reconcile Gmail outcome` and block Resend for
  `SEND_OUTCOME_UNKNOWN`.
- [ ] Show `Amend booking` separately when content or services must change.

### 12.9 Multi-attempt Gmail thread and reply detection gap

- [x] The Send Attempt ledger preserves every original and resend Gmail Message
  ID and Thread ID.
- [x] The booking row stores only the latest Gmail Message ID and Thread ID.
- [x] Current automatic reply detection scans only the booking's latest stored
  Gmail thread.
- [ ] Change reply detection to scan every proven Gmail thread in all synced or
  Gmail-accepted Send Attempts for the booking.
- [ ] Deduplicate thread IDs before Gmail reads.
- [ ] Match each outbound Message ID inside its own Thread ID.
- [ ] Ignore the connected employee's outbound messages.
- [ ] Detect a supplier inbound message after the applicable outbound message.
- [ ] Record which Send Attempt and Thread produced the inbound reply.
- [ ] Preserve replies from the original thread even after an alternate-
  recipient resend creates a newer thread.
- [ ] Display every delivery/thread chronologically in Delivery History.

### 12.10 Required implementation order

1. Add the backend TO-recipient invariant before Send Attempt creation.
2. Add the derived Email ID evidence-state helper.
3. Expose Delivery History for any Sent Email booking.
4. Add Daywise tree and Booking Register entry points.
5. Position Resend inside Delivery History under the selected proven attempt.
6. Add all-attempt Gmail thread scanning and attempt-aware reply evidence.
7. Add explicit UI marks for Gmail ID and official sync state.
8. Decide whether Day Wise Header, optional Start/Finish, and Hotel should
   appear in the standard booking body.
9. Run automated, packaged, and connected-account UAT before live deployment.

### 12.11 UAT gates

- [ ] Generate produces `GENERATED`, blank Gmail IDs, and a visible Not Sent
  mark.
- [ ] Closing and reopening restores the generated draft without creating a
  second booking or Send Attempt.
- [ ] One Send creates exactly one Send Attempt and one Gmail Message ID.
- [ ] Gmail Message ID and Thread ID appear in Delivery History immediately
  after Gmail acceptance.
- [ ] Apps Script failure leaves `SENT_PENDING_SYNC` with Gmail IDs visible.
- [ ] Retry Sync changes only evidence status and does not call Gmail.
- [ ] A second normal Send is rejected.
- [ ] A Sent row can reopen Delivery History after application restart.
- [ ] Resend is reachable from both Daywise tree and Booking Register.
- [ ] One intentional resend creates exactly one linked new attempt.
- [ ] Original and resend Gmail IDs remain independently visible.
- [ ] A reply on the original thread is detected after a resend.
- [ ] A reply on the resend thread is detected.
- [ ] No-TO backend rejection creates no Send Attempt.
- [ ] `SEND_OUTCOME_UNKNOWN` blocks Send and Resend until reconciliation.
- [ ] Amendment remains separate from Resend.

## 13. Approved deterministic sort and Gmail connection preflight

Status: `OWNER APPROVED — RECORDED FOR IMPLEMENTATION`

### 13.1 Package merge boundary

- [x] Merge selected service rows only when Customer Code and stable Supplier
  identity are the same.
- [x] Allow one package to contain the same supplier's services from multiple
  Days for the same client.
- [x] Never merge different Customer Codes.
- [x] Never merge different Supplier IDs only because their display names are
  similar.
- [x] Continue excluding every non-`VENDOR` Type.

### 13.2 Approved package sort

Implement this deterministic ascending order:

1. communication channel/SOP priority:
   - `EMAIL`;
   - `WHATSAPP`;
   - `PORTAL`;
   - `OTHERS` / `OTHER`;
   - unknown channel last;
2. normalized Supplier Name;
3. Customer Code;
4. earliest selected service date;
5. earliest selected Day number;
6. stable Package Key.

- [ ] Add first service date and first Day metadata to the generated queue
  entry.
- [ ] Add the final stable Package Key tie-breaker.
- [ ] Use the same comparator when generating and resuming drafts.
- [ ] Add automated coverage proving the result does not depend on insertion
  order.

### 13.3 Approved service sort inside one package

Implement this deterministic ascending order:

1. Day number;
2. service date;
3. Micro Split `splitSequence`;
4. normalized Product Name;
5. stable Service ID.

- [ ] Sort before building `selectedServiceIds`.
- [ ] Use the sorted service array for the generated snapshot.
- [ ] Use the same array for Subject/body preview, MIME, evidence, and Delivery
  History.
- [ ] Preserve stable Service IDs; sorting must not create or change identity.
- [ ] Add a test with unsorted input Days and Split sequences.
- [ ] Confirm the standard email body prints Day 1, Day 2, Day 3 consistently.

### 13.4 Generate-time Gmail preflight

Run this only when at least one selected package uses Email.

The preflight must not rely only on cached `auth.status.connected`.

Required checks:

1. OAuth configuration exists;
2. an encrypted session or active in-memory session exists;
3. `accessToken()` succeeds and refreshes the token when it is near expiry;
4. Gmail `users/me/profile` returns HTTP success;
5. returned `emailAddress` matches the connected employee email;
6. Gmail permission is sufficient for the configured Email workflow;
7. result includes sender email, checked time, and latency;
8. Apps Script health is checked separately as central-evidence readiness.

Do not store or display access tokens, refresh tokens, OAuth codes, or
authorization headers.

### 13.5 Generate preflight result states

| State | Meaning | Generate behavior | Send behavior |
| --- | --- | --- | --- |
| `GMAIL_READY` | Token refresh/profile succeeds and account matches | Proceed | Recheck before Send |
| `AUTH_REQUIRED` | No usable session/refresh fails | Block Email by default; offer Reconnect | Disabled |
| `PERMISSION_REQUIRED` | Gmail returns permission failure | Require reconnect/consent | Disabled |
| `ACCOUNT_MISMATCH` | Gmail profile differs from selected sender | Block Email | Disabled |
| `GMAIL_UNREACHABLE` | Network/API temporarily unavailable | Offer Generate Draft Only or Cancel | Disabled |
| `CENTRAL_SYNC_UNAVAILABLE` | Gmail ready; Apps Script unavailable | Generate allowed with warning | Send allowed; result may become `SENT_PENDING_SYNC` |
| `NON_EMAIL` | Package is WhatsApp/Portal/Other | Gmail check not required | Use channel-specific action |

Generate failure dialog:

```text
GMAIL IS NOT READY

Connected account: {cached employee email}
Result: {AUTH_REQUIRED / PERMISSION_REQUIRED / ACCOUNT_MISMATCH /
         GMAIL_UNREACHABLE}
Checked: {timestamp}

Email cannot be sent until Gmail is ready.

[Reconnect Google] [Generate Draft Only] [Cancel]
```

`Generate Draft Only`:

- [ ] creates or updates only the generated local snapshot;
- [ ] marks the package `EMAIL PREFLIGHT REQUIRED`;
- [ ] does not create a Send Attempt;
- [ ] keeps `Send via Gmail` disabled;
- [ ] permits later Resume and Recheck Connection.

### 13.6 Communication-workspace readiness notice

Show a sticky readiness card for the active Email package:

```text
GMAIL READY
Sender: staff@company.com
Session: active / refreshed
Checked: 10:22:15
Central evidence: READY
```

Alternative warning:

```text
GMAIL READY — CENTRAL SYNC UNAVAILABLE
Email may be sent once; official evidence will remain SENT_PENDING_SYNC.
```

Required actions:

- [ ] `Recheck connection`;
- [ ] `Reconnect Google` when auth/permission fails;
- [ ] show the returned sender account;
- [ ] show preflight age;
- [ ] mark stale after five minutes or when the app resumes from sleep;
- [ ] rerun on network change where detectable.

### 13.7 Mandatory pre-Send recheck

Generate preflight is early warning, not a delivery guarantee. Immediately
before the final confirmation and Send Attempt insertion:

1. validate at least one TO recipient;
2. call `accessToken()` so refresh can occur;
3. call Gmail `users/me/profile`;
4. verify the sender account still matches;
5. verify the generated snapshot has not changed;
6. then create the immutable Send Attempt;
7. then show final confirmation and call Gmail exactly once.

- [ ] A failed pre-Send check creates no Send Attempt.
- [ ] A canceled final confirmation creates no Send Attempt.
- [ ] A successful preflight does not weaken the existing
  `SEND_OUTCOME_UNKNOWN` protection.
- [ ] A Gmail failure before receiving proven IDs must never be silently
  retried.

### 13.8 Implementation order

1. Add deterministic service sorting in the backend read/preview path.
2. Add deterministic package metadata and comparator.
3. Add a focused Gmail preflight service reusing token refresh and Gmail
   profile verification.
4. Expose focused preflight through IPC without exposing credentials.
5. Run preflight on Generate for selected Email packages.
6. Add Generate Draft Only and readiness states.
7. Add sticky readiness notice and Recheck Connection.
8. Run mandatory validation/preflight before Send Attempt creation.
9. Add packaged and connected-account UAT.

### 13.9 UAT gates

- [ ] Same selected data produces the same package order across repeated runs.
- [ ] Same package produces the same service order regardless of source
  insertion order.
- [ ] Services from one client/supplier and multiple Days merge once.
- [ ] Different clients never merge.
- [ ] Email packages sort before WhatsApp, Portal, and Others.
- [ ] Day/service body lines are deterministic.
- [ ] Generate with a valid session shows the verified Gmail sender.
- [ ] Near-expiry token is refreshed during preflight.
- [ ] Expired session with valid refresh token recovers without new login.
- [ ] Revoked refresh token produces `AUTH_REQUIRED`.
- [ ] Missing Gmail permission produces `PERMISSION_REQUIRED`.
- [ ] Different Gmail profile produces `ACCOUNT_MISMATCH`.
- [ ] Offline Gmail produces `GMAIL_UNREACHABLE`.
- [ ] Generate Draft Only creates no Send Attempt.
- [ ] Non-Email packages are not blocked by Gmail readiness.
- [ ] Apps Script outage shows Central Sync warning without falsely marking
  Gmail unavailable.
- [ ] Pre-Send recheck is executed even after Generate passed.
- [ ] Session loss between Generate and Send creates no Send Attempt.
- [ ] Final confirmation cancellation creates no Send Attempt.
- [ ] Successful Send still creates exactly one Gmail Message ID.
- [ ] Gmail accepted plus central failure becomes `SENT_PENDING_SYNC`.
- [ ] Retry central sync performs zero additional Gmail sends.
