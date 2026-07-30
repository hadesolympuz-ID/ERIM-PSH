# Vendor Booking Generate, Send, Revise, and Cancel SOP

Status: `v1.1.12 PRIORITY 1–5 IMPLEMENTED — LOCAL VERIFICATION`
Operational owner: Vendor Booking

## 1. Queue ownership

- Micro Split type `VENDOR` enters Vendor Booking.
- Every type other than `VENDOR`, including `ADDITIONAL_SERVICE`, `TRANSPORT`,
  `TOC`, and `LUGGAGE_VAN`, stays outside Vendor Generate. Its owning workflow
  handles that record.
- The queue groups atomic services by Customer Code and supplier. Supplier ID
  is authoritative; a legacy name-only split remains visible as an unlinked
  temporary group so work is not lost.
- A missing or expired rate shows `PENDING_RATE` but does not block booking
  generation or sending.

## 2. Generate booking

1. Open Vendor Booking → Generate.
2. Expand the required Client and Day branches, then select the eligible
   service rows to prepare. Already sent or otherwise ineligible rows remain
   read-only.
3. Click one service to inspect its exact Supplier/SOP detail in the middle
   panel and Product/Contract/Rate detail in the right panel.
4. Select exactly one communication channel for each supplier package.
5. Click `Generate Booking` in the left panel. If at least one selected package
   uses Email, ERIM-PSH must run the focused Gmail connection preflight before
   preparing the communication batch.
6. The selected services are
   regrouped into supplier packages and opened in the full-screen communication
   workspace; nothing is sent.
7. Use the package queue and `Previous` / `Next pending` to review every
   service date, Day number, Product/service name, pax, quantity, price basis,
   and rate warning.
8. Verify all recipients. Each editable row uses `TO | address`,
   `CC | address`, `BCC | address`, or `WHATSAPP | number`.
9. Review and edit Subject and Booking Message.
10. Select New Booking or Amendment, then Regenerate Snapshot if the content
   changed.

Generate creates an exact working snapshot and service links in local SQLite.
It does not send anything. Re-generating an unsent action updates that draft
snapshot. A sent New/Amend/Cancel record is never overwritten; the next action
creates a new history record.

If the communication popup closes before delivery, the snapshot remains
`DRAFT READY — NOT SENT`. Use `Resume draft` on the service or `Resume drafts`
in the Daywise toolbar to restore the generated queue. Closing the popup never
changes a draft to Sent or removes it from the working flow.

Until the final mail-merge sample is approved, the `STANDARD_V1` fallback body
prints each service's Day number, Day Wise Header, optional Start/Finish time,
Hotel on that Day, date, Product/service, pax, quantity, and rate basis in the
same deterministic order used by the booking snapshot. The standard fallback
does not attach files automatically. Attachments require a separately reviewed
rule and explicit staff confirmation.

### 2.1 Deterministic grouping and sort

One package contains selected Vendor services for one Customer Code and one
stable Supplier identity, including services on multiple Days.

Package order is:

1. channel/SOP priority: Email, WhatsApp, Portal, Others;
2. for Email, WhatsApp, and Others: Supplier Name, Customer Code, first service
   date, first Day number, then stable Package Key;
3. for Portal: Customer Code, Supplier Name, first service date, first Product
   Name, then stable Package Key.

Service order inside an Email, WhatsApp, or Other package is:

1. Day number;
2. service date;
3. Micro Split sequence;
4. Product Name;
5. stable Service ID.

Service order inside a Portal package is:

1. service date;
2. Day number;
3. Product Name;
4. Micro Split sequence;
5. stable Service ID.

A Portal package is also the candidate ticket transaction boundary. Outbound
and return services may share one Portal booking/ticket reference only when
they have the same Customer Code and stable Supplier identity and the supplier
issues them in one transaction. The package retains every included stable
Service ID. Different suppliers always create separate Portal packages and
separate references, even when their services form the outbound and return
legs of one customer journey. A possible omitted same-supplier return produces
a non-blocking notice; the application must not auto-add it.

For the configured stable Eka Jaya Supplier identity, the Portal action panel
must also calculate calendar-day lead time from the Portal booking/action date
to the earliest included service date. A round trip therefore uses its
outbound date. Show `USE DEPOSIT` when the lead time is exactly 15 days or
less, and `USE PREPAID` when it is more than 15 days. Recheck this rule before
opening the Portal action, and retain the calculation inputs, result, and rule
version in the booking snapshot/evidence. Do not activate the rule through a
loose Supplier display-name match.

The backend snapshot and rendered message must use the same sorted service
array. Source insertion order must not change the result.

### 2.2 Gmail preflight

For an Email package, `Connected` is only a display hint. Generate must:

1. refresh the OAuth access token when required;
2. call Gmail `users/me/profile`;
3. verify the returned Gmail account matches the connected employee;
4. classify permission, authentication, network, and central-sync readiness;
5. show sender and checked time in the communication workspace.

If Gmail auth/profile is not ready, Email generation is blocked by default and
offers Reconnect, Generate Draft Only, or Cancel. Generate Draft Only must keep
Send disabled until a later successful preflight.

The same focused Gmail preflight is mandatory again immediately before Send.
The pre-Send preflight and final TO validation occur before creating the
immutable Send Attempt. Apps Script unavailability is a warning, not a Gmail
blocker, because a proven Gmail Send may safely become `SENT_PENDING_SYNC`.

## 3. Email sending

