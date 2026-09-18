/**
 * Bagian yang menempel di atas layar: kolom cari + pemilih daftar.
 *
 * Sebelumnya semua section ditumpuk vertikal, jadi untuk sampai ke "Belum
 * Pernah Dicoba" atau kolom cari toko harus menggulir melewati seluruh riwayat
 * lebih dulu. Sekarang ketiganya sejajar dan bisa dicapai tanpa menggulir.
 */
export default function TopBar({
  tabs,
  activeTab,
  onTabChange,
  search,
  onSearchChange,
  reviewing,
  pickedCount,
  onCloseReview,
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
      <div className="px-4 pt-1 pb-2.5">
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[13px] text-muted"
          >
            🔍
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari barang…"
            aria-label="Cari barang"
            className="w-full rounded-full border border-line bg-ice-light py-2.5 pr-9 pl-9 text-[14px] text-ink outline-none placeholder:text-muted focus:border-navy focus:bg-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Hapus pencarian"
              className="absolute top-1/2 right-2.5 -translate-y-1/2 px-1.5 py-1 text-[15px] text-muted"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {!search && reviewing && (
        <div className="flex items-center justify-between gap-2 px-4 pb-2.5">
          <span className="text-[13px] font-bold text-navy">
            ✓ {pickedCount} barang dipilih
          </span>
          <button
            type="button"
            onClick={onCloseReview}
            className="rounded-full bg-ice px-3 py-1.5 text-[12px] font-semibold text-navy"
          >
            Lanjut pilih
          </button>
        </div>
      )}

      {/* Tiga tab lebar sama: tidak ada yang terpotong atau perlu digeser di 360px */}
      {!search && !reviewing && (
        <div className="grid grid-cols-3 gap-1 px-3 pb-2.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-current={activeTab === tab.id ? 'true' : undefined}
              className={`rounded-full px-0.5 py-2 leading-tight transition-colors ${
                activeTab === tab.id
                  ? 'bg-navy text-white'
                  : 'bg-ice-light text-muted'
              }`}
            >
              <span className="block truncate text-[12px] font-semibold">{tab.label}</span>
              <span
                className={`block text-[10px] ${
                  activeTab === tab.id ? 'text-white/65' : 'text-muted/75'
                }`}
              >
                {tab.count} barang
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
