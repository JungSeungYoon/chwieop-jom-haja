"use client";
import { useState } from "react";
import { profileRequest } from "../../../lib/browser-auth.ts";

type Item = { id: string; title: string; excerpt: string; state?: string; draft_version?: number; record_version?: number };

export default function ArchiveCheck({ onChange }: { onChange: () => void }) {
  const [scope, setScope] = useState("mine");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [tags, setTags] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [pending, setPending] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("조건을 입력하고 검색해주세요.");

  async function search() {
    setBusy(true); setPending(null); setMessage("검색 중");
    try {
      const params = new URLSearchParams({ q: query });
      if (kind) params.set("type", kind);
      for (const tag of tags.split(",").map((tag) => tag.trim()).filter(Boolean)) params.append("tag", tag);
      if (scope === "trash") params.set("state", "deleted");
      let data: Item[];
      if (scope === "public") {
        const response = await fetch(`/api/records?${params}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error.message);
        data = result.data;
      } else data = await profileRequest(`/api/archive?${params}`);
      setItems(data); setMessage(data.length ? `검색 성공 · ${data.length}개 (최대 20개)` : "검색 결과가 없습니다.");
    } catch (error) { setItems([]); setMessage(error instanceof Error ? error.message : "검색 요청 실패"); }
    finally { setBusy(false); }
  }

  async function change(item: Item, restore: boolean) {
    setBusy(true);
    try {
      await profileRequest(`/api/drafts/${item.id}${restore ? "/restore" : ""}`, restore ? "POST" : "DELETE", {
        draft_version: item.draft_version, record_version: item.record_version,
      });
      setItems((current) => current.filter((row) => row.id !== item.id)); setPending(null);
      setMessage(restore ? "복원 성공 — 발행본은 비공개로 복원됩니다. 내 아카이브에서 확인해주세요." : "삭제 성공 — 초안과 발행본을 휴지통으로 이동했습니다.");
      onChange();
    } catch (error) { setMessage(error instanceof Error ? error.message : "변경 요청 실패 — 목록은 유지됩니다."); }
    finally { setBusy(false); }
  }

  return <section>
    <h2>목록·검색·휴지통 API 검증</h2>
    <p>개발용 수동 검증 화면입니다. 내 아카이브 검색은 최신 편집 초안 기준입니다.</p>
    <p role="status">{message}</p>
    <fieldset disabled={busy}>
      <label>검색 범위 <select value={scope} onChange={(event) => { setScope(event.target.value); setItems([]); setPending(null); }}><option value="mine">내 아카이브</option><option value="public">공개 글</option><option value="trash">내 휴지통</option></select></label>{" "}
      <label>유형 필터 <select value={kind} onChange={(event) => setKind(event.target.value)}><option value="">전체</option><option value="project">프로젝트</option><option value="study">공부 기록</option><option value="other">기타</option></select></label>
      <p><label>검색어 <input value={query} onChange={(event) => setQuery(event.target.value)} /></label></p>
      <p><label>태그 필터 (쉼표 구분) <input value={tags} onChange={(event) => setTags(event.target.value)} /></label></p>
      <button onClick={() => { void search(); }}>목록 검색</button>
      <ul>{items.map((item) => <li key={item.id}>
        <strong>{item.title || "제목 없는 기록"}</strong> / {item.state ?? "public"}<p>{item.excerpt}</p>
        {scope !== "public" && <button onClick={() => {
          if (scope === "trash") void change(item, true); else setPending(item);
        }}>{scope === "trash" ? "기록 복원" : "휴지통으로 이동"}</button>}
      </li>)}</ul>
      {pending && <div><p>‘{pending.title || "제목 없는 기록"}’의 초안과 발행본을 휴지통으로 이동할까요? 복원할 수 있으며 발행본은 비공개로 복원됩니다.</p><button onClick={() => { void change(pending, false); }}>삭제 확인</button>{" "}<button onClick={() => setPending(null)}>삭제 취소</button></div>}
    </fieldset>
  </section>;
}
