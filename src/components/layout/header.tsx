import {UserCircle} from "lucide-react"

export function Header() {
  return (
    <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <nav className="flex justify-between items-center px-8 py-4 max-w-7xl mx-auto">
        <div className="text-xl font-extrabold tracking-tighter text-foreground">
          portal<span className="text-muted-foreground">.ai</span>
        </div>
        <div className="flex items-center gap-6">
          <button aria-label="Account">
            <UserCircle className="size-5 text-outline cursor-pointer hover:text-primary transition-colors active:scale-95" />
          </button>
        </div>
      </nav>
    </header>
  )
}
