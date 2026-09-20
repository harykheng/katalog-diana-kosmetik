-- ============================================================
-- MIGRATION 42: Perbaiki paginasi catalog_get_products & catalog_get_history
-- Jalankan di Supabase SQL Editor, setelah migration41.
-- ============================================================
--
-- BUG YANG DIPERBAIKI
-- catalog.js mengambil seluruh produk lewat rpcAll(), yang meminta data
-- bertahap 1000 baris pakai header HTTP "Range: 0-999", "Range: 1000-1999",
-- dst — mengikuti pola bypass limit 1000 baris PostgREST yang sudah dipakai
-- di ERP. Ternyata Supabase TIDAK menghormati header Range untuk pemanggilan
-- RPC lewat POST: dikonfirmasi lewat DevTools, permintaan "Range: 16000-16999"
-- tetap dibalas "Content-Range: 0-999/*" — 1000 baris pertama yang sama,
-- berapa pun halaman yang diminta.
--
-- Akibatnya rpcAll() di browser mengira selalu "masih ada lagi" (karena
-- panjang hasil selalu tepat 1000), lalu meminta ulang tanpa henti sampai
-- berhenti sendiri di pengaman 50.000 baris — 50 kali pemanggilan sia-sia,
-- dan tab "Semua Barang" tidak pernah selesai memuat.
--
-- PERBAIKAN
-- Paginasi dipindah dari header HTTP ke parameter fungsi (p_limit, p_offset)
-- yang ditulis di body permintaan — persis pola yang sudah dipakai
-- catalog_get_suggestions. Ini tidak bergantung pada perilaku header Range
-- sama sekali, jadi tidak ada lagi ruang untuk salah paham antara browser
-- dan server.
--
-- Isinya sama persis dengan migration41 (termasuk kolom foto), cuma tambah
-- p_limit/p_offset + LIMIT/OFFSET di query. DROP dulu karena menambah
-- parameter juga ditolak PostgreSQL lewat CREATE OR REPLACE begitu dipakai
-- lewat RPC dengan cara pemanggilan yang berbeda jumlah argumennya — supaya
-- tidak ada fungsi lama yang nyangkut sebagai overload terpisah.
--
-- SOROT SAMPAI GRANT TERAKHIR, RUN SEKALI JALAN.
-- ============================================================

DROP FUNCTION IF EXISTS catalog_get_history(text);
DROP FUNCTION IF EXISTS catalog_get_products(text);

CREATE FUNCTION catalog_get_history(p_token text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
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
  GROUP BY p.id, p.name, p.sku, p.price, p.unit, cat.name,
           p.photo_thumb_path, p.photo_large_path
  ORDER BY count(DISTINCT i.id) DESC, max(i.invoice_date) DESC, p.name
  LIMIT least(greatest(coalesce(p_limit, 1000), 1), 1000)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

CREATE FUNCTION catalog_get_products(p_token text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
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
    AND catalog_customer_id(p_token) IS NOT NULL
  ORDER BY cat.name NULLS LAST, p.name
  LIMIT least(greatest(coalesce(p_limit, 1000), 1), 1000)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION catalog_get_history(text, integer, integer)  FROM PUBLIC;
REVOKE ALL ON FUNCTION catalog_get_products(text, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION catalog_get_history(text, integer, integer)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_get_products(text, integer, integer) TO anon, authenticated;


-- ============================================================
-- VERIFIKASI
-- ============================================================

-- Ganti PASTE_TOKEN_DI_SINI dengan token toko sungguhan.
-- Halaman pertama dan kedua HARUS beda isi (bukan lagi 1000 baris yang sama).
-- SELECT product_id, name FROM catalog_get_products('PASTE_TOKEN_DI_SINI', 5, 0);
-- SELECT product_id, name FROM catalog_get_products('PASTE_TOKEN_DI_SINI', 5, 5);

-- Total produk aktif toko manapun bisa lihat, buat sanity check jumlah SKU:
-- SELECT count(*) FROM products WHERE is_active = true;


-- ============================================================
-- ROLLBACK
-- ============================================================
-- Jalankan ulang LANGKAH 4 di migration41_foto_produk.sql untuk mengembalikan
-- catalog_get_history(text) dan catalog_get_products(text) tanpa p_limit/p_offset.
-- (catalog_get_suggestions tidak disentuh migration ini, tidak perlu dikembalikan.)
-- ============================================================
