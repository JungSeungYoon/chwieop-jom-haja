import { authenticate, databaseError, json, supabase, withApi } from "../../../lib/api.ts";
import { parseSearch, searchResult } from "../../../lib/search.ts";

export async function GET(request: Request): Promise<Response> {
  return withApi(async () => {
    const client = request.headers.has("authorization") ? (await authenticate(request)).client : supabase();
    const url = new URL(request.url);
    const input = parseSearch(url);
    const { data, error } = await client.rpc("search_records", input);
    if (error) databaseError(error);
    const result = searchResult(data);
    if (url.searchParams.get("feed") === "1" && result.data.length) {
      const rows = result.data as { id: string }[];
      const metadata = await client.rpc("feed_metadata", { p_ids: rows.map(row => row.id) });
      if (metadata.error) databaseError(metadata.error);
      const byId = new Map<string, Record<string, unknown>>((metadata.data ?? []).map((row: { id: string }) => [row.id, row]));
      // 조회 사이에 비공개/삭제된 기록은 표시하지 않는다.
      result.data = rows.filter(row => byId.has(row.id)).map(row => ({ ...row, ...byId.get(row.id), visibility: "public" }));
    }
    return json(result);
  });
}
