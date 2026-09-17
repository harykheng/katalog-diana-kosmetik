-- ============================================================
-- MIGRATION 37: Katalog per-toko (token + RLS + RPC baca)
-- Untuk Supabase project yang SAMA dengan StokManager (uddiana).
-- Jalankan di Supabase SQL Editor, urut dari atas ke bawah.
-- ============================================================
--
-- APA YANG DILAKUKAN FILE INI
--   1. Menambah kolom token katalog di `customers` (satu link unik per toko)
--   2. Menyalakan RLS di tabel inti supaya anon key TIDAK bisa membaca tabel
--      langsung (sekarang RLS-nya mati — anon berpotensi baca semua toko & faktur)
--   3. Membuat 4 fungsi RPC SECURITY DEFINER yang hanya mengembalikan data milik
--      toko pemegang token. Katalog publik cuma boleh memanggil 4 fungsi ini.
--
-- APA YANG TIDAK DILAKUKAN
--   • TIDAK membuat tabel produk / tabel harga baru. Harga tetap satu sumber:
--     `products.price`. Satuan tetap satu sumber: `products.unit`.
--   • TIDAK mengubah data faktur, produk, atau stok apa pun.
--   • TIDAK memberi hak tulis apa pun ke role anon. Katalog 100% read-only.
--
-- KEPUTUSAN YANG MASIH TERBUKA (sengaja belum dikunci di sini)
--   • Tier harga per toko: RPC mengembalikan `products.price` apa adanya.
--     Kalau nanti dipilih memakai aturan diskon khusus customer
--     (product_discount_rules + product_discount_rule_customers), cukup tambah
--     satu fungsi baru di migration berikutnya — file ini tidak perlu diubah.
--   • Konversi satuan (pcs/lusin/dus): RPC mengembalikan `unit` apa adanya,
--     tanpa konversi. Semua tampilan satuan diputuskan di sisi frontend.
--
-- CARA MEMBATALKAN: lihat bagian ROLLBACK di paling bawah.
-- ============================================================


-- ============================================================
-- LANGKAH 0 — PRA-CEK (hanya membaca, tidak mengubah apa pun)
-- Jalankan ini dulu dan baca hasilnya sebelum lanjut.
-- ============================================================
SELECT relname AS tabel, relrowsecurity AS rls_aktif_sekarang
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('customers','invoices','invoice_items','products','categories','app_settings')
ORDER BY relname;

-- Kalau ada baris dengan rls_aktif_sekarang = false, itu memang yang akan
-- diperbaiki LANGKAH 3. Semua halaman ERP login sebagai role `authenticated`,
-- dan LANGKAH 3 memberi policy penuh untuk role itu, jadi ERP tetap jalan
-- persis seperti sekarang.


-- ============================================================
-- LANGKAH 1 — Token katalog per toko
-- ============================================================

-- Token disimpan di tabel outlet yang sudah ada, bukan tabel baru.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS catalog_token            text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS catalog_token_created_at timestamptz;

-- Unik, tapi banyak toko boleh sama-sama NULL (= belum punya link katalog).
CREATE UNIQUE INDEX IF NOT EXISTS customers_catalog_token_key
  ON customers (catalog_token)
  WHERE catalog_token IS NOT NULL;

-- Token 32 karakter hex dari gen_random_uuid() (RNG kriptografis bawaan
-- PostgreSQL, tidak butuh extension tambahan). ~122 bit acak: tidak bisa ditebak
-- atau di-enumerate dari luar.
CREATE OR REPLACE FUNCTION catalog_new_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT replace(gen_random_uuid()::text, '-', '');
$$;

