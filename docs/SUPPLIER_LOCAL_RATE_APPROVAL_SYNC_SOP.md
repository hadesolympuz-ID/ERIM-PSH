# SOP Harga Supplier Lokal dan Approval Sync

Status dokumen: `APPROVED OPERATIONAL DESIGN — IMPLEMENTATION REQUIRED`
Owner proses: `Manager / Admin`
Pengguna operasional: `Vendor Booking dan department pemilik service`
Sumber resmi setelah sync: `ERIM-PSH Google Supplier Master`

## 1. Tujuan

SOP ini mengatur harga Supplier Master yang baru dimasukkan dan disimpan di
SQLite lokal sebelum dipublish ke Google.

Tujuan utamanya:

1. harga baru tetap dapat langsung dipakai untuk pekerjaan booking pada PC
   tempat harga tersebut dibuat;
2. harga lokal tidak pernah terlihat seolah-olah sudah resmi tersinkron;
3. Manager/Approver menerima notice untuk review dan approval sync;
4. booking yang sudah memakai harga lokal tidak kehilangan snapshot ketika
   harga ditolak, dikoreksi, konflik, atau kemudian disinkronkan;
5. refresh data online tidak menghapus local pending rate.

## 2. Prinsip wajib

- Status pemakaian operasional dan status publikasi pusat adalah dua hal
  berbeda.
- `Boleh dipakai lokal` tidak berarti `sudah disetujui`.
- `Sudah disetujui` tidak berarti `sudah berhasil tersinkron`.
- Harga pada booking harus selalu memakai snapshot, bukan membaca ulang nilai
  Supplier Master secara dinamis setelah booking dibuat.
- Local pending rate tidak tersedia di PC staff lain sampai berhasil sync.
- Hanya Supplier Master desktop yang boleh membuat atau mengubah harga master.
- Manual rate pada Micro Split tetap booking-only dan tidak otomatis menjadi
  Supplier Master rate.
- Tidak ada silent publish, silent approval, atau silent overwrite.

## 3. Dua kelompok status

### 3.1 Operational usability

| Status | Arti | Boleh dipakai untuk booking baru |
| --- | --- | --- |
| `LOCAL_RATE_READY` | Harga lokal lengkap dan valid untuk tanggal service | Ya, dengan notice |
| `LOCAL_RATE_INCOMPLETE` | Field wajib atau evidence belum lengkap | Tidak |
| `LOCAL_RATE_EXPIRED` | Validity tidak mencakup tanggal service | Tidak |
| `LOCAL_RATE_REJECTED` | Approver menolak harga | Tidak |
| `LOCAL_RATE_CONFLICT` | Versi online berubah dan belum direkonsiliasi | Hanya dengan Owner override dan alasan |
| `CENTRAL_RATE_READY` | Harga telah tersinkron dan aktif secara pusat | Ya |

### 3.2 Approval and sync

| Status | Arti |
| --- | --- |
| `APPROVAL_REQUIRED` | Harga tersimpan lokal dan menunggu diajukan/review |
| `APPROVAL_REQUESTED` | Inputter telah meminta approval |
| `CHANGES_REQUESTED` | Approver meminta koreksi |
| `APPROVED_TO_SYNC` | Approver menyetujui snapshot harga tertentu |
| `SYNCING` | Snapshot yang disetujui sedang dipublish |
| `SYNCED` | Google menerima harga dan local cache telah direfresh |
| `SYNC_CONFLICT` | Versi Google berubah sejak local edit dimulai |
| `SYNC_FAILED` | Gangguan teknis; harga tetap lokal |
| `REJECTED` | Harga tidak disetujui untuk menjadi master pusat |

Satu rate dapat memiliki kombinasi:

```text
LOCAL_RATE_READY + APPROVAL_REQUIRED
LOCAL_RATE_READY + APPROVAL_REQUESTED
LOCAL_RATE_READY + APPROVED_TO_SYNC
CENTRAL_RATE_READY + SYNCED
```

## 4. Syarat harga boleh dipakai lokal

Harga hanya boleh menjadi `LOCAL_RATE_READY` jika seluruh syarat berikut
terpenuhi:

