-- ============================================================
-- MIGRATION 39: Barang tanpa harga tidak muncul di katalog
-- Jalankan di Supabase SQL Editor, setelah migration37.
-- ============================================================
--
-- KENAPA
-- Sebagian produk di ERP masih ber-harga 0 (biasanya SKU baru yang harganya
-- belum sempat diisi). Di katalog, barang begitu tampil sebagai "Rp 0" — toko
-- bisa mengira gratis, dan kalau ikut dipesan, Total estimasi di pesan
-- WhatsApp jadi salah.
--
-- Katalog adalah daftar harga. Barang yang belum punya harga belum siap dijual
-- lewat sana, jadi disaring di sumbernya: ketiga fungsi yang mengembalikan
-- produk sekarang menambahkan syarat p.price > 0.
--
-- EFEK YANG PERLU DISADARI
-- Kalau sebuah barang pernah diambil toko TAPI harganya sekarang 0, barang itu
-- ikut hilang dari daftar "Biasa Diambil" toko tersebut. Itu memang disengaja —
-- lebih baik hilang daripada tampil Rp 0 — tapi artinya mengisi harga yang
-- kosong di ERP tetap pekerjaan yang harus dikejar. LANGKAH 3 di bawah
-- membantu menemukannya.
--
-- Tidak ada data yang diubah di sini, hanya definisi fungsi.
-- ============================================================


-- ============================================================
-- LANGKAH 1 — Lihat dulu seberapa banyak (read-only)
-- ============================================================
SELECT
  count(*) FILTER (WHERE is_active)                                AS sku_aktif,
  count(*) FILTER (WHERE is_active AND coalesce(price, 0) <= 0)    AS tanpa_harga,
  round(
    100.0 * count(*) FILTER (WHERE is_active AND coalesce(price, 0) <= 0)
    / nullif(count(*) FILTER (WHERE is_active), 0), 1)             AS persen_tanpa_harga
FROM products;


-- ============================================================
-- LANGKAH 2 — Saring di ketiga fungsi katalog
-- ============================================================
-- Sengaja ditulis ulang utuh (bukan ALTER) supaya isi fungsinya selalu bisa
-- dibaca apa adanya di file ini. Selain baris `AND p.price > 0`, tidak ada
-- yang berubah dari migration37.

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
    AND p.price > 0
  GROUP BY p.id, p.name, p.sku, p.price, p.unit, cat.name
  ORDER BY count(DISTINCT i.id) DESC, max(i.invoice_date) DESC, p.name;
$$;

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
    AND p.price > 0
    -- NOT EXISTS, bukan NOT IN: invoice_items.product_id boleh NULL, dan satu
    -- NULL saja di daftar NOT IN membuat SELURUH hasil jadi kosong tanpa error.
    AND NOT EXISTS (
      SELECT 1 FROM sudah_pernah sp WHERE sp.product_id = ii.product_id
    )
  GROUP BY p.id, p.name, p.sku, p.price, p.unit, cat.name
  ORDER BY count(DISTINCT i.customer_id) DESC, p.name
  LIMIT least(greatest(coalesce(p_limit, 12), 1), 50);
$$;

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
    AND p.price > 0
    AND catalog_customer_id(p_token) IS NOT NULL
  ORDER BY cat.name NULLS LAST, p.name;
$$;

-- CREATE OR REPLACE mempertahankan hak akses yang sudah ada, jadi GRANT dari
-- migration37 tetap berlaku. Baris di bawah cuma penegasan kalau file ini
-- dijalankan di project yang fungsinya sempat dibuat ulang dari nol.
GRANT EXECUTE ON FUNCTION catalog_get_history(text)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_get_suggestions(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_get_products(text)             TO anon, authenticated;


-- ============================================================
-- LANGKAH 3 — Daftar barang yang harganya perlu diisi
-- ============================================================
-- Urut dari yang paling sering diambil toko, jadi yang paling merugikan kalau
-- hilang dari katalog muncul paling atas. Ada tombol Download CSV di panel
-- hasil kalau daftarnya panjang.
SELECT
  p.sku,
  p.name,
  cat.name                       AS kategori,
  p.unit,
  count(DISTINCT i.id)           AS pernah_dijual_di_faktur,
  max(i.invoice_date)            AS terakhir_dijual
FROM products p
LEFT JOIN categories cat   ON cat.id = p.category_id
LEFT JOIN invoice_items ii ON ii.product_id = p.id
LEFT JOIN invoices i       ON i.id = ii.invoice_id AND i.status <> 'cancelled'
WHERE p.is_active = true
  AND coalesce(p.price, 0) <= 0
GROUP BY p.sku, p.name, cat.name, p.unit
ORDER BY count(DISTINCT i.id) DESC, p.name;

-- Perbaikinya lewat halaman Produk di ERP (termasuk Update Harga Massal untuk
-- beberapa SKU sekaligus). Begitu harganya terisi, barangnya otomatis muncul
-- lagi di katalog — tidak perlu menjalankan apa pun di sini.


-- ============================================================
-- LANGKAH 4 — Verifikasi
-- ============================================================
-- Ambil satu token dari customers.catalog_token, lalu:
--   SELECT count(*) FROM catalog_get_products('PASTE_TOKEN');
-- Angkanya harus turun sebanyak jumlah "tanpa_harga" di LANGKAH 1.


-- ============================================================
-- ROLLBACK
-- ============================================================
-- Jalankan ulang LANGKAH 4 migration37 (ketiga fungsi versi lama, tanpa
-- syarat p.price > 0).
-- ============================================================