-- Isi token untuk semua toko yang belum punya. Aman dijalankan berulang kali:
-- toko yang sudah punya token TIDAK akan berubah (link lama tetap hidup).
CREATE OR REPLACE FUNCTION catalog_ensure_tokens()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE customers
  SET catalog_token            = catalog_new_token(),
      catalog_token_created_at = now()
  WHERE catalog_token IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Cabut link lama & terbitkan link baru untuk satu toko (mis. link bocor ke
-- grup WA yang salah). Link lama langsung mati begitu fungsi ini dijalankan.
CREATE OR REPLACE FUNCTION catalog_rotate_token(p_customer_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  t text;
BEGIN
  UPDATE customers
  SET catalog_token            = catalog_new_token(),
      catalog_token_created_at = now()
  WHERE id = p_customer_id
  RETURNING catalog_token INTO t;
  RETURN t;
END;
$$;

-- Ketiga fungsi di atas MENULIS ke customers, jadi sengaja tidak diberikan ke
-- siapa pun lewat GRANT. PostgreSQL memberi EXECUTE ke PUBLIC secara default,
-- jadi harus dicabut eksplisit. Yang bisa menjalankannya hanya SQL Editor
-- (role postgres/service_role) — bukan katalog, bukan anon, bukan sales.
REVOKE ALL ON FUNCTION catalog_new_token()            FROM PUBLIC;
REVOKE ALL ON FUNCTION catalog_ensure_tokens()        FROM PUBLIC;
REVOKE ALL ON FUNCTION catalog_rotate_token(uuid)     FROM PUBLIC;

-- Terbitkan token untuk semua toko yang ada sekarang:
SELECT catalog_ensure_tokens() AS token_baru_dibuat;


-- ============================================================
-- LANGKAH 2 — Identitas distributor (tanpa hardcode di kode)
-- ============================================================
-- Nama distributor & nomor WA kantor diambil dari database, BUKAN ditulis di
-- kode katalog. Dengan begitu katalog yang sama bisa dipakai ulang untuk klien
-- lain cukup dengan mengganti dua baris di bawah.

CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO app_settings (key, value) VALUES
  ('catalog_distributor_name', ''),   -- contoh: 'DIANA KOSMETIK'
  ('catalog_whatsapp_number',  '')    -- WAJIB format internasional tanpa +, contoh: '628123456789'
ON CONFLICT (key) DO NOTHING;

-- >>> ISI DUA BARIS INI SEBELUM KATALOG DIPAKAI <<<
-- UPDATE app_settings SET value = 'DIANA KOSMETIK' WHERE key = 'catalog_distributor_name';
-- UPDATE app_settings SET value = '628xxxxxxxxxx'  WHERE key = 'catalog_whatsapp_number';


-- ============================================================
-- LANGKAH 3 — Nyalakan RLS di tabel inti
-- ============================================================
-- Sekarang RLS di tabel-tabel ini mati, artinya anon key (yang ikut terpasang di
-- katalog publik) berpotensi membaca SELURUH isi customers & invoices. Setelah
-- langkah ini, anon tidak punya policy sama sekali di tabel-tabel ini → nol baris,
-- dan satu-satunya jalan masuk adalah 4 fungsi RPC di LANGKAH 4 yang wajib token.
--
-- ERP tidak terpengaruh: semua halaman ERP login sebagai `authenticated`, dan
-- policy di bawah memberi akses penuh untuk role itu — sama persis dengan pola
-- yang sudah dipakai product_discount_rules (migration 8) dan discount_groups
-- (migration 9).
--
-- View `public_catalog_products` (migration 26) juga tidak terpengaruh: view itu
-- berjalan dengan hak pembuatnya (bukan security_invoker), jadi tetap bisa dibaca.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers','invoices','invoice_items','products','categories','app_settings']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'authenticated_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "authenticated_all" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- LANGKAH 3b — Tutup sisa tabel yang RLS-nya masih mati
-- (SANGAT DISARANKAN, boleh dijalankan terpisah setelah LANGKAH 3 aman)
-- ============================================================
-- LANGKAH 3 hanya menutup tabel yang dipakai katalog. Tabel lain
-- (stock_movements, purchases, purchase_items, stock_transfers, sales_visits,
-- wishlist_items, user_profiles, product_cost_logs, ...) RLS-nya juga masih mati.
--
-- Perlu diketahui: anon key StokManager memang sudah publik sejak awal — key itu
-- ada di js/config.js pada repo publik dan dikirim ke setiap browser yang membuka
-- ERP. Jadi tabel ber-RLS-mati sebenarnya SUDAH bisa dibaca siapa pun hari ini,
-- terlepas dari ada tidaknya katalog. Langkah ini menutup lubang itu sekalian.
--
-- Loop di bawah: nyalakan RLS di semua tabel schema public yang belum aktif, lalu
-- beri policy penuh untuk role `authenticated` supaya seluruh halaman ERP tetap
-- berjalan seperti biasa.
--
-- CATATAN setup.html: kalau suatu saat perlu membuat akun admin pertama dari nol
-- DAN konfirmasi email Supabase sedang aktif, insert ke user_profiles bisa tertolak
-- karena saat itu belum ada sesi. Akun admin sudah ada sekarang, jadi ini cuma
-- relevan untuk instalasi baru — baris pertamanya tinggal dibuat lewat SQL Editor.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'authenticated_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "authenticated_all" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;

-- Cek hasilnya — kolom rls_aktif harus true semua:
SELECT relname AS tabel, relrowsecurity AS rls_aktif
FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
ORDER BY relrowsecurity, relname;


-- ============================================================
-- LANGKAH 4 — RPC baca untuk katalog (satu-satunya pintu untuk anon)
-- ============================================================
-- Semua SECURITY DEFINER + SET search_path = public + STABLE (read-only).
-- Token tidak valid / kosong / NULL → nol baris, bukan error, bukan data toko lain.

-- Penerjemah token → outlet. Internal: tidak diberikan ke anon.
CREATE OR REPLACE FUNCTION catalog_customer_id(p_token text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM customers c
  WHERE c.catalog_token IS NOT NULL
    AND p_token IS NOT NULL
    AND length(p_token) >= 16
    AND c.catalog_token = p_token
  LIMIT 1;
$$;

-- 1) Header halaman: nama toko + identitas distributor.
--    Sengaja TIDAK mengembalikan phone/address/koordinat toko — katalog tidak
--    membutuhkannya, jadi tidak perlu ikut terkirim ke browser.
CREATE OR REPLACE FUNCTION catalog_get_outlet(p_token text)
RETURNS TABLE (
  store_name       text,
  distributor_name text,
  whatsapp_number  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(nullif(c.store_name, ''), c.name)                                  AS store_name,
    coalesce((SELECT s.value FROM app_settings s
               WHERE s.key = 'catalog_distributor_name'), '')                   AS distributor_name,
    coalesce((SELECT s.value FROM app_settings s
               WHERE s.key = 'catalog_whatsapp_number'),  '')                   AS whatsapp_number
  FROM customers c
  WHERE c.id = catalog_customer_id(p_token);
$$;

-- 2) Section "Biasa Diambil": produk dari riwayat faktur toko ini.
--    Faktur batal & faktur yang ditolak verifikasi tidak dihitung — keduanya
--    bukan pesanan yang benar-benar terjadi.
CREATE OR REPLACE FUNCTION catalog_get_history(p_token text)
RETURNS TABLE (
  product_id    uuid,
  name          text,
  sku           text,
  price         numeric,
  unit          text,
  category_name text,
  order_count   bigint,
  total_qty     bigint,
  last_ordered  date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    p.sku,
    p.price,
    p.unit,
    cat.name,
    count(DISTINCT i.id)   AS order_count,
    sum(ii.quantity)::bigint AS total_qty,
    max(i.invoice_date)    AS last_ordered
  FROM invoice_items ii
  JOIN invoices i   ON i.id = ii.invoice_id
  JOIN products p   ON p.id = ii.product_id
  LEFT JOIN categories cat ON cat.id = p.category_id
  WHERE i.customer_id = catalog_customer_id(p_token)
    AND i.status <> 'cancelled'
    AND coalesce(i.verification_status, '') <> 'rejected'
    AND p.is_active = true
  GROUP BY p.id, p.name, p.sku, p.price, p.unit, cat.name
  ORDER BY count(DISTINCT i.id) DESC, max(i.invoice_date) DESC, p.name;
$$;

-- 3) Section "Belum Pernah Dicoba": produk yang belum pernah diambil toko ini,
--    diurutkan dari yang paling banyak diambil toko LAIN.
CREATE OR REPLACE FUNCTION catalog_get_suggestions(p_token text, p_limit integer DEFAULT 12)
RETURNS TABLE (
  product_id    uuid,
  name          text,
  sku           text,
  price         numeric,
  unit          text,
  category_name text,
  outlet_count  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT catalog_customer_id(p_token) AS id
  ),
  sudah_pernah AS (
    SELECT DISTINCT ii.product_id
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.customer_id = (SELECT id FROM me)
      AND i.status <> 'cancelled'
      AND coalesce(i.verification_status, '') <> 'rejected'
  )
  SELECT
    p.id,
    p.name,
    p.sku,
    p.price,
    p.unit,
    cat.name,
    count(DISTINCT i.customer_id) AS outlet_count
  FROM invoice_items ii
  JOIN invoices i  ON i.id = ii.invoice_id
  JOIN products p  ON p.id = ii.product_id
  LEFT JOIN categories cat ON cat.id = p.category_id
  WHERE (SELECT id FROM me) IS NOT NULL
    AND i.customer_id IS NOT NULL
    AND i.customer_id <> (SELECT id FROM me)
    AND i.status <> 'cancelled'
    AND coalesce(i.verification_status, '') <> 'rejected'
    AND p.is_active = true
    -- NOT EXISTS, bukan NOT IN: invoice_items.product_id boleh NULL, dan satu
    -- NULL saja di daftar NOT IN membuat SELURUH hasil jadi kosong tanpa error.
    AND NOT EXISTS (
      SELECT 1 FROM sudah_pernah sp WHERE sp.product_id = ii.product_id
    )
  GROUP BY p.id, p.name, p.sku, p.price, p.unit, cat.name
  ORDER BY count(DISTINCT i.customer_id) DESC, p.name
  LIMIT least(greatest(coalesce(p_limit, 12), 1), 50);
$$;

-- 4) Section "Semua Produk": seluruh SKU aktif + kategorinya.
--    Kolom sensitif (cost, stock_quantity, min_stock, price_shopee) sengaja
--    tidak ikut — sama semangatnya dengan view public_catalog_products (m26).
CREATE OR REPLACE FUNCTION catalog_get_products(p_token text)
RETURNS TABLE (
  product_id    uuid,
  name          text,
  sku           text,
  price         numeric,
  unit          text,
  category_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    p.sku,
    p.price,
    p.unit,
    cat.name
  FROM products p
  LEFT JOIN categories cat ON cat.id = p.category_id
  WHERE p.is_active = true
    AND catalog_customer_id(p_token) IS NOT NULL
  ORDER BY cat.name NULLS LAST, p.name;
$$;


-- ============================================================
-- LANGKAH 5 — Hak akses fungsi
-- ============================================================
-- PostgreSQL memberi EXECUTE ke PUBLIC secara default untuk setiap fungsi baru,
-- jadi cabut dulu semuanya, baru berikan yang memang perlu.

REVOKE ALL ON FUNCTION catalog_customer_id(text)            FROM PUBLIC;
REVOKE ALL ON FUNCTION catalog_get_outlet(text)             FROM PUBLIC;
REVOKE ALL ON FUNCTION catalog_get_history(text)            FROM PUBLIC;
REVOKE ALL ON FUNCTION catalog_get_suggestions(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION catalog_get_products(text)           FROM PUBLIC;

-- catalog_customer_id sengaja TIDAK diberikan ke anon: itu penerjemah internal.
GRANT EXECUTE ON FUNCTION catalog_get_outlet(text)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_get_history(text)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_get_suggestions(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_get_products(text)           TO anon, authenticated;


-- ============================================================
-- LANGKAH 6 — Index penunjang
-- ============================================================
-- Section "Biasa Diambil" & "Belum Pernah Dicoba" menelusuri faktur per toko.
-- Foreign key di PostgreSQL TIDAK otomatis punya index, jadi dibuat manual.
-- Ini juga mempercepat halaman Piutang & Laporan Sales di ERP.
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id     ON invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON invoice_items (product_id);


-- ============================================================
-- LANGKAH 7 — Verifikasi (jalankan setelah semua di atas selesai)
-- ============================================================

-- 7a. Daftar link katalog per toko. Ganti <DOMAIN> dengan domain Vercel katalog.
SELECT
  coalesce(nullif(store_name, ''), name)               AS toko,
  'https://<DOMAIN>/t/' || catalog_token               AS link_katalog
FROM customers
WHERE catalog_token IS NOT NULL
ORDER BY toko
LIMIT 20;

-- 7b. Uji satu token sungguhan (ambil salah satu dari 7a, tempel ke bawah ini):
-- SELECT * FROM catalog_get_outlet('PASTE_TOKEN_DI_SINI');
-- SELECT * FROM catalog_get_history('PASTE_TOKEN_DI_SINI') LIMIT 10;
-- SELECT * FROM catalog_get_suggestions('PASTE_TOKEN_DI_SINI', 12);
-- SELECT count(*) FROM catalog_get_products('PASTE_TOKEN_DI_SINI');

-- 7c. Token ngawur HARUS mengembalikan nol baris, bukan error, bukan data toko lain:
SELECT
  (SELECT count(*) FROM catalog_get_outlet('token-ngawur-123456789'))      AS outlet_harus_0,
  (SELECT count(*) FROM catalog_get_history('token-ngawur-123456789'))     AS history_harus_0,
  (SELECT count(*) FROM catalog_get_products('token-ngawur-123456789'))    AS produk_harus_0,
  (SELECT count(*) FROM catalog_get_suggestions('token-ngawur-123456789')) AS saran_harus_0;


-- ============================================================
-- ROLLBACK (kalau ada yang tidak beres)
-- ============================================================
-- Matikan RLS lagi (kembali ke kondisi sebelum migration ini):
--   ALTER TABLE customers      DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE invoices       DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE invoice_items  DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE products       DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE categories     DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE app_settings   DISABLE ROW LEVEL SECURITY;
--
-- Matikan katalog tanpa menghapus apa pun (semua link langsung tidak berlaku):
--   REVOKE EXECUTE ON FUNCTION catalog_get_outlet(text)             FROM anon;
--   REVOKE EXECUTE ON FUNCTION catalog_get_history(text)            FROM anon;
--   REVOKE EXECUTE ON FUNCTION catalog_get_suggestions(text,integer) FROM anon;
--   REVOKE EXECUTE ON FUNCTION catalog_get_products(text)           FROM anon;
--
-- Hapus total:
--   DROP FUNCTION IF EXISTS catalog_get_products(text);
--   DROP FUNCTION IF EXISTS catalog_get_suggestions(text, integer);
--   DROP FUNCTION IF EXISTS catalog_get_history(text);
--   DROP FUNCTION IF EXISTS catalog_get_outlet(text);
--   DROP FUNCTION IF EXISTS catalog_customer_id(text);
--   DROP FUNCTION IF EXISTS catalog_rotate_token(uuid);
--   DROP FUNCTION IF EXISTS catalog_ensure_tokens();
--   DROP FUNCTION IF EXISTS catalog_new_token();
--   DROP INDEX    IF EXISTS customers_catalog_token_key;
--   ALTER TABLE customers DROP COLUMN IF EXISTS catalog_token;
--   ALTER TABLE customers DROP COLUMN IF EXISTS catalog_token_created_at;
-- (Index di LANGKAH 6 sebaiknya dibiarkan — bermanfaat untuk ERP.)
-- ============================================================
