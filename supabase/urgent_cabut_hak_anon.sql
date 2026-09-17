-- ============================================================
-- MENDESAK: cabut hak role `anon` di seluruh tabel
-- Jalankan di Supabase SQL Editor SEBELUM migration37.
-- ============================================================
--
-- MASALAHNYA
-- Role `anon` saat ini punya DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
-- TRUNCATE, UPDATE di 28 tabel schema public, sementara RLS mati di hampir
-- semuanya. Anon key bukan rahasia — ia ada di js/config.js pada repo publik
-- dan dikirim ke setiap browser yang membuka StokManager. Gabungan keduanya
-- berarti siapa pun yang punya key itu, tanpa login, bisa membaca seluruh isi
-- database DAN mengubah atau menghapusnya: harga, faktur, customer, sampai
-- kolom role di user_profiles.
--
-- Ini kondisi yang sudah berjalan sekarang, bukan akibat katalog.
--
-- KENAPA MENCABUT GRANT, BUKAN CUMA MENYALAKAN RLS
-- RLS baru berlaku kalau tabelnya diaktifkan satu per satu, dan satu policy
-- permissive yang longgar sudah cukup untuk membukanya lagi. Mencabut GRANT
-- menutup semuanya dalam satu perintah, langsung, tanpa bergantung pada policy
-- mana pun. Keduanya tetap dipakai: ini lapisan pertama, RLS di migration37
-- lapisan kedua.
--
-- APA YANG TIDAK BERUBAH
-- • Role `authenticated` tidak disentuh sama sekali, jadi seluruh halaman ERP
--   (yang semuanya login lebih dulu) tetap berjalan persis seperti sekarang.
-- • Login/logout lewat Supabase Auth tidak terpengaruh — itu layanan terpisah,
--   bukan lewat hak akses tabel.
-- • Dua view katalog publik (public_catalog_products, public_catalog_bestsellers)
--   SELECT-nya dikembalikan di LANGKAH 3, jadi katalog publik yang sudah jalan
--   tidak ikut mati.
--
-- ============================================================


-- ============================================================
-- LANGKAH 0 — Potret kondisi sebelum diubah (read-only)
-- Simpan hasilnya; ini yang dipakai membandingkan di LANGKAH 5.
-- ============================================================
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS hak_anon
FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;


-- ============================================================
-- LANGKAH 1 — Cabut semua hak anon di schema public
-- ============================================================
-- Mencakup tabel DAN view yang ada sekarang.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Sequence dan function ikut dicabut: anon tidak butuh keduanya. Hak EXECUTE
-- untuk 4 RPC katalog diberikan lagi secara spesifik di migration37 LANGKAH 5.
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- USAGE di schema TETAP diberikan: tanpa ini anon tidak bisa memanggil RPC
-- katalog sama sekali. USAGE sendiri tidak memberi akses ke tabel mana pun.
GRANT USAGE ON SCHEMA public TO anon;


-- ============================================================
-- LANGKAH 2 — Tutup juga untuk tabel yang dibuat NANTI
-- ============================================================
-- Tanpa ini, setiap tabel baru akan kembali mendapat hak penuh untuk anon
-- mengikuti default privileges bawaan, dan lubang yang sama terbuka lagi
-- diam-diam. Dijalankan untuk role yang biasa membuat tabel dari SQL Editor.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;


-- ============================================================
-- LANGKAH 3 — Kembalikan akses baca untuk katalog publik yang sudah jalan
-- ============================================================
-- HANYA dua view ini, HANYA SELECT. Keduanya view read-only berisi kolom aman
-- (tanpa cost, stock, data customer) dan berjalan dengan hak pembuatnya, jadi
-- tetap bisa dibaca meski RLS di tabel sumbernya dinyalakan nanti.
--
-- Kalau katalog publik yang sekarang ternyata membaca tabel lain juga, JANGAN
-- tambahkan grant-nya di sini — pindahkan dulu bacaannya ke view, atau bilang
-- ke saya tabel mana, supaya kita bikin view-nya. Memberi anon akses tabel
-- mentah lagi berarti mengulang masalah yang baru saja ditutup.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'public_catalog_products') THEN
    GRANT SELECT ON public_catalog_products TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'public_catalog_bestsellers') THEN
    GRANT SELECT ON public_catalog_bestsellers TO anon;
  END IF;
END $$;


-- ============================================================
-- LANGKAH 4 — (opsional, setelah dicek) Rapikan policy di `invoices`
-- ============================================================
-- Tabel invoices punya policy bernama "authenticated only" dengan role {public},
-- yang berlaku untuk SEMUA role termasuk anon. Sudah dicek: qual-nya
-- `auth.role() = 'authenticated'::text` dan with_check NULL (artinya qual yang
-- sama juga dipakai untuk tulis). Jadi anon memang tertutup — cuma nama dan
-- kolom role-nya yang bikin salah baca sekilas.
--
-- Ini AMAN dibiarkan apa adanya. Kalau mau diluruskan supaya seragam dengan
-- sembilan tabel lain yang memakai pola `TO authenticated`, jalankan dua baris
-- ini dalam SATU kali eksekusi (supaya tidak ada jeda tanpa policy yang membuat
-- halaman Faktur kosong sesaat):
--
--   DROP POLICY "authenticated only" ON invoices;
--   CREATE POLICY "authenticated_all" ON invoices
--     FOR ALL TO authenticated USING (true) WITH CHECK (true);
--
-- Catatan: `TO authenticated` lebih ketat daripada `auth.role()` karena dicek
-- PostgreSQL sendiri, bukan lewat isi JWT.


-- ============================================================
-- LANGKAH 5 — Verifikasi
-- ============================================================

-- 5a. Harus kosong, ATAU hanya berisi dua view katalog dengan hak SELECT saja:
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS hak_anon
FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;

-- 5b. Role authenticated HARUS tetap punya hak penuh (ERP bergantung padanya).
--     Kalau daftar ini kosong, JANGAN lanjut — berarti ada yang salah sasaran.
SELECT count(DISTINCT table_name) AS tabel_untuk_authenticated
FROM information_schema.role_table_grants
WHERE grantee = 'authenticated' AND table_schema = 'public';

-- 5c. Setelah ini, buka ERP dan pastikan masih normal: Dashboard, Produk,
--     Customers, Faktur, Pembelian, dan halaman Laporan. Semuanya login
--     sebagai authenticated, jadi seharusnya tidak ada yang berubah.

-- Kalau semua aman, lanjut ke migration37_catalog_per_toko.sql.


-- ============================================================
-- ROLLBACK (kalau ada halaman ERP yang ternyata ikut mati)
-- ============================================================
-- Ini mengembalikan lubangnya, jadi pakai hanya sebagai jalan darurat sementara
-- sambil mencari halaman mana yang membaca sebagai anon:
--   GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
--   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON TABLES TO anon;
-- ============================================================