1. Email requires at least one `TO` recipient.
2. Generate the latest snapshot and confirm the Generate preflight result.
3. Click Send via Gmail.
4. ERIM-PSH rechecks Gmail connection, token, account, and permission.
5. Read the final confirmation showing supplier, TO, subject, and the connected
   employee Gmail.
6. Confirm only when those values are correct.

After Gmail accepts the message, ERIM-PSH records Sent time, Gmail message ID,
Gmail thread ID, exact recipients, Subject, Body, services, source revision,
rate status, and actor-local audit event. A Sent booking cannot be silently
resent; prepare an Amendment instead.

The Google Desktop connection now requires `gmail.send`. An account connected
under an older version must Disconnect and Connect Google again before its
first send so Google can approve the additional permission.

### Intentional resend or alternate recipient

Use `Kirim ulang / Ganti penerima` only when a proven earlier delivery must be
repeated, for example because the same booking must reach another mailbox.
Review the previous and replacement recipients, enter the operational reason,
then pass the final confirmation. The resend creates a new linked Send Attempt
and Gmail thread; it never edits or replaces the original evidence. Content or
service changes must use Amendment instead of Resend.

## 4. WhatsApp, Portal, and Others

1. Generate the snapshot.
2. Perform the action in the approved external channel.
3. Return to ERIM-PSH.
4. Enter a portal booking ID, WhatsApp sent time/reference, or another evidence
   note.
5. Click Record as Sent.

External-channel Sent status is prohibited without this reference/evidence.

## 5. Revise itinerary and amendment

Revise Itinerary opens the same editor used by New Itinerary:

1. Load the Customer Code.
2. Modify only affected Day Wise and Micro Split records.
3. Save the revised local draft; post structured data online when authorized.
4. Open Generate.
5. Select each affected supplier and choose Amendment.
6. Review, generate, and send through the normal controlled process.

Automatic old/new impact decisions (`UNCHANGED`, `ADD`, `CHANGE`, `REBOOK`,
`CANCEL`) are not yet active. Staff must not assume an unaffected supplier
needs an amendment.

## 6. Cancel All Services

1. Open Cancel All Services.
2. Select Customer Code.
3. Enter the mandatory cancellation reason.
4. Click Prepare Cancellation Packages.
5. Review each supplier package in Generate.
6. Send or record each supplier cancellation separately.

Prepare does not send and does not erase the original booking. One new Cancel
history record is created per supplier, preserving the original services,
communication evidence, and reason.

## 7. Current UAT checks

- Dashboard Pending count matches unsent local supplier packages.
- The real test set resolves to 11 packages and 14 Vendor-owned services.
- Six pending-rate services remain visible and bookable.
- Floating Breakfast remains a rate-ready Additional Service package.
- No Transport, TOC, or Luggage Van service appears in Vendor Generate.
- Supplier SOP/channel/recipient details are checked before live sending.
- Email UAT uses an approved recipient and confirms Gmail evidence is retained.
- Cancel preparation creates packages but sends nothing automatically.

## 8. Remaining controlled work

- run the connected Workspace Gmail send/readback gates with an approved test
  recipient, including `SENT_PENDING_SYNC`, reconciliation, resend, and reply
  detection across original and resend threads;
- run the cross-account maker/checker approval and Apps Script sync gates for a
  newly entered Contract Rate;
- configure the stable Eka Jaya Supplier SOP once with
  `EKA_JAYA_15_DAY`, then verify 14/15/16-day Portal notices against live data;
- replace `STANDARD_V1` only after the owner supplies and approves the final
  mail-merge body and attachment rules;
- add DEV recipient whitelist controls;
- implement revision comparison and per-item impact decisions;
- implement supplier-reply review, confirmation results, completion gate, and
  final Reservation handoff.

## 9. Dashboard and Itinerary Check backlog

The next Vendor dashboard iteration contains:

1. New Itinerary not fully split and not marked complete by Vendor staff.
2. Split items whose supplier booking communication has not been generated.
3. Unreviewed supplier email replies linked to the exact Gmail thread.
4. Itineraries arriving from D+1 through D+7 with a button that opens the
   separate Itinerary Check submenu at the applicable Client Code.

Itinerary Check is also accessible directly below Dashboard. Staff search a
Client Code and receive Client → Day → Split Item. Each Day includes its Day
Wise subject/title. The view includes Vendor, Additional Service, Transport,
TOC, and Luggage Van rows for complete itinerary inspection.

Every item shows Type, Supplier, Product/service, rate readiness,
generation/sent status, supplier result, and its applicable action. A
Vendor-by-Email item with stored Gmail evidence links directly to its exact
thread. External channels display their evidence/reference. Transport/TOC rows
remain owned by Transport even though they are visible here.

Itinerary Check is read-only by default. Recheck is a human inspection action
and does not infer confirmation from an inbound reply or mark work complete.

## 10. Vendor Inbox backlog

Vendor Inbox uses two sections:

- Left: a searchable/sortable list of Generated and Sent booking packages.
  Every row distinguishes Generated from Sent and shows Client Code, Customer
  Name, Adult/Child/Infant pax, Supplier, Product/service, Day/date, action,
  channel, timestamps, rate/result status, and Gmail thread or external
  evidence when available.
- Right: incoming Vendor work notifications. The first event types are New
  Itinerary and Revised Itinerary; each deep-links to the exact shared intake
  or revise workspace. Later event types are added only after their workflow is
  approved.

The left register searches Client Code, Customer Name, Supplier, and
Product/service. It sorts by Sent time, Generated time, or Client Code, and may
filter state, channel, action, supplier, and date range. Opening history,
notification, or email thread does not mark the booking complete.
