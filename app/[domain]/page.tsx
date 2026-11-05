import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { HomePage } from "@/app/components/home-page";
import { Meter } from "@/app/components/meter";
import { num } from "@/lib/format";
import { websiteFrom } from "@/lib/keypages";
import { latestSite } from "@/lib/results";
import { getStore } from "@/lib/store";

// "/stripe.com": the home page, measuring that website at once. A saved result comes back instantly, with 0 credits.
// The readable address is also the link people share and type.

const fixtures = process.env.PTM_FIXTURES === "1";

// Saved results change over time, so they are read at request time, never prerendered.
const saved = cache(async (domain: string) => {
  await connection();
  return latestSite(getStore(), domain).catch(() => null);
});

export async function generateMetadata({ params }: PageProps<"/[domain]">): Promise<Metadata> {
  const domain = websiteFrom((await params).domain);
  if (!domain) return {};
  const result = await saved(domain);
  const title = result
    ? `${domain}: ${num(result.totalMarkdownTokens)} tokens to read its key pages`
    : `How does an AI agent read ${domain}?`;
  const description = "See the content AI agents get from its key pages and for how many tokens. Free and open source.";
  return { title: `${title} · Page Token Meter`, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

// Also marks the page as rendered per request, which the metadata above needs (it reads saved results).
async function MeterFor({ params }: Pick<PageProps<"/[domain]">, "params">) {
  await connection();
  const domain = websiteFrom((await params).domain);
  if (!domain) notFound();
  return <Meter fixtures={fixtures} initialDomain={domain} />;
}

export default function WebsitePage({ params }: PageProps<"/[domain]">) {
  return (
    <HomePage>
      <Suspense fallback={<Meter fixtures={fixtures} />}>
        <MeterFor params={params} />
      </Suspense>
    </HomePage>
  );
}