- Supplier ID stabil dan terhubung;
- Product ID stabil dan terhubung;
- Contract ID lokal stabil;
- Rate ID lokal stabil;
- Price Basis terisi;
- nominal sesuai basis harga;
- Currency terisi;
- Valid From dan Valid To terisi;
- tanggal service berada di dalam validity;
- sumber harga terisi;
- evidence reference terisi;
- alasan penggunaan harga lokal terisi;
- nama/email inputter dan waktu simpan tercatat;
- rate tidak berstatus Archive, Rejected, Cancelled, atau Superseded.

Sumber dan evidence yang diperbolehkan:

- supplier contract;
- quotation;
- email;
- Gmail Message ID atau Thread ID;
- WhatsApp dengan reference;
- supplier portal;
- dokumen resmi lain;
- telepon hanya jika disertai nama lawan bicara, tanggal, waktu, dan catatan.

## 5. Prosedur input harga baru

1. Buka `Manager / Admin > Supplier Master`.
2. Pilih Supplier dan Product yang benar.
3. Buat atau buka Contract.
4. Isi nomor contract/reference, validity, currency, dan source.
5. Isi Rate: Product, Price Basis, nominal, quantity rule, dan row validity bila
   berbeda dari contract.
6. Lampirkan atau referensikan evidence.
7. Tekan `Save locally`.
8. Sistem menyimpan Contract/Rate ke Local Pending.
9. Sistem memvalidasi kelengkapan.
10. Jika valid, status menjadi:

    ```text
    LOCAL_RATE_READY
    APPROVAL_REQUIRED
    ```

11. Harga langsung tersedia pada Micro Split di PC yang sama.
12. Sistem tidak melakukan publish otomatis.

## 6. Notice setelah local save

Sesudah Save, tampilkan notice:

```text
LOCAL RATE READY — APPROVAL SYNC REQUIRED

Harga ini sudah dapat dipakai untuk booking pada PC ini.
Harga belum tersedia untuk staff/perangkat lain dan belum menjadi master resmi.

Supplier: {Supplier Name}
Product: {Product Name}
Basis: {Price Basis}
Rate: {Currency} {Amount}
Validity: {Valid From} — {Valid To}
Source: {Source}

[Request approval] [Review local pending] [Continue working]
```

Notice tidak boleh menyebut `SYNCED`, `PUBLISHED`, atau `CENTRAL RATE`.

## 7. Notice pada Micro Split dan Generate

Jika local pending rate dipilih, tampilkan badge:

```text
LOCAL RATE — SYNC APPROVAL REQUIRED
```

Micro Split harus menampilkan:

- Supplier;
- Product;
- Price Basis;
- Rate;
- validity;
- source/evidence;
- local save time;
- approval/sync status.

Generate Product/Rate panel harus menampilkan:

```text
Rate source: LOCAL SUPPLIER MASTER
Operational use: READY
Central sync: APPROVAL REQUIRED
```

Generate dan Send tetap diperbolehkan jika rate `LOCAL_RATE_READY`. Snapshot
booking wajib menyimpan:

- Rate ID lokal;
- Contract ID lokal;
- Product ID;
- Price Basis;
- nominal dan currency;
- validity;
- source/evidence;
- approval status pada waktu Generate;
- local draft ID dan local revision;
- inputter;
- snapshot time.

Setelah snapshot dibuat, perubahan Supplier Master tidak boleh diam-diam
mengubah harga booking tersebut.

## 8. Request approval

Inputter menekan `Request approval` dari notice atau Local Pending.

Sistem harus:

1. membekukan approval snapshot/hash;
2. mengubah status menjadi `APPROVAL_REQUESTED`;
3. mencatat requester dan waktu;
4. membuat satu task/notice untuk Manager/Approver;
5. menampilkan jumlah pending approval pada Supplier Master dan Manager
   dashboard;
6. tidak membuat notice duplikat untuk snapshot yang sama;
7. tetap mengizinkan pemakaian lokal selama status operasional masih
   `LOCAL_RATE_READY`.

Notice Approver:

```text
SUPPLIER RATE SYNC APPROVAL REQUESTED

{Supplier} — {Product}
{Price Basis}: {Currency} {Amount}
Validity: {Valid From} — {Valid To}
Requested by: {Employee}
Evidence: {Evidence reference}

[Review] [Approve & queue sync] [Request changes] [Reject]
```

## 9. Review dan approval

Approver harus memeriksa:

