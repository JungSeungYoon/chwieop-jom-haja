import { ApiError } from "./profile.ts";
import { draftId } from "./draft.ts";
import { databaseError } from "./api.ts";

export function parsePins(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => key !== "record_ids")) {
    throw new ApiError(400, "INVALID_INPUT", "순서대로 record_ids 배열을 입력해주세요.");
  }
  const ids = (value as { record_ids?: unknown }).record_ids;
  if (!Array.isArray(ids) || ids.length > 3 || ids.some((id) => typeof id !== "string")) {
    throw new ApiError(400, "INVALID_INPUT", "핀은 공개 프로젝트 최대 3개까지 지정할 수 있습니다.");
  }
  const normalized = ids.map((id: string) => draftId(id).toLowerCase());
  if (new Set(normalized).size !== normalized.length) throw new ApiError(400, "INVALID_INPUT", "중복된 핀은 사용할 수 없습니다.");
  return normalized;
}

export function collectionError(error: { code: string }): never {
  if (error.code === "P0002") throw new ApiError(404, "RECORD_NOT_FOUND", "조건에 맞는 공개 기록을 찾을 수 없습니다.");
  if (error.code === "P0005") throw new ApiError(409, "PROFILE_REQUIRED", "프로필을 먼저 등록해주세요.");
  if (error.code === "22023") throw new ApiError(400, "INVALID_INPUT", "핀은 본인의 공개 프로젝트 최대 3개, 보관은 타인의 공개 기록에만 가능합니다.");
  return databaseError(error);
}
