import { useCallback, useEffect, useMemo, useState } from 'react';
import AllProducts from './components/AllProducts';
import BottomBar from './components/BottomBar';
import Header from './components/Header';
import ProductItem from './components/ProductItem';
import Section from './components/Section';
import {
  fetchHistory,
  fetchOutlet,
  fetchProducts,
  fetchSuggestions,
  tokenFromPath,
} from './lib/catalog';
import { formatShortDate } from './lib/date';
import { buildOrderLines, buildOrderText, orderTotal, whatsappUrl } from './lib/order';
import { baseUnit } from './lib/pricing';
import { configMissing } from './lib/supabase';

const SUGGESTION_LIMIT = 12;

export default function App() {
  const token = useMemo(() => tokenFromPath(), []);
  const [status, setStatus] = useState('loading'); // loading | ready | invalid | error
  const [outlet, setOutlet] = useState(null);
  const [history, setHistory] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [cart, setCart] = useState(() => new Map());

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

        // Dua section teratas didahulukan supaya halaman cepat berguna di
        // koneksi lambat; daftar lengkap menyusul di belakang.
        const [historyRows, suggestionRows] = await Promise.all([
          fetchHistory(token),
          fetchSuggestions(token, SUGGESTION_LIMIT),
        ]);
        if (cancelled) return;
        setHistory(historyRows);
        setSuggestions(suggestionRows);

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

  // Satu produk bisa muncul di beberapa section; katalog produknya dikunci per
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
        <p className="mt-1 text-gray-600">
          Minta link terbaru ke sales atau admin, ya.
        </p>
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

  const missingWhatsapp = !outlet.whatsappNumber;

  return (
    <div className="mx-auto max-w-lg">
      <Header outlet={outlet} />

      {missingWhatsapp && (
        <p className="bg-amber-100 px-3 py-2 text-[12px] text-amber-900">
          Nomor WhatsApp kantor belum diisi, tombol pesan belum bisa dipakai.
        </p>
      )}

      <Section
        title="Biasa Diambil"
        subtitle={
          history.length
            ? 'Barang yang paling sering diambil toko ini.'
            : undefined
        }
      >
        {history.length === 0 ? (
          <p className="px-3 py-4 text-[13px] text-gray-500">
            Belum ada riwayat pesanan untuk toko ini. Silakan pilih dari daftar
            di bawah.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {history.map((product) => (
              <ProductItem
                key={product.id}
                product={product}
                entry={cart.get(product.id)}
                onChange={handleChange}
                note={`${product.orderCount}× diambil · terakhir ${formatShortDate(
                  product.lastOrdered
                )}`}
              />
            ))}
          </ul>
        )}
      </Section>

      {suggestions.length > 0 && (
        <Section
          title="Belum Pernah Dicoba"
          subtitle="Laris di toko lain, belum pernah diambil di sini."
        >
          <ul className="divide-y divide-gray-100">
            {suggestions.map((product) => (
              <ProductItem
                key={product.id}
                product={product}
                entry={cart.get(product.id)}
                onChange={handleChange}
                note={`${product.categoryName} · dijual per ${baseUnit(product)}`}
              />
            ))}
          </ul>
        </Section>
      )}

      <AllProducts
        products={products}
        loading={productsLoading}
        cart={cart}
        onChange={handleChange}
      />

      <p className="px-3 py-5 text-center text-[11px] text-gray-400">
        Harga dapat berubah sewaktu-waktu. Total di atas adalah estimasi.
      </p>

      <BottomBar
        itemCount={lines.length}
        total={total}
        onOrder={handleOrder}
        disabled={missingWhatsapp}
      />
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
