import { expect, test } from '@playwright/test';
import { bukaKatalog, OUTLET, pasangStub } from './fixtures.js';

/**
 * catalog_get_products membatasi hasilnya sendiri lewat p_limit/p_offset,
 * karena PostgREST membatasi respons di 1.000 baris DAN (terbukti lewat
 * DevTools di produksi) tidak menghormati header Range untuk RPC lewat POST —
 * server selalu membalas 1.000 baris pertama yang sama berapa pun halaman
 * yang diminta. Lihat migration42.
 *
 * Dua bug nyata yang pernah lolos ke produksi, keduanya disimulasikan di sini:
 *   1. Tanpa paginasi bertahap sama sekali: katalog punya 1.574 SKU, 574 di
 *      antaranya tidak pernah terunduh — kolom cari pun tidak menemukannya,
 *      karena yang dicari cuma data yang ada di memori browser.
 *   2. Paginasi lewat header Range (bukan parameter fungsi): browser
 *      berulang kali minta "halaman berikutnya" tapi selalu dibalas 1.000
 *      baris pertama yang sama — rpcAll() tidak pernah tahu sudah sampai
 *      ujung data, dan tab Semua Barang tidak pernah selesai memuat.
 *
 * Stub di bawah meniru fungsi SQL yang benar: memotong hasil berdasarkan
 * p_limit/p_offset yang dikirim di body permintaan.
 */
const TOTAL = 1574;
const BATAS_SERVER = 1000;
const NAMA_TERAKHIR = 'Spon Terakhir Banget 99';

const semuaProduk = Array.from({ length: TOTAL }, (_, i) => ({
  product_id: `p${i}`,
  name: i === TOTAL - 1 ? NAMA_TERAKHIR : `Barang Nomor ${i + 1}`,
  sku: `SKU-${String(i + 1).padStart(4, '0')}`,
  price: '10000.00',
  unit: 'pcs',
  category_name: 'Umum',
  photo_thumb_path: null,
  photo_large_path: null,
}));

function potongSepertiFungsiSql(params) {
  const dari = Number(params.p_offset) || 0;
  const limit = Math.min(Number(params.p_limit) || BATAS_SERVER, BATAS_SERVER);
  return semuaProduk.slice(dari, Math.min(dari + limit, TOTAL));
}

test('seluruh produk terambil meski satu halaman dibatasi 1.000 baris', async ({ page }) => {
  const { paginasiDiminta } = await pasangStub(page, {
    catalog_get_outlet: [OUTLET],
    catalog_get_history: [],
    catalog_get_suggestions: [],
    catalog_get_products: potongSepertiFungsiSql,
  });

  await bukaKatalog(page);
  await page.waitForTimeout(400);

  // Diambil bertahap, bukan sekali jalan — dan BERHENTI setelah 2 halaman
  // (1574 SKU = 1000 + 574), bukan terus meminta halaman berikutnya.
  expect(paginasiDiminta).toEqual(['0-999', '1000-1999']);

  await expect(
    page.getByRole('button', { name: /Semua Barang/ }).getByText(`${TOTAL} barang`)
  ).toBeVisible();
});

test('barang di luar 1.000 pertama tetap ketemu lewat pencarian', async ({ page }) => {
  await pasangStub(page, {
    catalog_get_outlet: [OUTLET],
    catalog_get_history: [],
    catalog_get_suggestions: [],
    catalog_get_products: potongSepertiFungsiSql,
  });

  await bukaKatalog(page);
  await page.waitForTimeout(400);

  await page.getByLabel('Cari barang').fill('Spon Terakhir Banget');
  await expect(page.getByText(NAMA_TERAKHIR).first()).toBeVisible();
  await expect(page.getByText('1 barang cocok')).toBeVisible();
});
