import { expect, test } from '@playwright/test';
import { bukaKatalog, OUTLET, pasangStub } from './fixtures.js';

/**
 * PostgREST memotong SETIAP respons di 1.000 baris.
 *
 * Bug nyata yang pernah lolos ke produksi: katalog punya 1.574 SKU, tapi 574
 * di antaranya tidak pernah terunduh — dan kolom cari ikut tidak menemukannya,
 * karena yang dicari cuma data yang ada di memori browser. Dari layar toko
 * tampak seperti "barangnya tidak ada di katalog", bukan seperti data terpotong.
 *
 * Stub di bawah meniru perilaku itu apa adanya: tidak peduli berapa yang
 * diminta, satu respons tidak pernah lebih dari 1.000 baris.
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

function potongSepertiPostgrest(req) {
  const range = req.headers()['range'] || '';
  const cocok = range.match(/^(\d+)-(\d+)$/);
  const dari = cocok ? Number(cocok[1]) : 0;
  const sampai = cocok ? Number(cocok[2]) : BATAS_SERVER - 1;
  const akhir = Math.min(sampai, dari + BATAS_SERVER - 1, TOTAL - 1);
  return semuaProduk.slice(dari, akhir + 1);
}

test('seluruh produk terambil meski server memotong di 1.000 baris', async ({ page }) => {
  const { rangeDiminta } = await pasangStub(page, {
    catalog_get_outlet: [OUTLET],
    catalog_get_history: [],
    catalog_get_suggestions: [],
    catalog_get_products: potongSepertiPostgrest,
  });

  await bukaKatalog(page);
  await page.waitForTimeout(400);

  // Diambil bertahap, bukan sekali jalan.
  expect(rangeDiminta.length).toBeGreaterThanOrEqual(2);
  expect(rangeDiminta[0]).toBe('0-999');
  expect(rangeDiminta[1]).toBe('1000-1999');

  await expect(
    page.getByRole('button', { name: /Semua Barang/ }).getByText(`${TOTAL} barang`)
  ).toBeVisible();
});

test('barang di luar 1.000 pertama tetap ketemu lewat pencarian', async ({ page }) => {
  await pasangStub(page, {
    catalog_get_outlet: [OUTLET],
    catalog_get_history: [],
    catalog_get_suggestions: [],
    catalog_get_products: potongSepertiPostgrest,
  });

  await bukaKatalog(page);
  await page.waitForTimeout(400);

  await page.getByLabel('Cari barang').fill('Spon Terakhir Banget');
  await expect(page.getByText(NAMA_TERAKHIR).first()).toBeVisible();
  await expect(page.getByText('1 barang cocok')).toBeVisible();
});
