# Katalog Pesanan per Toko

Halaman katalog mobile-first, satu link unik per toko, tanpa login. Toko membuka
link dari HP, memilih barang dan jumlah, lalu menekan satu tombol yang membuka
WhatsApp dengan daftar pesanan sudah terisi.

**Tidak ada backend order.** Output akhir alur ini adalah pesan WhatsApp berisi
teks pesanan; admin memprosesnya manual di ERP seperti biasa.

## Arsitektur singkat

```
Toko (HP)  →  /t/:token  →  4 RPC Supabase (read-only, wajib token)  →  wa.me
```

- Data produk, toko, dan riwayat order dibaca **langsung dari database ERP yang
  sudah ada**. Tidak ada tabel produk atau tabel harga baru — harga satu sumber
  di `products.price`, satuan satu sumber di `products.unit`.
- Katalog tidak pernah menulis apa pun ke database.
- Tanpa library `@supabase/supabase-js`: keempat RPC dipanggil dengan `fetch`
  biasa ke endpoint PostgREST (`src/lib/supabase.js`, ±25 baris). Tetap Supabase,
  tetap anon key, RLS dan hak akses fungsi tetap berlaku sama — tapi bundle turun
  dari 132 KB gzip jadi 74 KB, yang terasa di HP dengan koneksi lambat.
- Tidak ada nama distributor, nomor WA, atau ID toko yang ditulis di kode.
  Semuanya dari data (`app_settings` + tabel outlet).

## Setup

```bash
npm install
cp .env.example .env     # isi VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY
npm run dev
```

Buka `http://localhost:5173/t/<token>` — token diambil dari kolom
`customers.catalog_token` di database.

### Migration database

Sebelum katalog bisa dipakai, jalankan `supabase/migration37_catalog_per_toko.sql`
di Supabase SQL Editor (project yang sama dengan ERP). Migration itu membuat:

- kolom `customers.catalog_token` + fungsi untuk menerbitkan & mencabut link
- RLS di tabel inti, supaya anon key tidak bisa membaca tabel secara langsung
- 4 fungsi RPC read-only yang wajib token: `catalog_get_outlet`,
  `catalog_get_history`, `catalog_get_suggestions`, `catalog_get_products`
- dua baris konfigurasi di `app_settings` yang **wajib diisi**:
  `catalog_distributor_name` dan `catalog_whatsapp_number`

Daftar link per toko bisa diambil dengan query di LANGKAH 7 file migration.

### Urutan file di `supabase/`

| File | Wajib? |
|---|---|
| `urgent_cabut_hak_anon.sql` | **Ya, pertama.** Mencabut hak role `anon` di seluruh tabel |
| `migration37_catalog_per_toko.sql` | **Ya.** Token per toko + RLS + 4 RPC katalog |
| `migration38_token_otomatis.sql` | **Ya.** Token otomatis untuk customer baru + `catalog_base_url` |
| `migration39_sembunyikan_harga_kosong.sql` | **Tidak — jangan dijalankan.** Sudah digantikan |
| `migration40_barang_tanpa_harga_tetap_tampil.sql` | **Hanya kalau 39 terlanjur dijalankan** |
| `migration41_foto_produk.sql` | **Ya.** Kolom & bucket foto produk + RPC ikut kirim path foto |
| `migration42_perbaiki_paginasi_produk.sql` | **Ya.** Perbaikan bug produksi — lihat di bawah |

39 dan 40 saling meniadakan. 39 menyembunyikan barang ber-harga 0 dari katalog;
keputusannya kemudian diubah — barang itu tetap ditampilkan dan boleh dipesan,
ditandai "Harga dikonfirmasi" dan tidak ikut total (ditangani di sisi aplikasi,
bukan database). 40 hanya ada untuk mengembalikan keadaan kalau 39 terlanjur
dijalankan. Kalau 39 tidak pernah dijalankan, lewati keduanya.

**Bug produksi yang diperbaiki migration42:** tab Semua Barang tidak pernah
selesai memuat. `rpcAll()` mengambil data bertahap lewat header HTTP
`Range: 0-999`, `Range: 1000-1999`, dst, meniru pola bypass limit 1.000 baris
di ERP. Ternyata Supabase tidak menghormati header `Range` untuk RPC yang
dipanggil lewat POST — server selalu membalas 1.000 baris pertama yang sama,
berapa pun halaman yang diminta (terkonfirmasi lewat tab Network browser:
`Range: 16000-16999` diminta, `Content-Range: 0-999/*` yang dibalas). Browser
tidak pernah tahu sudah sampai ujung data dan terus meminta "halaman
berikutnya" sampai berhenti sendiri di pengaman 50.000 baris. Perbaikannya:
`catalog_get_products` dan `catalog_get_history` sekarang menerima
`p_limit`/`p_offset` sebagai parameter fungsi dan memotong hasilnya sendiri
lewat `LIMIT`/`OFFSET` di SQL — tidak lagi bergantung pada header HTTP sama
sekali.

