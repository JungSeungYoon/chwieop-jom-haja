"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, AlertCircle, RefreshCw, Pin, Link2, Loader2 } from "lucide-react";
import { apiRequest, demoRecords, errorMessage, formatDate, object, parseFeedPost, readDemoBookmarks, typeNames, type FeedPost } from "../../lib/explore-data.ts";
import { buttonClass, useViewer } from "./ExploreShell.tsx";
import { badgeClass } from "./RecordCard.tsx";
import BookmarkButton from "./BookmarkButton.tsx";
import MarkdownBody from "./MarkdownBody.tsx";

type Detail = { post: FeedPost; body: string; details: Record<string, string> };
type Related = { id: string; title: string; type: keyof typeof typeNames };
const fieldNames: Record<string, string> = { intro: "소개", goal: "목표", role: "내 역할", tools: "사용 기술", troubleshooting: "문제 해결", result: "결과", topic: "학습 주제", resources: "참고 자료", learned: "배운 내용", practice: "실습", questions: "남은 질문" };
export default function RecordDetail({ id, demo }: { id: string; demo: boolean }) {
  const viewer = useViewer();
  const [detail, setDetail] = useState<Detail | null>(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  const [related, setRelated] = useState<Related[]>([]), [relatedError, setRelatedError] = useState("");
  const [relatedMore, setRelatedMore] = useState(false), [relatedBusy, setRelatedBusy] = useState(false), [relatedOffset, setRelatedOffset] = useState(0);
  const [relatedRefresh, setRelatedRefresh] = useState(0);
  useEffect(() => {
    if (!demo && !viewer.ready) return;
    const controller = new AbortController(); setLoading(true); setDetail(null); setError(""); setRelated([]); setRelatedOffset(0);
    void (async () => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("기록을 찾을 수 없습니다.");
      if (demo) {
        const sample = demoRecords.find(post => post.id === id);
        if (!sample) throw new Error("데모 기록을 찾을 수 없습니다.");
        let bookmarked = false;
        try { bookmarked = readDemoBookmarks(window.localStorage).has(id); } catch { setRelatedError("데모 보관 상태를 읽지 못했습니다. 탐색 화면에서 데모 보관 데이터를 초기화해주세요."); }
        return { post: { ...sample, isBookmarked: bookmarked }, body: sample.body, details: {} };
      }
      const result = await apiRequest(`/api/records/${id}?feed=1`, viewer.token, controller.signal);
      const row = object(result.data);
      if (row.visibility !== "public") throw new Error("이 기록은 공개된 탐색 기록이 아닙니다.");
      if (typeof row.body !== "string") throw new Error("기록 본문을 확인하지 못했습니다.");
      const fields = object(row.details);
      if (!Object.values(fields).every(value => typeof value === "string")) throw new Error("기록 항목을 확인하지 못했습니다.");
      return { post: parseFeedPost(row), body: row.body, details: fields as Record<string, string> };
    })().then(result => { if (!controller.signal.aborted) setDetail(result); }).catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, demo, viewer.ready, viewer.token, refresh]);
  useEffect(() => {
    if (!detail) return;
    const controller = new AbortController(); setRelatedBusy(true); setRelatedError("");
    void (async () => {
      if (demo) return { data: (demoRecords.find(post => post.id === id)?.relatedIds ?? []).map(id => {
        const post = demoRecords.find(post => post.id === id)!; return { id, title: post.title, record_type: post.type };
      }), page: { has_more: false } };
      return apiRequest(`/api/records/${id}/related?offset=${relatedOffset}`, undefined, controller.signal);
    })().then(result => {
      if (controller.signal.aborted) return;
      const page = object(result.page);
      if (!Array.isArray(result.data) || typeof page.has_more !== "boolean") throw new Error("관련 기록 응답을 확인하지 못했습니다.");
      const rows = result.data.map(value => { const row = object(value);
        if (typeof row.id !== "string" || !/^[0-9a-f-]{36}$/i.test(row.id) || typeof row.title !== "string" || !Object.hasOwn(typeNames, String(row.record_type))) throw new Error("관련 기록 응답을 확인하지 못했습니다.");
        return { id: row.id, title: row.title, type: row.record_type as Related["type"] };
      });
      setRelated(previous => relatedOffset ? [...previous, ...rows.filter(row => !previous.some(item => item.id === row.id))] : rows); setRelatedMore(page.has_more);
    }).catch(error => { if (!controller.signal.aborted) setRelatedError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setRelatedBusy(false); });
    return () => controller.abort();
  }, [detail?.post.id, demo, id, relatedOffset, relatedRefresh]);

  return <main id="main" className="mx-auto min-h-[60vh] max-w-3xl px-5 pt-10 sm:px-8">
    <Link className="mb-10 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900" href={demo ? "/?demo=1" : "/"}><ArrowLeft className="h-4 w-4" />탐색으로 돌아가기</Link>
    {loading ? <div role="status"><span className="sr-only">기록을 불러오는 중입니다.</span><div className="h-9 w-3/4 animate-pulse rounded bg-zinc-100" /><div className="mt-8 h-60 animate-pulse rounded-md border border-zinc-200 bg-zinc-50" /></div> : error ? <div className="rounded-md border border-zinc-200 p-8" role="alert"><AlertCircle className="mb-4 h-4 w-4" /><p className="mb-5 text-sm text-zinc-600">{error}</p><button className={buttonClass} type="button" onClick={() => setRefresh(value => value + 1)}><RefreshCw className="h-4 w-4" />다시 시도</button></div> : detail && <>
      <div className="mb-5 flex items-center gap-2"><span className={badgeClass}>{typeNames[detail.post.type]}</span>{detail.post.isPinned && <span className="flex items-center gap-1 font-mono text-xs text-zinc-500"><Pin className="h-4 w-4" />PINNED</span>}</div>
      <h1 className="break-words text-3xl font-semibold leading-snug tracking-tight text-zinc-900 sm:text-4xl">{detail.post.title}</h1>
      <div className="my-7 flex items-center justify-between gap-3 border-b border-zinc-200 pb-6"><div className="text-sm text-zinc-600">{detail.post.author.nickname}<span className="mx-3 text-zinc-300">/</span><time className="font-mono text-xs" dateTime={detail.post.createdAt}>{formatDate(detail.post.createdAt)}</time></div><BookmarkButton post={detail.post} demo={demo} onSaved={(_id, saved) => setDetail(previous => previous ? { ...previous, post: { ...previous.post, isBookmarked: saved } } : previous)} /></div>
      <div className="mb-8 flex flex-wrap gap-2">{detail.post.tags.map(tag => <span key={tag} className={badgeClass}>{tag}</span>)}</div>
      {Object.entries(detail.details).filter(([, value]) => value.trim()).map(([key, value]) => <section key={key} className="mb-7 rounded-md border border-zinc-200 p-5"><h2 className="mb-3 text-sm font-semibold">{fieldNames[key] ?? key}</h2><p className="whitespace-pre-wrap break-words text-sm leading-7 text-zinc-600">{value}</p></section>)}
      <article aria-label="기록 본문" className="break-words"><MarkdownBody body={detail.body} /></article>
      <section className="mt-12 border-t border-zinc-200 pt-7"><h2 className="mb-5 flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" />연결된 기록</h2>
        {related.map(row => <Link key={row.id} href={`/records/${row.id}${demo ? "?demo=1" : ""}`} className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-zinc-200 p-4 text-sm hover:border-zinc-400"><span className={badgeClass}>{typeNames[row.type]}</span>{row.title}</Link>)}
        {!related.length && !relatedBusy && !relatedError && <p className="text-sm text-zinc-500">공개된 연결 기록이 없습니다.</p>}
        {relatedBusy && <p role="status" className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />관련 기록을 불러오는 중입니다.</p>}
        {relatedError && <div role="alert"><p className="my-3 text-sm text-zinc-600">{relatedError}</p><button type="button" className={buttonClass} onClick={() => setRelatedRefresh(value => value + 1)}>관련 기록 다시 시도</button></div>}
        {relatedMore && !relatedError && <button type="button" disabled={relatedBusy} className={`${buttonClass} mt-3`} onClick={() => setRelatedOffset(value => value + 20)}>관련 기록 더 보기</button>}
      </section>
    </>}
  </main>;
}
