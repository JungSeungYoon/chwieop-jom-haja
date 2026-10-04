import { authenticate, json, readJson, withApi } from "../../../../../lib/api.ts";
import { draftId } from "../../../../../lib/draft.ts";
import { parseLifecycle, recordMutationError } from "../../../../../lib/record.ts";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withApi(async () => {
    const { client } = await authenticate(request);
    const id = draftId((await context.params).id);
    const input = parseLifecycle(await readJson(request));
    const { data, error } = await client.rpc("set_record_deleted", { p_draft_id: id, ...input, p_deleted: false }).single();
    if (error) recordMutationError(error);
    return json({ data });
  });
}
