import { authenticate, json, withApi } from "../../../../lib/api.ts";
import { draftId } from "../../../../lib/draft.ts";
import { collectionError } from "../../../../lib/collection.ts";

type Context = { params: Promise<{ id: string }> };
async function change(request: Request, context: Context, saved: boolean): Promise<Response> {
  return withApi(async () => {
    const { client } = await authenticate(request);
    const id = draftId((await context.params).id);
    const { data, error } = await client.rpc("set_bookmark", { p_record_id: id, p_saved: saved });
    if (error) collectionError(error);
    return json({ data: data?.[0] });
  });
}
export async function PUT(request: Request, context: Context) { return change(request, context, true); }
export async function DELETE(request: Request, context: Context) { return change(request, context, false); }
