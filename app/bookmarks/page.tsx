import ExploreShell from '../components/ExploreShell.tsx';
import MemberGate from '../components/MemberGate.tsx';
import Bookmarks from '../components/Bookmarks.tsx';
export default function Page() { return <ExploreShell demo={false}><MemberGate><Bookmarks /></MemberGate></ExploreShell>; }
