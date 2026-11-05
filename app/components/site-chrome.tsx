import Link from "next/link";
import { MAKER, REPO_URL } from "@/lib/links";
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
        <span className="ml-auto flex items-center gap-3 font-mono text-[11px] text-faint">
          <span>
            Made by{" "}
            <a href={MAKER.url} target="_blank" rel="noreferrer" className="text-muted underline-offset-2 transition hover:text-fg hover:underline">
              {MAKER.name}
            </a>
          </span>
          <span aria-hidden>·</span>
          <a href={`${REPO_URL}/blob/main/LICENSE`} className="transition hover:text-fg">
            MIT licence
          </a>
        </span>
      </div>
    </footer>
  );
}
