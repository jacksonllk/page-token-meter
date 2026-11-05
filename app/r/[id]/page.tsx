import type { Metadata } from "next";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { SharedView } from "@/app/components/shared-view";
import { SiteFooter, SiteHeader } from "@/app/components/site-chrome";
import { sharedResult } from "@/lib/results";
import { shareText } from "@/lib/share-text";
import { getStore } from "@/lib/store";

// One lookup per request, shared by the metadata and the page. Read at request time, never prerendered.
const load = cache(async (id: string) => {
  await connection();
  return sharedResult(getStore(), id);
});

export async function generateMetadata({ params }: PageProps<"/r/[id]">): Promise<Metadata> {
  const shared = await load((await params).id);
  if (!shared) return { title: "Result not found · Page Token Meter" };
  const { title, description } = shareText(shared);
  return {
    title: `${title} · Page Token Meter`,
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

async function Result({ params }: Pick<PageProps<"/r/[id]">, "params">) {
  const shared = await load((await params).id);
  if (!shared) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-5 text-sm">
        <p className="font-medium">Result not found</p>
        <p className="mt-1 text-muted">Check the link, or measure the page again.</p>
      </div>
    );
  }
  return <SharedView shared={shared} />;
}

export default function SharePage({ params }: PageProps<"/r/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-10">
      <SiteHeader />
      <div className="mt-4">
        <Suspense fallback={<div className="skeleton h-96 w-full rounded-2xl" />}>
          <Result params={params} />
        </Suspense>
      </div>
      <SiteFooter />
    </main>
  );
}
