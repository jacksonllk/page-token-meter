import Link from "next/link";
import { REPO_URL } from "@/lib/links";
import { GitHubIcon, MeterMark } from "./icons";
import { ThemeToggle } from "./theme-toggle";

// The top bar and the footer, shared by the home page and the share page.
export function SiteHeader() {
  return (
    <header className="flex h-16 items-center justify-between">
      <Link href="/" className="flex items-center gap-2.5">
        <MeterMark className="size-6" />
        <span className="text-[15px] font-semibold tracking-tight">Page Token Meter</span>
      </Link>
      <div className="flex items-center gap-2">
        <a
          href={REPO_URL}
          aria-label="Page Token Meter on GitHub"
          title="View on GitHub"
          className="flex size-9 items-center justify-center rounded-full border border-line text-muted transition hover:border-faint hover:text-fg"
        >
          <GitHubIcon />
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-8 border-t border-line pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={REPO_URL}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-panel py-1.5 pr-3.5 pl-2.5 text-xs text-muted transition hover:border-faint hover:text-fg"
        >
          <GitHubIcon className="size-3.5 text-fg" />
          View on <span className="font-medium text-fg">GitHub</span>
        </a>
        <span className="ml-auto font-mono text-[11px] text-faint">MIT licence</span>
      </div>
    </footer>
  );
}
