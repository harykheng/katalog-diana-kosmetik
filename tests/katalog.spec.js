import { expect, test } from '@playwright/test';
import {
  bukaKatalog,
  kartu,
  pasangStub,
  teksPesananWa,
  terlihatTanpaScroll,
} from './fixtures.js';

test.describe('Tata letak di layar 360px', () => {
  test('kolom cari & ketiga tab terlihat tanpa menggulir', async ({ page }) => {
    await pasangStub(page);
    await bukaKatalog(page);

    // Keluhan yang melahirkan susunan tab ini: dulu semua daftar ditumpuk
    // vertikal, jadi "Belum Dicoba" dan kolom cari baru terlihat setelah
    // menggulir melewati seluruh riwayat.
    expect(await terlihatTanpaScroll(page.getByLabel('Cari barang'))).toBe(true);
    expect(await terlihatTanpaScroll(page.getByRole('button', { name: /Belum Dicoba/ }))).toBe(true);
    expect(await terlihatTanpaScroll(page.getByRole('button', { name: /Semua Barang/ }))).toBe(true);
    expect(await terlihatTanpaScroll(page.getByRole('button', { name: 'Pesan via WA' }))).toBe(true);
  });

  test('teks tab tidak terpotong dan tidak melewati tepi layar', async ({ page }) => {
    await pasangStub(page);
    await bukaKatalog(page);

    const tab = page.getByRole('button', { name: /Semua Barang/ });
    const box = await tab.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(360);

    const terpotong = await tab.locator('span').first().evaluate((n) => n.scrollWidth - n.clientWidth);
    expect(terpotong).toBeLessThanOrEqual(0);
  });

  test('kolom cari tetap menempel setelah menggulir jauh', async ({ page }) => {
    await pasangStub(page);
    await bukaKatalog(page);

    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(250);
    const box = await page.getByLabel('Cari barang').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeLessThan(200);
  });

  test('tidak ada gulir horizontal', async ({ page }) => {
    await pasangStub(page);
    await bukaKatalog(page);

    const lebih = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(lebih).toBeLessThanOrEqual(0);
  });
});

test.describe('Perpindahan daftar', () => {
  test.beforeEach(async ({ page }) => {
    await pasangStub(page);
    await bukaKatalog(page);
  });

  test('header memuat nama toko & distributor dari data', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Toko Ani' })).toBeVisible();
    await expect(page.getByText('DIANA KOSMETIK')).toBeVisible();
  });

  test('satu layar = satu daftar', async ({ page }) => {
    await expect(page.getByText('Bedak Padat Aurora Seri 1 12gr').first()).toBeVisible();
    await expect(page.getByText('3× · 14 Agu 2026').first()).toBeVisible();

    await page.getByRole('button', { name: /Belum Dicoba/ }).click();
    await expect(page.getByText('Lipstik Matte Merah Bata').first()).toBeVisible();
    // Daftar sebelumnya tidak ikut tampil — bukan ditumpuk, tapi diganti.
    await expect(page.getByText('Bedak Padat Aurora Seri 1 12gr')).toHaveCount(0);
  });

  test('tab Semua Barang menampilkan kategori dulu, bukan 1.500 baris sekaligus', async ({ page }) => {
    await page.getByRole('button', { name: /Semua Barang/ }).click();
    await expect(page.getByRole('button', { name: /^Sabun/ })).toBeVisible();
    // Berat untuk HP kelas bawah kalau semua produk dirender sebelum dipilih.
    await expect(page.getByText('Sabun Muka Herbal 60ml')).toHaveCount(0);

    await page.getByRole('button', { name: /^Sabun/ }).click();
    await expect(page.getByText('Sabun Muka Herbal 60ml').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Semua kategori/ })).toBeVisible();
  });
});

test.describe('Pencarian', () => {
  test.beforeEach(async ({ page }) => {
    await pasangStub(page);
    await bukaKatalog(page);
  });

  test('mencari seluruh katalog, bukan hanya daftar yang terbuka', async ({ page }) => {
    await page.getByLabel('Cari barang').fill('masker');
    await expect(page.getByText('Masker Wajah Timun').first()).toBeVisible();
    await expect(page.getByText('1 barang cocok dengan “masker”')).toBeVisible();
  });

  test('memberi tahu kalau tidak ada yang cocok', async ({ page }) => {
    await page.getByLabel('Cari barang').fill('zzzz');
    await expect(page.getByText(/Tidak ada barang yang cocok/)).toBeVisible();
  });

  test('tombol hapus mengosongkan kolom cari', async ({ page }) => {
    await page.getByLabel('Cari barang').fill('masker');
    await page.getByRole('button', { name: 'Hapus pencarian' }).click();
    await expect(page.getByLabel('Cari barang')).toHaveValue('');
  });
});

