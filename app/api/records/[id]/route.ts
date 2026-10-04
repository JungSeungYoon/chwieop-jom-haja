import { authenticate, databaseError, json, supabase, withApi } from "../../../../lib/api.ts";
import { draftId } from "../../../../lib/draft.ts";
import { recordFields } from "../../../../lib/record.ts";
import { ApiError } from "../../../../lib/profile.ts";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withApi(async () => {
    const client = request.headers.has("authorization") ? (await authenticate(request)).client : supabase();
    const id = draftId((await context.params).id);
    const { data, error } = await client.from("records").select(recordFields).eq("id", id).maybeSingle();
    if (error) databaseError(error);
    if (!data) throw new ApiError(404, "RECORD_NOT_FOUND", "발행 글을 찾을 수 없습니다.");
    return json({ data });
  });
}
