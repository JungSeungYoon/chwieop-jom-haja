import { authenticate,databaseError,json,supabase,withApi } from "../../../../../lib/api.ts";
import { draftId } from "../../../../../lib/draft.ts";
import { imageFields } from "../../../../../lib/image.ts";
import { ApiError } from "../../../../../lib/profile.ts";
export async function GET(request:Request,context:{params:Promise<{id:string}>}) {
  return withApi(async()=>{
    const client=request.headers.has("authorization")?(await authenticate(request)).client:supabase(), id=draftId((await context.params).id);
    const record=await client.from("records").select("id").eq("id",id).is("deleted_at",null).maybeSingle();
    if(record.error) databaseError(record.error);
    if(!record.data) throw new ApiError(404,"RECORD_NOT_FOUND","발행 글을 찾을 수 없습니다.");
    const {data,error}=await client.from("record_images").select(`image:images(${imageFields})`).eq("record_id",id);
    if(error) databaseError(error);
    return json({data:(data??[]).map(row=>row.image)});
  });
}
