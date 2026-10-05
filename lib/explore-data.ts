import { ApiRequestError } from "./browser-auth.ts";

export type RecordType = "project" | "study" | "other";
export type FeedPost = {
  id: string; ownerId: string; title: string; summary: string; type: RecordType;
  visibility: "public" | "private"; tags: string[]; createdAt: string; updatedAt: string;
  author: { handle: string; nickname: string }; isPinned: boolean; isBookmarked: boolean;
  linkedStudyCount?: number;
};
export type FeedQuery = { query: string; type: "" | RecordType; tags: string[] };
export const emptyQuery: FeedQuery = { query: "", type: "", tags: [] };
export const typeNames = { project: "프로젝트", study: "공부 기록", other: "기타" };
export const demoBookmarkKey = "chwieop-jom-haja:demo:bookmarks:v1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("응답 형식을 확인하지 못했습니다.");
  return value as Record<string, unknown>;
}
function string(value: unknown): string { if (typeof value !== "string") throw new Error("응답 형식을 확인하지 못했습니다."); return value; }
function date(value: unknown): string { const result = string(value); if (!Number.isFinite(Date.parse(result))) throw new Error("날짜 응답을 확인하지 못했습니다."); return result; }
export function parseFeedPost(value: unknown): FeedPost {
  const row = object(value), author = object(row.author);
  if (!uuid.test(string(row.id)) || !uuid.test(string(row.owner_id)) ||
    !["project", "study", "other"].includes(string(row.record_type)) || row.visibility !== "public" ||
    !Array.isArray(row.tags) || !row.tags.every(tag => typeof tag === "string") ||
    typeof row.is_pinned !== "boolean" || typeof row.is_bookmarked !== "boolean" ||
    (row.linked_study_count !== undefined && (!Number.isSafeInteger(row.linked_study_count) || Number(row.linked_study_count) < 0))) throw new Error("목록 응답 형식을 확인하지 못했습니다.");
  return { id: string(row.id), ownerId: string(row.owner_id), title: string(row.title).trim() || "제목 없는 기록",
    summary: string(row.excerpt).replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim(), type: row.record_type as RecordType, visibility: "public", tags: row.tags,
    createdAt: date(row.created_at), updatedAt: date(row.updated_at),
    author: { handle: string(author.handle), nickname: string(author.nickname) || "이름 없는 작성자" },
    isPinned: row.is_pinned, isBookmarked: row.is_bookmarked, linkedStudyCount: row.linked_study_count as number | undefined };
}
export function parseFeed(value: unknown) {
  const payload = object(value), page = object(payload.page);
  if (!Array.isArray(payload.data) || typeof page.has_more !== "boolean") throw new Error("목록 응답 형식을 확인하지 못했습니다.");
  return { posts: payload.data.map(parseFeedPost), hasMore: page.has_more };
}
export function formatDate(value: string) {
  if (!Number.isFinite(Date.parse(value))) return "날짜 없음";
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)?.value).join(".");
}
export async function apiRequest(path: string, token?: string, signal?: AbortSignal, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, cache: "no-store", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
  let payload: Record<string, unknown>;
  try { payload = object(await response.json()); } catch { throw new Error("서버 응답을 읽지 못했습니다. 다시 시도해주세요."); }
  if (!response.ok) {
    const error = payload.error && typeof payload.error === "object" ? object(payload.error) : {};
    throw new ApiRequestError(typeof error.message === "string" ? error.message : "요청에 실패했습니다.", response.status, typeof error.code === "string" ? error.code : undefined);
  }
  return payload;
}
export function feedPath(query: FeedQuery, offset: number) {
  const params = new URLSearchParams({ feed: "1", offset: String(offset) });
  if (query.query) params.set("q", query.query);
  if (query.type) params.set("type", query.type);
  query.tags.forEach(tag => params.append("tag", tag));
  return `/api/records?${params}`;
}
export function errorMessage(error: unknown) {
  if (error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name)) return "응답이 지연되고 있습니다. 다시 시도해주세요.";
  if (error instanceof TypeError) return "네트워크 연결을 확인하고 다시 시도해주세요.";
  return error instanceof Error ? error.message : "요청에 실패했습니다. 다시 시도해주세요.";
}

