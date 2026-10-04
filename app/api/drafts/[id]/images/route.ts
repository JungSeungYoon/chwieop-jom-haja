import { authenticate,databaseError,json,readJson,withApi } from "../../../../../lib/api.ts";
import { draftId } from "../../../../../lib/draft.ts";
import { imageBucket,imageFields,imagePath,parseImageReservation,imageError,imageAdmin } from "../../../../../lib/image.ts";
import { ApiError } from "../../../../../lib/profile.ts";

export async function GET(request:Request,context:{params:Promise<{id:string}>}) {
  return withApi(async()=>{
    const {client}=await authenticate(request), id=draftId((await context.params).id);
    const draft=await client.from("record_drafts").select("id,version").eq("id",id).maybeSingle();
    if(draft.error) databaseError(draft.error);
    if(!draft.data) throw new ApiError(404,"DRAFT_NOT_FOUND","초안을 찾을 수 없습니다.");
    const {data,error}=await client.from("images").select(imageFields).eq("draft_id",id).order("created_at");
    if(error) databaseError(error);
    return json({data:{draft_version:draft.data.version,images:data}});
  });
}
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  return withApi(async()=>{
    const {client}=await authenticate(request), id=draftId((await context.params).id);
    imageAdmin(); // 설정 누락이면 예약을 남기기 전에 중단한다.
    const input=parseImageReservation(await readJson(request));
    const {data,error}=await client.rpc("reserve_image",{p_draft_id:id,...input}).single();
    if(error) imageError(error);
    const item=data as import("../../../../../lib/image.ts").ImageItem;
    return json({data:{...item,bucket:imageBucket,upload_path:imagePath(item,true),url:`/api/images/${item.id}`}},201);
  });
}
