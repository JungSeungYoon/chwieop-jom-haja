"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import { browserAuth, loginWithGitHub } from "../../lib/browser-auth.ts";
import { changeBookmark, demoBookmarkKey, errorMessage, optimisticBookmark, readDemoBookmarks, type FeedPost } from "../../lib/explore-data.ts";
import { useViewer } from "./ExploreShell.tsx";

export default function BookmarkButton({ post, demo, onSaved }: { post: FeedPost; demo: boolean; onSaved?: (id: string, saved: boolean) => void }) {
  const viewer = useViewer();
  const [saved, setSaved] = useState(post.isBookmarked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false), scope = useRef(viewer.token), mounted = useRef(true);
  scope.current = viewer.token;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setSaved(demo || viewer.token ? post.isBookmarked : false); setError(""); }, [post.isBookmarked, demo, viewer.token]);
  const own = !demo && viewer.id === post.ownerId;
  async function toggle() {
    if (pending.current) return;
    if (!demo && !viewer.id) {
      try { await loginWithGitHub("/"); } catch (error) { setError(errorMessage(error)); }
      return;
    }
    const token = viewer.token, previous = saved, next = !saved;
    pending.current = true; setBusy(true); setError("");
    try {
      const actual = await optimisticBookmark(previous, async () => {
        if (demo) {
          const bookmarks = readDemoBookmarks(window.localStorage);
          if (next) bookmarks.add(post.id); else bookmarks.delete(post.id);
          window.localStorage.setItem(demoBookmarkKey, JSON.stringify([...bookmarks]));
          return next;
        } else {
          const { data, error } = await browserAuth().auth.getSession();
          if (error || !data.session || data.session.user.id !== viewer.id) throw new Error("로그인 상태가 바뀌었습니다. 다시 로그인해주세요.");
          return changeBookmark(post.id, next, data.session.access_token);
        }
      }, value => { if (mounted.current && scope.current === token) setSaved(value); });
      if (!mounted.current || scope.current !== token) return;
      setSaved(actual); onSaved?.(post.id, actual);
      if (process.env.NODE_ENV === "development") console.log(`[Backend Mutation] Bookmark toggled: ${post.id}`);
    } catch (error) {
      if (mounted.current && scope.current === token) { setSaved(previous); setError(demo ? "데모 보관을 저장하지 못했습니다. 브라우저 저장소 설정을 확인해주세요." : errorMessage(error)); }
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  return <div className="flex flex-col items-end gap-1">
    <button type="button" aria-label={own ? "본인 기록은 보관할 수 없습니다" : `${post.title} ${saved ? "보관 해제" : "보관"}`}
      aria-pressed={saved} title={own ? "본인 기록은 보관할 수 없습니다" : !demo && !viewer.id ? "로그인 후 보관할 수 있습니다" : !demo && viewer.profile === "missing" ? "프로필 등록 후 보관할 수 있습니다" : "기록 보관"}
      disabled={busy || own || (!demo && (!viewer.ready || (viewer.id !== undefined && viewer.profile !== "ready")))}
      className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
      onClick={event => { event.stopPropagation(); void toggle(); }}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className={`h-4 w-4 ${saved ? "fill-zinc-900 text-zinc-900" : ""}`} />}
    </button>
    {error && <p role="alert" className="max-w-60 text-right text-xs leading-5 text-red-700">{error}</p>}
  </div>;
}
