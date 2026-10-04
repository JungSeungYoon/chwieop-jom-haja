import { ApiError } from "./profile.ts";
import { draftId, parseDraft } from "./draft.ts";

export function parseSearch(url: URL, archive = false) {
  const params = url.searchParams;
  const allowed = ["q", "type", "tag", "offset", archive ? "state" : "owner"];
  for (const key of params.keys()) {
    if (!allowed.includes(key) || (key !== "tag" && params.getAll(key).length > 1)) throw new ApiError(400, "INVALID_INPUT", "검색 조건을 확인해주세요.");
  }
  const query = (params.get("q") ?? "").trim();
  const type = params.get("type") ?? null;
  const offset = params.get("offset") ?? "0";
  if (Array.from(query).length > 100 || /\p{Cc}/u.test(query) || !/^\d{1,6}$/.test(offset)) throw new ApiError(400, "INVALID_INPUT", "검색어는 100자 이하, offset은 0~999999 정수로 입력해주세요.");
  const tags = parseDraft({ record_type: type ?? "other", tags: params.getAll("tag") }).tags;
  const common = { p_query: query, p_type: type, p_tags: tags, p_offset: Number(offset) };
  if (archive) {
    const state = params.get("state") ?? "all";
    if (!["all", "draft", "public", "private", "deleted"].includes(state)) throw new ApiError(400, "INVALID_INPUT", "아카이브 상태를 확인해주세요.");
    return { ...common, p_state: state };
  }
  const owner = params.get("owner");
  return { ...common, p_owner: owner === null ? null : draftId(owner) };
}

export function searchResult(data: unknown[] | null) {
  const rows = data ?? [];
  return { data: rows.slice(0, 20), page: { limit: 20, has_more: rows.length > 20 } };
}
