# Vendor Booking Generate, Send, Revise, and Cancel SOP

Status: `v1.1.7 UAT BASELINE`  
Operational owner: Vendor Booking

## 1. Queue ownership

- Micro Split type `VENDOR` enters Vendor Booking.
- `ADDITIONAL_SERVICE` also enters Vendor Booking, including a supplier with no
  contract and a manual/dynamic rate such as Floating Breakfast.
- `TRANSPORT`, `TOC`, and `LUGGAGE_VAN` never enter the Vendor queue. Transport
  owns those records.
- The queue groups atomic services by Customer Code and supplier. Supplier ID
  is authoritative; a legacy name-only split remains visible as an unlinked
  temporary group so work is not lost.
- A missing or expired rate shows `PENDING_RATE` but does not block booking
  generation or sending.

## 2. Generate booking

1. Open Vendor Booking → Generate.
2. Select the required Customer Code + supplier package.
3. Verify every service date, Day number, Product/service name, pax, quantity,
   price basis, and rate warning.
4. Verify the channel loaded from the active Supplier SOP.
5. Verify all recipients. Each editable row uses `TO | address`,
   `CC | address`, `BCC | address`, or `WHATSAPP | number`.
6. Review and edit Subject and Booking Message.
7. Select New Booking or Amendment.
8. Click Generate Booking.

Generate creates an exact working snapshot and service links in local SQLite.
It does not send anything. Re-generating an unsent action updates that draft
snapshot. A sent New/Amend/Cancel record is never overwritten; the next action
creates a new history record.

## 3. Email sending

1. Email requires at least one `TO` recipient.
2. Generate the latest snapshot.
3. Click Send Email Now.
4. Read the final confirmation showing supplier, TO, subject, and the connected
   employee Gmail.
5. Confirm only when those values are correct.

After Gmail accepts the message, ERIM-PSH records Sent time, Gmail message ID,
Gmail thread ID, exact recipients, Subject, Body, services, source revision,
rate status, and actor-local audit event. A Sent booking cannot be silently
resent; prepare an Amendment instead.

The Google Desktop connection now requires `gmail.send`. An account connected
under an older version must Disconnect and Connect Google again before its
first send so Google can approve the additional permission.

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

- publish official Supplier Booking, Booking Service, Communication, and
  Recipient records through Apps Script/Google Sheets with idempotent retry;
- add DEV recipient whitelist and attachment controls;
- implement revision comparison and per-item impact decisions;
- implement supplier-reply review, confirmation results, completion gate, and
  final Reservation handoff.
