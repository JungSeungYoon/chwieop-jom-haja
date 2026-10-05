import ExploreShell from '../components/ExploreShell.tsx';
import MemberGate from '../components/MemberGate.tsx';
import Archive from '../components/Archive.tsx';
export default function Page() { return <ExploreShell demo={false}><MemberGate><Archive /></MemberGate></ExploreShell>; }