## Pengujian

```bash
npx playwright install chromium   # sekali saja, di komputer baru
npm test                          # ±15 detik
```

23 pengujian menjalankan katalog di browser sungguhan pada viewport **360px**
— ukuran HP paling sempit yang ditargetkan. Seluruh panggilan jaringan disadap
di `tests/fixtures.js`, jadi pengujian **tidak pernah menyentuh Supabase**: bisa
jalan tanpa koneksi, tanpa kredensial, dan tidak mungkin mengubah data siapa pun.

Yang dijaga, dan kenapa — semuanya berasal dari kesalahan yang benar-benar
pernah terjadi di proyek ini:

| Yang dijaga | Kalau lolos |
|---|---|
| Produk bersatuan `lusin` tidak dikali 12 lagi | Rp 470.000 tampil jadi Rp 5.640.000 |
| Ganti satuan tidak mengonversi jumlah | "3" mendadak jadi 36 pcs tanpa disadari |
| Subtotal dibulatkan NAIK ke kelipatan 100, sama seperti ERP | Harga tidak genap ratusan (mis. Rp 4.570) bikin total katalog beda dari total faktur |
| Barang tanpa harga tidak tampil "Rp 0" & tidak menggeser total | Toko mengira gratis; total estimasi salah |
| Seluruh 1.500+ SKU terambil meski satu halaman dibatasi 1.000 baris | Ratusan produk "hilang" dan tidak ketemu saat dicari |
| Paginasi berhenti begitu sampai ujung data (bukan tergantung header Range) | Tab Semua Barang tidak pernah selesai memuat — lihat migration42 |
| Kolom cari & ketiga tab terlihat tanpa menggulir, teks tab tidak terpotong | Kembali jadi halaman panjang yang bikin toko bingung |
| Tombol − tetap utuh saat jumlah 0 (opacity harus 1) | Tombol terlihat rusak setengah |
| Daftar hanya menarik foto kecil; besar cuma saat diketuk | Kuota transfer Supabase gratis terkuras |
| Spinner tampil sampai foto besar selesai diunduh | Kotak kosong tanpa keterangan di koneksi lambat, terlihat seperti rusak |
| Isi pesan WhatsApp: nama, jumlah, satuan, total | Kegagalan paling fatal — admin memproses pesanan yang salah |

Menambah pengujian: tulis di `tests/`, pakai data & penyadap dari
`tests/fixtures.js`. Jangan mengarang data baru dari nol — kalau produk contoh
berubah, semua berkas ikut menyesuaikan dari satu tempat.

## Deploy (Vercel)

1. Import repo ini di Vercel (framework: Vite, build `npm run build`, output `dist`).
2. Isi Environment Variables: `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`
   (pakai **anon** key, jangan service_role).
3. `vercel.json` sudah mengarahkan `/t/:token` ke `index.html`.

## Aturan satuan & harga

Ini bagian paling rawan di fitur ini — semua perhitungannya terkumpul di
`src/lib/pricing.js`, jangan disebar ke komponen.

| Aturan | Nilai |
|---|---|
| Harga per satuan dasar | `products.price` (apa adanya dari ERP) |
| Harga lusin | `Math.ceil(price * 12 / 100) * 100` — dibulatkan NAIK, sama persis dengan ERP |
| Lusin berlaku untuk | produk bersatuan `pcs` saja |
| Produk satuan lain | dijual apa adanya (lusin, box, pack, kg, …), tanpa konversi |
| Subtotal per baris (qty × harga satuan) | `Math.ceil(subtotal / 100) * 100` — dibulatkan NAIK, sama persis dengan `invoices.html`/`sales.html` ERP |
| Tier harga per toko | belum dipakai — satu harga untuk semua toko |
| Barang ber-harga 0 | tetap bisa dipesan, ditandai "Harga dikonfirmasi", **tidak ikut total** |

Satu aturan pembulatan untuk semuanya: **selalu NAIK ke kelipatan 100**
(`Math.ceil`, fungsi `roundSubtotal()` di `pricing.js`) — dipakai untuk harga
lusin, rekap kartu produk (`ProductItem.jsx`), dan subtotal baris pesanan
(`order.js`: baris pesanan, total, teks WhatsApp). Sebelumnya harga lusin
dibulatkan ke kelipatan 100 **terdekat** (`Math.round`), beda dari subtotal
yang sudah lebih dulu pakai `Math.ceil` — untuk harga yang genap ratusan dua
rumus itu kebetulan sama, jadi tidak pernah kelihatan bedanya sampai ada
produk dengan harga per pcs yang tidak genap ratusan (mis. Rp 4.570): harga
lusin tampil Rp 54.800 sementara subtotal 12 pcs tampil Rp 54.900 — dua angka
beda di satu kartu produk yang sama. ERP-nya sendiri (`js/utils.js`,
`products.html`, `sales.html` di repo `uddiana`) juga sudah disamakan ke
`Math.ceil` supaya tidak ada dua sumber kebenaran.

