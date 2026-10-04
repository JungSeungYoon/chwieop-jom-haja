"use client";
import { useState } from "react";
import { profileRequest } from "../../../lib/browser-auth.ts";

type Item = { id: string; record_type: string; title: string; state?: string };
export default function LinkCheck() {
  const [candidates,setCandidates] = useState<Item[]>([]);
  const [project,setProject] = useState(""); const [study,setStudy] = useState("");
  const [source,setSource] = useState(""); const [scope,setScope] = useState("mine");
  const [items,setItems] = useState<Item[]>([]); const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("내 연결 후보를 조회해주세요.");
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage("요청 중");
    try { await action(); } catch (error) { setItems([]); setMessage(error instanceof Error ? error.message : "요청 실패"); }
    finally { setBusy(false); }
  }
  async function loadCandidates() {
    const data: Item[] = await profileRequest("/api/archive");
    const eligible = data.filter((row) => ["project","study"].includes(row.record_type));
    const p = eligible.find((row) => row.record_type === "project")?.id ?? "";
    setCandidates(eligible); setProject(p); setStudy(eligible.find((row) => row.record_type === "study")?.id ?? "");
    setSource(p || eligible[0]?.id || ""); setItems([]); setMessage("후보 조회 성공 · 최신 초안 기준 (최대 20개)");
  }
  async function related() {
    let data: Item[];
    if (scope === "mine") data = await profileRequest(`/api/drafts/${source}/related`);
    else {
      const response = await fetch(`/api/records/${source}/related`,{ cache:"no-store" }); const result = await response.json();
      if (!response.ok) throw new Error(result.error.message);
      data = result.data;
    }
    setItems(data); setMessage(data.length ? `관련 기록 조회 성공 · ${data.length}개` : "관련 기록이 없습니다.");
  }
  async function change(linked: boolean) {
    await profileRequest("/api/links",linked ? "PUT" : "DELETE",{ project_id:project,study_id:study });
    setItems([]); setMessage(linked ? "연결 저장 성공 — 양쪽 상세에서 조회할 수 있습니다." : "연결 해제 성공");
  }
  const options = (type?: string) => candidates.filter((item) => !type || item.record_type===type).map((item) => <option key={item.id} value={item.id}>{item.title || "제목 없는 기록"} / {item.record_type} / {item.state}</option>);
  return <section>
    <h2>프로젝트–공부 기록 연결 API 검증</h2>
    <p>개발용 수동 검증 도구입니다. 본인 조회는 최신 초안, 공개 조회는 마지막 발행본 기준입니다.</p>
    <p role="status">{message}</p>
    <fieldset disabled={busy}>
      <button onClick={() => { void run(loadCandidates); }}>내 연결 후보 조회</button>
      <p><label>연결할 프로젝트 <select value={project} onChange={(event) => setProject(event.target.value)}><option value="">선택</option>{options("project")}</select></label></p>
      <p><label>연결할 공부 기록 <select value={study} onChange={(event) => setStudy(event.target.value)}><option value="">선택</option>{options("study")}</select></label></p>
      <button disabled={!project || !study} onClick={() => { void run(() => change(true)); }}>기록 연결</button>{" "}
      <button disabled={!project || !study} onClick={() => { void run(() => change(false)); }}>기록 연결 해제</button>
      <p><label>관련 기록의 기준 글 <select value={source} onChange={(event) => { setSource(event.target.value); setItems([]); }}><option value="">선택</option>{options()}</select></label></p>
      <p><label>관련 기록 조회 범위 <select value={scope} onChange={(event) => { setScope(event.target.value); setItems([]); }}><option value="mine">본인 관리</option><option value="public">로그인 없는 방문자</option></select></label></p>
      <button disabled={!source} onClick={() => { void run(related); }}>관련 기록 조회</button>
      <ul>{items.map((item) => <li key={item.id}>{item.title || "제목 없는 기록"} / {item.record_type} / {item.state ?? "public"}</li>)}</ul>
    </fieldset>
  </section>;
}
