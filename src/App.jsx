import { useCallback, useEffect, useMemo, useState } from 'react';
import BottomBar from './components/BottomBar';
import CategoryBrowser from './components/CategoryBrowser';
import Header from './components/Header';
import ProductItem from './components/ProductItem';
import TopBar from './components/TopBar';
import {
  fetchHistory,
  fetchOutlet,
  fetchProducts,
  fetchSuggestions,
  tokenFromPath,
} from './lib/catalog';
import { formatShortDate } from './lib/date';
import { buildOrderLines, buildOrderText, orderTotal, whatsappUrl } from './lib/order';
import { configMissing } from './lib/supabase';

const SUGGESTION_LIMIT = 12;
const SEARCH_LIMIT = 60; // cukup untuk dipilih, tidak membanjiri HP kelas bawah

export default function App() {
  const token = useMemo(() => tokenFromPath(), []);
  const [status, setStatus] = useState('loading'); // loading | ready | invalid | error
  const [outlet, setOutlet] = useState(null);
  const [history, setHistory] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [cart, setCart] = useState(() => new Map());
  const [tab, setTab] = useState('history');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(null);
  // Daftar barang terpilih dibuka dari bar bawah, bukan jadi tab keempat —
  // supaya ketiga tab tetap muat sejajar tanpa terpotong di layar 360px.
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    if (configMissing || !token) {
      setStatus(configMissing ? 'error' : 'invalid');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const found = await fetchOutlet(token);
        if (cancelled) return;
        if (!found) {
          setStatus('invalid');
          return;
        }
        setOutlet(found);
        setStatus('ready');

        // Dua daftar teratas didahulukan supaya halaman cepat berguna di
        // koneksi lambat; katalog lengkap menyusul di belakang.
        const [historyRows, suggestionRows] = await Promise.all([
          fetchHistory(token),
          fetchSuggestions(token, SUGGESTION_LIMIT),
        ]);
        if (cancelled) return;
        setHistory(historyRows);
        setSuggestions(suggestionRows);
        // Toko yang belum pernah order tidak punya isi di tab pertama —
        // langsung arahkan ke daftar yang ada isinya.
        if (!historyRows.length) setTab(suggestionRows.length ? 'new' : 'all');

        const productRows = await fetchProducts(token);
        if (cancelled) return;
        setProducts(productRows);
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatus('error');
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleChange = useCallback((productId, entry) => {
    setCart((prev) => {
      const next = new Map(prev);
      if (!entry.qty) next.delete(productId);
      else next.set(productId, entry);
      return next;
    });
  }, []);

  // Satu produk bisa muncul di beberapa daftar; katalog produknya dikunci per
  // id supaya nama, harga, dan satuan yang dipakai selalu satu sumber.
  const productIndex = useMemo(() => {
    const map = new Map();
    for (const list of [products, history, suggestions]) {
      for (const product of list) if (!map.has(product.id)) map.set(product.id, product);
    }
    return map;
  }, [products, history, suggestions]);

  const lines = useMemo(() => buildOrderLines(cart, productIndex), [cart, productIndex]);
  const total = useMemo(() => orderTotal(lines), [lines]);

  const keyword = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!keyword) return [];
    const found = [];
    for (const product of productIndex.values()) {
      if (
        product.name.toLowerCase().includes(keyword) ||
        (product.sku || '').toLowerCase().includes(keyword)
      ) {
        found.push(product);
      }
    }
    return found.sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [productIndex, keyword]);

  // Kalau barang terakhir dihapus saat daftar terpilih sedang dibuka, jangan
  // tinggalkan toko di layar kosong.
  useEffect(() => {
    if (reviewing && !lines.length) setReviewing(false);
  }, [reviewing, lines.length]);

  function changeTab(next) {
    setTab(next);
    setReviewing(false);
    if (next !== 'all') setCategory(null);
    window.scrollTo({ top: 0 });
  }

  function openReview() {
    setReviewing(true);
    setSearch('');
    window.scrollTo({ top: 0 });
  }

  function handleOrder() {
    if (!outlet || !lines.length) return;
    const text = buildOrderText(outlet.storeName, lines);
    window.open(whatsappUrl(outlet.whatsappNumber, text), '_blank', 'noopener');
  }

  if (status === 'loading') return <Centered>Memuat katalog…</Centered>;

  if (status === 'invalid')
    return (
      <Centered>
        <p className="font-semibold text-gray-900">Link katalog tidak berlaku</p>
        <p className="mt-1 text-gray-600">Minta link terbaru ke sales atau admin, ya.</p>
      </Centered>
    );

  if (status === 'error')
    return (
      <Centered>
        <p className="font-semibold text-gray-900">Katalog belum bisa dibuka</p>
        <p className="mt-1 text-gray-600">
          Coba muat ulang halaman. Kalau masih sama, hubungi admin.
        </p>
      </Centered>
    );

  const tabs = [
    { id: 'history', label: 'Biasa Diambil', count: history.length },
    { id: 'new', label: 'Belum Dicoba', count: suggestions.length },
    { id: 'all', label: 'Semua Barang', count: products.length },
  ];

  const missingWhatsapp = !outlet.whatsappNumber;

  return (
    <div className="mx-auto max-w-lg bg-gray-50">
      <Header outlet={outlet} />

      <TopBar
        tabs={tabs}
        activeTab={tab}
        onTabChange={changeTab}
        search={search}
        onSearchChange={setSearch}
        reviewing={reviewing}
        pickedCount={lines.length}
        onCloseReview={() => setReviewing(false)}
      />

      {missingWhatsapp && (
        <p className="bg-amber-100 px-3 py-2 text-[12px] text-amber-900">
          Nomor WhatsApp kantor belum diisi, tombol pesan belum bisa dipakai.
        </p>
      )}

      {reviewing ? (
        <List
          items={lines.map((l) => productIndex.get(l.productId)).filter(Boolean)}
          cart={cart}
          onChange={handleChange}
          empty="Belum ada barang dipilih."
        />
      ) : keyword ? (
        <SearchResults
          matches={matches}
          keyword={search.trim()}
          loading={productsLoading}
          cart={cart}
          onChange={handleChange}
        />
      ) : (
        <>
          {tab === 'history' && (
            <List
              items={history}
              cart={cart}
              onChange={handleChange}
              note={(p) => `${p.orderCount}× · ${formatShortDate(p.lastOrdered)}`}
              empty="Belum ada riwayat pesanan untuk toko ini. Lihat tab Semua Barang."
            />
          )}

          {tab === 'new' && (
            <List
              items={suggestions}
              cart={cart}
              onChange={handleChange}
              note={(p) => `${p.categoryName} · laris di toko lain`}
              empty="Belum ada rekomendasi untuk toko ini."
            />
          )}

          {tab === 'all' && (
            <CategoryBrowser
              products={products}
              loading={productsLoading}
              cart={cart}
              onChange={handleChange}
              category={category}
              onCategoryChange={setCategory}
            />
          )}

        </>
      )}

      <p className="px-3 py-5 text-center text-[11px] text-gray-400">
        Harga dapat berubah sewaktu-waktu. Total di atas adalah estimasi.
      </p>

      <BottomBar
        itemCount={lines.length}
        total={total}
        onOrder={handleOrder}
        disabled={missingWhatsapp}
        onReview={openReview}
        reviewing={reviewing}
      />
    </div>
  );
}

