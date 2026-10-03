import { CommunitySupport } from "@/components/community-support";
import { HomeBoard } from "@/components/home-board";
import { SiteHeader } from "@/components/site-header";
import { loadTaskFeed } from "@/lib/runs";

export const revalidate = 30;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ donated?: string | string[] }>;
}) {
  const query = await searchParams;
  const donated = (Array.isArray(query.donated) ? query.donated[0] : query.donated) === "1";
  const feed = await loadTaskFeed();
  return (
    <>
      <SiteHeader />
      <main>
        <HomeBoard feed={feed} />
        <CommunitySupport thanked={donated} />
      </main>
      <footer className="border-t border-neutral-200 px-4 py-8 text-center text-sm text-neutral-500">
        Abacus estimates tokens before you spend them.
      </footer>
    </>
  );
}
