"use client";
import { useState } from "react";
import { profileRequest } from "../../../lib/browser-auth.ts";
import type { Draft } from "../../../lib/draft.ts";

export default function GitHubImportCheck() {
  const [url,setUrl] = useState(""); const [busy,setBusy] = useState(false);
  const [draft,setDraft] = useState<Draft | null>(null);
  const [message,setMessage] = useState("공개 GitHub 저장소 주소를 입력해주세요.");
  async function run() {
    setBusy(true); setMessage("GitHub 가져오는 중");
    try {
      const data: Draft = await profileRequest("/api/imports/github","POST",{ url });
      setDraft(data); setMessage("가져오기 성공 — 새 비공개 프로젝트 초안입니다. 기존 입력은 유지됩니다. 위의 초안 목록 새로 조회로 편집할 수 있습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "가져오기 실패 — 기존 초안은 유지됩니다."); }
    finally { setBusy(false); }
  }
  return <section>
    <h2>GitHub 공개 저장소 가져오기 API 검증</h2>
    <p>개발용 수동 검증 도구입니다. 원본 변경을 자동 동기화하거나 자동 공개하지 않습니다.</p>
    <p role="status">{message}</p>
    <fieldset disabled={busy}>
      <label>공개 GitHub 저장소 URL <input value={url} onChange={(event) => setUrl(event.target.value)} /></label>{" "}
      <button onClick={() => { void run(); }}>저장소에서 새 초안 만들기</button>
    </fieldset>
    {draft && <aside>
      <h3>마지막 가져오기 결과</h3>
      <p>{draft.title} / {draft.record_type} / 초안 v{draft.version}</p><p>초안 ID: {draft.id}</p>
      <p>설명: {draft.details.intro || "없음"}</p><p>언어: {draft.details.tools || "없음"}</p>
      <pre style={{ whiteSpace:"pre-wrap",maxHeight:350,overflow:"auto" }}>{draft.body}</pre>
    </aside>}
  </section>;
}
