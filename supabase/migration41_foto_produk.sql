-- ============================================================
-- MIGRATION 41: Foto produk (bucket publik + kolom path + RPC)
-- Jalankan di Supabase SQL Editor, setelah migration38.
-- ============================================================
--
-- APA INI
-- Foto produk diunggah dari halaman Produk di ERP, dikecilkan di browser
-- sebelum dikirim, lalu ditampilkan di katalog sebagai thumbnail (bisa diketuk
-- untuk melihat versi besar).
--
-- KENAPA BUCKET PUBLIK
-- Foto produk bukan data sensitif, dan bucket publik bisa di-cache CDN
-- sehingga hemat kuota transfer. Bandingkan dengan 'visit-photos' (foto absen
-- sales) yang sengaja privat karena berisi lokasi dan wajah orang.
--
-- KENAPA DUA UKURAN
--   thumb : sisi terpanjang 400px  (~15-25 KB) — dimuat di daftar katalog
--   large : sisi terpanjang 900px  (~60-100 KB) — hanya saat foto diketuk
-- Untuk 1.574 SKU: sekitar 160 MB, masih jauh di bawah kuota 1 GB.
--
-- PENGAMAN UKURAN FILE
-- Batas 1 MB per file dan hanya menerima webp/jpeg dipasang di level bucket,
-- jadi foto mentah 3 MB dari kamera DITOLAK server meskipun ada kode yang lupa
-- mengompres. Ini yang menjaga kuota, bukan disiplin di sisi browser saja.
--
-- VERSI DI DALAM NAMA FILE
-- Path memuat timestamp (contoh: <product_id>/1780000000-thumb.webp). Ganti
-- foto = path baru = URL baru, jadi tidak pernah ada masalah cache CDN yang
-- masih menampilkan foto lama. File lama dihapus oleh ERP setelah unggahan
-- baru berhasil.
-- ============================================================


-- ============================================================
-- LANGKAH 1 — Kolom path di products
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_thumb_path text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_large_path text;


-- ============================================================
-- LANGKAH 2 — Bucket publik + batas ukuran
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos', 'product-photos', true)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
SET public             = true,
    file_size_limit    = 1048576,                            -- 1 MB
    allowed_mime_types = ARRAY['image/webp', 'image/jpeg']
WHERE id = 'product-photos';


-- ============================================================
-- LANGKAH 3 — Hak akses bucket
-- ============================================================
-- Baca: siapa saja (termasuk toko yang membuka katalog tanpa login).
-- Tulis/hapus: hanya yang login di ERP.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Public read product photos'
  ) THEN
    CREATE POLICY "Public read product photos" ON storage.objects
      FOR SELECT TO public
      USING (bucket_id = 'product-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated manage product photos'
  ) THEN
    CREATE POLICY "Authenticated manage product photos" ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'product-photos')
      WITH CHECK (bucket_id = 'product-photos');
  END IF;
END $$;


-- ============================================================
-- LANGKAH 4 — Ketiga RPC katalog ikut mengirim path foto
-- ============================================================
-- Ditulis ulang utuh supaya isi fungsinya selalu terbaca apa adanya di file
-- ini. Selain dua kolom foto, tidak ada yang berubah dari migration37.
--
-- DROP dulu, bukan CREATE OR REPLACE: PostgreSQL menolak mengubah daftar kolom
-- keluaran sebuah fungsi lewat REPLACE ("cannot change return type of existing
-- function"). DROP menghapus hak aksesnya juga, makanya GRANT di bawah wajib
-- ikut dijalankan.
--
-- SOROT SELURUH LANGKAH 4 (sampai baris GRANT terakhir) LALU RUN SEKALI JALAN.
-- Kalau dijalankan sepotong-sepotong, ada jeda ketika fungsinya sudah dihapus
-- tapi belum dibuat ulang — katalog yang dibuka toko pada detik itu akan error.

DROP FUNCTION IF EXISTS catalog_get_history(text);
DROP FUNCTION IF EXISTS catalog_get_suggestions(text, integer);
DROP FUNCTION IF EXISTS catalog_get_products(text);

CREATE OR REPLACE FUNCTION catalog_get_history(p_token text)
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
  ORDER BY count(DISTINCT i.id) DESC, max(i.invoice_date) DESC, p.name;
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

CREATE OR REPLACE FUNCTION catalog_get_products(p_token text)
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
  ORDER BY cat.name NULLS LAST, p.name;
$$;

GRANT EXECUTE ON FUNCTION catalog_get_history(text)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_get_suggestions(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_get_products(text)             TO anon, authenticated;


-- ============================================================
-- LANGKAH 5 — Verifikasi
-- ============================================================

-- 5a. Bucket sudah benar (public = true, batas 1 MB, webp/jpeg saja):
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'product-photos';

-- 5b. Kolom foto sudah ada:
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'products'
  AND column_name LIKE 'photo%'
ORDER BY column_name;

-- 5c. Setelah mengunggah satu foto lewat halaman Produk di ERP, cek berapa
--     produk yang sudah berfoto:
SELECT count(*) FILTER (WHERE photo_thumb_path IS NOT NULL) AS sudah_ada_foto,
       count(*)                                             AS total_produk_aktif
FROM products WHERE is_active = true;


-- ============================================================
-- ROLLBACK
-- ============================================================
--   ALTER TABLE products DROP COLUMN IF EXISTS photo_thumb_path;
--   ALTER TABLE products DROP COLUMN IF EXISTS photo_large_path;
--   DROP POLICY IF EXISTS "Public read product photos" ON storage.objects;
--   DROP POLICY IF EXISTS "Authenticated manage product photos" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'product-photos';  -- kosongkan dulu isinya
-- Lalu jalankan ulang LANGKAH 4 migration37 untuk mengembalikan ketiga fungsi.
-- ============================================================
