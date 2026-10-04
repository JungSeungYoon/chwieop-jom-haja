import { authenticate, databaseError, json, withApi } from "../../../lib/api.ts";
import { parseSearch, searchResult } from "../../../lib/search.ts";

export async function GET(request: Request): Promise<Response> {
  return withApi(async () => {
    const { client } = await authenticate(request);
    const input = parseSearch(new URL(request.url), true);
    const { data, error } = await client.rpc("search_archive", input);
    if (error) databaseError(error);
    return json(searchResult(data));
  });
}