- Supplier dan Product benar;
- duplikasi Product/Contract/Rate;
- validity dan overlap;
- Price Basis;
- nominal dan currency;
- minimum/maximum quantity;
- tax/inclusion/exclusion bila relevan;
- evidence dapat dibuka;
- source dapat dipertanggungjawabkan;
- apakah booking sudah menggunakan rate;
- perubahan versi online sejak local edit dimulai.

Keputusan:

### Approve & queue sync

- status menjadi `APPROVED_TO_SYNC`;
- approval terikat pada snapshot hash yang direview;
- perubahan field setelah approval membatalkan approval dan kembali ke
  `APPROVAL_REQUIRED`;
- publish queue menggunakan dependency order:
  Supplier → Product → Contract → Rate.

### Request changes

- alasan wajib;
- status menjadi `CHANGES_REQUESTED`;
- harga tetap dapat dipakai lokal hanya jika nilai yang sedang digunakan masih
  valid dan Approver tidak menandainya unsafe;
- perubahan baru membuat revision dan approval snapshot baru.

### Reject

- alasan wajib;
- status menjadi `REJECTED` dan operational state menjadi
  `LOCAL_RATE_REJECTED`;
- rate tidak boleh dipilih untuk booking baru;
- booking yang sudah Generated atau Sent mempertahankan snapshot;
- booking Generated tetapi belum Sent mendapat Attention notice untuk review;
- tidak ada record yang dihapus.

## 10. Sync procedure

1. Hanya rate dengan `APPROVED_TO_SYNC` yang boleh masuk publish queue.
2. Sistem memvalidasi snapshot hash sebelum publish.
3. Jika snapshot berubah setelah approval, batalkan queue dan kembali ke
   `APPROVAL_REQUIRED`.
4. Publish dependency dilakukan secara berurutan.
5. Jika Google menerima semua entity, refresh central cache satu kali.
6. Local pending overlay dilepas hanya setelah cache baru memuat entity/version
   yang dipublish.
7. Status menjadi:

   ```text
   CENTRAL_RATE_READY
   SYNCED
   ```

8. Staff/perangkat lain baru boleh melihat rate setelah central refresh mereka
   berhasil.

## 11. Offline, failure, dan conflict

### Offline atau sync gagal

- harga tetap tersimpan lokal;
- booking snapshot tetap valid;
- status menjadi `SYNC_FAILED`;
- notice menunjukkan bahwa rate belum tersedia untuk perangkat lain;
- Retry Sync tidak membuat rate baru atau mengubah ID;
- tidak ada silent rollback.

### Version conflict

Jika versi Google berubah setelah local edit:

- status menjadi `SYNC_CONFLICT`;
- local payload dan online payload ditampilkan berdampingan;
- tidak boleh auto-overwrite;
- Approver memilih:
  - keep online;
  - update local from online;
  - create corrected revision;
  - Owner override dengan alasan.
- booking Generated/Sent mempertahankan snapshot lama.
- pemakaian untuk booking baru diblok secara default sampai rekonsiliasi.

### Online refresh

Refresh harus:

1. mengambil central catalog;
2. menyimpan central cache secara atomik;
3. menerapkan kembali local pending overlay;
4. mempertahankan draft ID, revision, approval, dan error;
5. tidak menghilangkan harga lokal yang belum sync.

## 12. Booking yang memakai local rate

Setiap booking harus dapat menjawab:

- rate berasal dari Central atau Local;
- rate/contract/product ID yang dipakai;
- nominal, basis, currency, dan validity;
- approval/sync status saat Generate;
- siapa yang memasukkan rate;
- evidence;
- apakah rate kemudian disetujui, ditolak, konflik, atau dikoreksi.

Perubahan status Supplier Master setelah booking:

| Kondisi | Generated belum Sent | Sudah Sent |
| --- | --- | --- |
| Rate disetujui dan synced tanpa perubahan | Update notice; snapshot tetap | Tidak ada perubahan |
| Rate disetujui dengan nominal berbeda | Attention; operator pilih Regenerate atau Amendment | Financial review; booking email tidak berubah |
| Rate ditolak | Block Send sampai review/override | Snapshot dan audit tetap |
| Rate konflik | Attention dan reconciliation | Snapshot dan audit tetap |
| Rate expired setelah service date lama | Tidak mengubah snapshot | Tidak mengubah snapshot |

## 13. Role dan permission

