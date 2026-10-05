import ExploreShell from '../components/ExploreShell.tsx';
import MemberGate from '../components/MemberGate.tsx';
import Writer from '../components/Writer.tsx';
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { const params = await searchParams; return <ExploreShell demo={false}><MemberGate><Writer key={typeof params.id === 'string' ? params.id : 'new'} initialId={typeof params.id === 'string' ? params.id : undefined} /></MemberGate></ExploreShell>; }
