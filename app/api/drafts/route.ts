import { authenticate, databaseError, json, readJson, withApi } from "../../../lib/api.ts";
import { draftFields, parseDraft } from "../../../lib/draft.ts";
import { ApiError } from "../../../lib/profile.ts";

export async function POST(request: Request): Promise<Response> {
  return withApi(async () => {
    const { client, user } = await authenticate(request);
    const input = parseDraft(await readJson(request, 512 * 1024));
    const { data, error } = await client.from("record_drafts").insert({ ...input, owner_id: user.id }).select(draftFields).single();
    if (error?.code === "23503") throw new ApiError(404, "PROFILE_NOT_FOUND", "먼저 프로필을 등록해주세요.");
    if (error) databaseError(error);
    return json({ data }, 201);
  });
}

export async function GET(request: Request): Promise<Response> {
  return withApi(async () => {
    const { client, user } = await authenticate(request);
    const url = new URL(request.url);
    const offset = url.searchParams.get("offset") ?? "0";
    if (!/^\d{1,6}$/.test(offset)) throw new ApiError(400, "INVALID_INPUT", "offset은 0~999999 정수로 입력해주세요.");
    const { data, error } = await client.from("record_drafts")
      .select("id,record_type,title,tags,version,created_at,updated_at")
      .eq("owner_id", user.id).is("deleted_at", null).order("updated_at", { ascending: false }).order("id")
      .range(Number(offset), Number(offset) + 19);
    if (error) databaseError(error);
    return json({ data });
  });
}
