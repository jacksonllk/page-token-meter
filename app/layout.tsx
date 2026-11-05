import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/links";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Share images need full URLs. Vercel sets VERCEL_PROJECT_PRODUCTION_URL (no https://). SITE_URL overrides it.
const siteUrl = process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

const title = "Page Token Meter: see your website as AI agents see it";
const description = "Scan a URL to see the content AI agents get from your key pages and for how many tokens. Open source, built with context.dev.";

// A page that sets its own openGraph replaces this one, so each sets siteName too.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: { siteName: SITE_NAME, type: "website", title, description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies a saved dark-mode choice before the first paint, so the page does not flash. Light is the default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
