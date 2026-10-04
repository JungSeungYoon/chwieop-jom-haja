import { authenticate, databaseError, json, readJson, withApi } from "../../../../lib/api.ts";
import { draftFields, draftId, parseDraft } from "../../../../lib/draft.ts";
import { ApiError } from "../../../../lib/profile.ts";
import { parseLifecycle, recordMutationError } from "../../../../lib/record.ts";

type Context = { params: Promise<{ id: string }> };
const notFound = () => new ApiError(404, "DRAFT_NOT_FOUND", "초안을 찾을 수 없습니다.");

export async function GET(request: Request, context: Context): Promise<Response> {
  return withApi(async () => {
    const { client, user } = await authenticate(request);
    const id = draftId((await context.params).id);
    const { data, error } = await client.from("record_drafts").select(draftFields).eq("id", id).eq("owner_id", user.id).is("deleted_at", null).maybeSingle();
    if (error) databaseError(error);
    if (!data) throw notFound();
    return json({ data });
  });
}

// 저장은 콘텐츠 전체 교체다. 버전 비교와 갱신은 DB의 한 UPDATE에서 수행한다.
export async function PUT(request: Request, context: Context): Promise<Response> {
  return withApi(async () => {
    const { client, user } = await authenticate(request);
    const id = draftId((await context.params).id);
    const { version, ...content } = parseDraft(await readJson(request, 512 * 1024), true);
    const { data, error } = await client.from("record_drafts").update(content)
      .eq("id", id).eq("owner_id", user.id).eq("version", version!).is("deleted_at", null).select(draftFields).maybeSingle();
    if (error) databaseError(error);
    if (!data) {
      const current = await client.from("record_drafts").select("id").eq("id", id).eq("owner_id", user.id).is("deleted_at", null).maybeSingle();
      if (current.error) databaseError(current.error);
      if (!current.data) throw notFound();
      throw new ApiError(409, "DRAFT_VERSION_CONFLICT", "다른 요청에서 초안이 변경되었습니다. 입력을 보관하고 최신 초안을 확인해주세요.");
    }
    return json({ data });
  });
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return withApi(async () => {
    const { client } = await authenticate(request);
    const id = draftId((await context.params).id);
    const input = parseLifecycle(await readJson(request));
    const { data, error } = await client.rpc("set_record_deleted", { p_draft_id: id, ...input, p_deleted: true }).single();
    if (error) recordMutationError(error);
    return json({ data });
  });
}
