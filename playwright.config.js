import { defineConfig } from '@playwright/test';

const PORT = 4173;

/**
 * Pengujian dijalankan terhadap hasil build sungguhan (bukan dev server),
 * di viewport 360px — ukuran HP paling sempit yang ditargetkan katalog ini.
 *
 * Seluruh panggilan jaringan disadap di tests/fixtures.js, jadi pengujian
 * tidak pernah menyentuh Supabase: bisa jalan tanpa koneksi, tanpa kredensial,
 * dan tidak mungkin mengubah data siapa pun. Nilai environment di bawah cuma
 * pengisi supaya proses build tidak menganggap konfigurasinya kosong.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 360, height: 740 },
    trace: 'on-first-retry',
  },

  // Sengaja TIDAK memakai preset devices['Desktop Chrome']: presetnya membawa
  // viewport 1280px sendiri dan menimpa 360px di atas, jadi pengujian tata
  // letak tidak lagi menguji layar HP — yang justru seluruh alasan katalog ini
  // dibuat mobile-first.
  projects: [{ name: 'hp-360px', use: { browserName: 'chromium', hasTouch: true } }],

  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: 'https://stub.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'stub-anon-key',
    },
  },
});