test.describe('Satuan — bagian paling rawan di fitur ini', () => {
  test.beforeEach(async ({ page }) => {
    await pasangStub(page);
    await bukaKatalog(page);
    await page.getByRole('button', { name: /Belum Dicoba/ }).click();
  });

  test('harga lusin = pembulatan yang sama dengan ERP', async ({ page }) => {
    const item = kartu(page, 'Lipstik Matte Merah Bata');
    await item.getByRole('button', { name: /^Tambah/ }).click();
    await item.getByRole('button', { name: 'lusin', exact: true }).click();

    // 45.000 × 12 = 540.000 → Math.round(540000/100)*100
    await expect(item.getByText('1 lusin = 12 pcs · Rp 540.000')).toBeVisible();
  });

  test('ganti satuan tidak mengonversi jumlah diam-diam', async ({ page }) => {
    const item = kartu(page, 'Lipstik Matte Merah Bata');
    await item.getByRole('button', { name: /^Tambah/ }).click();
    await item.getByRole('button', { name: 'lusin', exact: true }).click();

    // "1" yang tadinya pcs tidak boleh mendadak jadi 12 tanpa disadari toko.
    await expect(item.locator('input[type=number]')).toHaveValue('1');
  });

  test('produk yang satuan dasarnya lusin TIDAK dikali 12 lagi', async ({ page }) => {
    const item = kartu(page, 'Paket Lipstik Nude (isi 12)');

    // Bug nyata yang pernah lolos: Rp 470.000 tampil jadi Rp 5.640.000 karena
    // mode satuan dibandingkan dengan teks 'lusin', yang kebetulan juga nama
    // satuan dasar produk ini.
    await expect(item.getByRole('group')).toHaveCount(0);
    await expect(item.getByText('Rp 470.000 / lusin').first()).toBeVisible();
  });
});

test.describe('Barang tanpa harga', () => {
  test.beforeEach(async ({ page }) => {
    await pasangStub(page);
    await bukaKatalog(page);
  });

  test('ditandai, bukan ditampilkan sebagai Rp 0', async ({ page }) => {
    const item = kartu(page, 'Produk Belum Ada Harga');
    await expect(item).toBeVisible();
    await expect(item.getByText('Harga dikonfirmasi', { exact: true })).toBeVisible();
    // "Rp 0" terbaca seperti gratis — tidak boleh muncul di kartu produk.
    await expect(page.locator('li').getByText(/Rp 0\b/)).toHaveCount(0);
  });

  test('tetap bisa dipesan tapi tidak menggeser total', async ({ page }) => {
    const berharga = kartu(page, 'Bedak Padat Aurora Seri 1 12gr');
    await berharga.getByRole('button', { name: /^Tambah/ }).click();
    const totalAwal = await page.locator('text=/^Rp [0-9.]+$/').first().textContent();

    const item = kartu(page, 'Produk Belum Ada Harga');
    await item.getByRole('button', { name: /^Tambah/ }).click();
    await item.getByRole('button', { name: /^Tambah/ }).click();

    await expect(item.locator('input[type=number]')).toHaveValue('2');
    await expect(item.getByText('2 pcs · harga dikonfirmasi')).toBeVisible();
    expect(await page.locator('text=/^Rp [0-9.]+$/').first().textContent()).toBe(totalAwal);
    await expect(page.getByText('+1 barang tanpa harga')).toBeVisible();
  });
});

test.describe('Stepper', () => {
  test('tombol − tetap utuh saat jumlah masih 0', async ({ page }) => {
    await pasangStub(page);
    await bukaKatalog(page);

    const tombol = page.locator('li').first().getByRole('button', { name: /^Kurangi/ });
    await expect(tombol).toBeVisible();

    // Pernah dipasang disabled:opacity-30, dan itu memudarkan border serta
    // latarnya juga — di layar terlihat seperti tombolnya hilang setengah.
    const opacity = await tombol.evaluate((n) => getComputedStyle(n).opacity);
    expect(Number(opacity)).toBe(1);

    const kotak = page.locator('li').first().locator('div.rounded-full').last();
    const border = await kotak.evaluate((n) => {
      const s = getComputedStyle(n);
      return { lebar: parseFloat(s.borderTopWidth), warna: s.borderTopColor };
    });
    expect(border.lebar).toBeGreaterThanOrEqual(1);
    expect(border.warna).not.toBe('rgba(0, 0, 0, 0)');
  });
});

