import { authenticate, databaseError, json, supabase, withApi } from "../../../lib/api.ts";
import { parseSearch, searchResult } from "../../../lib/search.ts";

export async function GET(request: Request): Promise<Response> {
  return withApi(async () => {
    const client = request.headers.has("authorization") ? (await authenticate(request)).client : supabase();
    const input = parseSearch(new URL(request.url));
    const { data, error } = await client.rpc("search_records", input);
    if (error) databaseError(error);
    return json(searchResult(data));
  });
}
