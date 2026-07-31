# ERIM-PSH Post Notification Matrix

Status dokumen: `OFFICIAL PLANNING RECORD — NO IMPLEMENTATION`

Tanggal baseline audit: `31/July/2026`

## 1. Tujuan

Dokumen ini menjadi daftar resmi kandidat notifikasi internal ERIM-PSH yang
nantinya dapat diaktifkan satu per satu melalui:

`Manager / Admin → Notification Settings`

Owner dapat memilih event dari suatu divisi, menentukan penerimanya, dan
mengaktifkan atau menonaktifkan route tanpa mengubah source code.

Status pada matrix bersifat faktual:

- `ACTIVE`: source audit mengonfirmasi event sudah membuat central
  `NOTIFICATIONS` dan `NOTIF_RECIPIENTS`;
- `NOT IMPLEMENTED`: event belum memiliki central routed notification, walaupun
  status, audit, dashboard card, report, atau local toast mungkin sudah ada.

Dokumen ini tidak mengaktifkan notification baru, tidak mengubah penerima aktif,
dan tidak melakukan Apps Script deployment.

## 2. Batasan

`Post Notification` dalam dokumen ini berarti notification internal kepada
pegawai ERIM-PSH melalui central Notification Inbox.

Yang tidak termasuk:

- email booking ke Supplier;
- WhatsApp, Portal, atau Other external delivery;
- toast sementara pada satu PC;
- progress checklist yang hanya menjelaskan proses lokal;
- Gmail reply atau Google notification yang belum dikonversi menjadi event
  internal ERIM-PSH.

## 3. Official Notification Matrix

