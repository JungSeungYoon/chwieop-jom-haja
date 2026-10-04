"use client";
import { useState } from "react";
import { profileRequest } from "../../../lib/browser-auth.ts";

type Item = { id: string; title: string; sort_order?: number };
export default function CollectionCheck({ owner }: { owner: string }) {
  const [pins, setPins] = useState<Item[]>([]);
  const [available, setAvailable] = useState<Item[]>([]);
  const [bookmarks, setBookmarks] = useState<Item[]>([]);
  const [recordId, setRecordId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("목록을 조회해주세요.");

  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage("요청 중");
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "요청 실패"); }
    finally { setBusy(false); }
  }
  async function load() {
    const [pinned, saved] = await Promise.all([profileRequest("/api/pins"), profileRequest("/api/bookmarks")]);
    const response = await fetch(`/api/records?owner=${owner}&type=project`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error.message);
    setPins(pinned); setBookmarks(saved); setAvailable(result.data); setLoaded(true);
    setMessage(`조회 성공 · 핀 ${pinned.length}개 · 보관 ${saved.length}개`);
  }
  async function replace(ids: string[]) {
    const data = await profileRequest("/api/pins", "PUT", { record_ids: ids });
    setPins(data); setMessage(`핀 순서 저장 성공 · ${data.length}개`);
  }
  async function bookmark(id: string, saved: boolean) {
    await profileRequest(`/api/bookmarks/${id}`, saved ? "PUT" : "DELETE");
    setBookmarks(await profileRequest("/api/bookmarks"));
    setMessage(saved ? "보관 성공" : "보관 해제 성공");
  }
  return <section>
    <h2>대표 프로젝트 핀·보관함 API 검증</h2>
    <p>개발용 수동 검증 도구입니다. 목록은 최대 20개까지 확인합니다.</p>
    <p role="status">{message}</p>
    <fieldset disabled={busy}>
      <button onClick={() => { void run(load); }}>핀·보관함 새로 조회</button>
      <h3>저장된 핀 순서</h3>
      {loaded && pins.length === 0 && <p>고정한 프로젝트가 없습니다.</p>}
      <ol>{pins.map((item, index) => <li key={item.id}>{item.title} / 순서 {item.sort_order}
        {index > 0 && <button onClick={() => { const ids = pins.map((row) => row.id); [ids[index-1],ids[index]] = [ids[index],ids[index-1]]; void run(() => replace(ids)); }}>위로</button>}
        <button onClick={() => { void run(() => replace(pins.filter((row) => row.id !== item.id).map((row) => row.id))); }}>핀 해제</button>
      </li>)}</ol>
      <h3>내 공개 프로젝트</h3>
      {loaded && available.length === 0 && <p>고정할 공개 프로젝트가 없습니다.</p>}
      <ul>{available.map((item) => <li key={item.id}>{item.title}<p>기록 ID: {item.id}</p>
        <button disabled={pins.some((row) => row.id === item.id)} onClick={() => { void run(() => replace([...pins.map((row) => row.id),item.id])); }}>핀 추가</button>
      </li>)}</ul>
      <h3>내 보관함</h3>
      <p><label>보관할 공개 기록 ID <input value={recordId} onChange={(event) => setRecordId(event.target.value)} /></label></p>
      <button onClick={() => { void run(() => bookmark(recordId.trim(),true)); }}>공개 기록 보관</button>
      {loaded && bookmarks.length === 0 && <p>보관한 공개 기록이 없습니다.</p>}
      <ul>{bookmarks.map((item) => <li key={item.id}>{item.title}<button onClick={() => { void run(() => bookmark(item.id,false)); }}>보관 해제</button></li>)}</ul>
    </fieldset>
  </section>;
}
