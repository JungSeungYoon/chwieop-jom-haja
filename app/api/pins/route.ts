import { authenticate, json, readJson, supabase, withApi } from "../../../lib/api.ts";
import { draftId } from "../../../lib/draft.ts";
import { ApiError } from "../../../lib/profile.ts";
import { collectionError, parsePins } from "../../../lib/collection.ts";

export async function GET(request: Request): Promise<Response> {
  return withApi(async () => {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => key !== "owner") || params.getAll("owner").length > 1) throw new ApiError(400, "INVALID_INPUT", "owner만 지정할 수 있습니다.");
    let client, owner;
    if (params.has("owner")) { owner = draftId(params.get("owner")!); client = supabase(); }
    else { const auth = await authenticate(request); client = auth.client; owner = auth.user.id; }
    const { data, error } = await client.rpc("list_pins", { p_owner: owner });
    if (error) collectionError(error);
    return json({ data });
  });
}

export async function PUT(request: Request): Promise<Response> {
  return withApi(async () => {
    const { client } = await authenticate(request);
    const ids = parsePins(await readJson(request));
    const { data, error } = await client.rpc("replace_pins", { p_ids: ids });
    if (error) collectionError(error);
    return json({ data });
  });
}
