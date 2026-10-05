"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowUpRight, LogIn, Loader2 } from "lucide-react";
import { browserAuth, loginWithGitHub } from "../../lib/browser-auth.ts";
import { apiRequest, errorMessage, object } from "../../lib/explore-data.ts";

type Viewer = { ready: boolean; id?: string; token?: string; nickname?: string; handle?: string; profile: "none" | "checking" | "ready" | "missing" | "error"; refreshProfile: () => void };
const ViewerContext = createContext<Viewer>({ ready: false, profile: "none", refreshProfile: () => {} });
export const useViewer = () => useContext(ViewerContext);
export const buttonClass = "inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-50";
export const primaryClass = `${buttonClass} border-zinc-900! bg-zinc-900! text-white hover:bg-zinc-700!`;

export default function ExploreShell({ demo, children }: { demo: boolean; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(demo);
  const [profile, setProfile] = useState<Viewer["profile"]>("none");
  const [nickname, setNickname] = useState<string>(); const [handle, setHandle] = useState<string>();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [profileRevision, setProfileRevision] = useState(0);
  const profileUser = useRef<string | undefined>(undefined);
  const configured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  useEffect(() => {
    if (demo) return;
    if (!configured) { setReady(true); setNotice("Supabase 연결 설정이 필요합니다. 데모에서 화면을 살펴볼 수 있습니다."); return; }
    let active = true, revision = 0;
    const auth = browserAuth().auth;
    const { data } = auth.onAuthStateChange((_event, current) => { revision++; if (active) { setSession(current); setReady(true); } });
    const initial = revision;
    void auth.getSession().then(result => {
      // PKCE 코드 교환이 끝난 뒤에만 콜백 URL을 정리한다.
      if (active && result.data.session) {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.has("code")) { currentUrl.searchParams.delete("code"); window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.search}`); }
      }
      if (!active || revision !== initial) return;
      setSession(result.data.session); setReady(true);
      if (result.error) setNotice("로그인 상태를 확인하지 못했습니다. 다시 로그인해주세요.");
    }).catch(() => { if (active) { setReady(true); setNotice("로그인 상태를 확인하지 못했습니다."); } });
    const url = new URL(window.location.href);
    if (url.searchParams.has("error")) setNotice("GitHub 로그인이 취소되었거나 실패했습니다. 다시 시도해주세요.");
    if (url.searchParams.has("error")) {
      ["code", "error", "error_code", "error_description"].forEach(key => url.searchParams.delete(key));
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [demo, configured]);

  useEffect(() => {
    if (!session) { setProfile("none"); setNickname(undefined); setHandle(undefined); profileUser.current = undefined; return; }
    if (profileUser.current !== session.user.id) { setNickname(undefined); setHandle(undefined); setProfile("checking"); }
    profileUser.current = session.user.id;
    const controller = new AbortController();
    void apiRequest("/api/me", session.access_token, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      const data = object(result.data);
      if (data.needs_profile === true) { setProfile("missing"); setNotice("프로필을 등록하면 글 작성과 보관 기능을 사용할 수 있습니다."); }
      else {
        const profileData = object(data.profile);
        if (typeof profileData.nickname !== "string") throw new Error("프로필 응답을 확인하지 못했습니다.");
        if (typeof profileData.handle !== "string") throw new Error("개인 주소를 확인하지 못했습니다."); setHandle(profileData.handle); setNickname(profileData.nickname); setProfile("ready");
      }
    }).catch(error => { if (!controller.signal.aborted) { setProfile("error"); setNotice(errorMessage(error)); } });
    return () => controller.abort();
  }, [session?.access_token, profileRevision]);

  async function login() {
    setBusy(true); setNotice("");
    try { await loginWithGitHub("/"); } catch (error) { setNotice(errorMessage(error)); setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try {
      const { error } = await browserAuth().auth.signOut({ scope: "local" });
      if (error) throw new Error("로그아웃에 실패했습니다. 다시 시도해주세요.");
      setSession(null); setNickname(undefined); setHandle(undefined); setNotice("로그아웃했습니다.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return <ViewerContext.Provider value={{ ready, id: session?.user.id, token: session?.access_token, nickname, handle, profile, refreshProfile: () => setProfileRevision(value => value + 1) }}>
    <div className="min-h-screen bg-white font-sans">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">본문으로 건너뛰기</a>
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-6 sm:gap-10">
            <Link href={demo ? "/?demo=1" : "/"} className="text-lg font-bold tracking-tight">취업좀하자<span className="ml-0.5 text-zinc-400">.</span></Link>
            <nav aria-label="주 메뉴" className="flex flex-wrap gap-4 text-sm font-medium text-zinc-600"><Link href={demo ? "/?demo=1" : "/"} className="text-zinc-900">탐색</Link>{!demo && session && <><Link href="/archive">내 아카이브</Link><Link href="/bookmarks">보관함</Link>{handle && <Link href={`/u/${handle}`}>내 포트폴리오</Link>}<Link href="/settings/pins">대표 프로젝트</Link></>}</nav>
          </div>
          <div className="flex items-center gap-3">
            {demo ? <Link className={buttonClass} href="/?demo=0">실제 피드 <ArrowUpRight className="h-4 w-4" /></Link> : session ? <>
              <span className="max-w-28 truncate text-sm text-zinc-600">{nickname ?? "GitHub 회원"}</span>
              <Link href="/settings/profile" className="text-sm text-zinc-600">프로필</Link>
              {profile === "ready" && <Link href="/write" className={primaryClass}>글쓰기</Link>}
              <button type="button" data-leave-editor="true" className={buttonClass} disabled={busy} onClick={() => void logout()}>로그아웃</button>
            </> : <button type="button" className={primaryClass} disabled={!ready || busy || !configured} onClick={() => void login()}>
              {busy || !ready ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} GitHub 로그인
            </button>}
          </div>
        </div>
      </header>
      {demo && <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-2.5 text-center text-xs leading-5 text-zinc-600"><span className="font-semibold text-zinc-900">데모 데이터</span> · 실제 회원의 기록이 아닙니다. 보관은 이 브라우저에만 저장됩니다.</div>}
      {notice && <div role="status" className="mx-auto max-w-6xl px-5 pt-5 text-sm leading-6 text-zinc-600">{notice} {!configured && <Link className="underline" href="/?demo=1">데모 보기</Link>}</div>}
      {!demo && session && profile === "missing" && <div className="mx-auto max-w-6xl px-5 pt-3 text-sm"><Link className="underline" href="/settings/profile">프로필 등록하기</Link></div>}
      {children}
      <footer className="mt-20 border-t border-zinc-200">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-5 py-7 text-xs text-zinc-500 sm:px-8">
          <span>취업좀하자</span><span className="font-mono">프로젝트와 공부 기록을 정리하는 곳</span>
        </div>
      </footer>
    </div>
  </ViewerContext.Provider>;
}
