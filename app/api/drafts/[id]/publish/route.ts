import { authenticate, databaseError, json, readJson, withApi } from "../../../../../lib/api.ts";
import { draftId } from "../../../../../lib/draft.ts";
import { parsePublication } from "../../../../../lib/record.ts";
import { ApiError } from "../../../../../lib/profile.ts";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withApi(async () => {
    const { client } = await authenticate(request);
    const id = draftId((await context.params).id);
    const input = parsePublication(await readJson(request));
    const { data, error } = await client.rpc("apply_record", { p_draft_id: id, ...input }).single();
    if (error) {
      if (error.code === "P0002") throw new ApiError(404, "DRAFT_NOT_FOUND", "초안을 찾을 수 없습니다.");
      if (error.code === "P0003") throw new ApiError(409, "DRAFT_VERSION_CONFLICT", "초안이 변경되었습니다. 최신 내용을 확인해주세요.");
      if (error.code === "P0004") throw new ApiError(409, "RECORD_VERSION_CONFLICT", "발행 글이 변경되었습니다. 최신 공개 범위와 버전을 확인해주세요.");
      if (error.code === "22023") throw new ApiError(400, "INVALID_INPUT", "정식 저장에는 제목과 비어 있지 않은 본문이 필요합니다.");
      databaseError(error);
    }
    return json({ data }, input.p_record_version === 0 ? 201 : 200);
  });
}
