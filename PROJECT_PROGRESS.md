# ERIM-PSH — Project Progress & Development Direction

Dokumen ini adalah sumber utama untuk melihat arah development, keputusan
arsitektur, milestone, pekerjaan selesai, pekerjaan tertunda, dan scope yang
dibatalkan.

**Project:** ERIM-PSH  
**Repository:** `hadesolympuz-ID/ERIM-PSH`  
**Local project:** `C:\PROJECT\ERIM-PSH`  
**Target application:** `https://status.peakseasonholidays.com`  
**Last updated:** 2026-07-26  
**Current phase:** Desktop v1.0 Dummy Operational Modeling

---

## Status Legend

| Status | Meaning |
| --- | --- |
| `DONE` | Selesai dan sudah tersedia dalam project. |
| `IN PROGRESS` | Sedang dikerjakan. Hanya gunakan untuk pekerjaan yang benar-benar aktif. |
| `PENDING` | Belum dimulai atau menunggu keputusan/dependency. |
| `BLOCKED` | Tidak dapat dilanjutkan sebelum hambatan tertentu diselesaikan. |
| `CANCELED` | Dikeluarkan dari scope berdasarkan keputusan project. |

---

## 1. Product Direction

ERM-PSH adalah sistem internal operasional Peak Season Holidays untuk sekitar
9–10 pengguna. Sistem menghubungkan pekerjaan Reservation, Vendor Booking,
Transport, Ops Accounting, General Cashier, dan Manager/Admin.

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
| Reservation | Confirmation intake, itinerary, revision, final checking, dan delivery ke confirmation email. | `PENDING` |
| Vendor Booking | Daywise, supplier split, booking, amendment/cancel, confirmation, dan follow-up. | `PENDING` |
| Transport | Driver/transporter, operational rates, TOC preparation, transport checking, dan transporter invoice. | `PENDING` |
| Ops Accounting | Customer invoice, final cost sheet, reconciliation, dan payment request. | `PENDING` |
| General Cashier | Validate approved request, execute payment, upload proof, dan mark paid. | `PENDING` |
| Manager/Admin | Master/config, approval, exception, KPI, access, recovery, dan audit review. | `PENDING` |

### Policy recommendations awaiting approval

| Policy | Recommended default | Status |
| --- | --- | --- |
| Final itinerary sender | Reservation sends after Vendor marks booking process complete. | `PENDING` |
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
| Daywise input workspace | `PENDING` | Staff works without editing raw Sheet. |
| Service split | `PENDING` | Services grouped into supplier bookings. |
| Vendor search/assignment | `PENDING` | Approved active vendor only. |
| Booking generation | `PENDING` | Uses approved SOP/template. |
| Email/WhatsApp helper | `PENDING` | Snapshot and communication evidence recorded. |
| Email booking link | `PENDING` | Each email-channel booking links to its Gmail thread/message. |
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
| Google resource IDs | `PENDING` | Create DEV Sheet, Drive folders, and Apps Script deployment. |
| Local database technology | `DONE` | Electron + SQLite validated with automated tests. |
| Publication-chain schema | `DONE` | Workbook and Apps Script contract aligned. |
| OAuth / Google identity | `PENDING` | Configure DEV client and approved users. |
| Hostinger access | `PENDING` | Provide staging subdomain/hosting access when deployment begins. |
| Company roles and employees | `PENDING` | Complete employee master. |
| Approved status transitions | `PENDING` | Review `STATUS_CATALOG`. |
| Cross-origin integration | `PENDING` | Run technical spike before module implementation. |
| GitHub publication | `DONE` | Branch `agent/desktop-v1` and draft PR #1 available for review. |

---

## 8. Next Recommended Actions

Do these in order:

### Next desktop dummy update

| Feature | Status | Initial direction |
| --- | --- | --- |
| Template Booking | `PENDING` | Reusable booking templates by service/vendor/channel with controlled fields and preview. |
| Template Report | `PENDING` | Reusable operational report templates with department, period, and status filters. |
| Export / Import menu | `PENDING` | Controlled XLSX/CSV export and validated import with preview, error report, duplicate protection, and audit. |

### Following actions

1. Define the required Booking Template types and fields.
2. Define the required Report Template layouts and recipients.
3. Approve which tables are allowed for import and export per department.
4. Implement preview and validation before any imported data is accepted.
5. Continue detailed Reservation and Vendor Booking workflow modeling.

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
