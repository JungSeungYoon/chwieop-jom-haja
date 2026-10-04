"use client";

import { useEffect, useState } from "react";
import { profileRequest } from "../../../lib/browser-auth.ts";
import type { Draft, DraftType } from "../../../lib/draft.ts";

type Summary = Pick<Draft, "id" | "title" | "record_type" | "version">;

export default function DraftCheck() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [items, setItems] = useState<Summary[]>([]);
  const [kind, setKind] = useState<DraftType>("project");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("초안 목록 확인 중");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    void profileRequest("/api/drafts").then((data) => {
      if (active) { setItems(data); setMessage(data.length ? "내 초안 목록 조회 완료" : "저장된 초안이 없습니다."); }
    }).catch((error: Error) => { if (active) setMessage(error.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function load(id: string) {
    setBusy(true);
    try {
      const data: Draft = await profileRequest(`/api/drafts/${id}`);
      setDraft(data); setKind(data.record_type); setTitle(data.title); setBody(data.body);
      setMessage(`초안 불러오기 성공 · 버전 ${data.version}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "불러오기 실패"); }
    finally { setBusy(false); }
  }

  async function save(stale = false) {
    setBusy(true);
    try {
      const data: Draft = await profileRequest(draft ? `/api/drafts/${draft.id}` : "/api/drafts", draft ? "PUT" : "POST", {
        record_type: kind, title, body,
        details: draft?.record_type === kind ? draft.details : {}, tags: draft?.tags ?? [],
        ...(draft ? { version: stale ? Math.max(1, draft.version - 1) : draft.version } : {}),
      });
      setDraft(data);
      setItems((current) => [data, ...current.filter((item) => item.id !== data.id)]);
      setMessage(`초안 저장 성공 · 버전 ${data.version} · 본인만 조회 가능`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장 실패 — 입력은 유지됩니다."); }
    finally { setBusy(false); }
  }

  return <section>
    <h2>비공개 초안 API 검증</h2>
    <p>최종 편집기가 아닌 수동 검증 도구입니다. 자동 저장·공개 발행은 이후 구현합니다.</p>
    <p role="status">{message}</p>
    <ul>{items.map((item) => <li key={item.id}><button disabled={busy} onClick={() => { void load(item.id); }}>{item.title || "제목 없는 초안"} / {item.record_type} / v{item.version}</button></li>)}</ul>
    <fieldset disabled={busy}>
      <p><label>글 종류 <select value={kind} onChange={(event) => setKind(event.target.value as DraftType)}><option value="project">프로젝트</option><option value="study">공부 기록</option><option value="other">기타</option></select></label></p>
      <p><label>초안 제목 <input value={title} onChange={(event) => setTitle(event.target.value)} /></label></p>
      <p><label>초안 본문 <textarea rows={6} cols={70} value={body} onChange={(event) => setBody(event.target.value)} /></label></p>
      <button onClick={() => { void save(); }}>{draft ? "초안 수정 저장" : "새 초안 저장"}</button>{" "}
      {draft && draft.version > 1 && <button onClick={() => { void save(true); }}>이전 버전 충돌 검사</button>}
    </fieldset>
  </section>;
}
