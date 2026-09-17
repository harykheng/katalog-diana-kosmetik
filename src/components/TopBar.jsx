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
    <div className="sticky top-0 z-20 border-b border-gray-200 bg-white">
      <div className="px-3 pt-2.5 pb-2">
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px] text-gray-400"
          >
            🔍
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari barang…"
            aria-label="Cari barang"
            className="w-full rounded-xl border border-gray-300 bg-gray-50 py-2.5 pr-9 pl-9 text-[14px] outline-none focus:border-gray-900 focus:bg-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Hapus pencarian"
              className="absolute top-1/2 right-2 -translate-y-1/2 px-1.5 py-1 text-[15px] text-gray-400"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {!search && reviewing && (
        <div className="flex items-center justify-between gap-2 px-3 pb-2">
          <span className="text-[13px] font-bold text-gray-900">
            ✓ {pickedCount} barang dipilih
          </span>
          <button
            type="button"
            onClick={onCloseReview}
            className="rounded-full bg-gray-100 px-3 py-1.5 text-[12px] font-semibold text-gray-700"
          >
            Lanjut pilih
          </button>
        </div>
      )}

      {/* Tiga tab lebar sama: tidak ada yang terpotong atau perlu digeser di 360px */}
      {!search && !reviewing && (
        <div className="grid grid-cols-3 gap-1 px-3 pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-current={activeTab === tab.id ? 'true' : undefined}
              className={`rounded-xl px-1 py-1.5 leading-tight ${
                activeTab === tab.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              <span className="block truncate text-[12px] font-semibold">{tab.label}</span>
              <span
                className={`block text-[10px] ${
                  activeTab === tab.id ? 'text-white/70' : 'text-gray-400'
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
