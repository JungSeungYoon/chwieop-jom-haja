import { authenticate, json, withApi } from "../../../lib/api.ts";
import { ApiError } from "../../../lib/profile.ts";
import { collectionError } from "../../../lib/collection.ts";
import { searchResult } from "../../../lib/search.ts";

export async function GET(request: Request): Promise<Response> {
  return withApi(async () => {
    const { client } = await authenticate(request);
    const params = new URL(request.url).searchParams;
    const offset = params.get("offset") ?? "0";
    if ([...params.keys()].some((key) => key !== "offset") || params.getAll("offset").length > 1 || !/^\d{1,6}$/.test(offset)) {
      throw new ApiError(400, "INVALID_INPUT", "offset은 0~999999 정수만 지정할 수 있습니다.");
    }
    const { data, error } = await client.rpc("list_bookmarks", { p_offset: Number(offset) });
    if (error) collectionError(error);
    return json(searchResult(data));
  });
}