Barang tanpa harga tidak pernah ditampilkan sebagai "Rp 0" — itu terbaca
seperti gratis. Jumlahnya tetap bisa diisi, subtotalnya nol, bar bawah menulis
"+n barang tanpa harga", dan di pesan WhatsApp barisnya diberi keterangan
"(harga dikonfirmasi)" plus catatan di bawah total. Penentunya `hasPrice()` di
`src/lib/pricing.js`; database mengirim apa adanya.

Mode satuan di keranjang disimpan sebagai `'base'` atau `'lusin'`, **bukan** nama
satuannya. Kalau dibandingkan dengan teks `'lusin'`, produk yang satuan dasarnya
memang lusin akan ikut dikali 12 sekali lagi.

## Struktur

```
src/
├── lib/
│   ├── supabase.js   ← pemanggil RPC lewat fetch, semua dari environment variable
│   ├── catalog.js    ← pembacaan token dari URL + 4 panggilan RPC
│   ├── pricing.js    ← SATU-SATUNYA tempat perhitungan harga & satuan
│   ├── order.js      ← susunan pesanan + teks & URL WhatsApp
│   └── date.js
├── components/
│   ├── Header.jsx          ← nama toko, distributor, WA kantor (ringkas)
│   ├── TopBar.jsx          ← sticky: kolom cari + 3 tab
│   ├── ProductItem.jsx     ← harga, pemilih satuan, stepper
│   ├── CategoryBrowser.jsx ← tab Semua: daftar kategori → isinya
│   └── BottomBar.jsx       ← sticky: jumlah item, total, tombol pesan
└── App.jsx
```

## Tampilan

Palet mengikuti arah visual referensi skincare: biru es sangat terang sebagai
latar, navy pekat untuk tombol & judul, kartu putih, sudut membulat. Semua
warna didefinisikan sebagai token di `@theme` pada `src/index.css` — komponen
memakai namanya (`bg-navy`, `text-ink`, `bg-ice`), tidak ada hex yang
bertaburan di JSX, jadi mengganti nuansa cukup di satu file.

| Token | Dipakai untuk |
|---|---|
| `navy` | tombol utama, judul, harga, tab aktif |
| `ice` / `ice-light` | latar halaman, chip, baris terpilih |
| `ink` / `muted` | teks utama & sekunder |
| `line` | garis pemisah & border |
| `warn-bg` / `warn-ink` | barang tanpa harga |

Judul memakai serif bawaan perangkat (`--font-display`), **bukan** font dari
Google — satu permintaan jaringan tambahan sebelum halaman bisa dibaca terlalu
mahal untuk HP kelas bawah dengan koneksi lambat.

## Susunan layar

Satu layar = satu daftar. Tiga daftar sejajar sebagai tab, bukan ditumpuk
vertikal — kalau ditumpuk, toko dengan riwayat panjang harus menggulir jauh
hanya untuk sampai ke daftar berikutnya atau ke kolom cari.

```
┌──────────────────────────┐
│ Nama toko · distributor  │  header ringkas, ikut tergulir
├──────────────────────────┤
│ 🔍 Cari barang…          │  menempel di atas, mencari SELURUH katalog
│ [Biasa][Belum][Semua]    │  tiga tab lebar sama, tidak ada yang terpotong
├──────────────────────────┤
│ daftar barang            │
├──────────────────────────┤
│ 2 barang · Rp x  [Pesan] │  menempel di bawah; sisi kiri membuka
└──────────────────────────┘  daftar barang yang sudah dipilih
```

Tab "Semua Barang" menampilkan daftar kategori dulu, baru isinya. 1.500+ SKU
tidak pernah dirender sekaligus — berat untuk HP kelas bawah, dan tidak mungkin
ditelusuri dengan jempol.

## Format pesan WhatsApp

```
Pesanan Toko Ani

- Bedak Padat Aurora 12gr: 1 lusin
- Paket Lipstik Nude (isi 12): 1 lusin

Total estimasi: Rp 770.000
```

## Di luar lingkup

Foto produk, indikator stok, riwayat order untuk dilihat toko, keranjang
tersimpan, login, PWA, submit order ke ERP, notifikasi, halaman admin, analytics.
