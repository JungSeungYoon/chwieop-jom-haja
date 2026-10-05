import ExploreShell from '../../components/ExploreShell.tsx';
import MemberGate from '../../components/MemberGate.tsx';
import PinManager from '../../components/PinManager.tsx';
export default function Page() { return <ExploreShell demo={false}><MemberGate><PinManager /></MemberGate></ExploreShell>; }
