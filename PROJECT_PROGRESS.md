# ERIM-PSH — Project Progress & Development Direction

Dokumen ini adalah sumber utama untuk melihat arah development, keputusan
arsitektur, milestone, pekerjaan selesai, pekerjaan tertunda, dan scope yang
dibatalkan.

**Project:** ERIM-PSH  
**Repository:** `hadesolympuz-ID/ERIM-PSH`  
**Local project:** `C:\PROJECT\ERIM-PSH`  
**Target application:** `https://status.peakseasonholidays.com`  
**Last updated:** 2026-07-29
**Current phase:** Vendor Booking v1.1.9 released; connected-account Gmail and full operational UAT remain

---

## Status Legend

| Status | Meaning |
| --- | --- |
| `DONE` | Selesai dan sudah tersedia dalam project. |
| `IN PROGRESS` | Sedang dikerjakan. Hanya gunakan untuk pekerjaan yang benar-benar aktif. |
| `OPEN` | Temuan trial/UAT sudah dicatat dan belum diperbaiki atau ditutup lewat retest. |
| `PENDING` | Belum dimulai atau menunggu keputusan/dependency. |
| `BLOCKED` | Tidak dapat dilanjutkan sebelum hambatan tertentu diselesaikan. |
| `CANCELED` | Dikeluarkan dari scope berdasarkan keputusan project. |

---

## 1. Product Direction

ERM-PSH adalah sistem internal operasional Peak Season Holidays untuk sekitar
9–10 pengguna. Sistem menghubungkan pekerjaan Reservation, Vendor Booking,
Transport, Ops Accounting, General Cashier, dan Manager/Admin.

### Overall progress estimate

| Measure | Current estimate | Meaning |
| --- | --- | --- |
| Entire ERIM-PSH product plan | `30%` | Architecture, desktop foundation, connectivity, updater, and the initial Reservation workflow exist; Vendor, Transport, Accounting, Cashier, Manager controls, production hardening, and mobile completion remain substantial. |

Persentase ini mengukur keseluruhan produk, bukan hanya menu Reservation.
Workbook/master data menggunakan pendekatan just-in-time: struktur dilengkapi
bersamaan dengan workflow yang akan dikembangkan agar setiap tabel dan field
benar-benar terpakai.

### Application modes

| Mode | Direction | Status |
| --- | --- | --- |
| Desktop dashboard | Workspace operasional penuh dengan temporary local database terpisah untuk setiap user/department. | `DONE` |
| Mobile PWA | Hostinger subdomain khusus monitoring read-only dengan Google authentication. | `IN PROGRESS` |
| Google Apps Script API | Satu-satunya business-rule dan permission gateway. | `IN PROGRESS` |
| Google Sheets | Authoritative database untuk hasil department yang sudah Complete/Post. | `DONE` |
| Google Drive | Penyimpanan itinerary, invoice, booking file, export, dan bukti pembayaran. | `IN PROGRESS` |
| Gmail references | Reservation link confirmation, Ops Accounting link quotation, Vendor link email booking. | `PENDING` |

### Desktop local database principle

- Setiap user/department memiliki temporary database di PC masing-masing.
- Local database berisi draft, source snapshot, generated files, dan sync queue.
- Department lain tidak membaca database lokal user secara langsung.
- Setelah pekerjaan `DONE`, desktop melakukan controlled publish melalui Apps Script.
- Downstream department membaca hasil publish beserta chain link/version, bukan local path.
- Publish wajib memakai base version, idempotency key, central lock, dan audit.
- Jika upload gagal, pekerjaan tetap `PENDING_SYNC` dan dapat diulang tanpa duplikasi.
- Setelah berhasil, local record menyimpan publication ID dan official version.

### Department communication links

- Reservation mengaitkan confirmation Gmail thread dengan Tour/Customer Code.
- Ops Accounting mengaitkan quotation Gmail thread dengan Tour/Customer Code.
- Vendor email booking mengaitkan setiap Supplier Booking dengan Gmail thread/message.
- WhatsApp menyimpan target, generated message snapshot, attachment, status manual, actor, dan evidence.
- Portal booking menyimpan portal URL, external reference, status, last checked, actor, dan proof file.

### Mobile access principle

Mobile hanya untuk membaca dan membuka informasi yang diizinkan:

- Search berdasarkan Customer Code.
- Melihat client, agent, arrival/departure, dan progress department.
- Melihat current itinerary.
- Membuka confirmation email dan quotation email.
- Membuka supplier booking email/thread.
- Melihat driver, phone, vehicle, transporter, pickup, dan service hari ini.
- Melihat pending confirmation, PIC, alasan pending, dan follow-up terakhir.
- Melihat timeline dan waktu update.

Mobile tidak memiliki operasi:

- Create atau revise itinerary.
- Mengubah daywise, vendor, driver, atau service.
- Mengirim email melalui sistem.
- Mengubah rate, TOC, invoice, atau payment.
- Approval atau mark paid.
- Mutation lain walaupun request dibuat secara manual.

Server wajib menolak mutation mobile. Menyembunyikan tombol saja tidak dianggap
sebagai security control.

---

## 2. Approved Architecture

```text
MOBILE
status.peakseasonholidays.com
  -> Hostinger read-only PWA
  -> Google authentication
  -> Apps Script read API
  -> Published Google data

DESKTOP
User PC
  -> Department workspace
  -> Per-user temporary local database
  -> Complete/Post
  -> Apps Script publish API
  -> Published Google database + Drive + Gmail references
```

| Architecture decision | Status | Note |
| --- | --- | --- |
| Host PWA static di Hostinger | `DONE` | Khusus mobile monitoring. |
| Install dari browser | `DONE` | Tidak memerlukan Play Store package. |
| Mobile-first monitoring | `DONE` | Mobile ditetapkan read-only. |
| Apps Script sebagai central API | `DONE` | Semua permission dan business rules diperiksa server-side. |
| Per-user desktop temporary database | `DONE` | Model disetujui; implementasi belum dimulai. |
| Department publication chain | `DONE` | Downstream membaca published links/version, bukan local DB. |
| Google Sheets sebagai published database MVP | `DONE` | Struktur awal sudah dibuat dalam XLSX dan perlu diselaraskan dengan publication chain. |
| Google Drive sebagai document layer | `DONE` | Model arsitektur sudah disetujui; integrasi belum dilakukan. |
| Gmail sebagai communication source | `DONE` | Simpan stable message/thread reference, bukan unrestricted mailbox. |
| IndexedDB untuk mobile preferences/cache | `DONE` | Bukan database operasional desktop. |
| Local state menjadi authoritative data | `CANCELED` | Official data harus berasal dari Google central services. |
| Vercel | `CANCELED` | Tidak digunakan. |
| PostgreSQL | `CANCELED` | Tidak digunakan pada MVP. |
| Play Store / native Android package | `CANCELED` | PWA dipasang langsung dari browser. |
| Mobile create/revise workflow | `CANCELED` | Mobile khusus monitoring. |

---

## 3. Completed Foundation

| Work item | Status | Location / note |
| --- | --- | --- |
| Local project folder | `DONE` | `C:\PROJECT\ERIM-PSH` |
| Local Git repository initialized | `DONE` | Branch `main`. |
| GitHub remote configured | `DONE` | `https://github.com/hadesolympuz-ID/ERIM-PSH.git` |
| Initial project README | `DONE` | Architecture baseline dan environment rules. |
| Static PWA shell | `DONE` | `apps/pwa` |
| PWA manifest | `DONE` | Initial installable-app metadata. |
| Service worker | `DONE` | Cache app shell; tidak cache cross-origin API data. |
| Mobile read-only screen foundation | `DONE` | Search, tour overview, driver, pending, quick links. |
| Development demo code | `DONE` | `DEV-PSH-0001` sebelum API terhubung. |
| Apps Script API skeleton | `DONE` | `apps-script` |
| Safe config examples | `DONE` | Tidak berisi ID atau secret sebenarnya. |
| Architecture documentation | `DONE` | `docs/architecture.md` |
| Permission baseline | `DONE` | `docs/permissions.md` |
| Initial data-model documentation | `DONE` | `docs/data-model.md` |
| Detailed function/process DFD baseline | `DONE` | `docs/DFD_DETAILED_FUNCTION_PROCESS.md`; Settings/connections, menu/button hierarchy, role ownership, local/online flow, Google table mapping, and implementation gaps documented. |
| Initial technical roadmap | `DONE` | `docs/roadmap.md` |
| Desktop dashboard data workbook | `DONE` | `preparation/ERIM-PSH_Desktop_Dashboard_Data_Foundation.xlsx` |
| Workbook structural verification | `DONE` | 35 sheets, 31 operational tables, 498 field definitions. |
| Workbook visual QA | `DONE` | Semua sheet diperiksa melalui rendered preview. |
| Google Drive connector/plugin | `DONE` | Tersedia; artifact belum di-upload. |
| Native Google Sheets import | `DONE` | Native Sheet `ERIM-PSH Desktop v1 - Central Data Foundation`. |
| Desktop local database schema | `DONE` | SQLite per user: draft, source snapshot, generated file, sync queue/result, audit, settings. |
| Publication-chain workbook update | `DONE` | `DEPARTMENT_PUBLICATIONS`, `PUBLICATION_LINKS`, dan `EXTERNAL_BOOKING_REFS`. |
| Windows installer v1.0 | `DONE` | NSIS installer plus `latest.yml` updater metadata. |
| Google browser sign-in adapter | `DONE` | Desktop OAuth + PKCE loopback; credentials still require DEV configuration. |
| DEV dummy authentication bypass | `DONE` | Google login removed from DEV UI; local publish simulation is fully operable. |
| Administrator DEV Console | `DONE` | Health checks for SQLite, dummy engine, Google account/Gmail/Drive/Sheets, Apps Script, GitHub, and updater. |
| ADMIN_DEV environment | `DONE` | Dummy publishing remains enabled while optional personal Google DEV connectivity can be tested. |
| GitHub Releases auto-update client | `DONE` | Check, download, restart-and-install flow implemented. |
| GitHub Secret Scanning | `DONE` | Enabled on public `hadesolympuz-ID/ERIM-PSH`; initial open-alert count verified as zero. |
| GitHub Push Protection | `DONE` | Enabled and verified in repository security settings. |
| Credential-safe `.gitignore` | `DONE` | Environment, Google/OAuth credential JSON, Apps Script local config, private keys/certificates, sessions, databases, logs, releases, and installers excluded. |
| Credential protection DFD | `DONE` | Credential classes, storage boundary, 72-hour reauthentication, build/release checks, and incident response documented. |
| Interactive reauthentication every 72 hours | `PENDING` | Implement with encrypted `authenticated_at`, `reauth_required_at`, scope hash, and privileged-action checks; independent from the temporary legacy Client Secret. |
| Legacy OAuth Client Secret removal | `PENDING` | Retained temporarily by project-owner decision; local SQLite only and forbidden from Git, logs, installers, Sheets, and Drive. |
| Git commit | `DONE` | Desktop v1.0 foundation committed intentionally. |
| GitHub push | `DONE` | Branch `agent/desktop-v1` pushed; draft PR #1 opened. |

