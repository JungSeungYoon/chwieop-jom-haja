'use client';
import { useEffect, useState } from 'react';
import { useViewer, primaryClass } from './ExploreShell.tsx';
import { memberRequest } from '../../lib/workspace-data.ts';
import { object, errorMessage } from '../../lib/explore-data.ts';
import { parseProfile } from '../../lib/profile.ts';
const empty = { handle: '', nickname: '', major: '', interests: '', bio: '' };
const labels = { handle: '개인 주소', nickname: '닉네임', major: '전공', interests: '관심 분야', bio: '소개' };
export default function ProfileSettings() {
  const viewer = useViewer(); const [form, setForm] = useState(empty), [loaded, setLoaded] = useState(false), [exists, setExists] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => { let active = true; setLoaded(false);
    void memberRequest(viewer.id!, '/api/me').then(result => { if (!active) return; const data = object(result.data); setExists(!!data.profile); if (data.profile) { const row = object(data.profile); const next = { ...empty }; for (const key of Object.keys(next) as (keyof typeof empty)[]) { if (typeof row[key] !== 'string') throw new Error('프로필 응답을 확인하지 못했습니다.'); next[key] = row[key]; } setForm(next); } setLoaded(true); }).catch(error => { if (active) setNotice(errorMessage(error)); });
    return () => { active = false; };
  }, [viewer.id, revision]);
  async function save() { setBusy(true); setNotice(''); try { const input = parseProfile(form, exists ? 'update' : 'create'); await memberRequest(viewer.id!, '/api/profiles', exists ? 'PATCH' : 'POST', input); setExists(true); viewer.refreshProfile(); setNotice('프로필을 저장했습니다.'); } catch (error) { setNotice(errorMessage(error)); } finally { setBusy(false); } }
  return <main id="main" className="mx-auto max-w-2xl px-5 pt-12"><p className="text-xs font-mono text-zinc-500">YOUR IDENTITY</p><h1 className="mt-3 mb-8 text-3xl font-semibold">프로필 설정</h1>
    {notice && <p role="status" className="mb-5 text-sm">{notice}</p>}{!loaded ? <button type="button" className={primaryClass} onClick={() => setRevision(value => value + 1)}>프로필 다시 불러오기</button> : <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-5">{(Object.keys(empty) as (keyof typeof empty)[]).map(key => <label key={key} className="block text-sm font-medium">{labels[key]}<input disabled={busy} required={key === 'handle' || key === 'nickname'} value={form[key]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} className="mt-2 w-full rounded-md border border-zinc-200 p-3 font-normal" /></label>)}<p className="text-xs leading-6 text-zinc-500">개인 주소는 영문 소문자·숫자·하이픈 3~30자입니다. 닉네임은 2~30자입니다.</p><button type="submit" disabled={busy} className={primaryClass}>{busy ? '저장 중…' : '프로필 저장'}</button></form>}
  </main>;
}
