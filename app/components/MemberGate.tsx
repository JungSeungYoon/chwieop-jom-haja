'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useViewer, buttonClass } from './ExploreShell.tsx';
export default function MemberGate({ children, profile = true }: { children: ReactNode; profile?: boolean }) {
  const viewer = useViewer();
  if (!viewer.ready || (profile && (viewer.profile === 'checking' || (viewer.id && viewer.profile === 'none')))) return <main id="main" className="mx-auto max-w-6xl p-8" role="status">회원 정보를 확인하는 중입니다.</main>;
  if (!viewer.id) return <main id="main" className="mx-auto max-w-6xl p-8">상단의 GitHub 로그인 버튼으로 로그인해주세요.</main>;
  if (profile && viewer.profile !== 'ready') return <main id="main" className="mx-auto max-w-6xl p-8">{viewer.profile === 'missing' ? <Link className={buttonClass} href="/settings/profile">프로필 등록하기</Link> : <button className={buttonClass} onClick={viewer.refreshProfile}>회원 정보 다시 확인</button>}</main>;
  return <div key={viewer.id}>{children}</div>;
}