| Action | Vendor/Operational staff | Manager/Admin | Approver/Owner |
| --- | --- | --- | --- |
| Melihat local-rate notice | Ya, sesuai department | Ya | Ya |
| Memakai `LOCAL_RATE_READY` | Ya, dengan notice | Ya | Ya |
| Membuat/edit Supplier Master rate | Tidak | Ya | Ya |
| Request approval | Pembuat/Manager | Ya | Ya |
| Approve sync | Tidak | Sesuai permission | Ya |
| Reject/request changes | Tidak | Sesuai permission | Ya |
| Owner conflict override | Tidak | Tidak | Ya |
| Publish approved batch | Tidak | Ya | Ya |

Default yang disarankan adalah maker-checker: pembuat harga tidak menyetujui
harga buatannya sendiri. Jika kantor menggunakan satu Manager, Owner override
diperbolehkan dengan alasan dan audit.

## 14. Audit fields

Wajib dicatat:

- local draft ID;
- entity type dan stable entity ID;
- local revision;
- base online record version;
- payload/snapshot hash;
- Supplier, Product, Contract, dan Rate ID;
- previous and new values;
- source/evidence;
- created by/at;
- requested by/at;
- reviewed by/at;
- decision dan reason;
- approved snapshot hash;
- sync session ID;
- sync result/version;
- conflict/error;
- booking IDs yang memakai rate.

## 15. Notification policy

- Satu local save menghasilkan satu Local Pending record, bukan spam notice.
- Satu approval snapshot hanya memiliki satu active approval task.
- Edit setelah request memperbarui revision dan menutup request lama sebagai
  superseded.
- Manager dashboard menampilkan total pending approval.
- Reminder disarankan pada 4, 8, dan 24 jam jika rate sudah dipakai untuk
  booking tetapi belum disetujui.
- Reminder berhenti setelah Approved, Rejected, atau Superseded.
- Notice harus menyebut bila rate hanya tersedia pada satu PC.

## 16. Implementation checklist

- [ ] Tambahkan operational usability state terpisah dari approval/sync state.
- [ ] Simpan approval request, reviewer, reason, dan approved snapshot hash.
- [ ] Pastikan local Contract/Rate tetap dioverlay setelah online refresh.
- [ ] Tambahkan `LOCAL RATE — SYNC APPROVAL REQUIRED` pada Supplier Master.
- [ ] Tambahkan badge yang sama pada Micro Split.
- [ ] Tambahkan local-rate notice pada Generate Product/Rate panel.
- [ ] Tambahkan `Request approval`.
- [ ] Tambahkan Approver inbox/task.
- [ ] Batasi publish hanya untuk `APPROVED_TO_SYNC`.
- [ ] Batalkan approval jika payload berubah.
- [ ] Simpan local-rate provenance di booking snapshot.
- [ ] Hubungkan booking IDs yang memakai local rate.
- [ ] Tambahkan rejection dan conflict impact review.
- [ ] Tambahkan Manager pending-approval counter.
- [ ] Tambahkan reminder tanpa notice duplikat.
- [ ] Tambahkan permission enforcement di backend, bukan UI saja.

## 17. UAT gates

- [ ] Save rate lokal yang lengkap menghasilkan `LOCAL_RATE_READY` dan
  `APPROVAL_REQUIRED`.
- [ ] Rate langsung tersedia di Micro Split pada PC yang sama.
- [ ] Rate belum muncul pada perangkat lain sebelum sync.
- [ ] Micro Split dan Generate menampilkan local-rate notice.
- [ ] Generate menyimpan provenance dan approval status dalam snapshot.
- [ ] Generate/Send tetap dapat berjalan dengan local-rate notice.
- [ ] Request approval membuat tepat satu task.
- [ ] Edit setelah request membatalkan approval snapshot lama.
- [ ] Approver dapat Approve, Request Changes, atau Reject dengan reason.
- [ ] Publish menolak rate yang belum approved.
- [ ] Sync sukses mengganti local overlay dengan central version tanpa
  mengubah stable IDs.
- [ ] Sync gagal mempertahankan local rate dan booking snapshot.
- [ ] Refresh online tidak menghapus local pending rate.
- [ ] Conflict tidak melakukan overwrite otomatis.
- [ ] Rejected rate hilang dari pilihan booking baru.
- [ ] Generated-unsent booking yang memakai rejected/changed rate mendapat
  Attention.
- [ ] Sent booking mempertahankan snapshot dan audit.
- [ ] Staff tanpa permission tidak dapat approve atau publish melalui direct
  IPC/API request.