const samples: { title: string; type: RecordType; tags: string[]; body: string; name: string; handle: string }[] = [
  { title: "패킷을 따라가며 만든 네트워크 모니터", type: "project", tags: ["Python", "TCP/IP", "Wireshark"], name: "서연", handle: "seoyeon",
    body: "패킷 수집부터 이상 트래픽 탐지까지, 네트워크가 보내는 신호를 읽는 도구를 만들었습니다.\n\n문제\n실습 환경에서 반복되는 연결 오류를 재현하고 원인을 찾기 어려웠습니다.\n\n구현\nPython으로 패킷 흐름을 정리하고 TCP 상태 전이를 시각화했습니다. 수집과 분석을 분리해 같은 데이터를 반복해서 검증했습니다.\n\n배운 점\n측정 기준을 먼저 정하고 정상 트래픽과 비교하는 과정이 분석의 출발점이었습니다." },
  { title: "TCP 연결은 어떻게 시작되고 끝날까", type: "study", tags: ["TCP/IP", "Wireshark"], name: "서연", handle: "seoyeon",
    body: "3-way handshake부터 연결 종료까지 직접 캡처한 패킷으로 정리한 TCP 학습 기록입니다.\n\nSYN, ACK의 순서를 확인하고 재전송과 타임아웃이 발생하는 조건을 비교했습니다. 실제 패킷의 sequence number를 따라가며 교재 속 상태 전이와 연결했습니다." },
  { title: "권한을 먼저 설계한 팀 프로젝트 API", type: "project", tags: ["TypeScript", "Next.js", "Supabase"], name: "민준", handle: "minjun",
    body: "인증과 데이터 권한을 분리하고 RLS로 사용자별 접근을 검증한 웹 서비스입니다.\n\n내 역할\nAPI 요청과 데이터베이스 정책을 설계했습니다.\n\n검증\n본인, 다른 회원, 방문자의 요청을 나눠 검사했습니다. 실패 응답과 동시 수정 충돌을 화면에서도 구분할 수 있도록 오류 코드를 정리했습니다." },
  { title: "RLS가 지키는 데이터의 경계", type: "study", tags: ["PostgreSQL", "Supabase", "Security"], name: "민준", handle: "minjun",
    body: "클라이언트의 조건만으로 권한을 보장할 수 없는 이유와 행 수준 보안의 동작을 정리했습니다.\n\nSELECT 정책과 변경 정책을 각각 확인하고 인증된 사용자 ID를 기준으로 소유권을 검사했습니다. 허용되는 요청만큼 거부되어야 하는 요청도 중요했습니다." },
  { title: "센서 데이터로 읽는 작은 실험실", type: "project", tags: ["C++", "ESP32", "MQTT"], name: "지우", handle: "jiwoo",
    body: "ESP32에서 수집한 온습도 데이터를 MQTT로 전송하고 측정 결과를 기록하는 프로젝트입니다.\n\n연결이 끊겼을 때 재접속하고 누락 구간을 표시했습니다. 센서 측정값과 기준 장비를 비교해 오차를 확인했습니다." },
  { title: "신호와 잡음 사이에서 찾은 기준", type: "study", tags: ["MATLAB", "Signal"], name: "지우", handle: "jiwoo",
    body: "샘플링 주파수와 필터 조건에 따라 신호가 달라지는 과정을 비교한 실습 기록입니다.\n\n같은 입력에 여러 필터를 적용하고 시간 영역과 주파수 영역을 함께 확인했습니다. 보기 좋은 그래프보다 재현 가능한 설정을 남기는 데 집중했습니다." },
  { title: "보안 로그를 모아 사건의 흐름 읽기", type: "project", tags: ["Linux", "Python", "Security"], name: "도윤", handle: "doyun",
    body: "서로 다른 형식의 로그를 시간순으로 모으고 반복되는 인증 실패를 찾는 분석 도구입니다.\n\n개인정보를 제외한 테스트 로그로 파서와 탐지 조건을 검증했습니다. 탐지 결과에는 근거가 된 이벤트를 함께 남겼습니다." },
  { title: "프로젝트 회고에 남겨야 할 것들", type: "other", tags: ["회고", "협업"], name: "도윤", handle: "doyun",
    body: "잘한 일보다 다음 작업에서 바꿀 행동을 구체적으로 남기기 위한 회고 기록입니다.\n\n문제, 선택, 결과를 순서대로 정리하고 내 역할을 설명할 수 있는 근거를 모았습니다. 작은 실패도 기록해두면 다음 설계의 기준이 됩니다." },
];
export const demoRecords = Array.from({ length: 24 }, (_, index) => {
  const sample = samples[index % samples.length], series = Math.floor(index / samples.length);
  const id = `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
  const timestamp = new Date(Date.UTC(2026, 9, 5 - index, 0)).toISOString();
  const post: FeedPost & { body: string; relatedIds: string[] } = {
    id, ownerId: `20000000-0000-4000-8000-${String(Math.floor((index % 8) / 2) + 1).padStart(12, "0")}`,
    title: sample.title + (series ? ` · ${series + 1}차 기록` : ""), summary: sample.body.split("\n")[0], type: sample.type,
    visibility: "public", tags: sample.tags, createdAt: timestamp, updatedAt: timestamp,
    author: { handle: sample.handle, nickname: sample.name }, isPinned: index === 0 || index === 2,
    isBookmarked: false, body: sample.body, relatedIds: [], linkedStudyCount: sample.type === "project" && index % 8 < 6 ? 1 : 0,
  };
  if (index % 8 < 6) post.relatedIds = [`10000000-0000-4000-8000-${String(index % 2 === 0 ? index + 2 : index).padStart(12, "0")}`];
  return post;
});
export function demoFeed(query: FeedQuery, offset: number, saved: Set<string>) {
  const text = query.query.toLowerCase();
  const records = demoRecords.filter(post => (!query.type || post.type === query.type) && query.tags.every(tag => post.tags.includes(tag)) &&
    (!text || `${post.title} ${post.body} ${post.tags.join(" ")}`.toLowerCase().includes(text)));
  return { posts: records.slice(offset, offset + 20).map(post => ({ ...post, isBookmarked: saved.has(post.id) })), hasMore: records.length > offset + 20 };
}
export function readDemoBookmarks(storage: Pick<Storage, "getItem">): Set<string> {
  const value = storage.getItem(demoBookmarkKey);
  if (!value) return new Set();
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every(id => typeof id === "string" && demoRecords.some(post => post.id === id))) throw new Error("데모 보관 데이터가 손상되었습니다. 보관 상태를 초기화해 표시합니다.");
  return new Set(parsed);
}
export async function changeBookmark(id: string, saved: boolean, token: string) {
  const result = await apiRequest(`/api/bookmarks/${id}`, token, undefined, saved ? "PUT" : "DELETE");
  const row = object(result.data);
  if (row.record_id !== id || typeof row.saved !== "boolean") throw new Error("보관 응답 형식을 확인하지 못했습니다.");
  return row.saved;
}
export async function optimisticBookmark(previous: boolean, persist: (next: boolean) => Promise<boolean>, update: (saved: boolean) => void) {
  update(!previous);
  try { const saved = await persist(!previous); update(saved); return saved; }
  catch (error) { update(previous); throw error; }
}
