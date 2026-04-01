export function Footer() {
  return (
    <footer className="w-full py-10 bg-card border-t border-border">
      <div className="flex flex-col md:flex-row justify-between items-center px-8 gap-6 max-w-7xl mx-auto">
        <div className="text-sm font-extrabold tracking-tighter text-foreground">
          portal<span className="text-muted-foreground">.ai</span>
        </div>
        <div className="text-[10px] font-mono font-bold tracking-widest text-on-surface-variant uppercase">
          Powered by AI
        </div>
        <div className="flex gap-8">
          {["Privacy", "Terms", "Support"].map((item) => (
            <a
              key={item}
              href="#"
              className="text-xs font-medium tracking-wide text-on-surface-variant hover:text-primary transition-colors"
            >
              {item}
            </a>
          ))}
        </div>
        <div className="text-xs font-medium tracking-wide text-on-surface-variant">
          &copy; 2026 portal.ai
        </div>
      </div>
    </footer>
  )
}
