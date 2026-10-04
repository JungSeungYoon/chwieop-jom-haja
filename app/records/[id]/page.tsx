import ExploreShell from "../../components/ExploreShell.tsx";
import RecordDetail from "../../components/RecordDetail.tsx";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params, query = await searchParams;
  const demo = query.demo === "1" || (query.demo !== "0" && process.env.NEXT_PUBLIC_DEMO_MODE === "true");
  return <ExploreShell demo={demo}><RecordDetail id={id} demo={demo} /></ExploreShell>;
}
