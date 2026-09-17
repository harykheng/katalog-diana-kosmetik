import { useMemo, useState } from 'react';
import ProductItem from './ProductItem';

/**
 * Section "Semua Produk": search di atas, lalu kategori yang collapsed by
 * default. Saat ada kata kunci, hasil ditampilkan datar (tanpa kategori) supaya
 * toko tidak perlu membuka-tutup apa pun untuk menemukan barangnya.
 */
export default function AllProducts({ products, loading, cart, onChange }) {
  const [search, setSearch] = useState('');
  const [openCategories, setOpenCategories] = useState(() => new Set());

  const keyword = search.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!keyword) return [];
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(keyword) ||
        (p.sku || '').toLowerCase().includes(keyword)
    );
  }, [products, keyword]);

  const categories = useMemo(() => {
    const map = new Map();
    for (const product of products) {
      if (!map.has(product.categoryName)) map.set(product.categoryName, []);
      map.get(product.categoryName).push(product);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'id'));
  }, [products]);

  function toggleCategory(name) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  return (
    <section className="mt-4">
      <h2 className="px-3 pb-1.5 text-[15px] font-bold text-gray-900">
        Semua Produk
      </h2>

      <div className="px-3 pb-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama produk atau SKU…"
          aria-label="Cari produk"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-[14px] outline-none focus:border-gray-900"
        />
      </div>

      {loading && (
        <p className="px-3 py-3 text-[13px] text-gray-500">Memuat produk…</p>
      )}

      {!loading && keyword && (
        <div className="overflow-hidden border-y border-gray-200 bg-white">
          {matches.length === 0 ? (
            <p className="px-3 py-4 text-[13px] text-gray-500">
              Tidak ada produk yang cocok dengan “{search.trim()}”.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {matches.map((product) => (
                <ProductItem
                  key={product.id}
                  product={product}
                  entry={cart.get(product.id)}
                  onChange={onChange}
                  note={product.categoryName}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {!loading && !keyword && (
        <div className="border-y border-gray-200 bg-white">
          {categories.map(([name, items]) => {
            const open = openCategories.has(name);
            const picked = items.filter((p) => cart.get(p.id)?.qty).length;
            return (
              <div key={name} className="border-b border-gray-100 last:border-0">
                <button
                  type="button"
                  onClick={() => toggleCategory(name)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
                >
                  <span className="text-[14px] font-semibold text-gray-900">
                    {name}
                  </span>
                  <span className="flex items-center gap-2">
                    {picked > 0 && (
                      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
                        {picked}
                      </span>
                    )}
                    <span className="text-[12px] text-gray-500">
                      {items.length}
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-[12px] text-gray-400"
                    >
                      {open ? '▲' : '▼'}
                    </span>
                  </span>
                </button>
                {open && (
                  <ul className="divide-y divide-gray-100 border-t border-gray-100">
                    {items.map((product) => (
                      <ProductItem
                        key={product.id}
                        product={product}
                        entry={cart.get(product.id)}
                        onChange={onChange}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