| No | From | To | Notification purpose | Notification sample messages | Status |
| ---: | --- | --- | --- | --- | --- |
| 1 | Reservation | Vendor; Manager/Admin; All Rounder; posting actor | Memberi tahu bahwa itinerary baru resmi diposting dan siap diproses Vendor. | `ND/PSHBALI7661 — New itinerary posted by Reservation. Open New Itinerary.` | `ACTIVE` |
| 2 | Reservation | Vendor; Manager/Admin; All Rounder; revision actor | Memberi tahu bahwa itinerary resmi direvisi dan perlu impact review. | `ND/PSHBALI7661 — Revision 2 posted. Review affected Vendor services.` | `ACTIVE` |
| 3 | Reservation | Divisi yang dipilih saat revision; oversight | Membuat task hanya untuk divisi yang benar-benar terdampak revision. | `ND/PSHBALI7661 — Revision affects Vendor and Transport. Review required.` | `NOT IMPLEMENTED` |
| 4 | Reservation | Reservation owner; Manager/Admin | Memberi tahu bahwa review/download itinerary terbaru telah dicatat. | `ND/PSHBALI7661 — Latest itinerary reviewed by Staff A at 10:25 WITA.` | `NOT IMPLEMENTED` |
| 5 | Reservation | Vendor; Transport; authorized oversight | Memberi tahu bahwa flight/date/pax/hotel sumber berubah sebelum pekerjaan downstream selesai. | `ND/PSHBALI7661 — Arrival time changed from 15:00 to 17:30. Review downstream work.` | `NOT IMPLEMENTED` |
| 6 | Reservation | Reservation owner; Manager/Admin | Mengeskalasi follow-up Reservation yang melewati target waktu. | `ND/PSHBALI7661 — Reservation follow-up has been pending for 24 hours.` | `NOT IMPLEMENTED` |
| 7 | Vendor | Vendor owner; Manager/Admin | Mengonfirmasi bahwa structured Daywise/Micro Split berhasil diposting online. | `ND/PSHBALI7661 — Vendor Daywise posted online successfully.` | `NOT IMPLEMENTED` |
| 8 | Vendor | Vendor owner/eligible Vendor staff | Memberi tahu bahwa generated booking draft siap diproses. | `ND/PSHBALI7661 — 8 supplier packages are Generated and ready for delivery.` | `NOT IMPLEMENTED` |
| 9 | Vendor | Vendor owner; configured oversight | Mencatat bahwa supplier booking Email/External channel berhasil dikirim/direkam. | `ND/PSHBALI7661 — Booking sent to Kecinan by Email at 10:30 WITA.` | `NOT IMPLEMENTED` |
| 10 | Vendor/System | Sending actor; Vendor supervisor; Manager/Admin | Memberi tahu Gmail sudah menerima tetapi central evidence masih pending. | `ND/PSHBALI7661 — Gmail accepted the booking; evidence sync is pending.` | `NOT IMPLEMENTED` |
| 11 | Vendor/System | Sending actor; Vendor supervisor; Manager/Admin | Mengeskalasi Gmail send dengan hasil tidak dapat dibuktikan. | `ND/PSHBALI7661 — Gmail outcome unknown. Reconcile before any resend.` | `NOT IMPLEMENTED` |
| 12 | Supplier reply detector | Current Vendor booking owner; eligible Vendor staff | Memberi tahu ada balasan Supplier yang harus direview. | `ND/PSHBALI7661 — Supplier reply received from Kecinan. Review Gmail thread.` | `NOT IMPLEMENTED` |
| 13 | Vendor | Reservation; Vendor supervisor; oversight | Memberi tahu booking Supplier tidak dapat dikonfirmasi beserta alasan. | `ND/PSHBALI7661 — Eka Jaya booking not confirmed: requested sailing unavailable.` | `NOT IMPLEMENTED` |
| 14 | Vendor | Reservation; affected Vendor owner; Transport when affected | Memberi tahu Supplier mengubah detail booking yang berdampak ke itinerary/operasi. | `ND/PSHBALI7661 — Supplier changed pickup time to 08:30. Review itinerary impact.` | `NOT IMPLEMENTED` |
| 15 | Vendor | Reservation; authorized oversight | Memberi tahu seluruh Vendor booking telah selesai dan siap final checking. | `ND/PSHBALI7661 — Vendor Booking Complete. Reservation final check is required.` | `NOT IMPLEMENTED` |
| 16 | Vendor/System | Vendor owner; Vendor supervisor; Manager/Admin | Menandai Generated item kehilangan/berubah parent Service, Supplier, Product, atau Rate. | `ND/PSHBALI7661 — Product parent archived for a Generated item. Review before Send.` | `NOT IMPLEMENTED` |
| 17 | Vendor/System | Vendor owner; Vendor supervisor | Mengingatkan supplier confirmation belum diterima sesuai aging/SOP. | `ND/PSHBALI7661 — No supplier confirmation after 24 hours. Follow-up required.` | `NOT IMPLEMENTED` |
| 18 | Vendor | Reservation; affected operational division | Memberi tahu amendment/cancellation sudah dikirim atau memperoleh hasil. | `ND/PSHBALI7661 — Supplier cancellation confirmed for Day 4 fastboat.` | `NOT IMPLEMENTED` |
| 19 | Vendor/System | Sending actor; Vendor supervisor | Memberi tahu background evidence sync gagal dan aman untuk Retry Sync. | `ND/PSHBALI7661 — Evidence sync failed. Gmail will not be resent; retry sync only.` | `NOT IMPLEMENTED` |
| 20 | Vendor/System | Vendor owner; Manager/Admin | Memberi tahu Generated package di-Skip dan masih tertinggal di Needs Action. | `ND/PSHBALI7661 — Kecinan package skipped for now and remains Needs Action.` | `NOT IMPLEMENTED` |
| 21 | Reservation/Vendor | Transport; Transport supervisor; oversight | Membuat pekerjaan Transport baru dari itinerary on-ground. | `ND/PSHBALI7661 — New Transport requirement available for 27/September/2026.` | `NOT IMPLEMENTED` |
| 22 | Reservation/Vendor | Transport owner; Transport supervisor | Memberi tahu revision mengubah kebutuhan Transport. | `ND/PSHBALI7661 — Day 3 transport changed after itinerary revision.` | `NOT IMPLEMENTED` |
| 23 | Vendor/Reservation | Transport; Transport supervisor | Memberi tahu Day 0/pre-arrival operation ditambahkan atau diubah. | `ND/PSHBALI7661 — Day 0 pickup at 23:59 requires Transport review.` | `NOT IMPLEMENTED` |
| 24 | Transport/System | Transport owner; Transport supervisor | Mengingatkan driver/vehicle belum ditetapkan menjelang tanggal operasi. | `ND/PSHBALI7661 — Driver is still unassigned for tomorrow at 08:00.` | `NOT IMPLEMENTED` |
| 25 | Transport | Reservation; Vendor; Transport owner | Memberi tahu driver dan vehicle sudah ditetapkan. | `ND/PSHBALI7661 — Driver Budi / DK 1234 assigned for Day 3.` | `NOT IMPLEMENTED` |
| 26 | Transport | Reservation; Vendor; Transport supervisor | Memberi tahu perubahan driver/vehicle setelah assignment awal. | `ND/PSHBALI7661 — Day 3 driver changed from Budi to Made.` | `NOT IMPLEMENTED` |
| 27 | Transport | Reservation; Vendor; Manager/Admin | Memberi tahu seluruh kebutuhan Transport sudah siap. | `ND/PSHBALI7661 — Transport Ready for all on-ground dates.` | `NOT IMPLEMENTED` |
| 28 | Transport/System | Transport owner; Transport supervisor | Mengeskalasi transporter booking/reference atau bukti yang belum lengkap. | `ND/PSHBALI7661 — Transporter reference missing for airport transfer.` | `NOT IMPLEMENTED` |
| 29 | Transport | Reservation; Vendor; Manager/Admin | Mengeskalasi masalah operasional yang memengaruhi tamu. | `ND/PSHBALI7661 — Vehicle breakdown reported. Replacement action required.` | `NOT IMPLEMENTED` |
| 30 | Vendor/Transport | Ops Accounting | Memberi tahu confirmed operational cost sudah tersedia untuk costing. | `ND/PSHBALI7661 — Confirmed Vendor/Transport costs are ready for Cost Sheet.` | `NOT IMPLEMENTED` |
| 31 | Ops Accounting | Manager/Admin; authorized reviewer | Meminta review Cost Sheet sebelum payment/customer invoice. | `ND/PSHBALI7661 — Cost Sheet draft is ready for approval.` | `NOT IMPLEMENTED` |
| 32 | Ops Accounting/System | Ops Accounting owner; source division; Manager/Admin | Mengeskalasi cost/rate yang hilang, conflicted, atau ditolak. | `ND/PSHBALI7661 — 2 cost items require rate review before finalization.` | `NOT IMPLEMENTED` |
| 33 | Ops Accounting | Manager/Admin/authorized approver | Meminta approval payment. | `PAY-2026-0041 — Payment request Rp9.500.000 requires approval.` | `NOT IMPLEMENTED` |
| 34 | Manager/Admin | Ops Accounting request owner | Memberi tahu payment request disetujui. | `PAY-2026-0041 — Approved by Manager A and ready for Cashier.` | `NOT IMPLEMENTED` |
| 35 | Manager/Admin | Ops Accounting request owner | Mengembalikan payment request untuk revisi atau menolak. | `PAY-2026-0041 — Changes requested: attach supplier invoice.` | `NOT IMPLEMENTED` |
| 36 | Ops Accounting | Reservation; Manager/Admin | Memberi tahu invoice/Cost Sheet final sudah selesai. | `ND/PSHBALI7661 — Final Cost Sheet completed and ready for closing.` | `NOT IMPLEMENTED` |
| 37 | Manager/Admin/Ops Accounting | General Cashier | Membuat antrean pembayaran yang sudah memiliki approval. | `PAY-2026-0041 — Approved payment is ready for execution.` | `NOT IMPLEMENTED` |
| 38 | General Cashier | Ops Accounting; requesting division; Manager/Admin | Memberi tahu pembayaran berhasil dan bukti tersedia. | `PAY-2026-0041 — Paid at 14:20 WITA. Bank reference uploaded.` | `NOT IMPLEMENTED` |
| 39 | General Cashier | Ops Accounting; requesting division; Manager/Admin | Mengeskalasi pembayaran gagal atau ditahan. | `PAY-2026-0041 — Payment on hold: beneficiary account mismatch.` | `NOT IMPLEMENTED` |
| 40 | General Cashier/System | Cashier owner; Ops Accounting | Mengingatkan bukti pembayaran belum diunggah. | `PAY-2026-0041 — Payment marked executed but proof is still missing.` | `NOT IMPLEMENTED` |
| 41 | General Cashier/System | Cashier supervisor; Manager/Admin | Mengeskalasi reconciliation/cash exception. | `Cash reconciliation variance detected for 31/July/2026.` | `NOT IMPLEMENTED` |
| 42 | Staff/Supplier Master | Manager/Admin approvers | Meminta cross-PC approval untuk exact local Contract/Rate snapshot. | `Kecinan — Rp950.000/service requires Manager approval for Google sync.` | `NOT IMPLEMENTED` |
| 43 | Manager/Admin | Approval request maker | Memberi tahu approval meminta perubahan. | `Kecinan rate approval: Changes requested. Open exact Contract/Rate.` | `NOT IMPLEMENTED` |
| 44 | Manager/Admin | Approval request maker; Supplier Master sync owner | Memberi tahu exact snapshot telah disetujui dan siap sync. | `Kecinan rate snapshot approved. Resume or take over sync.` | `NOT IMPLEMENTED` |
| 45 | Manager/Admin | Approval request maker | Memberi tahu approval ditolak beserta alasan. | `Kecinan rate approval rejected: source document is incomplete.` | `NOT IMPLEMENTED` |
| 46 | Staff/System | Approval request maker | Memberi tahu request masih lokal dan belum terlihat Manager. | `Kecinan approval request is pending upload. Manager cannot see it yet.` | `NOT IMPLEMENTED` |
| 47 | Manager/Admin | Semua user aktif dengan desktop/mobile access | Memberi tahu Supplier Master selesai diinisialisasi. | `Supplier Master initialized by Admin A.` | `ACTIVE` |
| 48 | Manager/Admin | Semua user aktif dengan desktop/mobile access | Memberi ringkasan batch Supplier Master yang berhasil dipublish. | `Admin A published 6 Supplier Master changes.` | `ACTIVE` |
| 49 | System | Semua user aktif dengan desktop/mobile access | Mengingatkan Supplier Contract mendekati masa berlaku sesuai threshold. | `Contract CTR-001 for Kecinan expires in 30 days.` | `ACTIVE` |
| 50 | System | Semua user aktif dengan desktop/mobile access | Mengingatkan Supplier Contract berakhir hari ini. | `Contract CTR-001 for Kecinan expires today.` | `ACTIVE` |
| 51 | System | Semua user aktif dengan desktop/mobile access | Memberi tahu Supplier Contract sudah kedaluwarsa. | `Contract CTR-001 for Kecinan expired on 30/July/2026.` | `ACTIVE` |
| 52 | Supplier Master/System | Editing user; Manager/Admin | Mengeskalasi record version conflict terhadap Google. | `Kecinan Contract changed online after your local edit. Review current version.` | `NOT IMPLEMENTED` |
| 53 | Sync Center/System | Job owner; department supervisor; Manager/Admin | Mengeskalasi publication/sync job gagal atau stuck. | `Supplier Master sync has failed 3 times. Review Sync Center.` | `NOT IMPLEMENTED` |
| 54 | Work owner/Manager | Previous owner; new owner; Manager/Admin/All Rounder | Memberi audit notice saat ownership/claim diambil alih. | `ND/PSHBALI7661 — Work ownership moved from Staff A to Staff B.` | `NOT IMPLEMENTED` |
| 55 | Manager/Admin | Affected employee; Manager/Admin audit roles | Memberi tahu akses, role, atau department pegawai berubah. | `Your ERIM-PSH role changed from Vendor Staff to Vendor Supervisor.` | `NOT IMPLEMENTED` |
| 56 | System | Manager/Admin | Mengeskalasi backup, central schema, API health, atau security control gagal. | `ERIM-PSH backend health check failed: Supplier Master schema unavailable.` | `NOT IMPLEMENTED` |
| 57 | System | Connected employee; department supervisor when unresolved | Meminta reconnect Google ketika session/permission tidak lagi valid. | `Google Workspace connection expired. Reconnect before Gmail/Drive work.` | `NOT IMPLEMENTED` |