---

## 4. Data Foundation

Workbook preparation sudah memiliki tabel:

### Control and master

- `CONFIG`
- `EMPLOYEES`
- `VENDORS`
- `STATUS_CATALOG`
- `DATA_DICTIONARY`

### Reservation and core operations

- `TOURS`
- `ITINERARY_REVISIONS`
- `WORK_ITEMS`
- `NOTIFICATIONS`
- `NOTIF_RECIPIENTS`
- `TOUR_DAYS`
- `SERVICES`

### Vendor booking and communication

- `SUPPLIER_BOOKINGS`
- `BOOKING_SERVICES`
- `COMMUNICATIONS`
- `FOLLOW_UPS`

### Transport

- `DRIVER_ASSIGNMENTS`
- `PRICE_LISTS`
- `PRICE_LIST_ITEMS`
- `TOC_REQUESTS`
- `TOC_ITEMS`
- `TRANSPORT_INVOICES`
- `TRANSPORT_INV_ITEMS`

### Finance

- `CUSTOMER_INVOICES`
- `CUSTOMER_INV_ITEMS`
- `PAYMENT_REQUESTS`
- `PAYMENTS`

### Management and control

- `KPI_DEFINITIONS`
- `KPI_RESULTS`
- `AUDIT_LOG`

### Additional tables approved for the revised architecture

- `DEPARTMENT_PUBLICATIONS`
- `PUBLICATION_LINKS`
- `EXTERNAL_BOOKING_REFS`
- Local-only: `LOCAL_DRAFTS`, `LOCAL_SOURCE_SNAPSHOTS`,
  `LOCAL_SYNC_QUEUE`, `LOCAL_SYNC_RESULTS`

Tabel tambahan ini sudah masuk workbook preparation dan native Google Sheet.

### Data model notes

| Decision | Status | Note |
| --- | --- | --- |
| Stable internal IDs | `DONE` | Semua official record menggunakan ID yang tidak berubah. |
| Customer Code searchable | `DONE` | Menjadi primary operational lookup, bukan database primary key. |
| Record version | `DONE` | Digunakan untuk mencegah stale update. |
| Stable Drive File ID | `DONE` | Current itinerary mempertahankan link stabil dan version history. |
| Effective-dated price lists | `DONE` | Perubahan harga tidak menimpa histori lama. |
| Per-user notification state | `DONE` | Read state terpisah untuk setiap recipient. |
| Append-only audit history | `DONE` | Tidak boleh ada silent history deletion. |
| Per-user local draft isolation | `DONE` | Model disetujui; implementasi belum dimulai. |
| Department publication chain | `DONE` | Hasil complete terhubung ke source publication/version. |
| Field-level visibility rules | `PENDING` | Perlu finalisasi per role. |
| Production sheet protection | `PENDING` | Diterapkan saat native Sheet dan Apps Script siap. |

---

## 5. Role Alignment

| Department | Agreed responsibility | Status |
| --- | --- | --- |
| Reservation | Confirmation intake, Customer Code ownership, itinerary post/revision, final checking setelah Vendor selesai, dan final delivery ke confirmation email. | `DONE` |
| Vendor Booking | Daywise, supplier split, booking, amendment/cancel, confirmation, dan follow-up. | `PENDING` |
| Transport | Driver/transporter, operational rates, TOC preparation, transport checking, dan transporter invoice. | `PENDING` |
| Ops Accounting | Customer invoice, final cost sheet, reconciliation, dan payment request. | `PENDING` |
| General Cashier | Validate approved request, execute payment, upload proof, dan mark paid. | `PENDING` |
| Manager/Admin | Master/config, approval, exception, KPI, access, recovery, dan audit review. | `PENDING` |

### Policy recommendations awaiting approval

| Policy | Recommended default | Status |
| --- | --- | --- |
| Final itinerary sender | Reservation sends after Vendor marks booking process complete. | `DONE` |
| Cost sheet ownership | Departments input components; Ops Accounting owns final Cost Sheet. | `PENDING` |
| Mark `PAID` authority | General Cashier only. | `PENDING` |
| Transport price changes | Use `effective_from`; never rewrite historical price. | `PENDING` |
| Revision affected departments | Manual selection for MVP. | `PENDING` |
| Gmail reply detection | Manual Open Thread first; automation later. | `PENDING` |
| WhatsApp booking evidence | Generated message + manual sent/confirmed status + optional proof. | `PENDING` |
| Portal booking evidence | Portal URL + external reference + status + proof; automation deferred. | `PENDING` |

---

## 6. Development Milestones

### Milestone 0 — Preparation and governance

**Goal:** Semua master, SOP, status, permission, dan ownership siap sebelum
official workflow dibangun.

| Deliverable | Status | Acceptance condition |
| --- | --- | --- |
| Job descriptions aligned | `IN PROGRESS` | Daily/weekly/monthly responsibilities approved. |
| Customer Code format | `PENDING` | Format and uniqueness rule documented. |
| Employee master | `PENDING` | Employees, emails, departments, roles, supervisors, active status complete. |
| Vendor master | `PENDING` | Vendor type, contact, channel, SOP, and active status complete. |
| Status catalogue approval | `PENDING` | Every module status and transition approved. |
| Permission matrix approval | `PENDING` | Role, action, and field visibility approved. |
| Approval limits | `PENDING` | Price, invoice, TOC, payment, and override limits documented. |
| KPI definitions | `PENDING` | Daily/weekly/monthly formulas and targets approved. |
| DEV dummy data | `PENDING` | No real customer data used. |

### Milestone 1 — Technical integration spike

**Goal:** Membuktikan jalur teknis end-to-end sebelum module development.

| Deliverable | Status | Acceptance condition |
| --- | --- | --- |
| Hostinger staging subdomain | `PENDING` | HTTPS page opens at approved staging URL. |
| PWA install Android | `PENDING` | App appears and opens standalone. |
| PWA Add to Home Screen iPhone | `PENDING` | App launches from Home Screen. |
| Google sign-in | `PENDING` | Only approved DEV users can enter. |
| Apps Script authenticated call | `PENDING` | Verified user reaches health/data endpoint. |
| Read one DEV tour | `PENDING` | PWA reads one dummy record. |
| Desktop local database | `PENDING` | One user creates and reloads an isolated local draft. |
| Desktop publishes one DEV record | `PENDING` | Complete/Post creates publication ID, version, and audit event. |
| Downstream publication chain | `PENDING` | Second department loads the published upstream version, not local DB. |
| Retry safety | `PENDING` | Failed post retries with the same idempotency key without duplication. |
| Mobile mutation rejected | `PENDING` | API returns stable `MOBILE_READ_ONLY` error. |
| Cross-origin decision | `PENDING` | Direct Apps Script confirmed or minimal Hostinger gateway approved. |

### Milestone 2 — Mobile monitoring MVP

**Goal:** Staff dapat mengecek informasi penting dari ponsel tanpa mengubah
official data.

| Deliverable | Status | Acceptance condition |
| --- | --- | --- |
| Customer Code search | `IN PROGRESS` | Exact code returns authorized tour detail. |
| Tour overview | `IN PROGRESS` | Client, agent, dates, version, and department progress visible. |
| Today/on-ground view | `IN PROGRESS` | Service, pickup, driver, vehicle, and transporter visible. |
| Pending confirmations | `IN PROGRESS` | Age, vendor, PIC, reason, and follow-up visible. |
| Current itinerary link | `PENDING` | Opens authorized Drive file. |
| Confirmation email link | `PENDING` | Opens correct Gmail thread. |
| Quotation email link | `PENDING` | Opens correct Gmail thread. |
| Supplier communication links | `PENDING` | Opens role-approved thread. |
| Role-filtered fields | `PENDING` | Financial/private fields hidden by API policy. |
| Timeline | `PENDING` | Latest official events visible. |
| Offline shell | `DONE` | App shell can load; official data remains online-controlled. |

### Milestone 3 — Desktop foundation and Reservation

| Deliverable | Status | Acceptance condition |
| --- | --- | --- |
| Desktop dashboard shell | `DONE` | Responsive desktop layout and role navigation ready. |
| Per-user temporary database | `DONE` | Isolated local drafts and sync queue work safely. |
| Controlled publication | `IN PROGRESS` | Client and server contract built; live Apps Script deployment test pending. |
| Personal notification inbox | `PENDING` | Independent unread/read state per user. |
| New confirmation intake | `PENDING` | Required ID/client/agent/email/document fields validated. |
| Current itinerary upload | `PENDING` | Stable Drive File ID and link retained. |
| Itinerary revision | `PENDING` | Version increments and mandatory notes saved. |
| Affected department tasks | `PENDING` | Review items created per selected department. |
| Final itinerary delivery | `PENDING` | Latest file sent/linked and delivery status recorded. |
| Reservation KPI/queue | `PENDING` | Pending reasons and aging available. |

### Milestone 4 — Vendor Booking

