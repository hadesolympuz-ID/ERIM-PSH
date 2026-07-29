# Vendor v1.1.9 UAT Follow-up Notes

Status: `RECORDED — AWAITING IMPLEMENTATION`

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
