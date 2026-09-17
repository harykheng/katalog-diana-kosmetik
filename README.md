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
| Harga lusin | `Math.round(price * 12 / 100) * 100` — sama persis dengan ERP |
| Lusin berlaku untuk | produk bersatuan `pcs` saja |
| Produk satuan lain | dijual apa adanya (lusin, box, pack, kg, …), tanpa konversi |
| Tier harga per toko | belum dipakai — satu harga untuk semua toko |

Mode satuan di keranjang disimpan sebagai `'base'` atau `'lusin'`, **bukan** nama
satuannya. Kalau dibandingkan dengan teks `'lusin'`, produk yang satuan dasarnya
memang lusin akan ikut dikali 12 sekali lagi.

## Struktur

```
src/
├── lib/
│   ├── supabase.js   ← client, semua dari environment variable
│   ├── catalog.js    ← pembacaan token dari URL + 4 panggilan RPC
│   ├── pricing.js    ← SATU-SATUNYA tempat perhitungan harga & satuan
│   ├── order.js      ← susunan pesanan + teks & URL WhatsApp
│   └── date.js
├── components/
│   ├── Header.jsx        ← nama toko, distributor, WA kantor
│   ├── Section.jsx
│   ├── ProductItem.jsx   ← harga, pemilih satuan, stepper
│   ├── AllProducts.jsx   ← search + kategori collapsed by default
│   └── BottomBar.jsx     ← sticky: jumlah item, total, tombol pesan
└── App.jsx
```

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
