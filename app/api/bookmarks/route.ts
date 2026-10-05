import { authenticate, databaseError, json, withApi } from "../../../lib/api.ts";
import { ApiError } from "../../../lib/profile.ts";
import { collectionError } from "../../../lib/collection.ts";
import { parseSearch, searchResult } from "../../../lib/search.ts";

export async function GET(request: Request): Promise<Response> {
  return withApi(async () => {
    const { client, user } = await authenticate(request);
    const params = new URL(request.url).searchParams;
    const offset = params.get("offset") ?? "0";
    if ([...params.keys()].some((key) => !['offset','q','type','tag'].includes(key)) || params.getAll("offset").length > 1 || !/^\d{1,6}$/.test(offset)) {
      throw new ApiError(400, "INVALID_INPUT", "offset은 0~999999 정수만 지정할 수 있습니다.");
    }
    const input = parseSearch(new URL(request.url));
    if (input.p_query || input.p_type || input.p_tags.length) {
      let query = client.from('bookmarks').select('created_at,records!inner(id,owner_id,record_type,title,body,tags,version)').eq('owner_id',user.id).eq('records.visibility','public').is('records.deleted_at',null).neq('records.owner_id',user.id);
      if (input.p_query) { const escaped = input.p_query.replace(/[\\%_]/g,'\\$&'); query = query.ilike('records.title',`%${escaped}%`); }
      if (input.p_type) query = query.eq('records.record_type',input.p_type);
      if (input.p_tags.length) query = query.contains('records.tags',input.p_tags);
      const result = await query.order('created_at',{ascending:false}).order('record_id',{ascending:false}).range(input.p_offset,input.p_offset+20);
      if (result.error) databaseError(result.error);
      const rows = (result.data ?? []).map(item => { const record = item.records as unknown as { body:string }; return {...record, excerpt:record.body.slice(0,200), body:undefined, saved_at:item.created_at}; });
      return json(searchResult(rows));
    }
    const { data, error } = await client.rpc("list_bookmarks", { p_offset: Number(offset) });
    if (error) collectionError(error);
    return json(searchResult(data));
  });
}
