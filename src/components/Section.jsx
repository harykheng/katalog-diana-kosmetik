/** Judul section + pembungkus daftar produk. */
export default function Section({ title, subtitle, badge, children }) {
  return (
    <section className="mt-3">
      <div className="flex items-baseline justify-between gap-2 px-3 pb-1.5">
        <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
        {badge}
      </div>
      {subtitle && (
        <p className="px-3 pb-2 text-[12px] leading-snug text-gray-500">
          {subtitle}
        </p>
      )}
      <div className="overflow-hidden border-y border-gray-200 bg-white">
        {children}
      </div>
    </section>
  );
}
