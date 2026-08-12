import Link from "next/link";

const NAV_ITEMS = [
  { href: "/", label: "홈", emoji: "🏠" },
  { href: "/learn", label: "학습", emoji: "📖" },
  { href: "/review", label: "복습", emoji: "🔁" },
  { href: "/test", label: "테스트", emoji: "📝" },
];

export default function Navbar() {
  return (
    <header className="sticky top-0 z-10 border-b border-orange-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-orange-600">
          <span>🐿️</span>
          <span>지후 영단어</span>
        </Link>
        <nav className="flex gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-orange-100 hover:text-orange-700 transition"
            >
              <span>{item.emoji}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
