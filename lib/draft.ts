import { ApiError } from "./profile.ts";

export const draftFields = "id,owner_id,record_type,title,body,details,tags,version,created_at,updated_at";
export const detailKeys: Record<"project" | "study" | "other", string[]> = {
  project: ["intro", "goal", "role", "tools", "troubleshooting", "result"],
  study: ["topic", "resources", "learned", "practice", "questions"],
  other: [],
};
export type DraftType = keyof typeof detailKeys;
export type DraftContent = { record_type: DraftType; title: string; body: string; details: Record<string, string>; tags: string[] };
export type Draft = DraftContent & { id: string; owner_id: string; version: number; created_at: string; updated_at: string };

function invalid(message: string): never { throw new ApiError(400, "INVALID_INPUT", message); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("JSON 객체로 입력해주세요.");
  return value as Record<string, unknown>;
}
function text(value: unknown, limit: number, multiline = false): string {
  if (typeof value !== "string") invalid("글 항목은 문자열로 입력해주세요.");
  const result = multiline ? value : value.trim();
  if (Array.from(result).length > limit || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /\p{Cc}/u).test(result)) {
    invalid("글 항목의 길이 또는 문자를 확인해주세요.");
  }
  return result;
}
export function draftId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) invalid("초안 ID 형식을 확인해주세요.");
  return value;
}
export function parseDraft(value: unknown, update = false): DraftContent & { version?: number } {
  const input = object(value);
  const allowed = ["record_type", "title", "body", "details", "tags", ...(update ? ["version"] : [])];
  if (Object.keys(input).some((key) => !allowed.includes(key))) invalid("허용되지 않은 글 항목입니다.");
  if (typeof input.record_type !== "string" || !Object.hasOwn(detailKeys, input.record_type)) invalid("프로젝트·공부 기록·기타 중 글 종류를 선택해주세요.");
  const record_type = input.record_type as DraftType;
  const details: Record<string, string> = {};
  for (const [key, raw] of Object.entries(object(input.details === undefined ? {} : input.details))) {
    if (!detailKeys[record_type].includes(key)) invalid("글 종류에 맞는 안내 항목을 입력해주세요.");
    details[key] = text(raw, 5000, true);
  }
  const rawTags = input.tags === undefined ? [] : input.tags;
  if (!Array.isArray(rawTags) || rawTags.length > 10) invalid("태그는 최대 10개까지 입력해주세요.");
  const tags = [...new Set(rawTags.map((raw) => {
    const tag = text(raw, 30);
    if (!tag) invalid("빈 태그는 사용할 수 없습니다.");
    return tag;
  }))];
  const output: DraftContent & { version?: number } = {
    record_type, title: text(input.title === undefined ? "" : input.title, 200), body: text(input.body === undefined ? "" : input.body, 100000, true), details, tags,
  };
  if (update) {
    if (!Number.isSafeInteger(input.version) || Number(input.version) < 1 || Number(input.version) >= 2147483647) invalid("저장된 초안의 버전이 필요합니다.");
    output.version = input.version as number;
  }
  return output;
}
