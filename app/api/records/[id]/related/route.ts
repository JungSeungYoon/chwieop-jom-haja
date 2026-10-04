import { json, supabase, withApi } from "../../../../../lib/api.ts";
import { draftId } from "../../../../../lib/draft.ts";
import { linkError, relatedOffset } from "../../../../../lib/link.ts";
import { searchResult } from "../../../../../lib/search.ts";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withApi(async () => {
    const id = draftId((await context.params).id); const offset = relatedOffset(new URL(request.url));
    const { data, error } = await supabase().rpc("list_public_related", { p_record_id: id, p_offset: offset });
    if (error) linkError(error);
    return json(searchResult(data));
  });
}
