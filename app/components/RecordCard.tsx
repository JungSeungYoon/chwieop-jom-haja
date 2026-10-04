import Link from "next/link";
import { Pin, ArrowUpRight, Link2 } from "lucide-react";
import { formatDate, typeNames, type FeedPost } from "../../lib/explore-data.ts";
import BookmarkButton from "./BookmarkButton.tsx";

export const badgeClass = "rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-xs text-zinc-500";
export default function RecordCard({ post, demo, onSaved }: { post: FeedPost; demo: boolean; onSaved: (id: string, saved: boolean) => void }) {
  return <article className="flex min-h-72 min-w-0 flex-col rounded-md border border-zinc-200 bg-white p-6 transition-colors hover:border-zinc-400">
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className={badgeClass}>{typeNames[post.type]}</span>
      {post.isPinned && <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium tracking-wide text-zinc-700"><Pin className="h-4 w-4" /> PINNED</span>}
    </div>
    <h2 className="text-base font-semibold leading-7 text-zinc-900"><Link className="group inline-flex items-start gap-2 break-words" href={`/records/${post.id}${demo ? "?demo=1" : ""}`}>
      {post.title}<ArrowUpRight className="mt-1.5 h-4 w-4 shrink-0 text-zinc-400 transition-colors group-hover:text-zinc-900" />
    </Link></h2>
    <p className="mt-3 line-clamp-2 break-words text-sm leading-6 text-zinc-600">{post.summary || "본문 요약이 없습니다."}</p>
    {post.type === "project" && post.linkedStudyCount !== undefined && post.linkedStudyCount > 0 && <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500"><Link2 className="h-4 w-4" /> 연결된 공부 기록 {post.linkedStudyCount}개</p>}
    <div className="mb-6 mt-5 flex flex-wrap gap-1.5">{post.tags.filter(Boolean).map(tag => <span className={`${badgeClass} max-w-full break-all`} key={tag}>{tag}</span>)}</div>
    <div className="mt-auto flex items-end justify-between gap-2 border-t border-zinc-100 pt-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-xs text-zinc-600">{Array.from(post.author.nickname)[0]}</span>
        <div className="min-w-0"><p className="truncate text-xs font-medium text-zinc-700">{post.author.nickname}</p><time className="font-mono text-[10px] text-zinc-500" dateTime={post.createdAt}>{formatDate(post.createdAt)}</time></div>
      </div>
      <BookmarkButton post={post} demo={demo} onSaved={onSaved} />
    </div>
  </article>;
}
