import { ApiError } from "./profile.ts";
import { databaseError } from "./api.ts";
import type { DraftContent } from "./draft.ts";

export const recordFields = "id,owner_id,record_type,title,body,details,tags,visibility,source_version,version,created_at,updated_at";
export type RecordSnapshot = DraftContent & { id: string; owner_id: string; visibility: "public" | "private"; source_version: number; version: number; created_at: string; updated_at: string };
export function parsePublication(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "INVALID_INPUT", "발행 조건을 JSON 객체로 입력해주세요.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["draft_version", "record_version", "visibility"].includes(key)) ||
    !Number.isSafeInteger(input.draft_version) || Number(input.draft_version) < 1 || Number(input.draft_version) > 2147483647 ||
    !Number.isSafeInteger(input.record_version) || Number(input.record_version) < 0 || Number(input.record_version) >= 2147483647 ||
    (input.visibility !== "public" && input.visibility !== "private")) {
    throw new ApiError(400, "INVALID_INPUT", "초안 버전·발행 버전·공개 범위를 확인해주세요.");
  }
  return { p_draft_version: input.draft_version as number, p_record_version: input.record_version as number, p_visibility: input.visibility as "public" | "private" };
}

export function parseLifecycle(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !["draft_version", "record_version"].includes(key))) {
    throw new ApiError(400, "INVALID_INPUT", "삭제·복원할 초안과 발행본의 버전을 입력해주세요.");
  }
  const { p_draft_version, p_record_version } = parsePublication({ ...value, visibility: "private" });
  return { p_draft_version, p_record_version };
}

export function recordMutationError(error: { code: string }): never {
  if (error.code === "P0002") throw new ApiError(404, "DRAFT_NOT_FOUND", "초안을 찾을 수 없습니다.");
  if (error.code === "P0003") throw new ApiError(409, "DRAFT_VERSION_CONFLICT", "초안이 변경되었습니다. 최신 내용을 확인해주세요.");
  if (error.code === "P0004") throw new ApiError(409, "RECORD_VERSION_CONFLICT", "발행 글이 변경되었습니다. 최신 공개 범위와 버전을 확인해주세요.");
  if (error.code === "22023") throw new ApiError(400, "INVALID_INPUT", "요청 조건과 정식 저장에 필요한 제목·본문을 확인해주세요.");
  return databaseError(error);
}
