/**
 * Thumbnail produk di daftar.
 *
 * Produk tanpa foto tetap mendapat kotak berukuran sama berisi huruf awal
 * namanya — bukan ruang kosong. Kalau tingginya berubah-ubah tergantung ada
 * tidaknya foto, daftar jadi loncat-loncat saat digulir, dan selama masa
 * pengisian foto nanti sebagian besar produk memang belum berfoto.
 *
 * `loading="lazy"` penting untuk kuota: yang diunduh cuma foto yang benar-benar
 * masuk layar, bukan seluruh kategori sekaligus.
 */
export default function ProductPhoto({ product, onOpen }) {
  const huruf = (product.name || '?').trim().charAt(0).toUpperCase();

  if (!product.photoThumb) {
    return (
      <div
        aria-hidden="true"
        className="font-display flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-ice text-[20px] text-navy/55"
      >
        {huruf}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(product)}
      aria-label={`Lihat foto ${product.name}`}
      className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-line bg-white"
    >
      <img
        src={product.photoThumb}
        alt=""
        loading="lazy"
        decoding="async"
        width="56"
        height="56"
        className="h-full w-full object-cover"
      />
    </button>
  );
}