| Deliverable | Status | Acceptance condition |
| --- | --- | --- |
| Focused implementation baseline | `DONE` | Approved ownership, menu hierarchy, separate state machines, online/local table contract, claim rules, notification routing, delivery phases, and VB-01 acceptance tests are consolidated in `docs/VENDOR_BOOKING_BASE_PLAN.md`. |
| Vendor role dashboard design | `DONE` | Vendor-specific dashboard has independently scrolling Urgent, Pending, Replied, and Done sections with exact source conditions, navigation behavior, timezone/window rules, and no automatic reply-to-confirmed assumption. |
| Vendor role dashboard implementation | `IN PROGRESS` | v1.1.8 packages the four approved cards, stable shared Itinerary Check read model, Booking Register, and Work Inbox. Live authenticated data and operational UAT remain. |
| Shared generic Notification Inbox baseline | `DONE` | Every department uses the same display-only Inbox component; visible totals/information are filtered server-side by job description/role/assignment, while approved All Rounder/oversight roles may receive broader events. Subgroups and action lifecycle remain later work. |
| Universal Lookup foundation | `PENDING` | Reusable keyboard-friendly typeahead searches active vendors, aliases, programs, hotels, agents, staff, and Customer Codes on every keystroke; results are ranked contextually while manual organic detail remains available. |
| Daywise input workspace | `IN PROGRESS` | v1.0.8 loads the latest Drive DOCX, extracts editable arrival/departure/hotels, generates Day 1..N, and stores pasted staff text locally before controlled Post. Live dummy-case UAT remains. |
| Service split | `IN PROGRESS` | v1.0.8 records per-day Vendor/TOC/Vehicle/Additional Services micro splits into `SERVICES`; supplier grouping and booking generation remain later phases. |
| Central Supplier Master | `DONE` | v1.1.0 provides one Manager/Admin submenu for data-driven types, suppliers, repeatable contacts/recipients/SOPs, products, contracts, dated rates, archive, audit, and user-wide change notifications. v1.1.1 adds responsive formula-safe international contacts. v1.1.2 stages routine edits instantly in local SQLite and publishes reviewed changes to Google in one dependency-ordered batch; initialization is isolated inside protected System Maintenance. v1.1.3 adds create-only Excel import, per-batch conflicts, and filtered same-schema export. |
| Contract-aware micro split | `DONE` | Type, Supplier, and Product use the same central catalog; valid service-date contracts load automatically, missing/expired contracts become `PENDING_RATE`, and booking-only manual rates require reason/source. Packaged v1.1.0 and automated tests verify the flow. |
| Vendor search/assignment | `PENDING` | Vendor is selected through Universal Lookup using a stable `vendor_id`; active approved matches appear first, aliases resolve to the canonical vendor, and staff can intentionally expand to all authorized vendors. |
| Booking generation | `IN PROGRESS` | v1.1.8 provides item readiness, Supplier Master correction links, SOP-driven channel choice, and replaceable `STANDARD_V1` mail merge. Final owner samples, attachment rules, and live UAT remain. |
| Email/WhatsApp helper | `IN PROGRESS` | v1.1.8 preserves immutable generated/send snapshots and external-channel evidence; live operational UAT remains. |
| Email booking link | `IN PROGRESS` | v1.1.8 stores Gmail message/thread IDs, exposes thread links, and detects replies as `REVIEW_REQUIRED`; connected-account UAT remains. |
| Portal booking reference | `PENDING` | URL, reference, status, last check, and proof recorded. |
| Amendment/cancellation | `PENDING` | Revision impact traceable per booking/service. |
| Pending confirmation queue | `PENDING` | Reason, aging, follow-up, and escalation available. |
| Vendor search/export | `PENDING` | Date/vendor/status filters and XLSX output verified. |

### Milestone 5 — Transport

| Deliverable | Status | Acceptance condition |
| --- | --- | --- |
| Daily transport requirement | `PENDING` | Pulled from published tour days/services. |
| Driver/vehicle assignment | `PENDING` | Supports per day, service, or whole itinerary. |
| On-ground mobile detail | `PENDING` | Current driver detail visible read-only. |
| Effective rate list | `PENDING` | Historical rates remain unchanged. |
| Transport cost checking | `PENDING` | Checked/Need Review with mandatory reason. |
| TOC preparation | `PENDING` | One request per itinerary with selectable approved items. |
| TOC submission/payment trace | `PENDING` | Transport submits; Cashier marks paid. |
| Transporter invoicing | `PENDING` | Grouped by vendor and itinerary. |
| Date-based travel export | `PENDING` | Stable XLSX export structure. |

### Milestone 6 — Finance and Cashier

| Deliverable | Status | Acceptance condition |
| --- | --- | --- |
| Customer invoice | `PENDING` | Uses latest confirmation/quotation reference. |
| Invoice revision | `PENDING` | Addition/reduction traceable. |
| Cost Sheet | `PENDING` | Costs trace to services/bookings/transport/TOC. |
| Reconciliation | `PENDING` | Variance and resolution recorded. |
| Payment request | `PENDING` | Complete support required before submission. |
| Cashier review | `PENDING` | Incomplete requests returned with reason. |
| Payment execution | `PENDING` | Amount/date/reference/proof recorded. |
| Overpaid/underpaid handling | `PENDING` | Status and resolution workflow approved. |

### Milestone 7 — Manager, reports, and KPI

| Deliverable | Status | Acceptance condition |
| --- | --- | --- |
| Manager control center | `PENDING` | Input-date, aging, pending, exception, and progress visible. |
| Weekly reporting | `PENDING` | Issues, suggestions, pending reasons, and KPI ready for briefing. |
| Monthly reporting | `PENDING` | Trend and post-briefing review recorded. |
| KPI engine | `PENDING` | Metrics use approved visible definitions. |
| Access review | `PENDING` | Active user and role review auditable. |
| Audit review | `PENDING` | Official events searchable and protected. |
| Supplier/rate administration | `DONE` | Manager/Admin changes are immediate, audited, centrally stored, and broadcast; archive preserves booking history. |
| Backup/recovery test | `PENDING` | Recovery owner and procedure verified. |

### Milestone 8 — UAT and production readiness

| Deliverable | Status | Acceptance condition |
| --- | --- | --- |
| UAT scenarios | `PENDING` | Critical workflows tested with expected/observed results. |
| Security review | `PENDING` | No anonymous mutation or client-only authorization. |
| Data migration decision | `PENDING` | New-data-first vs selected historical import approved. |
| Production Google ownership | `PENDING` | Company account/Shared Drive owns resources. |
| Production deployment | `PENDING` | Versioned Apps Script and Hostinger release. |
| Pilot | `PENDING` | Selected departments complete real controlled cases. |
| Go-live approval | `PENDING` | Owner signs off scope, support, and recovery. |

---

## 7. Current Blockers and Dependencies

| Item | Status | Required action |
| --- | --- | --- |
| Google Sheet import | `DONE` | Native Google Sheet created and structurally verified. |
| Google resource IDs | `DONE` | Personal DEV Sheet, Drive folder, and Apps Script deployment are connected. |
| Local database technology | `DONE` | Electron + SQLite validated with automated tests. |
| Publication-chain schema | `DONE` | Workbook and Apps Script contract aligned. |
| OAuth / Google identity | `DONE` | Personal DEV Google OAuth is connected; company Workspace migration remains a later milestone. |
| Hostinger access | `PENDING` | Provide staging subdomain/hosting access when deployment begins. |
| Company roles and employees | `PENDING` | Complete employee master. |
| Approved status transitions | `PENDING` | Review `STATUS_CATALOG`. |
| Cross-origin integration | `DONE` | Desktop-to-Apps-Script publication and central Sheet readback verified end-to-end. |
| GitHub publication | `DONE` | Branch `agent/desktop-v1` and draft PR #1 available for review. |

---

## 8. Next Recommended Actions

Do these in order:

### Next desktop dummy update

| Feature | Status | Initial direction |
| --- | --- | --- |
| Template Booking | `PENDING` | Reusable booking templates by service/vendor/channel with controlled fields and preview. |
| Template Report | `PENDING` | Reusable operational report templates with department, period, and status filters. |
| Show/hide sidebar + collapsible menus | `DONE` | The detailed full-text sidebar is retained. Clicking the application logo toggles the whole sidebar; hidden mode leaves a narrow logo strip and expands content. Parent menu groups independently collapse/expand, active state is restored, and preferences persist locally. No icon-only navigation was added. |
| Bulk duplicate Supplier Product | `DONE` | A Product can be copied locally to one or many active same-Type suppliers with optional Contract metadata and matching Rates. New IDs are generated, Drive evidence is excluded, same-name conflicts are skipped/reported, and all successful copies enter Local Pending. |
| Transport operational submenu foundation | `DONE` | Prepared New/Revise Itinerary Check, Add Cost, Driver Detail, Arrival, TOC, KPI, Day Tour, and Invoicing work areas. Pages define workflow boundaries without activating unapproved operational writes. |
| Type/stage Supplier Master publication | `OPEN` | Trial issue `UAT-115-001`: publish one Supplier Type at a time in confirmed Supplier → Product → Contract/Rate stages. |
| Parent dashboard vs submenu collapse | `OPEN` | Trial issue `UAT-115-002`: parent label always opens the department dashboard; a separate control expands/collapses its submenu. |
| Multi-select Product duplication | `OPEN` | Trial issue `UAT-115-003`: checkbox selection, Select all visible, selected count, preview matrix, and per Product/supplier result tracking. |
| Export / Import menu | `DONE` | Manager/Admin submenu supports one Type per operation, official XLSX template, required-header validation, create-only duplicate protection, preview, local Pending staging, per-batch conflict reports, direct existing-record correction, filtered supplier selection, and same-schema export. Hotel remains a separate future submenu with a seasonal model. |

### Scheduled Vendor Booking development

Version numbers below are the proposed incremental delivery order. Each release
must remain testable with dummy data before the next release starts.

