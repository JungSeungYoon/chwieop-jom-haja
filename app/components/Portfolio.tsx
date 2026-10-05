'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiRequest, errorMessage, object, parseFeed, type FeedPost, typeNames } from '../../lib/explore-data.ts';
import { recordRows, type RecordRow } from '../../lib/portfolio-data.ts';
import RecordCard from './RecordCard.tsx';
import { useViewer, buttonClass } from './ExploreShell.tsx';
type Profile = { id: string; handle: string; nickname: string; major: string; interests: string; bio: string };
export default function Portfolio({ handle }: { handle: string }) {
  const viewer = useViewer(); const [profile, setProfile] = useState<Profile>(), [pins, setPins] = useState<RecordRow[]>([]), [posts, setPosts] = useState<FeedPost[]>([]), [query, setQuery] = useState(''), [search, setSearch] = useState(''), [type, setType] = useState(''), [offset, setOffset] = useState(0), [more, setMore] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0), [notice, setNotice] = useState('');
  useEffect(() => { let active = true; setLoading(true); setError('');
    void (async () => { const result = object((await apiRequest(`/api/profiles/${encodeURIComponent(handle)}`)).data); if (!['id','handle','nickname','major','interests','bio'].every(key => typeof result[key] === 'string')) throw new Error('프로필 정보를 확인하지 못했습니다.'); const current = result as Profile;
      const params = new URLSearchParams({ owner: current.id, feed: '1', offset: String(offset), q: search }); if (type) params.set('type', type);
      const [pinResult, feedResult] = await Promise.all([apiRequest(`/api/pins?owner=${current.id}`), apiRequest(`/api/records?${params}`, viewer.token)]); const nextPins = recordRows(pinResult.data), next = parseFeed(feedResult);
      if (active) { setProfile(current); setPins(nextPins); setPosts(previous => offset ? [...previous, ...next.posts.filter(row => !previous.some(item => item.id === row.id))] : next.posts); setMore(next.hasMore); }
    })().catch(error => { if (active) setError(errorMessage(error)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; };
  }, [handle, viewer.token, search, type, offset, revision]);
  async function share() { try { await navigator.clipboard.writeText(`${window.location.origin}/u/${encodeURIComponent(handle)}`); setNotice('주소를 복사했습니다.'); } catch { setNotice(`공유 주소: ${window.location.origin}/u/${encodeURIComponent(handle)}`); } }
  return <main id="main" className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
    {profile && <section className="mb-10 border-b border-zinc-200 pb-8"><div className="flex flex-wrap justify-between gap-4"><div><p className="text-sm text-zinc-500">@{profile.handle}</p><h1 className="mt-2 text-3xl font-semibold">{profile.nickname}</h1></div><button type="button" className={buttonClass} onClick={() => void share()}>주소 복사</button></div>{profile.major && <p className="mt-4 text-sm">{profile.major}</p>}{profile.interests && <p className="mt-2 text-sm text-zinc-600">{profile.interests}</p>}{profile.bio && <p className="mt-4 whitespace-pre-wrap text-sm leading-7">{profile.bio}</p>}{notice && <p role="status" className="mt-3 text-sm">{notice}</p>}</section>}
    {pins.length > 0 && <section className="mb-10"><h2 className="mb-4 font-semibold">대표 프로젝트</h2><ol className="grid gap-4 md:grid-cols-3">{pins.map(row => <li key={row.id} className="rounded-md border border-zinc-200 p-5"><Link href={`/records/${row.id}`} className="font-semibold hover:underline">{row.title || '제목 없는 기록'}</Link></li>)}</ol></section>}
    <h2 className="mb-4 font-semibold">공개 기록</h2><form className="mb-6 flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); setOffset(0); setPosts([]); setSearch(query); setRevision(value => value + 1); }}><label className="min-w-0 flex-1"><span className="sr-only">기록 검색</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="제목·본문 검색" maxLength={100} className="w-full rounded-md border border-zinc-200 p-3 text-sm" /></label><label><span className="sr-only">기록 유형</span><select value={type} onChange={event => { setOffset(0); setPosts([]); setType(event.target.value); }} className="rounded-md border border-zinc-200 p-3 text-sm"><option value="">전체</option>{Object.entries(typeNames).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="submit" className={buttonClass}>검색</button></form>
    {error && <div role="alert" className="mb-5"><p>{error}</p><button type="button" className={buttonClass} onClick={() => setRevision(value => value + 1)}>다시 시도</button></div>}
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{posts.map(post => <RecordCard key={post.id} post={post} demo={false} onSaved={(id,saved) => setPosts(previous => previous.map(row => row.id === id ? {...row,isBookmarked:saved} : row))} />)}</div>
    {loading && <p role="status" className="mt-5">기록을 불러오는 중입니다.</p>}{!loading && !error && !posts.length && <p className="text-sm text-zinc-500">{search || type ? '검색 조건에 맞는 기록이 없습니다.' : '아직 공개한 기록이 없습니다.'}</p>}{!loading && more && !error && <button type="button" className={`${buttonClass} mt-5`} onClick={() => setOffset(value => value + 20)}>더 보기</button>}
  </main>;
}
