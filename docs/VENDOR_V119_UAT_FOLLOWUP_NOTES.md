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

