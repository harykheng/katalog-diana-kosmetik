import { useMemo } from 'react';
import ProductItem from './ProductItem';

/**
 * Tab "Semua": daftar kategori dulu, baru isinya.
 *
 * 1.500+ SKU tidak pernah dirender sekaligus — selain berat untuk HP kelas
 * bawah, daftar sepanjang itu juga tidak mungkin ditelusuri dengan jempol.
 * Toko memilih kategori (satu ketukan), lalu melihat isinya saja. Untuk
 * mencari barang tertentu, kolom cari di atas layar selalu ada.
 */
export default function CategoryBrowser({
  products,
  loading,
  cart,
  onChange,
  category,
  onCategoryChange,
}) {
  const categories = useMemo(() => {
    const map = new Map();
    for (const product of products) {
      if (!map.has(product.categoryName)) map.set(product.categoryName, []);
      map.get(product.categoryName).push(product);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'id'));
  }, [products]);

  if (loading) {
    return <p className="px-3 py-6 text-center text-[13px] text-gray-500">Memuat daftar barang…</p>;
  }

  if (!category) {
    return (
      <ul className="divide-y divide-gray-100 bg-white">
        {categories.map(([name, items]) => {
          const picked = items.filter((p) => cart.get(p.id)?.qty).length;
          return (
            <li key={name}>
              <button
                type="button"
                onClick={() => onCategoryChange(name)}
                className="flex w-full items-center justify-between gap-2 px-3 py-3.5 text-left"
              >
                <span className="text-[14px] font-semibold text-gray-900">{name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {picked > 0 && (
                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
                      {picked}
                    </span>
                  )}
                  <span className="text-[12px] text-gray-400">{items.length}</span>
                  <span aria-hidden="true" className="text-[12px] text-gray-300">›</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  const items = categories.find(([name]) => name === category)?.[1] || [];

  return (
    <div>
      <button
        type="button"
        onClick={() => onCategoryChange(null)}
        className="flex w-full items-center gap-1.5 border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-[13px] font-semibold text-gray-700"
      >
        <span aria-hidden="true">‹</span> Semua kategori
        <span className="ml-auto text-[12px] font-normal text-gray-500">
          {category} · {items.length}
        </span>
      </button>
      <ul className="divide-y divide-gray-100 bg-white">
        {items.map((product) => (
          <ProductItem
            key={product.id}
            product={product}
            entry={cart.get(product.id)}
            onChange={onChange}
          />
        ))}
      </ul>
    </div>
  );
}
