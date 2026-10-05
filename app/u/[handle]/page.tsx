import ExploreShell from '../../components/ExploreShell.tsx';
import Portfolio from '../../components/Portfolio.tsx';
export default async function Page({ params }: { params: Promise<{ handle: string }> }) { const { handle } = await params; return <ExploreShell demo={false}><Portfolio key={handle} handle={handle} /></ExploreShell>; }
