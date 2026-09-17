-- ============================================================
-- MIGRATION 38: Token katalog otomatis untuk customer baru
-- Jalankan di Supabase SQL Editor, setelah migration37.
-- ============================================================
--
-- KENAPA
-- migration37 menerbitkan token untuk semua toko yang ADA SAAT ITU lewat
-- catalog_ensure_tokens(). Toko yang dibuat setelahnya tidak dapat token, jadi
-- tombol "Link Katalog" di halaman Customers akan kosong untuk mereka sampai
-- ada yang ingat menjalankan fungsi itu lagi secara manual.
--
-- Trigger di bawah menutup celah itu: setiap customer baru langsung punya token
-- saat disimpan, tanpa perlu ada yang mengingatnya.
--
-- Sekaligus menambah satu baris konfigurasi: alamat domain katalog, supaya
-- halaman Customers bisa menyusun link lengkapnya tanpa ada domain yang
-- ditulis di dalam kode.
-- ============================================================


-- ============================================================
-- LANGKAH 1 — Trigger token otomatis
-- ============================================================
-- SECURITY DEFINER karena catalog_new_token() sengaja tidak diberikan ke
-- siapa pun lewat GRANT (lihat migration37 LANGKAH 1). Trigger ini yang
-- meminjam haknya, jadi hak itu tidak perlu dibuka untuk role manapun.
CREATE OR REPLACE FUNCTION set_catalog_token_on_new_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.catalog_token IS NULL THEN
    NEW.catalog_token := catalog_new_token();
    NEW.catalog_token_created_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_token_on_insert ON customers;
CREATE TRIGGER trg_catalog_token_on_insert
  BEFORE INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION set_catalog_token_on_new_customer();

-- Susulkan token untuk customer yang mungkin dibuat di antara migration37
-- dan sekarang. Toko yang sudah punya token tidak berubah — link lama tetap hidup.
SELECT catalog_ensure_tokens() AS token_susulan;


-- ============================================================
-- LANGKAH 2 — Alamat domain katalog
-- ============================================================
INSERT INTO app_settings (key, value) VALUES ('catalog_base_url', '')
ON CONFLICT (key) DO NOTHING;

-- >>> ISI DENGAN DOMAIN VERCEL KATALOG, TANPA GARIS MIRING DI AKHIR <<<
-- Contoh: 'https://katalog-diana-kosmetik.vercel.app'
-- UPDATE app_settings SET value = 'https://DOMAIN-ANDA' WHERE key = 'catalog_base_url';

-- Halaman Customers memakai nilai ini untuk menyusun link:
--   <catalog_base_url>/t/<catalog_token>
-- Kalau kosong, tombol Link Katalog akan memberi tahu bahwa domainnya belum diatur.


-- ============================================================
-- LANGKAH 3 — Verifikasi
-- ============================================================

-- 3a. Semua toko harus punya token (kolom tanpa_token = 0):
SELECT count(*) AS total_toko,
       count(catalog_token) AS punya_token,
       count(*) FILTER (WHERE catalog_token IS NULL) AS tanpa_token
FROM customers;

-- 3b. Domain katalog sudah terisi:
SELECT key, value FROM app_settings WHERE key LIKE 'catalog_%' ORDER BY key;

-- 3c. Uji trigger: tambah satu customer lewat halaman Customers di ERP,
--     lalu pastikan tombol Link Katalog-nya langsung bisa dipakai.


-- ============================================================
-- ROLLBACK
-- ============================================================
--   DROP TRIGGER IF EXISTS trg_catalog_token_on_insert ON customers;
--   DROP FUNCTION IF EXISTS set_catalog_token_on_new_customer();
-- (Token yang sudah terlanjur dibuat tidak ikut terhapus — memang tidak perlu.)
-- ============================================================
