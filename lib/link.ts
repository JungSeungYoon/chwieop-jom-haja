import { ApiError } from "./profile.ts";
import { draftId } from "./draft.ts";
import { databaseError } from "./api.ts";

export function parseLink(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !["project_id","study_id"].includes(key))) {
    throw new ApiError(400, "INVALID_INPUT", "project_id와 study_id만 입력해주세요.");
  }
  const input = value as { project_id?: unknown; study_id?: unknown };
  if (typeof input.project_id !== "string" || typeof input.study_id !== "string") throw new ApiError(400, "INVALID_INPUT", "두 기록 ID가 필요합니다.");
  const project = draftId(input.project_id).toLowerCase(); const study = draftId(input.study_id).toLowerCase();
  if (project === study) throw new ApiError(400, "INVALID_INPUT", "서로 다른 프로젝트와 공부 기록을 선택해주세요.");
  return { p_project_id: project, p_study_id: study };
}

export function relatedOffset(url: URL) {
  const params = url.searchParams; const offset = params.get("offset") ?? "0";
  if ([...params.keys()].some((key) => key !== "offset") || params.getAll("offset").length > 1 || !/^\d{1,6}$/.test(offset)) throw new ApiError(400, "INVALID_INPUT", "offset은 0~999999 정수만 지정할 수 있습니다.");
  return Number(offset);
}

export function linkError(error: { code: string }): never {
  if (error.code === "P0002") throw new ApiError(404, "RECORD_NOT_FOUND", "접근할 수 있는 기록을 찾을 수 없습니다.");
  if (error.code === "22023") throw new ApiError(400, "INVALID_INPUT", "본인의 프로젝트와 공부 기록을 선택해주세요.");
  return databaseError(error);
}
