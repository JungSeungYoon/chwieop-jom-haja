import ExploreShell from '../../components/ExploreShell.tsx';
import MemberGate from '../../components/MemberGate.tsx';
import ProfileSettings from '../../components/ProfileSettings.tsx';
export default function Page() { return <ExploreShell demo={false}><MemberGate profile={false}><ProfileSettings /></MemberGate></ExploreShell>; }
