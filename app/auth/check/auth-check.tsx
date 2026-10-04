"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { browserAuth, loginWithGitHub, profileRequest } from "../../../lib/browser-auth.ts";
import DraftCheck from "./draft-check.tsx";
import ArchiveCheck from "./archive-check.tsx";
import CollectionCheck from "./collection-check.tsx";
import LinkCheck from "./link-check.tsx";
import GitHubImportCheck from "./github-import-check.tsx";
import ImageCheck from "./image-check.tsx";

type Profile = { id: string; handle: string; nickname: string; major: string; interests: string; bio: string };

export default function AuthCheck() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [handle, setHandle] = useState("");
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [ready, setReady] = useState(false);
  const [recordsEpoch, setRecordsEpoch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("로그인 상태 확인 중");

  useEffect(() => {
    const auth = browserAuth().auth;
    const { data: listener } = auth.onAuthStateChange((_event, current) => { setSession(current); });
    let active = true;
    void auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
      setMessage(error ? "로그인 상태 확인에 실패했습니다." : data.session ? "로그인 상태 확인 완료" : "로그인하지 않은 상태입니다.");
      if (new URLSearchParams(window.location.search).has("error")) {
        setMessage("GitHub 로그인이 취소되었거나 실패했습니다. 다시 시도해주세요.");
        window.history.replaceState(null, "", "/auth/check");
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!session) { setProfile(null); return; }
    let active = true;
    setBusy(true);
    void profileRequest("/api/me").then((data) => {
      if (!active) return;
      setProfile(data.profile);
      setHandle(data.profile?.handle ?? "");
      setNickname(data.profile?.nickname ?? "");
      setBio(data.profile?.bio ?? "");
      setMessage(data.needs_profile ? "로그인 성공 — 프로필 등록이 필요합니다." : "로그인 성공 — 기존 프로필 조회 완료");
    }).catch((error: Error) => { if (active) setMessage(error.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [ready, session]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await profileRequest("/api/profiles", profile ? "PATCH" : "POST", { handle, nickname, bio });
      setProfile(data);
      setHandle(data.handle);
      setNickname(data.nickname);
      setBio(data.bio);
      setMessage(profile ? "프로필 수정 성공" : "프로필 등록 성공");
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장 요청 실패"); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    const { error } = await browserAuth().auth.signOut({ scope: "local" });
    if (error) setMessage("로그아웃에 실패했습니다. 다시 시도해주세요.");
    else { setSession(null); setProfile(null); setHandle(""); setNickname(""); setBio(""); setMessage("로그아웃 완료"); }
    setBusy(false);
  }

  return <main>
    <h1>GitHub 로그인·프로필 API 검증</h1>
    <p>개발 환경 전용 임시 화면입니다. 서비스 UI 디자인은 이후 진행합니다.</p>
    <p role="status">{message}</p>
    {!session ? <button disabled={!ready || busy} onClick={() => {
      setBusy(true);
      void loginWithGitHub().catch((error: Error) => { setMessage(error.message); setBusy(false); });
    }}>GitHub로 로그인</button> : <>
      <button disabled={busy} onClick={() => { void logout(); }}>로그아웃</button>
      <form onSubmit={(event) => { void save(event); }}>
        <p><label>개인 주소 <input required value={handle} onChange={(event) => setHandle(event.target.value)} /></label></p>
        <p><label>닉네임 <input required value={nickname} onChange={(event) => setNickname(event.target.value)} /></label></p>
        <p><label>짧은 소개 <input value={bio} onChange={(event) => setBio(event.target.value)} /></label></p>
        <button disabled={busy}>{profile ? "프로필 수정" : "프로필 등록"}</button>
      </form>
      {profile && <p>저장된 프로필: <a href={`/api/profiles/${profile.handle}`}>{profile.nickname} / {profile.handle}</a></p>}
      {profile && <DraftCheck key={`${profile.id}-${recordsEpoch}`} />}
      {profile && <ArchiveCheck key={profile.id} onChange={() => setRecordsEpoch((value) => value + 1)} />}
      {profile && <CollectionCheck key={`collections-${profile.id}`} owner={profile.id} />}
      {profile && <LinkCheck key={`links-${profile.id}`} />}
      {profile && <GitHubImportCheck key={`github-import-${profile.id}`} />}
      {profile && <ImageCheck key={`images-${profile.id}`} />}
    </>}
  </main>;
}
