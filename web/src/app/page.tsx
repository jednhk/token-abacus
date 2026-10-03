import { CommunitySupport } from "@/components/community-support";
import { HomeBoard } from "@/components/home-board";
import { Mascot } from "@/components/mascot";
import { SiteHeader } from "@/components/site-header";
// import { loadTaskFeed } from "@/lib/runs";

export const revalidate = 30;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ donated?: string | string[] }>;
}) {
  const query = await searchParams;
  const donated = (Array.isArray(query.donated) ? query.donated[0] : query.donated) === "1";
  // const feed = await loadTaskFeed();
  return (
    <>
      <SiteHeader />
      <main>
        <section className="px-4 pt-14 text-center sm:pt-20">
          <Mascot preload className="mx-auto h-28 w-auto sm:h-36" />
          <h1 className="mx-auto mt-6 max-w-[16ch] font-serif text-[2.6rem] leading-[0.98] font-medium tracking-[-0.03em] sm:text-6xl md:text-[4.25rem]">
            Meet Abacus, your token saver.
          </h1>
          <p className="mx-auto mt-5 max-w-md text-balance text-base leading-7 text-neutral-500 sm:text-lg">
            See the cost before you send it, then take the cheaper path.
          </p>
        </section>
        <div className="mt-8">
          <HomeBoard />
        </div>
        <CommunitySupport thanked={donated} />
      </main>
      <footer className="border-t border-neutral-200 px-4 py-8 text-center text-sm text-neutral-500">
        Abacus estimates tokens before you spend them.
      </footer>
    </>
  );
}
