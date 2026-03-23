export function Footer() {
  return (
    <footer className="w-full py-12 bg-slate-50">
      <div className="flex flex-col md:flex-row justify-between items-center px-12 gap-6 max-w-7xl mx-auto">
        <div className="text-sm font-bold text-slate-900">MOODFIT</div>
        <div className="text-xs font-medium tracking-wide text-slate-400 uppercase">
          Powered by AI
        </div>
        <div className="flex gap-8">
          {["Privacy", "Terms", "Support"].map((item) => (
            <a
              key={item}
              href="#"
              className="text-xs font-medium tracking-wide text-slate-400 hover:text-moodfit-primary transition-colors"
            >
              {item}
            </a>
          ))}
        </div>
        <div className="text-xs font-medium tracking-wide text-slate-400">
          &copy; 2026 MOODFIT Digital Atelier
        </div>
      </div>
    </footer>
  )
}
