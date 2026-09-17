-- ============================================================
-- MIGRATION 40: Barang tanpa harga tetap tampil di katalog
-- Jalankan HANYA kalau migration39 sudah pernah dijalankan.
-- ============================================================
--
-- PERUBAHAN KEPUTUSAN
-- migration39 menyembunyikan barang ber-harga 0 dari katalog. Keputusannya
-- diubah: barang itu tetap ditampilkan dan tetap boleh dipesan, tapi di layar
-- toko ditandai "Harga dikonfirmasi admin" — bukan "Rp 0" — dan TIDAK ikut
-- dihitung ke Total estimasi. Di pesan WhatsApp, barisnya diberi keterangan
-- "(harga dikonfirmasi)" dan di bawah total ada catatan berapa barang yang
-- belum termasuk.
--
-- Alasannya: toko sering tahu persis barang apa yang mau diambil meski
-- harganya belum tercatat di ERP. Menyembunyikannya membuat mereka tidak bisa
-- memesan sama sekali; menampilkannya dengan tanda membuat pesanan tetap jalan
-- tanpa ada angka yang berbohong.
--
-- File ini mengembalikan ketiga fungsi ke versi migration37 (tanpa syarat
-- p.price > 0). Kalau migration39 BELUM pernah dijalankan, lewati saja file
-- ini — tidak ada yang perlu dikembalikan.
--
-- Pemisahan tugas setelah ini:
--   • Database  : mengirim apa adanya, termasuk harga 0.
--   • Aplikasi  : hasPrice() di src/lib/pricing.js yang menentukan tampilan
--                 dan perhitungan total.
-- ============================================================


-- ============================================================
-- LANGKAH 1 — Kembalikan ketiga fungsi (versi migration37)
-- ============================================================

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

GRANT EXECUTE ON FUNCTION catalog_get_history(text)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_get_suggestions(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_get_products(text)             TO anon, authenticated;


-- ============================================================
-- LANGKAH 2 — Daftar barang yang harganya masih kosong
-- ============================================================
-- Tetap berguna: barang ini sekarang tampil sebagai "Harga dikonfirmasi admin",
-- artinya tiap kali dipesan admin harus mengecek harganya manual. Urut dari
-- yang paling sering dijual, jadi yang paling sering merepotkan ada di atas.
SELECT
  p.sku,
  p.name,
  cat.name             AS kategori,
  p.unit,
  count(DISTINCT i.id) AS pernah_dijual_di_faktur,
  max(i.invoice_date)  AS terakhir_dijual
FROM products p
LEFT JOIN categories cat   ON cat.id = p.category_id
LEFT JOIN invoice_items ii ON ii.product_id = p.id
LEFT JOIN invoices i       ON i.id = ii.invoice_id AND i.status <> 'cancelled'
WHERE p.is_active = true
  AND coalesce(p.price, 0) <= 0
GROUP BY p.sku, p.name, cat.name, p.unit
ORDER BY count(DISTINCT i.id) DESC, p.name;


-- ============================================================
-- LANGKAH 3 — Verifikasi
-- ============================================================
-- Ambil satu token dari customers.catalog_token, lalu pastikan barang tanpa
-- harga ikut terkirim lagi (angkanya harus sama dengan jumlah di LANGKAH 2
-- yang kategorinya aktif):
--   SELECT count(*) FROM catalog_get_products('PASTE_TOKEN') WHERE price <= 0;
-- ============================================================