| Proposed version | Scope | Status | Acceptance condition |
| --- | --- | --- | --- |
| v1.0.8 | Vendor role dashboard, generic Notification Inbox, and work queue | `PENDING` | Vendor receives independently scrolling Urgent, Pending, Replied, and Done sections; the shared Inbox only displays job-description-permitted totals/information; Pending routes to Generating Booking, Done shows check-ins from tomorrow through +7 days read-only, and work items own claim/action state. |
| v1.0.9 | Universal Lookup, daywise service input, and supplier split | `PENDING` | Vendor can create/revise stable daywise service items; find programs/vendors through live per-keystroke typeahead with keyboard navigation, contextual ranking, aliases, and canonical IDs; retain manual organic booking detail; group services into supplier bookings; and validate unassigned/duplicate items before saving. |
| v1.0.10 | Five-type micro split and independent rate status | `DONE` | Vendor, TOC, Transport, Luggage Van, and Additional Service use type-aware provider/service lookup and price snapshots; `PENDING_RATE` does not block booking communication. |
| v1.0.11 | Micro split Type dropdown hotfix | `DONE` | Type is a fixed five-option select, so Vendor, TOC, Transport, Luggage Van, and Additional Service remain visible regardless of the current selection. |
| v1.1.0 | Supplier Master and contract-rate foundation | `DONE` | One Manager/Admin menu maintains dynamic types, suppliers, unlimited contacts/recipients/SOPs, products, contract documents, validity and rates. Changes are immediate, audited, broadcast, and consumed by Micro Split with pending/manual-rate rules. Apps Script Version 15 and GitHub Release v1.1.0 are live. |
| v1.1.1 | Supplier contact layout and `+` number hotfix | `DONE` | Contact persons and booking recipients render as responsive cards; phone/WhatsApp inputs accept international formatting, normalize the leading `+`, remain literal text in Google Sheets, and recover formula-error cells. Apps Script Version 16 and GitHub Release v1.1.1 are live. |
| v1.1.2 | Supplier Master local staging and batch publish | `DONE` | Supplier, product, contract, type, and archive edits save immediately to SQLite with pending/conflict/failed states. Reviewed changes publish through one Apps Script batch, refresh the central catalog once, and create one user-wide summary notification. Initialize/migrate is protected inside System Maintenance. Apps Script Version 17 and the v1.1.2 installer are complete. |
| v1.1.3 | Supplier Import / Export foundation | `DONE` | Official Excel template, create-only import, required-header validation, preview, conflict ledger/export, local Pending staging, selective filtered export, and responsive Manager/Admin UI. Supplier types are Vendor, TOC, Transport, Luggage Van, and Additional Service; Hotel stays outside this menu. |
| v1.1.4 | Supplier archive-dialog hotfix | `DONE` | Replaces unsupported Electron `window.prompt` with an in-app controlled archive modal containing record identity, impact summary, mandatory reason, cancel, and local queue confirmation. |
| v1.1.5 | Product duplication, adaptive sidebar, and Transport menu foundation | `DONE` | Bulk same-Type Product/Contract/Rate copies stage locally with conflict protection; logo show/hide and collapsible full-text menus persist; all requested Transport work areas are present as safe foundations. Installer, packaged ASAR, isolated startup, visual QA, syntax, and all 38 tests pass. |
| v1.1.6 | Supplier publication and Micro Split foundation rehabilitation | `IN PROGRESS — FINAL UAT` | One selected set is published by Type through Supplier → Product → Contract/Rate chunks; Google readback drives persistent per-item status and confirmed percentage; failed dependencies can safely resume; Supplier/Product remain selectable as `PENDING_RATE`; each Day resolves its own contract validity; new local Product/Contract entries appear first. Micro Split passed user trial. Apps Script Web App Version 18 is active on the existing URL and returns JSON health; Supplier refresh safely falls back to SQLite during a remote outage. Department dashboard and submenu controls are separated, and Product duplication supports persistent multi-select with a Product x supplier preview and per-combination results. Source checks and all 43 automated tests pass; the rebuilt installer and mixed-Type 94-record live publish UAT remain. |
| v1.1.7 | Booking template, preview, and Gmail send | `IN PROGRESS — UAT READY` | Local Micro Split records form live Customer Code + supplier packages for Vendor and Additional Service only. Supplier Master SOP/channel/recipient data creates editable previews; pending rates do not block generation; Email requires a generated snapshot and final confirmation before Gmail send; WhatsApp/Portal/Others require an external evidence reference before Sent. Gmail message/thread IDs and exact local snapshots are retained. |
| v1.1.7 | Revision impact and booking amendment | `IN PROGRESS — FOUNDATION` | Revise reuses the complete New Itinerary editor and Generate exposes Amendment without overwriting a previously sent booking. Automatic old/new per-item impact classification remains pending. |
| v1.1.7 | Vendor re-check and booking completion | `PENDING` | Every supplier booking is marked Sent, Pending, Confirmed, Changed, or Canceled with actor/time/note/evidence; incomplete items block Booking Complete publication and the resulting notification reaches Reservation. |
| v1.1.7 | Reservation daywise drill-down and communication viewer | `PENDING` | Clicking a day opens all linked service, vendor booking, transport, TOC, status, PIC, and notes; clicking an email-channel booking opens its complete Gmail thread in a separate system window/panel. |

#### Vendor Daily — New Confirmation

1. Receive and acknowledge the new-itinerary notification.
2. Load the exact published Reservation version, linked itinerary, confirmation
   thread, and current daywise record.
3. Create stable daywise service items from the itinerary without editing raw
   Google Sheets.
4. Split the service items into supplier/vendor booking packages.
5. Select an approved active vendor through Universal Lookup. Each typed
   character immediately narrows and re-ranks the visible list by exact/prefix
   match, program relevance, active status, and usage; keyboard navigation is
   supported, while `Show all vendors` remains available for authorized staff.
6. Generate the booking communication from the applicable SOP/template.
7. Preview recipients, subject, body, attachments, and source itinerary version.
8. Send or record the booking action and retain Gmail/external references.
9. Re-check each processed booking and mark its result with actor, time, note,
   and evidence.

#### Vendor Daily — Revised Confirmation

1. Receive and acknowledge the revised-itinerary notification, including its
   revision number and Reservation note.
2. Load the previous Vendor publication and the exact new Reservation source
   version.
3. Show a per-service impact comparison between the old and new itinerary.
4. Require an explicit decision for every affected item: unchanged, add,
   change, rebook, or cancel.
5. Revise daywise service items without replacing their historical versions.
6. Revise supplier splits and identify which existing supplier bookings are
   affected.
7. Generate amendment/cancellation/new-booking communications using the
   applicable SOP/template.
8. Send or record each action, retain the linked thread/evidence, and run the
   final re-check before publishing the revised Vendor result.

#### Vendor Daily — Itinerary bookings confirmed

1. Receive the booking-process-done task only when all required supplier items
   have a resolved operational status.
2. Re-check every itinerary item against the latest confirmation, itinerary,
   supplier booking status, and evidence.
3. Resolve or explain every exception before the case can be completed.
4. Publish `VENDOR_BOOKING_COMPLETE` with the exact source itinerary revision.
5. Trigger the final-itinerary handoff and record `SENT`, `PENDING`, or
   `CANCELED`, including actor, time, recipient, Gmail thread/message ID, and
   reason.

#### Confirmed Vendor workflow decisions — approved implementation baseline

These decisions are approved for the future Vendor Booking releases but are not
implemented yet. The focused build contract and phase gates are maintained in
`docs/VENDOR_BOOKING_BASE_PLAN.md`.

| Point | Approved decision | Planned implementation |
| --- | --- | --- |
| Ownership and final delivery | Reservation remains the Customer Code owner and final itinerary sender. Vendor breaks the itinerary into daywise and micro booking items, confirms every required item, and publishes `VENDOR_BOOKING_COMPLETE`; this triggers Reservation final check. | v1.0.14-v1.0.15 |
| Micro-item confirmation | Every supplier booking has independent `CONFIRMED` and `NOT_CONFIRMED` review actions. `NOT_CONFIRMED` requires category/reason and remains open for additional review attempts until resolved. | v1.0.10-v1.0.14 |
| Gmail read and review evidence | Gmail read state applies only to the mailbox of the staff who opens it. Opening a notification and successfully loading its email must append `EMAIL_REVIEW_OPENED` online even when no business status changes. | v1.0.12 |
| Notification routing | Recipients are generated by event/category, department, role, and assignment. Operational departments do not receive unrelated alerts. `NOT_CONFIRMED` reaches the required follow-up departments; `VENDOR_BOOKING_COMPLETE` reaches Reservation and authorized oversight roles. | v1.0.8-v1.0.14 |
| Local notification retention | Each PC keeps its user Inbox in local SQLite for 90 days. Central notification distribution and long-term audit remain online. | v1.0.8 |
| Manager audit visibility | Review attempts, opens, status changes, reasons, actors, source revision, and evidence references are append-only online records for Manager/All Rounder oversight. Staff operational screens emphasize current status and relevant history. | v1.0.8-v1.0.14 |
| Concurrent item claim | The first staff member who opens an unclaimed work item receives edit ownership. Other staff see the current owner and a read-only notice. Claim, release, finish, expiry, and authorized takeover are centrally controlled and audited. | v1.0.8 |
| DEV sending safety | Real send testing will use approved dummy/whitelisted email addresses supplied by the project owner. Non-whitelisted recipients remain blocked in DEV. | v1.0.12 |
| Vendor contacts and templates | Each vendor has structured destination and multi-CC contact rules plus approved channel/template/SOP versions. Sample templates will be reviewed in the scheduled Vendor Template discussion. | v1.0.10-v1.0.12 |
| WhatsApp timestamps | Manual WhatsApp `SENT` and `CONFIRMED` actions record timestamp, actor, channel, attempt, and optional evidence. These timestamps support later vendor response-time review. | v1.0.12-v1.0.14 |
| Organic-first data entry and Universal Lookup | The system supplies context, suggestions, validation, and coordination without replacing staff judgement. Free-text operational detail such as `02 HRS SPA 13.00` remains editable and authoritative. Vendor/program selection uses a reusable live typeahead component backed by stable IDs, aliases, and contextual ranking. | v1.0.9 |

#### Required decisions and safeguards before implementation

| Notice / decision | Recommendation | Status |
| --- | --- | --- |
| Final itinerary sender ownership | Reservation is confirmed as the customer/agent-facing final sender. Vendor publishes `BOOKING_COMPLETE` and triggers the Reservation final-check task. | `DONE` |
| Two Vendor staff working the same code | Auto-claim the first opener through a central atomic lock; the second opener is read-only and sees owner/time. Add expiry, release, finish, stale-data warning, and controlled takeover. | `DONE` |
| Booking status separation | Keep service requirement, supplier booking, communication delivery, and supplier confirmation as separate statuses. Generated email must not equal Sent or Confirmed. | `PENDING` |
| Revision safety | Never auto-cancel or overwrite a confirmed supplier booking from a text comparison. Show the impact and require a human decision with a note. | `PENDING` |
| DEV email safety | Approved dummy-recipient whitelist will be used for send testing; addresses are still to be provided. | `DONE` |
| Supplier master readiness | Use structured vendor contacts for destination and multiple CC addresses; include channel, timezone, cutoff, cancellation policy, template/SOP version, and active status. Samples remain pending. | `PENDING` |
| Canonical vendor and alias mapping | Keep one stable `vendor_id` per official vendor and map historical spelling variants to it. Autocomplete may suggest a canonical match but must not silently replace an intentional staff choice. | `PENDING` |
| Lookup performance and fallback | Search locally cached authorized master data on every keystroke, support arrow/Enter/Escape controls, show why a result matched, and provide an intentional `Show all` fallback when program filtering is too narrow. | `PENDING` |
| Stable item identity | Assign immutable IDs to tour days, services, supplier bookings, and communications. Do not identify records only by row order or description text. | `PENDING` |
| Many-to-many supplier split | Use `BOOKING_SERVICES`; one supplier booking may contain multiple services and one requirement may need multiple suppliers. | `PENDING` |
| Template versioning | Save the template version and final sent-content snapshot so later SOP edits do not change historical evidence. | `PENDING` |
| Gmail evidence | Store thread ID, message ID, recipient snapshot, sent timestamp, attachment Drive IDs, and sender. Do not depend only on a Gmail URL. | `PENDING` |
| WhatsApp and portal vendors | Use manual evidence/reference workflows; never store passwords. Email automation must not be treated as the only booking channel. | `PENDING` |
| Notification lifecycle | Initial shared Inbox is display-only. Add subgroup classification, deep links, unread/read, acknowledge, resolved, escalation, and 90-day local lifecycle later; work claim remains separate from notification state. | `PENDING` |
| KPI timestamps | Capture received, acknowledged, claimed, first action, sent, supplier confirmed, revised, canceled, and completed timestamps per actor. | `PENDING` |
| Daywise drill-down privacy/performance | Load linked details on demand and apply role filtering; do not download every Gmail trail or financial field when a day is opened. | `PENDING` |

