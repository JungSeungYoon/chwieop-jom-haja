import ExploreShell from "./components/ExploreShell.tsx";
import ExploreFeed from "./components/ExploreFeed.tsx";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const demo = params.demo === "1" || (params.demo !== "0" && process.env.NEXT_PUBLIC_DEMO_MODE === "true");
  return <ExploreShell demo={demo}><ExploreFeed demo={demo} /></ExploreShell>;
}