function List({ items, cart, onChange, note, empty }) {
  if (!items.length) {
    return <p className="px-4 py-8 text-center text-[13px] text-gray-500">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-gray-100 bg-white">
      {items.map((product) => (
        <ProductItem
          key={product.id}
          product={product}
          entry={cart.get(product.id)}
          onChange={onChange}
          note={note ? note(product) : undefined}
        />
      ))}
    </ul>
  );
}

function SearchResults({ matches, keyword, loading, cart, onChange }) {
  const shown = matches.slice(0, SEARCH_LIMIT);
  return (
    <div>
      <p className="px-3 py-2 text-[12px] text-gray-500">
        {loading && !matches.length
          ? 'Memuat daftar barang…'
          : `${matches.length} barang cocok dengan “${keyword}”`}
        {matches.length > SEARCH_LIMIT && ` — menampilkan ${SEARCH_LIMIT} teratas`}
      </p>
      {shown.length === 0 && !loading ? (
        <p className="px-4 py-8 text-center text-[13px] text-gray-500">
          Tidak ada barang yang cocok. Coba kata lain, atau cari lewat tab Semua Barang.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 bg-white">
          {shown.map((product) => (
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
  );
}

function Centered({ children }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 text-center text-[14px] text-gray-600">
      <div>{children}</div>
    </div>
  );
}