## 4. Current Active Routing Warning

Source audit menunjukkan notification Supplier Master pada No. 47–51 saat ini
dikirim kepada semua pegawai aktif yang memiliki desktop atau mobile access.
Route ini berfungsi, tetapi masih terlalu luas untuk operasi jangka panjang.

Owner checklist nantinya dapat mempersempit penerima, misalnya:

- Supplier Master batch update → Manager/Admin + Vendor/Transport supervisor;
- Contract expiry → Supplier Master owner + Manager/Admin + divisi pengguna
  Supplier Type terkait;
- initialization → Manager/Admin only.

Perubahan route aktif tersebut belum dilakukan oleh dokumen ini.

## 5. Manager/Admin Notification Settings Contract

### 5.1 Tampilan

Gunakan compact matrix dengan satu row per notification route:

`Enabled | From | Event/Purpose | To Department | To Role | Specific User |
Immediate/Digest | Severity | Status | Last Changed`

Owner dapat:

- centang `Enabled`;
- memilih satu atau beberapa Department penerima;
- memilih Role, job description, assigned owner, atau specific employee;
- memilih immediate notification atau scheduled digest;
- menyimpan perubahan sebagai draft;
- review summary;
- publish configuration secara terkontrol.

### 5.2 Recipient target

Target yang diizinkan:

- Department;
- Role/job description;
- assigned/current work owner;
- previous owner;
- event actor/maker;
- Manager/Admin/All Rounder oversight;
- specific active employee.

Ordinary staff tidak menerima notification divisi lain kecuali route
configuration secara eksplisit mengizinkannya.

### 5.3 Central authority

- routing ditentukan Apps Script dari central configuration, bukan dari
  pilihan local renderer;
- setiap route memiliki stable `notification_route_key`;
- satu event/idempotency key hanya membuat satu notification dan satu recipient
  row per penerima;
- penerima dihitung dari active employee directory pada waktu event;
- perubahan setting memiliki version, actor, time, reason, dan audit;
- hanya Manager/Admin berizin yang dapat publish perubahan;
- konfigurasi lama tetap aktif sampai versi baru berhasil dipublish.

### 5.4 Lifecycle

Setiap recipient memiliki state terpisah:

`DELIVERED → READ → ACKNOWLEDGED → RESOLVED`

Read, acknowledge, resolve, claim work, dan business status tetap merupakan
state yang berbeda. Membuka notification tidak boleh menandai pekerjaan selesai.

### 5.5 Deep link dan content safety

- setiap notification harus membuka exact permitted workspace/entity;
- isi minimum: event, entity/Customer Code, actor/source, event time, current
  state, dan required action;
