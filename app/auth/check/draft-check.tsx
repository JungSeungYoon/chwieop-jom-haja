"use client";

import { useEffect, useState } from "react";
import { ApiRequestError, profileRequest } from "../../../lib/browser-auth.ts";
import type { Draft, DraftType } from "../../../lib/draft.ts";
import type { RecordSnapshot } from "../../../lib/record.ts";

type Summary = Pick<Draft, "id" | "title" | "record_type" | "version">;

export default function DraftCheck() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [published, setPublished] = useState<RecordSnapshot | null>(null);
  const [items, setItems] = useState<Summary[]>([]);
  const [kind, setKind] = useState<DraftType>("project");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
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
      const [data, snapshot]: [Draft, RecordSnapshot | null] = await Promise.all([
        profileRequest(`/api/drafts/${id}`),
        profileRequest(`/api/records/${id}`).catch((error) => {
          if (error instanceof ApiRequestError && error.status === 404) return null;
          throw error;
        }),
      ]);
      setDraft(data); setKind(data.record_type); setTitle(data.title); setBody(data.body);
      setTags(data.tags.join(", "));
      setPublished(snapshot);
      setMessage(`초안 불러오기 성공 · 버전 ${data.version}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "불러오기 실패"); }
    finally { setBusy(false); }
  }

  async function publish(visibility: "public" | "private") {
    if (!draft) return;
    if (kind !== draft.record_type || title !== draft.title || body !== draft.body || JSON.stringify(inputTags()) !== JSON.stringify(draft.tags)) {
      setMessage("입력한 변경 내용을 먼저 초안으로 저장해주세요."); return;
    }
    setBusy(true);
    try {
      const data: RecordSnapshot = await profileRequest(`/api/drafts/${draft.id}/publish`, "POST", {
        draft_version: draft.version, record_version: published?.version ?? 0, visibility,
      });
      setPublished(data); setMessage(`정식 저장 성공 · ${data.visibility === "public" ? "공개" : "비공개"} · 발행 버전 ${data.version}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "정식 저장 실패"); }
    finally { setBusy(false); }
  }

  function inputTags() { return tags.split(",").map((tag) => tag.trim()).filter(Boolean); }

  async function checkVisitor() {
    if (!draft) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/records/${draft.id}`, { cache: "no-store" });
      const result = await response.json();
      setMessage(response.ok ? `방문자 조회 ${response.status} · ${result.data.visibility} · ${result.data.body}` : `방문자 조회 ${response.status} · ${result.error.code}`);
    } catch { setMessage("방문자 조회 요청 실패"); }
    finally { setBusy(false); }
  }

  async function save(stale = false) {
    setBusy(true);
    try {
      const data: Draft = await profileRequest(draft ? `/api/drafts/${draft.id}` : "/api/drafts", draft ? "PUT" : "POST", {
        record_type: kind, title, body,
        details: draft?.record_type === kind ? draft.details : {}, tags: inputTags(),
        ...(draft ? { version: stale ? Math.max(1, draft.version - 1) : draft.version } : {}),
      });
      setDraft(data);
      setTags(data.tags.join(", "));
      setItems((current) => [data, ...current.filter((item) => item.id !== data.id)]);
      setMessage(`초안 저장 성공 · 버전 ${data.version} · 본인만 조회 가능`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장 실패 — 입력은 유지됩니다."); }
    finally { setBusy(false); }
  }

  return <section>
    <h2>비공개 초안 API 검증</h2>
    <p>최종 편집기가 아닌 수동 검증 도구입니다. 자동 저장 UI는 이후 구현합니다.</p>
    <p role="status">{message}</p>
    <ul>{items.map((item) => <li key={item.id}><button disabled={busy} onClick={() => { void load(item.id); }}>{item.title || "제목 없는 초안"} / {item.record_type} / v{item.version}</button></li>)}</ul>
    <fieldset disabled={busy}>
      <p><label>글 종류 <select value={kind} onChange={(event) => setKind(event.target.value as DraftType)}><option value="project">프로젝트</option><option value="study">공부 기록</option><option value="other">기타</option></select></label></p>
      <p><label>초안 제목 <input value={title} onChange={(event) => setTitle(event.target.value)} /></label></p>
      <p><label>초안 본문 <textarea rows={6} cols={70} value={body} onChange={(event) => setBody(event.target.value)} /></label></p>
      <p><label>글 태그 (쉼표 구분) <input value={tags} onChange={(event) => setTags(event.target.value)} /></label></p>
      <button onClick={() => { void save(); }}>{draft ? "초안 수정 저장" : "새 초안 저장"}</button>{" "}
      {draft && draft.version > 1 && <button onClick={() => { void save(true); }}>이전 버전 충돌 검사</button>}
      {draft && <p>
        <button onClick={() => { void publish("public"); }}>공개 내용 적용</button>{" "}
        <button onClick={() => { void publish("private"); }}>비공개로 정식 저장</button>{" "}
        <button onClick={() => { void checkVisitor(); }}>방문자 조회 검사</button>
      </p>}
    </fieldset>
    {published && <aside><h3>마지막 정식 저장본</h3><p>{published.visibility} / 발행 v{published.version} / 초안 v{published.source_version}</p><pre>{published.body}</pre></aside>}
  </section>;
}