### Following actions

1. Approve final-itinerary sender ownership.
2. Complete Vendor master fields, alias/program mappings, Universal Lookup
   ranking rules, and approved status transitions.
3. Provide one New Confirmation sample, one Revised Confirmation sample, and
   one complete supplier-booking email trail for dummy UAT.
4. Define the required Booking Template types, recipients, subject rules, body
   fields, attachments, and CC rules.
5. Approve DEV email safety mode: Draft only or recipient whitelist.
6. Define the required Report Template layouts and recipients.
7. Approve which tables are allowed for import and export per department.
8. Implement preview and validation before any imported data is accepted.

---

## 9. Project Notes

- Development currently uses personal GitHub and Google resources for modeling.
- Production resources must eventually move to company-owned Google Workspace.
- DEV must not contain real customer data or send emails to real vendors.
- Environment IDs, OAuth values, folder IDs, and deployment URLs must not be
  committed as source-code constants.
- Apps Script ownership/deployment may need recreation when moving from a
  personal account to company ownership.
- Apps Script and Google service quotas must be monitored during testing.
- Official production records should be changed through the application/API,
  not by uncontrolled direct edits to raw Sheets.

---

## 10. Change Log

| Date | Change | Status |
| --- | --- | --- |
| 2026-07-26 | Initial repository and local architecture foundation prepared. | `DONE` |
| 2026-07-26 | Hostinger static PWA + Apps Script + Google Sheets direction approved. | `DONE` |
| 2026-07-26 | Mobile scope fixed as read-only monitoring. | `DONE` |
| 2026-07-26 | IndexedDB retained only for mobile preferences/cache. | `DONE` |
| 2026-07-26 | Desktop changed to per-user temporary local database with controlled publish. | `DONE` |
| 2026-07-26 | Hostinger subdomain confirmed as mobile-only. | `DONE` |
| 2026-07-26 | Reservation confirmation, Ops quotation, Vendor email/WA/portal link strategy documented. | `DONE` |
| 2026-07-26 | Desktop dashboard simplified to notification Inbox; Reservation itinerary actions moved to submenu; Add New Itinerary reduced to Customer Code. | `DONE` |
| 2026-07-26 | Reservation intake expanded with Customer Name, Agent typeahead/add-new flag, Gmail confirmation linking, and normalized itinerary upload to Google Drive. | `DONE` |
| 2026-07-26 | Revise Itinerary workflow added: central Customer Code lookup, daywise/status view, embedded scrollable DOCX content, mandatory revised DOCX and revision note, Drive file replacement with revision numbering. | `DONE` |
| 2026-07-26 | Gmail confirmation trail viewer and Reservation pending follow-up KPI foundation added, including aging bands, cross-department waiting field, mandatory pending reason on update, and resolution tracking. | `DONE` |
| 2026-07-26 | Central Google Sheet Reservation KPI database and management summary created; desktop cloud upsert connector prepared but activation deferred. | `IN PROGRESS` |
| 2026-07-26 | Reservation submenu `Cek KPI` and personal local KPI screen prepared; cloud KPI synchronization intentionally deferred until the later implementation milestone. | `DONE` |
| 2026-07-26 | Desktop v1.0.3 compiled for Reservation workflow, Gmail trail, Drive itinerary handling, revision control, notification Inbox, and personal KPI screen. | `DONE` |
| 2026-07-26 | GitHub Release v1.0.3 published with NSIS installer, blockmap, and latest.yml; updater feed verified as latest. | `DONE` |
| 2026-07-26 | Office Customer Code format implemented: slash preserved for database/Gmail, Sales Code and File Code stored separately, Drive filename normalized safely, and Gmail fallback search added. | `DONE` |
| 2026-07-26 | GitHub Release v1.0.4 published and installed locally for office Customer Code and Gmail attachment testing. | `DONE` |
| 2026-07-26 | ADMIN_DEV publication routing corrected from local dummy mode to the live Apps Script API; legacy dummy-sync records are automatically requeued once. | `DONE` |
| 2026-07-26 | Apps Script deployment v3 activated with Reservation NEW_CONFIRMATION upsert into central TOURS and Gmail/Drive reference fields. | `DONE` |
| 2026-07-26 | Four pending Reservation records published through ONLINE_APPS_SCRIPT; AK/PSHBALI4804 verified directly in central TOURS with customer, agent, and Gmail thread data. | `DONE` |
| 2026-07-26 | Desktop v1.0.5 completed with explicit Sync Mode visibility and 11 passing automated tests. | `DONE` |
| 2026-07-26 | GitHub Release v1.0.5 published with installer, blockmap, and latest.yml; feed, checksum, silent installation, executable version, and running process verified. | `DONE` |
| 2026-07-26 | Dedicated Google Drive folder `ERIM-PSH - ITINERARIES` created; four existing test itineraries moved from Drive root and the folder ID configured as the desktop upload destination. | `DONE` |
| 2026-07-26 | Itinerary upload guardrail added: desktop must reject uploads when the official Drive Folder ID is not configured instead of silently writing to Drive root. | `DONE` |
| 2026-07-26 | GitHub Release v1.0.6 published and installed; updater feed, executable version, persistent Folder ID, running process, and 12 automated tests verified. | `DONE` |
| 2026-07-26 | Apps Script deployment Version 4 activated on the existing `/exec` URL with append-only itinerary events and broadcast notification recipients for every active system user. | `DONE` |
| 2026-07-26 | Desktop v1.0.7 released and installed with Re Check Itinerary, independent Gmail/daywise/Drive panes, latest-itinerary download folder actions, central Inbox notifications, and a per-code activity logbook for post/revision/download accountability; GitHub updater feed and 13 automated tests verified. | `DONE` |
| 2026-07-26 | Vendor Booking development schedule proposed for v1.0.8-v1.0.15, covering Daily Inbox, new/revised daywise, supplier split, SOP email generation, revision impact, booking re-check, final handoff, and Reservation daywise drill-down; ownership and safety decisions remain pending. | `PENDING` |
| 2026-07-26 | Vendor workflow Point 1 finalized: Reservation retains Customer Code ownership and final delivery; Vendor completes per-micro-item confirmation, online review audit, and `VENDOR_BOOKING_COMPLETE` handoff. Claim/read-only concurrency, event-based notification routing, DEV whitelist, structured multi-CC vendor contacts, and WhatsApp timestamps were approved for later implementation. | `DONE` |
| 2026-07-27 | Universal Lookup/typeahead added to the Vendor Booking development plan at v1.0.9: live per-keystroke vendor/program filtering, contextual ranking, keyboard navigation, canonical vendor IDs with aliases, `Show all` fallback, and organic manual booking detail retained. | `DONE` |
| 2026-07-27 | Reservation Role Alignment finalized: Reservation owns the Customer Code, confirmation intake, itinerary post/revision, final checking after Vendor completion, and final itinerary delivery to the confirmation email. | `DONE` |
| 2026-07-27 | Detailed ERIM-PSH function/process DFD baseline created with hierarchical Settings, shared services, every current/planned department menu, button-to-data mapping, Local SQLite/App Script/Sheets/Drive/Gmail flows, Vendor Universal Lookup placement, and schema-alignment gaps. | `DONE` |
| 2026-07-27 | Overall product progress recorded at approximately 30%. Workbook/master data will be completed just in time with each workflow; immediate priorities are employee access/position, vendor identity and contacts, versioned transport pricing, and TOC data. Employee passwords will never be stored in the workbook. | `DONE` |
| 2026-07-27 | Future Sales & Production chain recorded as a later phase after the operational core: effective-dated contract rates, daywise rate calculation, derived/implied selling rates, quotation/version/reply trail, accepted confirmation handoff, rate sheet, Cost Sheet, invoicing, payment, and variance linkage. Issued commercial records preserve rate snapshots and are never silently recalculated by later contract updates. | `DONE` |
| 2026-07-27 | Credential-protection hardening completed for current scope: GitHub Secret Scanning and Push Protection enabled with zero initial open alerts; ignore rules expanded and verified; detailed DFD controls, pre-commit/pre-release scanning, incident response, and planned 72-hour interactive reauthentication recorded. Legacy OAuth Client Secret remains temporarily in local SQLite by project-owner decision and must never enter Git, logs, installer resources, Sheets, or Drive. | `DONE` |
| 2026-07-27 | Vendor Booking focused implementation baseline approved and consolidated: ownership, menu hierarchy, independent work/service/booking/communication/result states, online/local table contract, atomic claim rules, Universal Lookup, New/Revised Confirmation flows, evidence handling, notification routing, VB-01–VB-08 delivery phases, and first-sprint dummy UAT are recorded in `docs/VENDOR_BOOKING_BASE_PLAN.md`. | `DONE` |
| 2026-07-27 | Department-specific dashboard principle approved. Vendor Dashboard baseline now contains independent-scroll Urgent (>72 hours from applicable Reservation New/Revise/Cancel publication and unresolved), Pending (micro split but outbound action not sent, with Generate Booking route), Replied (linked inbound vendor reply awaiting human review), and Done (read-only completed Customer Codes checking in tomorrow through +7 days). | `DONE` |
| 2026-07-27 | Notification Inbox scope clarified: one shared generic display-only component for all departments, initially showing permitted event totals/latest information without claim or mutation. Apps Script filters recipients by job description, department, role, assignment, and oversight; All Rounder and approved higher roles may receive broader events. Inbox subgroup classification and full lifecycle are deferred. | `DONE` |
| 2026-07-27 | Desktop v1.0.8 Vendor Booking Sprint 1 implemented locally: six Vendor submenus, four-panel role dashboard, notification deep-link for New/Revise events, editable Adult/Child/Infant pax and flight/hotel intake, unlimited hotel rows, generated Day 1..N, side-by-side Drive DOCX viewer, micro split editor, SQLite draft persistence, and controlled `vendor.intake.save` Apps Script mutation. Existing `TOURS.pax_adult`, `pax_child`, and `pax_infant` columns are reused end-to-end. | `IN PROGRESS` |
| 2026-07-27 | Apps Script Version 7 deployed on the existing `/exec` URL. Version 6 Vendor intake controls remain, while Vendor New Itinerary now persists validated Adult/Child/Infant values to existing `TOURS.pax_adult`, `pax_child`, and `pax_infant` fields and records them in the audit payload. | `DONE` |
| 2026-07-27 | Workbook foundation aligned for Vendor Sprint 1: `TOUR_HOTEL_STAYS` added, TOURS flight fields and SERVICES suggested-vendor fields appended, SHEET_INDEX/DATA_DICTIONARY updated, formula scan clean, and visual table preview verified. | `DONE` |
| 2026-07-27 | Vendor Sprint 1 automated suite passes 17/17 tests; isolated-profile Electron startup smoke test completed without application errors. Live authenticated Post/readback dummy UAT remains before v1.0.8 installer release. | `IN PROGRESS` |
| 2026-07-27 | GitHub Release v1.0.8 published from commit `4de1488` with NSIS installer, blockmap, and `latest.yml`. Apps Script Version 7 and the desktop release now contain the Vendor Inbox/New Itinerary baseline plus Adult/Child/Infant persistence. Live authenticated Post/readback dummy UAT remains. | `DONE` |
| 2026-07-27 | Desktop v1.0.9 UI refinement started: customer/pax identity remains one aligned row, Arrival and Departure use parallel grouped fields, and every Day Wise row has an editable Tour Day Header beside its service date. The header persists locally and posts to `TOUR_DAYS.day_title`. | `IN PROGRESS` |
| 2026-07-27 | Vendor v1.0.9 micro-split workspace changed to a wide resizable two-pane dialog per Day: left is the independent service split editor and right is reserved for Day Wise/email/evidence context. `Save split locally` atomically autosaves the full current Vendor intake to local SQLite only (`LOCAL_DRAFT`); no Apps Script, Sheet, Gmail, or online publication occurs until a separate controlled online/generate-stage action. The desktop main window now opens maximized while retaining standard minimize/restore controls. | `IN PROGRESS` |
| 2026-07-27 | Vendor Day Wise now derives its hotel context live from the ordered hotel stay list. Each Day displays the active hotel plus a separate Hotel Change column; a checkout/check-in transition date displays the outgoing and incoming hotels together, while unmatched dates show `Hotel not assigned`. The display recalculates immediately after hotel name/date or Day date changes and does not duplicate hotel data in SQLite or Sheets. | `IN PROGRESS` |
| 2026-07-27 | Vendor Day Wise header extended with required Start Time and optional Finish Time. A Day cannot open Micro Split without Start Time; partial local drafts remain allowed, while controlled online posting rejects any Day without Start Time. SQLite migration adds `vendor_day_drafts.start_time` and `finish_time`; Apps Script Version 11 now provides matching `TOUR_DAYS` headers and server-side validation. | `DONE` |
| 2026-07-27 | Tester master data integrated with the central Google Sheet as source of truth: `TOC_MASTER` contains 82 rows, `VENDOR_RATE_MASTER` contains 232 rows, and `MASTER_DATA_STATE` records version/checksum/validity through 16 December 2026. Every desktop startup recomputes the online checksum and atomically refreshes SQLite only when changed; offline/invalid reads retain the last good cache. No rate rows are stored in Git or bundled releases. Type `TOC` receives its own suggestions; transport rates remain 0/pending. | `DONE` |
| 2026-07-27 | Updater rollback appearance diagnosed: the installed release correctly restored published v1.0.8, while the newer Day Wise UI existed only as uncommitted v1.0.9 source. Release procedure now requires source commit, packaged `app.asar`, executable version, `latest.yml`, release tag, and asset checksum to be verified against the same build before updater handoff. | `DONE` |
| 2026-07-27 | GitHub Release v1.0.9 published from commit `d2ed6f0` with installer, blockmap, and `latest.yml`. Packaged executable and ASAR report v1.0.9 and contain the approved Day Wise/Micro Split UI plus Google Sheet master-cache sync; raw rate data is absent. Online `latest.yml` exactly matches the local build, GitHub marks v1.0.9 Latest, and all three release assets are uploaded successfully. | `DONE` |
| 2026-07-27 | Apps Script production-style DEV deployment completed as Web app Version 11 with `Anyone` access and owner execution. Versioned source verification confirms `dayTitle`, `start_time`, and `finish_time`; the new `/exec` health endpoint returns `ok: true`. Local desktop `api_base_url` was migrated from the obsolete Version 7 deployment URL to the new Version 11 Web app URL. The former deployment was converted to a read-only Library by an Apps Script API update attempt and is no longer used. | `DONE` |
| 2026-07-27 | Micro split generalized to Vendor, TOC, Transport, Luggage Van, and Additional Service with type-aware provider/service lookup and price snapshots. Additional Service may be saved as `PENDING_RATE` without blocking email/WhatsApp/portal booking; rate completion remains a separate financial gate. DEV-only priced Transport/Luggage fixtures and Vendor `Additional` services `Garland` and `Water` were added pending approved production master data. Automated suite passes 21/21 tests and the packaged v1.0.10 ASAR contains the approved five-type catalogue and rate-status logic. | `DONE` |
| 2026-07-27 | Apps Script Web app Version 13 deployed for the v1.0.10 micro-split contract with owner execution and `Anyone` access. The new `/exec?action=health` endpoint returns HTTP 200 and `ok: true`; the desktop `api_base_url` now points to deployment `AKfycbx0UhP8kweXnPQnErA6oE5GgD2d2BomoJGDXpOeL2080LkW51JzZ83eFkaIpZih3o5hFw`. | `DONE` |
| 2026-07-27 | GitHub Release v1.0.10 published from implementation commit `8e36769` with the NSIS installer, blockmap, and `latest.yml`. GitHub marks v1.0.10 Latest; the packaged application starts successfully and the installer SHA-256 is `801BB8D5D5878BDCB80FE3BEC3DAF8EEDC1B9A8291276569D25CE875B42E14AB`. | `DONE` |
| 2026-07-27 | Micro split Type control corrected from a filtered datalist to a fixed native select. Vendor, TOC, Transport, Luggage Van, and Additional Service are now always available in the dropdown; v1.0.11 is reserved as the desktop UI hotfix so existing v1.0.10 clients can receive it through the updater. | `DONE` |
| 2026-07-27 | GitHub Release v1.0.11 hotfix published from commit `9deac7a` with installer, blockmap, and `latest.yml`, and marked Latest. Packaged ASAR confirms the native five-option Type select and absence of the old Type datalist; the installer SHA-256 is `75145686F681C7979EF22755E8AAC70F233259B897AC4658559515EC66075752`. | `DONE` |
| 2026-07-28 | Supplier Master and contract-rate foundation completed. Manager/Admin now has one two-panel CRUD menu for dynamic types, supplier profiles, unlimited contacts/recipients, SOPs, products, contracts, dated rates, archive, audit, all-user notifications, and Drive contract documents. Micro Split consumes the same catalog and allows booking with `PENDING_RATE` or a controlled booking-only manual rate. Google Supplier Master tables are initialized with legacy migration plus Transport/Luggage and Additional–Garland/Water seed data; the expiry trigger is active. Apps Script Web App Version 15 and GitHub Release v1.1.0 are live from commit `2994872`; 23 tests, syntax checks, visual QA, packaged ASAR verification, and isolated smoke start passed. Installer SHA-256: `AFDEF43A425BAFCE56FD253DDA3724006C09697A7296590A4090C8AE4EE83075`. | `DONE` |
| 2026-07-28 | Supplier contact/recipient hotfix v1.1.1 completed and released. Repeatable rows now use responsive card hierarchy with a header-level remove action and aligned Emergency control. Phone and WhatsApp fields accept international `+` formatting, normalize on blur/save, remain formula-safe across the desktop/Apps Script/Google Sheet boundary, and are protected by plain-text formatting, formula-injection escaping, validation, and automatic legacy error-cell recovery. Apps Script Web App Version 16 is live on the existing deployment URL; a live Supplier Master refresh synchronized 4 contacts and 4 recipients with zero remaining `#ERROR!` values. GitHub Release v1.1.1 is Latest from commit `b3f1355` with installer, blockmap, and `latest.yml`. The 26-test suite, syntax checks, browser QA at the narrow panel width, executable version check, and packaged ASAR inspection passed. Installer SHA-256: `B1C754E261BE14901AA4F358E28B4F1A40BBCE5CDE22B6AECCE83F1C501B4005`. | `DONE` |
| 2026-07-28 | Supplier Master local staging and batch publish v1.1.2 completed. Routine Type, Supplier, Product, Contract/Rate, and archive changes now save immediately to per-user SQLite, remain visible as local overlays, and publish selected records through one dependency-ordered Apps Script request with base-version conflicts, per-record audit, one catalog refresh, and one user-wide summary notification. Initialize/migrate moved into protected System Maintenance with explicit `INITIALIZE` confirmation. Apps Script Web App Version 17 is live on the existing deployment URL. Syntax checks and all 28 tests passed; the compiled executable and updater metadata report v1.1.2. Installer SHA-256: `7A083B5D36728070C5E2178F234494594A8EC6B750F325C6E6ABF6FA8160C161`. | `DONE` |
| 2026-07-28 | Supplier Import / Export v1.1.3 completed. Manager/Admin receives a dedicated responsive submenu for one-Type import/export across Vendor, TOC, Transport, Luggage Van, and Additional Service. The official workbook contains normalized Supplier, Contact, Recipient, SOP, Product, Contract, Rate, and issue sheets. Import is create-only, validates structure before writes, records conflicts per local batch, exports correction workbooks, and stages valid records into the existing Pending Supplier Master queue. Export supports filtered supplier checkboxes and produces the same schema. Hotel is explicitly reserved for a separate submenu and Low/High/Peak Season model. All 33 tests and syntax checks pass; the installer and updater metadata report v1.1.3, and packaged ASAR inspection confirms the workbook plus Excel service/schema are present and parser-compatible. Installer SHA-256: `D0976F39A9FB68AC28861417F6D764F4D8267D51E31E8E664511D69CFE8ACE75`. | `DONE` |
| 2026-07-28 | Supplier archive-dialog hotfix v1.1.4 completed. The packaged Electron app no longer calls unsupported `window.prompt` when Supplier, Product, or Contract archive is selected. A controlled in-app modal now displays the record and active dependency impact, requires a reason, and queues archive locally before Google publication. All 34 tests and syntax checks pass; packaged ASAR inspection confirms the modal and handler are present, while the executable and updater metadata report v1.1.4. Installer SHA-256: `FA7FF623B52A79D0F370FD315D9C0FB8E6560E9F49F3C130EA1D3AC60AF65286`. | `DONE` |
| 2026-07-28 | Desktop v1.1.5 completed and published as the GitHub Latest release from implementation commit `15e6d09`. Supplier Product cards can bulk-copy Product details plus optional Contract metadata and matching Rates to multiple active same-Type suppliers through Local Pending; new IDs are generated, Drive evidence is excluded, and same-name conflicts are skipped and reported. The full-text sidebar now shows/hides through the logo and independently collapses/expands Reservation, Vendor, Transport, and Manager/Admin groups with locally persisted preferences. Transport now contains New/Revise Itinerary Check, Add Cost, Driver Detail, Arrival, TOC, KPI, Day Tour, and Invoicing foundations without unapproved backend writes. SOPs record duplication and Transport boundaries. Syntax, 38 tests, browser visual QA, packaged ASAR inspection, isolated executable startup, installer/blockmap/updater asset upload, and Latest-feed verification pass. Installer SHA-256: `156FC6227CE8594DB8D7F7EB3BCC2D861CB3233038A950C944A0276DAF21DBE5`. | `DONE` |
| 2026-07-28 | Trial issue record opened for v1.1.5: `UAT-115-001` requires Supplier Master publication per Supplier Type and sequential Supplier → Product → Contract/Rate stages; `UAT-115-002` separates department-dashboard navigation from submenu collapse control; `UAT-115-003` adds checkbox-based multi-Product duplication with persistent selection, preview matrix, and per-combination results. Detailed reproduction and acceptance conditions are recorded in `docs/TRIAL_ISSUE_RECORD.md`. | `OPEN` |
| 2026-07-28 | v1.1.6 foundation rehabilitation implementation started. Supplier publishing now creates a persistent SQLite Publish Session, automatically partitions the selected records by Type and Supplier → Product → Contract/Rate stage, sends safe 20-record chunks, verifies the returned Google catalogue, emits live item status and confirmed percentage, preserves session history, and can resume unresolved records. Vendor Intake now carries the complete Supplier Master catalogue; incomplete itinerary suggestions cannot erase it; startup sync refreshes Micro Split; Suppliers/Products without a current Rate remain selectable; and all effective-dated Rates remain available for per-Day resolution. New local Product/Contract cards and Contract Rate rows appear first with focused input. Syntax checks, 43 automated tests, packaged-directory build, signed NSIS installer, v1.1.6 executable version inspection, and an isolated six-second smoke start pass. Previous local installer SHA-256: `6AD6FB7B48D91604CDB67AE5DA591AD2733AA9FABCE2810A213F4C37607D7C23`. Apps Script Web App v18 is now deployed; the mixed-Type 94-record Google UAT remains before the milestone can be marked `DONE`. | `IN PROGRESS — FINAL UAT` |
| 2026-07-28 | v1.1.6 Micro Split Supplier/Product hotfix implemented after live trial. The previous shared reset flag cleared the newly selected Supplier ID, leaving Product empty. Type, Supplier, and Product now have independent reset behavior; Supplier/Product use typed native suggestion lists with canonical hidden IDs; and Product suggestions enable only after a valid Supplier resolves. Product suggestions show the Product name plus the Contract Rate valid for that Day, or `Pending rate` instead of an internal Product Code. Syntax checks and all 43 automated tests pass. Packaged UAT remains before `UAT-116-001` can close. | `IN PROGRESS` |
| 2026-07-28 | v1.1.6 UAT rehabilitation continued. Apps Script Web App Version 18 was activated on the existing deployment with owner execution and `Anyone` access; its health endpoint again returns HTTP 200 JSON. Supplier Master refresh now falls back to the last SQLite catalogue if Google returns a non-JSON or unavailable response. UAT-115-002 separates department-dashboard navigation from full-text submenu Show/Hide controls. UAT-115-003 adds persistent Product checkboxes, select-all/clear tracking, multi-source duplication, Product x supplier preview, and created/conflict/failed results. Micro Split UAT-115-004 and UAT-116-001 were accepted by the user. Syntax checks and all 43 automated tests pass. The rebuilt v1.1.6 installer reports Product Version 1.1.6.0; SHA-256: `FA5D6F2820B0B1BD89E7850F1FABC22C61D365476E0E0CE5C3F8EE29800707A5`. The mixed-Type 94-record Publish Session trial is the remaining completion gate. | `IN PROGRESS — FINAL UAT` |
| 2026-07-28 | A live 39-item Transport Publish Session verified grouping, backend chunking, Google-confirmed progress, and dependency protection. The legacy Web App deployment then redirected to HTTP 404: 17 Products remained `FAILED`, 17 dependent Contracts became `BLOCKED_BY_DEPENDENCY`, four confirmed archive records remained `SYNCED`, and no orphan Contract was published. A clean Apps Script Web App Version 19 was created, its health endpoint returned HTTP 200 JSON, and the desktop SQLite `api_base_url` was migrated to the new deployment. The same persistent session must be resumed after app restart; no new session or manual reselection is required. | `LIVE UAT — RESUME PENDING` |
| 2026-07-28 | Resume-control hotfix completed for interrupted Publish Sessions. A persisted session that remains `PUBLISHING` after restart now displays `Resume interrupted session` with its unresolved count; the control stays hidden/disabled only while a real in-process publication is active. The same session ID is reused, `SYNCED` items are excluded, and failed/blocked/in-flight items return through the dependency plan. Syntax checks and all 43 tests pass. Rebuilt v1.1.6 installer SHA-256: `120328F676DFBD2656D18830E46557346F00667D0019C257CDA7CC805590C2B7`. | `HOTFIX READY FOR RESUME UAT` |
| 2026-07-28 | Vendor Booking v1.1.7 foundation implemented. The dashboard merges online records with the local Micro Split queue; Vendor and Additional Service splits group by Customer Code + supplier while Transport, TOC, and Luggage Van stay outside Vendor. Generate loads Supplier Master channel, SOP, recipients, services, pax, rate readiness, and editable subject/body. `PENDING_RATE` remains bookable. Email uses the connected employee Gmail only after Generate plus an explicit final confirmation and records Gmail IDs; external channels require a reference/evidence note. Revise reuses the New Itinerary workspace; Cancel All prepares one preserved cancellation package per supplier without sending. A copy of the real local dataset validated 11 packages, 14 Vendor services, six pending rates, one dynamic Additional package, and zero Transport/TOC leakage. Syntax checks and all 45 tests pass. | `IN PROGRESS — UAT READY` |
| 2026-07-28 | The packaged v1.1.7 UAT installer and blockmap were built successfully. Windows metadata reports Product Version `1.1.7`; the unpacked executable reports `1.1.7.0` and remained running through the isolated smoke window. Final installer SHA-256: `1B27BBE2BC5E5CA0911214765CB645FFA21F76D3BE0568BB24CABDC6520C407D`. | `UAT BUILD READY` |
| 2026-07-28 | Next Vendor Generating design recorded without implementation. The workspace will show all Vendor-owned split items with item-level readiness; non-contracted items and missing WhatsApp/email/portal/recipient/SOP data receive notices with deep links to the exact master entry. Available send channels come from the active Booking SOP and may be changed before generation. Email generation will use a two-section popup: outgoing selection/mail-merge preview on the left and permitted Gmail context on the right. Final body tokens, conditional formatting, attachments, and Subject rules wait for the owner's sample mail-merge and Subject format. | `BACKLOG — SAMPLE PENDING` |
| 2026-07-28 | Revised Vendor dashboard and Itinerary Check design recorded locally. The four dashboard cards are: New Itinerary not fully split/not Vendor-done; split supplier packages not generated; inbound Email replies awaiting Gmail-thread review; and D+1 through D+7 arrivals whose action opens Itinerary Check. The separate submenu below Dashboard searches Client Code and renders Client → Day (including Day Wise subject/title) → every split type, including Vendor, Additional Service, Transport, TOC, and Luggage Van. Vendor-by-Email rows link to their stored Gmail thread; external channels show evidence. The view is read-only by default and does not transfer Transport ownership, mark work complete, or infer confirmation. | `LOCAL DRAFT — AWAITING DESIGN APPROVAL` |
| 2026-07-28 | Vendor Inbox two-section design recorded locally. The wider left section is a searchable/sortable Generated/Sent Booking Register showing Client Code, Customer Name, Adult/Child/Infant pax, Supplier, Product/service and Day/date, action/channel, generated/sent timestamps, rate/result state, and Gmail-thread or external-evidence links. Generated remains visibly different from Sent. The right section is the incoming Work Inbox, initially New Itinerary and Revised Itinerary, with direct links to their exact workspaces; additional event types will be added incrementally. Both sections scroll independently and stack safely on narrower screens. | `LOCAL DRAFT — AWAITING DESIGN APPROVAL` |
| 2026-07-28 | The complete next Vendor milestone is approved and consolidated in `docs/VENDOR_NEXT_MILESTONE_PLAN.md`: temporary Generate/Send workflow, four-card Vendor Dashboard, two-section Vendor Inbox, read-only Itinerary Check, item readiness and master-entry correction links, SOP channel selection, two-section Email popup, stable identity/state separation, Gmail-thread reply association, role ownership, and a pre-send idempotent ledger. Gmail success followed by central sync failure must become `SENT_PENDING_SYNC` and retry evidence sync without resending. The approved implementation order starts with the shared Itinerary Check read model and ends with controlled live-send UAT. | `APPROVED FOR NEXT DEVELOPMENT` |
| 2026-07-29 | Approved Vendor milestone implementation started. SQLite now exposes one stable read model for read-only Itinerary Check, the four approved Dashboard cards, Booking Register, and Work Inbox. The Generate view uses a replaceable `STANDARD_V1` mail-merge fallback and a two-section compose/Gmail-context layout; Supplier readiness links route to the exact local Supplier Master record. Email send now persists an immutable Send Attempt snapshot and hash before Gmail, blocks ambiguous/double sends, records Gmail message/thread IDs, publishes idempotent `SUPPLIER_BOOKINGS` and `COMMUNICATIONS` evidence through Apps Script, and uses `SENT_PENDING_SYNC` when only the official evidence sync fails. Retry calls only Apps Script and never Gmail. Stored thread IDs drive Gmail reply detection; a reply creates `REVIEW_REQUIRED` without confirming the supplier. Syntax checks and all 47 automated tests pass. Live Apps Script deployment, connected-account Gmail UAT, attachment rules, final mail-merge samples, Inbox state mutations, and full operational UAT remain open. | `IN PROGRESS — LOCAL UAT READY` |
| 2026-07-29 | Vendor Booking v1.1.8 Windows UAT candidate packaged successfully. The unpacked executable and NSIS installer both report Product Version `1.1.8`; ASAR inspection confirms the `STANDARD_V1` fallback, `SENT_PENDING_SYNC`, and persistent send ledger are included. All 47 automated tests and source checks pass, and the packaged app remained alive through an isolated eight-second smoke launch. Installer size: `111,054,651` bytes. SHA-256: `80AEB22400B0566B064F11EDBC8352DDA3D4E7CA8D5DE3E5F7994F342866201B`. No Apps Script deployment, Gmail send, Git commit, push, or GitHub release was performed. | `UAT BUILD READY` |
| 2026-07-29 | Transport next-milestone design v0.1 recorded in `docs/TRANSPORT_NEXT_MILESTONE_PLAN.md`. The first operating loop extracts every active on-ground itinerary by an inclusive selected date, lets Transport add only Transport/TOC requirements inside the shared New Itinerary Daywise context, and extracts Transport service rows for driver name/number assignment. Driver assignments are canonical per stable Transport service, with optional bulk apply per Day, so multiple drivers on the same Day remain supported. Ownership, source tables, status separation, revision safety, permissions, delivery sequence, UAT gates, and open owner decisions are recorded; no Transport operational write was activated. | `DRAFT — OWNER INPUT OPEN` |
| 2026-07-29 | Micro Split day context added to the rebuilt v1.1.8 UAT candidate. Opening a Day now shows the hotel applicable to that service date plus its Start and Finish times above the Day Wise reference. Hotel transitions can display both matching hotel names using the same date rule already used by the Day card; missing hotel or Finish time remains explicit instead of being inferred. Syntax checks and all 48 automated tests pass. Packaged ASAR inspection confirms all three controls and the hotel-date binding are included; Windows metadata remains Product Version `1.1.8`, and the isolated eight-second smoke launch passes. Replacement installer size: `111,054,801` bytes. Replacement SHA-256: `4E44385C6CA1A632F48F0CCB6CCDA6888F263FE02195D03FE1F77C14B0A81F10`. | `UAT BUILD READY` |
| 2026-07-29 | GitHub Release v1.1.8 published as Latest from implementation commit `4449c0b`. The installer, blockmap, and `latest.yml` are all uploaded and visible to the desktop updater; the GitHub installer digest matches SHA-256 `4E44385C6CA1A632F48F0CCB6CCDA6888F263FE02195D03FE1F77C14B0A81F10`. Draft PR #1 now targets the full v1.1.8 Vendor Booking scope. The Apps Script evidence-sync route remains source-only and must be deployed before connected-account Gmail send UAT. | `RELEASED — BACKEND UAT GATE OPEN` |
| 2026-07-29 | Micro Split and Generate UX revision v0.1 recorded in `docs/MICRO_SPLIT_GENERATE_UX_REVISION_PLAN.md` after owner feedback. The proposal makes manual-rate fields depend on Price Basis: `PER_PAX` uses separate Adult/Child/Infant rates and itinerary pax, whole-unit bases use an integer Quantity with step 1, and `PER_SERVICE` stays flat. The flat Generate queue becomes a compact collapsible Client → Day → service tree with eligible service-level checkboxes that regroup selected rows by supplier before generation; selection never sends directly. `Open exact Supplier Master` becomes a focused child window that saves/readbacks the required section, closes on success, and restores the active Generate selection/scroll context. No implementation was activated pending owner approval. | `DRAFT — OWNER REVIEW` |
| 2026-07-29 | Owner approved and implementation started for the Micro Split and Generate UX revision as v1.1.9. Manual `PER_PAX` now separates Adult/Child/Infant rates (including explicit free Infant rate `0`), whole-unit bases use integer Quantity, and `PER_SERVICE` remains fixed at one. Generate is a collapsible Client → Day → service tree with stable eligible service selection, exact selected-service snapshots, backend supplier regrouping, and per-service partial-generation state. Supplier readiness opens a secure focused child window, stages the exact correction locally, closes after successful save, and refreshes the parent while preserving its active package. Apps Script source was extended for Infant rate, but no deployment or GitHub release was performed. | `IMPLEMENTED — LOCAL UAT` |
| 2026-07-29 | Vendor Booking v1.1.9 Windows UAT candidate packaged successfully. All 51 automated tests, source syntax checks, Apps Script syntax check, and diff hygiene pass. The unpacked executable reports Product Version `1.1.9`; ASAR inspection confirms the selectable service tree, Infant rates, focused Supplier Master IPC, exact product/contract Rate focus, and `PARTIALLY_GENERATED` state are present. The isolated packaged app remained alive through the eight-second smoke gate. Installer size: `111,061,615` bytes. SHA-256: `A8F92A4E087E5BBB13AD6401D652F1876E6B4F3039E507A9A760C24D87EB95E5`. No Apps Script deployment, Git commit, push, or GitHub release was performed. | `UAT BUILD READY` |
| 2026-07-29 | Vendor Booking v1.1.9 deployed. Implementation commit `91bff18` is pushed to `agent/desktop-v1`; Apps Script Web App Version 20 is active on the existing deployment URL and its health endpoint returns HTTP 200 with `ok: true`. GitHub Release v1.1.9 is published as Latest with the installer, blockmap, and `latest.yml`; the online installer digest matches SHA-256 `A8F92A4E087E5BBB13AD6401D652F1876E6B4F3039E507A9A760C24D87EB95E5`. Draft PR #1 now covers the full v1.1.9 scope. Connected-account Gmail send/readback and full operational UAT remain open. | `RELEASED — LIVE UAT` |
| 2026-07-29 | Owner set the week of 2026-08-03 as the target for the first mobile web installation UAT. The initial delivery remains an installable Hostinger PWA, not a native Android package. Its recommended first operational slice is Google Workspace sign-in, role-filtered Dashboard and Inbox, read-only Itinerary Check, booking communication/status tracking, and Gmail-thread deep links. Supplier Master bulk maintenance, document editing, and the full mail composer remain desktop-only for this milestone. Mobile remains server-enforced read-only; cache is limited to the application shell and non-sensitive preferences, with no long-lived OAuth token or operational-data storage. Acceptance gates include Hostinger HTTPS, Android install, iPhone Add to Home Screen, Apps Script authenticated read/CORS validation, role checks, mutation rejection, and a clear offline indicator. | `TARGET — MOBILE PWA UAT NEXT WEEK` |
| 2026-07-30 | Vendor v1.1.9 UAT follow-up recorded in `docs/VENDOR_V119_UAT_FOLLOWUP_NOTES.md` without implementation. Start/Finish Time becomes optional for online Day posting; Add item creates the focused blank Micro Split card at the top; Vendor Generate is restricted to normalized `VENDOR` rows and no longer receives Additional Service or other Types; the New Booking subject is standardized as `Booking {Customer Code} - {Client Display Name} - {Client Tag} - {Supplier Name}`; Daywise tree labels must expose Day, date, and a clearly labeled readable header. Portal URLs should initially open in the system browser and use its password manager; credentials are forbidden from SQLite, Google, GitHub, logs, and booking payloads, while any future application-owned storage requires the Windows credential vault and dedicated security UAT. Missing Special/Pending Rates receive focused `Isi harga` and non-blocking `Skip untuk sekarang` actions without converting the rate to zero or Ready. | `RECORDED — AWAITING IMPLEMENTATION` |
| 2026-07-30 | Generate follow-up expanded with the approved three-panel direction: left is the Client/Day/Vendor-service tree with exact Supplier Master correction links and one radio-style channel per supplier package; middle is the generated Subject/message/service/attachment snapshot; right is the active Email, WhatsApp, Portal, or Other workspace. Email uses an ERIM-PSH Gmail composer connected to the staff account with an in-system Send action, immutable pre-send ledger, and returned Gmail message/thread IDs. Intentional `Kirim ulang / Ganti penerima` is allowed for delivery trouble: a previous-delivery notice offers Continue/Cancel, then requires old/new recipient review, reason, and final Gmail confirmation. It creates a new attempt linked to the immutable original, preserves every Gmail thread, and keeps idempotency protection against repeated clicks. Content/service changes remain Amendment rather than Resend. | `RECORDED — AWAITING IMPLEMENTATION` |
| 2026-07-26 | Desktop dashboard data workbook with 35 sheets and 31 native tables prepared and verified. | `DONE` |
| 2026-07-26 | Workbook imported and verified as native Google Sheets. | `DONE` |
| 2026-07-26 | Desktop v1.0 shell, SQLite isolation, safe sync queue, Google sign-in, and updater built. | `DONE` |
| 2026-07-26 | Windows NSIS installer v1.0 generated and smoke-tested. | `DONE` |
| 2026-07-26 | Desktop v1.0 pushed and opened as GitHub draft PR #1. | `DONE` |
| 2026-07-26 | Next update scope recorded: Template Booking, Template Report, and Export / Import menu. | `PENDING` |
| 2026-07-26 | Administrator DEV Console and read-only backend health scheme implemented. | `DONE` |
| 2026-07-26 | v1.0.1 published with installer, blockmap, and latest.yml as the first live auto-update test. | `DONE` |
| 2026-07-26 | Live updater verified from installed v1.0.0 to v1.0.1: detection, download, restart, and installation succeeded. | `DONE` |
| 2026-07-26 | v1.0.2 prepared with OAuth token-exchange fallback and sanitized diagnostics. | `IN PROGRESS` |
| 2026-07-26 | Master project progress document created. | `DONE` |

---

## Maintenance Rule

Update this file whenever:

- A milestone item starts or finishes.
- A decision changes project architecture or scope.
- A feature is canceled.
- A blocker appears or is resolved.
- A workbook/schema/API contract changes.
- A deployment, commit, release, or UAT event occurs.

Never mark an item `DONE` unless its acceptance condition has actually been met.
