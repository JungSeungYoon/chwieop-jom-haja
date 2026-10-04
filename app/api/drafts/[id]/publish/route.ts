import { authenticate, json, readJson, withApi } from "../../../../../lib/api.ts";
import { draftId } from "../../../../../lib/draft.ts";
import { parsePublication, recordMutationError } from "../../../../../lib/record.ts";
import { cleanupDraftImages } from "../../../../../lib/image.ts";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withApi(async () => {
    const { client } = await authenticate(request);
    const id = draftId((await context.params).id);
    const input = parsePublication(await readJson(request));
    const { data, error } = await client.rpc("apply_record", { p_draft_id: id, ...input }).single();
    if (error) recordMutationError(error);
    const image_cleanup_pending = await cleanupDraftImages(client,id);
    return json({ data, image_cleanup_pending }, input.p_record_version === 0 ? 201 : 200);
  });
}
