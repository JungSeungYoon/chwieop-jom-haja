"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Search, X, AlertCircle, RefreshCw, Loader2, ArrowDown } from "lucide-react";
import { apiRequest, demoFeed, emptyQuery, errorMessage, feedPath, parseFeed, readDemoBookmarks, type FeedPost, type FeedQuery, typeNames } from "../../lib/explore-data.ts";
import RecordCard, { badgeClass } from "./RecordCard.tsx";
import { buttonClass, primaryClass, useViewer } from "./ExploreShell.tsx";

export default function ExploreFeed({ demo }: { demo: boolean }) {
  const viewer = useViewer();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true), [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState(""), [moreError, setMoreError] = useState(""), [warning, setWarning] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState<FeedQuery>(emptyQuery);
  const [searchText, setSearchText] = useState(""), [tagInput, setTagInput] = useState("");
  const [refresh, setRefresh] = useState(0);
  const request = useRef<AbortController | null>(null), sequence = useRef(0), offset = useRef(0);
  const firstDemo = useRef(true), morePending = useRef(false);
  const load = useCallback(async (append = false) => {
    if (append && morePending.current) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const revision = ++sequence.current;
    const currentOffset = append ? offset.current : 0;
    morePending.current = append;
    if (append) { setMoreLoading(true); setMoreError(""); } else { setIsLoading(true); setPosts([]); setError(""); setHasMore(false); setMoreLoading(false); }
    try {
      let result: { posts: FeedPost[]; hasMore: boolean };
      if (demo) {
        if (firstDemo.current) { await new Promise(resolve => setTimeout(resolve, 1000)); firstDemo.current = false; }
        let saved = new Set<string>();
        try { saved = readDemoBookmarks(window.localStorage); setWarning(""); }
        catch { setWarning("데모 보관 데이터를 읽지 못했습니다. 초기 상태로 표시합니다. 보관 데이터 초기화로 복구할 수 있습니다."); }
        result = demoFeed(query, currentOffset, saved);
      } else result = parseFeed(await apiRequest(feedPath(query, currentOffset), viewer.token, controller.signal));
      if (controller.signal.aborted || revision !== sequence.current) return;
      setPosts(previous => append ? [...previous, ...result.posts.filter(post => !previous.some(item => item.id === post.id))] : result.posts);
      offset.current = currentOffset + 20; setHasMore(result.hasMore);
    } catch (error) {
      if (!controller.signal.aborted && revision === sequence.current) (append ? setMoreError : setError)(errorMessage(error));
    } finally {
      if (revision === sequence.current) { setIsLoading(false); setMoreLoading(false); morePending.current = false; }
    }
  }, [demo, query, viewer.token]);
  useEffect(() => {
    if (!demo && !viewer.ready) return;
    void load();
    return () => { sequence.current++; request.current?.abort(); morePending.current = false; };
  }, [load, viewer.ready, demo, refresh]);
  function submit(event: FormEvent) {
    event.preventDefault();
    const tags = [...new Set([...query.tags, ...tagInput.split(",").map(tag => tag.trim()).filter(Boolean)])];
    if (tags.length > 10 || tags.some(tag => Array.from(tag).length > 30)) { setWarning("태그는 30자 이하로 최대 10개까지 선택해주세요."); return; }
    setWarning(""); setTagInput(""); setQuery({ ...query, query: searchText.trim(), tags });
  }
  function reset() { setSearchText(""); setTagInput(""); setWarning(""); setQuery({ ...emptyQuery }); }
  const filtered = !!(query.query || query.type || query.tags.length);
  return <main id="main" className="mx-auto max-w-6xl border-x border-zinc-100 px-5 pb-4 sm:px-8">
    <section className="relative border-b border-zinc-200 py-14 sm:py-20">
      <span className="mb-5 block font-mono text-[11px] tracking-[.2em] text-zinc-500">프로젝트 · 공부 기록</span>
      <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">프로젝트와 공부 기록,<br /><span className="text-zinc-400">한곳에 모아보세요.</span></h1>
      <p className="mt-6 max-w-md text-sm leading-7 text-zinc-600 sm:text-base">진행한 프로젝트와 공부한 내용을 정리하고 공유하세요.</p>
      <div className="mt-8 flex items-center gap-2 text-xs text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-zinc-900" /> 프로젝트 · 공부 기록 · 기타</div>
    </section>
    <section aria-label="기록 탐색" className="pt-8">
      <div className="mb-5 flex items-center justify-between"><h2 className="text-sm font-semibold">다른 사람의 기록</h2><span className="font-mono text-[10px] text-zinc-500">최근 수정순</span></div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-72"><label htmlFor="search" className="mb-2 block text-xs text-zinc-600">검색어</label><div className="relative"><Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input id="search" type="search" maxLength={100} value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="제목, 본문, 기술 태그 검색" className="h-10 w-full rounded-md border border-zinc-200 py-2 pl-9 pr-3 text-sm" /></div></div>
        <div className="min-w-0 flex-1 basis-52"><label htmlFor="tag" className="mb-2 block text-xs text-zinc-600">기술 태그</label><input id="tag" value={tagInput} onChange={event => setTagInput(event.target.value)} placeholder="예: Python, Security" className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm" /></div>
        <button className={`${primaryClass} h-10`} type="submit"><Search className="h-4 w-4" />검색</button>
        <button className={`${buttonClass} h-10`} type="button" onClick={reset}>초기화</button>
      </form>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4">
        <div className="flex flex-wrap gap-1" role="group" aria-label="기록 유형 필터">{(["", "project", "study", "other"] as const).map(type => <button key={type} type="button" aria-pressed={query.type === type} onClick={() => setQuery({ ...query, type })} className={`rounded-md px-3 py-2 text-sm transition-colors ${query.type === type ? "bg-zinc-900 font-medium text-white" : "text-zinc-500 hover:bg-zinc-100"}`}>{type ? typeNames[type] : "전체"}</button>)}</div>
        {filtered && <span className="text-xs text-zinc-500">선택한 조건으로 검색 중</span>}
      </div>
      {query.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-2" aria-label="선택한 기술 태그">{query.tags.map(tag => <button type="button" className={`${badgeClass} inline-flex items-center gap-1`} key={tag} aria-label={`${tag} 태그 해제`} onClick={() => setQuery({ ...query, tags: query.tags.filter(item => item !== tag) })}>{tag}<X className="h-3 w-3" /></button>)}</div>}
      {warning && <p role="status" className="mt-4 text-sm leading-6 text-zinc-600">{warning} {demo && <button className="underline" type="button" onClick={() => { try { window.localStorage.removeItem("chwieop-jom-haja:demo:bookmarks:v1"); setWarning(""); setRefresh(value => value + 1); } catch { setWarning("브라우저 저장소를 사용할 수 없습니다."); } }}>데모 보관 데이터 초기화</button>}</p>}
      <div className="mt-6" aria-busy={isLoading || moreLoading}>
        {isLoading ? <><p className="sr-only" role="status">기록을 불러오는 중입니다.</p><div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(index => <div key={index} aria-hidden="true" className="h-72 animate-pulse rounded-md border border-zinc-200 bg-zinc-50 p-6"><div className="h-4 w-16 rounded bg-zinc-200" /><div className="mt-6 h-5 w-3/4 rounded bg-zinc-200" /><div className="mt-4 h-3 w-full rounded bg-zinc-100" /><div className="mt-2 h-3 w-5/6 rounded bg-zinc-100" /><div className="mt-12 h-6 w-24 rounded bg-zinc-200" /></div>)}</div></> : error ? <div role="alert" className="rounded-md border border-zinc-200 p-10 text-center"><AlertCircle className="mx-auto h-4 w-4 text-zinc-500" /><p className="my-4 text-sm text-zinc-600">{error}</p><button type="button" className={buttonClass} onClick={() => void load()}><RefreshCw className="h-4 w-4" />다시 시도</button>{!demo && <Link className="ml-4 text-sm text-zinc-500 underline" href="/?demo=1">데모 보기</Link>}</div> : posts.length === 0 ? <div role="status" className="rounded-md border border-dashed border-zinc-200 px-5 py-16 text-center"><Search className="mx-auto mb-4 h-4 w-4 text-zinc-400" /><p className="text-sm text-zinc-600">{filtered ? "검색 조건에 맞는 기록이 없습니다" : "아직 공개된 기록이 없습니다"}</p>{filtered && <button type="button" className={`${buttonClass} mt-5`} onClick={reset}>조건 초기화</button>}</div> : <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{posts.map(post => <RecordCard key={`${viewer.id ?? "visitor"}-${post.id}`} post={post} demo={demo} onSaved={(id, saved) => setPosts(previous => previous.map(item => item.id === id ? { ...item, isBookmarked: saved } : item))} />)}</div>}
      </div>
      {moreError && <p role="alert" className="mt-5 text-center text-sm text-red-700">{moreError}</p>}
      {!isLoading && !error && hasMore && <div className="mt-8 text-center"><button type="button" className={buttonClass} disabled={moreLoading} onClick={() => void load(true)}>{moreLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : moreError ? <RefreshCw className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}{moreLoading ? "불러오는 중" : moreError ? "추가 조회 다시 시도" : "더 보기"}</button></div>}
    </section>
  </main>;
}