test.describe('Foto produk', () => {
  test('thumbnail dimuat malas, versi besar hanya saat diketuk', async ({ page }) => {
    const { fotoDiminta } = await pasangStub(page);
    await bukaKatalog(page);

    const item = kartu(page, 'Bedak Padat Aurora Seri 1 12gr');
    await expect(item.locator('img').first()).toBeVisible();
    await expect(item.locator('img').first()).toHaveAttribute('loading', 'lazy');

    // Kuota Supabase gratis: daftar tidak boleh menarik versi besar.
    expect(fotoDiminta.every((u) => u.includes('-thumb.'))).toBe(true);

    await item.getByRole('button', { name: /^Lihat foto/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Rp 25.000 / pcs')).toBeVisible();
    expect(fotoDiminta.some((u) => u.includes('-large.'))).toBe(true);

    await page.getByRole('button', { name: 'Tutup foto' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('produk tanpa foto tetap setinggi yang berfoto', async ({ page }) => {
    await pasangStub(page);
    await bukaKatalog(page);

    // Kalau tingginya berubah-ubah, daftar jadi loncat saat digulir — dan
    // selama masa pengisian foto, sebagian besar produk memang belum berfoto.
    const berfoto = await kartu(page, 'Bedak Padat Aurora Seri 1 12gr').boundingBox();
    const tanpaFoto = await kartu(page, 'Bedak Padat Aurora Seri 2 12gr').boundingBox();
    expect(Math.abs(berfoto.height - tanpaFoto.height)).toBeLessThanOrEqual(1);
  });
});

test.describe('Pesan WhatsApp — hasil akhir seluruh alur', () => {
  test('nama, jumlah, satuan, dan total terkirim benar', async ({ page }) => {
    await pasangStub(page);
    await bukaKatalog(page);
    await page.getByRole('button', { name: /Belum Dicoba/ }).click();

    const lipstik = kartu(page, 'Lipstik Matte Merah Bata');
    await lipstik.getByRole('button', { name: /^Tambah/ }).click();
    await lipstik.getByRole('button', { name: 'lusin', exact: true }).click();

    const paket = kartu(page, 'Paket Lipstik Nude (isi 12)');
    await paket.getByRole('button', { name: /^Tambah/ }).click();

    const tanpaHarga = kartu(page, 'Produk Belum Ada Harga');
    await tanpaHarga.getByRole('button', { name: /^Tambah/ }).click();
    await tanpaHarga.getByRole('button', { name: /^Tambah/ }).click();

    await page.getByRole('button', { name: 'Pesan via WA' }).click();
    const { url, teks } = await teksPesananWa(page);

    expect(url.startsWith('https://wa.me/628123456789?text=')).toBe(true);
    expect(teks).toContain('Pesanan Toko Ani');
    expect(teks).toContain('- Lipstik Matte Merah Bata: 1 lusin');
    expect(teks).toContain('- Paket Lipstik Nude (isi 12): 1 lusin');
    expect(teks).toContain('- Produk Belum Ada Harga: 2 pcs (harga dikonfirmasi)');
    // 540.000 + 470.000; barang tanpa harga tidak ikut dihitung.
    expect(teks).toContain('Total estimasi: Rp 1.010.000');
    expect(teks).toContain('(belum termasuk 1 barang yang harganya dikonfirmasi dulu)');
  });

  test('daftar barang terpilih bisa diperiksa sebelum dikirim', async ({ page }) => {
    await pasangStub(page);
    await bukaKatalog(page);

    await kartu(page, 'Bedak Padat Aurora Seri 1 12gr')
      .getByRole('button', { name: /^Tambah/ })
      .click();
    await page.getByRole('button', { name: 'Lihat barang yang dipilih' }).click();

    await expect(page.getByText('✓ 1 barang dipilih')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lanjut pilih' })).toBeVisible();
    await expect(page.locator('li')).toHaveCount(1);
  });
});

test.describe('Token', () => {
  test('token tidak berlaku diberi pesan yang jelas', async ({ page }) => {
    await pasangStub(page, { catalog_get_outlet: [] });
    await bukaKatalog(page, 'tokenngawur123456789');

    await expect(page.getByText('Link katalog tidak berlaku')).toBeVisible();
  });
});