- financial/private details hanya terlihat oleh penerima yang mempunyai izin;
- tidak menyimpan password, OAuth token, Gmail body, atau credential Portal;
- sample message pada matrix adalah pola, bukan final mail merge.

## 6. Owner Selection Procedure

Saat Notification Settings diimplementasikan:

1. sistem memuat semua route No. 1–57;
2. route `ACTIVE` ditampilkan sesuai current behavior;
3. route `NOT IMPLEMENTED` terlihat tetapi disabled sampai event publisher dan
   deep link-nya lulus UAT;
4. Owner/Manager memilih From/To route satu per satu;
5. sistem menampilkan effective-recipient preview sebelum publish;
6. test notification dikirim hanya ke nominated test users;
7. production route diaktifkan setelah owner sign-off.

## 7. Implementation Gates

- tidak ada broadcast baru hanya karena tercantum dalam matrix;
- event publisher, permission, deep link, idempotency, recipient preview,
  read/acknowledge lifecycle, audit, and test-recipient gate harus tersedia;
- external Email/WhatsApp/Portal tidak ikut terpicu;
- notification retry tidak boleh mengulang business mutation;
- Manager/Admin dapat menonaktifkan route baru tanpa menghapus history;
- mobile push merupakan delivery channel terpisah dan tidak dianggap aktif oleh
  matrix ini.

