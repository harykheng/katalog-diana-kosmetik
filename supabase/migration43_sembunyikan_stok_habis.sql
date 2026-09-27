-- ============================================================
-- MIGRATION 43: Sembunyikan barang yang stoknya habis
-- Jalankan di Supabase SQL Editor, setelah migration42.
-- ============================================================
--
-- APA INI
-- Barang dengan products.stock_quantity <= 0 tidak lagi muncul di katalog —
-- di ketiga daftar (Biasa Diambil, Belum Pernah Dicoba, Semua Barang) dan di
-- hasil pencarian, karena ketiganya sama-sama lewat tiga RPC ini. Begitu stok
-- diisi ulang (lewat Pembelian Barang di ERP), barangnya otomatis muncul lagi
-- di panggilan berikutnya — tidak ada flag manual yang perlu diubah, murni
-- baca stok terkini tiap kali toko membuka katalog.
--
-- KENAPA DI SINI, BUKAN DI KODE REACT
-- Sama seperti is_active = true yang sudah ada: difilter di fungsi SQL-nya
-- supaya barang stok habis tidak pernah terkirim ke HP toko sama sekali —
-- bukan dikirim lalu disembunyikan di browser (itu masih boros kuota, dan
-- barang yang "harusnya" tidak boleh dipesan tetap bisa dipaksa muncul lewat
-- DevTools).
--
-- TIDAK ADA PERUBAHAN KOLOM ATAU PARAMETER — cuma menambah satu syarat WHERE
-- di ketiga fungsi, jadi CREATE OR REPLACE cukup, tidak perlu DROP dulu.
-- ============================================================

CREATE OR REPLACE FUNCTION catalog_get_history(p_token text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
RETURNS TABLE (
  product_id       uuid,
  name             text,
  sku              text,
  price            numeric,
  unit             text,
  category_name    text,
  photo_thumb_path text,
  photo_large_path text,
  order_count      bigint,
  total_qty        bigint,
  last_ordered     date
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
    p.photo_thumb_path,
    p.photo_large_path,
    count(DISTINCT i.id)     AS order_count,
    sum(ii.quantity)::bigint AS total_qty,
    max(i.invoice_date)      AS last_ordered
  FROM invoice_items ii
  JOIN invoices i   ON i.id = ii.invoice_id
  JOIN products p   ON p.id = ii.product_id
  LEFT JOIN categories cat ON cat.id = p.category_id
  WHERE i.customer_id = catalog_customer_id(p_token)
    AND i.status <> 'cancelled'
    AND coalesce(i.verification_status, '') <> 'rejected'
    AND p.is_active = true
    AND coalesce(p.stock_quantity, 0) > 0
  GROUP BY p.id, p.name, p.sku, p.price, p.unit, cat.name,
           p.photo_thumb_path, p.photo_large_path
  ORDER BY count(DISTINCT i.id) DESC, max(i.invoice_date) DESC, p.name
  LIMIT least(greatest(coalesce(p_limit, 1000), 1), 1000)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION catalog_get_suggestions(p_token text, p_limit integer DEFAULT 12)
RETURNS TABLE (
  product_id       uuid,
  name             text,
  sku              text,
  price            numeric,
  unit             text,
  category_name    text,
  photo_thumb_path text,
  photo_large_path text,
  outlet_count     bigint
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
    p.photo_thumb_path,
    p.photo_large_path,
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
    AND coalesce(p.stock_quantity, 0) > 0
    -- NOT EXISTS, bukan NOT IN: invoice_items.product_id boleh NULL, dan satu
    -- NULL saja di daftar NOT IN membuat SELURUH hasil jadi kosong tanpa error.
    AND NOT EXISTS (
      SELECT 1 FROM sudah_pernah sp WHERE sp.product_id = ii.product_id
    )
  GROUP BY p.id, p.name, p.sku, p.price, p.unit, cat.name,
           p.photo_thumb_path, p.photo_large_path
  ORDER BY count(DISTINCT i.customer_id) DESC, p.name
  LIMIT least(greatest(coalesce(p_limit, 12), 1), 50);
$$;

CREATE OR REPLACE FUNCTION catalog_get_products(p_token text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
RETURNS TABLE (
  product_id       uuid,
  name             text,
  sku              text,
  price            numeric,
  unit             text,
  category_name    text,
  photo_thumb_path text,
  photo_large_path text
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
    p.photo_thumb_path,
    p.photo_large_path
  FROM products p
  LEFT JOIN categories cat ON cat.id = p.category_id
  WHERE p.is_active = true
    AND coalesce(p.stock_quantity, 0) > 0
    AND catalog_customer_id(p_token) IS NOT NULL
  ORDER BY cat.name NULLS LAST, p.name
  LIMIT least(greatest(coalesce(p_limit, 1000), 1), 1000)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

-- CREATE OR REPLACE tidak mencabut hak akses yang sudah ada, tapi digrant
-- ulang di sini juga supaya file ini aman dijalankan sendiri kalau suatu saat
-- perlu di-replay tanpa migration41/42 di baris riwayat yang sama.
GRANT EXECUTE ON FUNCTION catalog_get_history(text, integer, integer)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_get_suggestions(text, integer)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_get_products(text, integer, integer)   TO anon, authenticated;


-- ============================================================
-- VERIFIKASI
-- ============================================================

-- Sanity check: berapa produk aktif yang stoknya 0 vs masih ada.
SELECT
  count(*) FILTER (WHERE coalesce(stock_quantity, 0) > 0) AS ada_stok,
  count(*) FILTER (WHERE coalesce(stock_quantity, 0) <= 0) AS stok_habis
FROM products
WHERE is_active = true;

-- Ganti PASTE_TOKEN_DI_SINI dengan token toko sungguhan, lalu bandingkan
-- dengan jumlah "ada_stok" di atas — harus sama atau lebih kecil (kalau ada
-- filter lain yang juga berlaku, seperti is_active).
-- SELECT count(*) FROM catalog_get_products('PASTE_TOKEN_DI_SINI', 1000, 0);


-- ============================================================
-- ROLLBACK
-- ============================================================
-- Jalankan ulang LANGKAH 4 di migration42_perbaiki_paginasi_produk.sql untuk
-- catalog_get_history & catalog_get_products, dan bagian catalog_get_suggestions
-- di migration41_foto_produk.sql — keduanya tanpa syarat stock_quantity.
-- ============================================================
