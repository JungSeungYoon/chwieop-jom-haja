import { authenticate,json,readJson,supabase,withApi } from "../../../../lib/api.ts";
import { draftId } from "../../../../lib/draft.ts";
import { findImage,imageBucket,imagePath,imageError,cleanupImage } from "../../../../lib/image.ts";
import { ApiError } from "../../../../lib/profile.ts";

export async function GET(request:Request,context:{params:Promise<{id:string}>}) {
  return withApi(async()=>{
    const client=request.headers.has("authorization")?(await authenticate(request)).client:supabase();
    const item=await findImage(client,draftId((await context.params).id));
    if(!item.ready) throw new ApiError(404,"IMAGE_NOT_FOUND","완료한 사진을 찾을 수 없습니다.");
    const {data,error}=await client.storage.from(imageBucket).download(imagePath(item));
    if(error || !data) throw new ApiError(503,"IMAGE_STORAGE_FAILED","사진을 불러오지 못했습니다.");
    return new Response(data,{headers:{"Content-Type":"image/webp","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'"}});
  });
}
export async function DELETE(request:Request,context:{params:Promise<{id:string}>}) {
  return withApi(async()=>{
    const {client,user}=await authenticate(request), id=draftId((await context.params).id);
    const item=await findImage(client,id,user.id), input=await readJson(request);
    if(!input || typeof input!=="object" || Array.isArray(input) || Object.keys(input).some(k=>k!=="draft_version") ||
      !Number.isSafeInteger((input as {draft_version?:unknown}).draft_version) ||
      Number((input as {draft_version?:unknown}).draft_version)<1 || Number((input as {draft_version?:unknown}).draft_version)>=2147483647) throw new ApiError(400,"INVALID_INPUT","최신 초안 버전을 입력해주세요.");
    const result=await client.rpc("detach_image",{p_image_id:id,p_draft_version:(input as {draft_version:number}).draft_version}).single();
    if(result.error) imageError(result.error);
    const detached=result.data as {id:string;draft_version:number;retained:boolean};
    const pending=!detached.retained && !await cleanupImage(client,{...item,attached:false});
    return json({data:{...detached,cleanup_pending:pending}},pending?202:200);
  });
}
