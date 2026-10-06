// Video tutorial "Cara Pesan Lewat Katalog" — YouTube Shorts, Unlisted.
// https://youtube.com/shorts/-OG2e2mI5Gs
export const CARA_PESAN_VIDEO_ID = '-OG2e2mI5Gs';

function seenKey(token) {
  return `catalog_video_seen:${token}`;
}

// Ditandai per-token (bukan global) supaya kalau device yang sama dipakai
// buka link beberapa toko berbeda, tiap toko tetap kebagian modal pertama
// kali — bukan cuma yang paling duluan dibuka.
export function hasSeenCaraPesanVideo(token) {
  try {
    return localStorage.getItem(seenKey(token)) === '1';
  } catch {
    // localStorage tidak bisa diakses (mode private dkk) -- anggap sudah
    // lihat supaya modal tidak maksa muncul tiap kali reload.
    return true;
  }
}

export function markCaraPesanVideoSeen(token) {
  try {
    localStorage.setItem(seenKey(token), '1');
  } catch {
    // Abaikan -- ini cuma kenyamanan (jangan muncul berulang), bukan hal kritis.
  }
}
