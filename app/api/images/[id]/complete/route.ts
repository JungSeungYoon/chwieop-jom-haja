import { authenticate,json,withApi } from "../../../../../lib/api.ts";
import { draftId } from "../../../../../lib/draft.ts";
import { findImage,imageAdmin,imageBucket,imagePath,imageError,normalizeImage } from "../../../../../lib/image.ts";
import { ApiError } from "../../../../../lib/profile.ts";

export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  return withApi(async()=>{
    const {client,user}=await authenticate(request), id=draftId((await context.params).id);
    const item=await findImage(client,id,user.id), admin=imageAdmin();
    if(!item.attached) throw new ApiError(404,"IMAGE_NOT_FOUND","해제한 사진은 완료할 수 없습니다.");
    if(!item.ready) {
      const source=await admin.storage.from(imageBucket).download(imagePath(item,true));
      if(source.error || !source.data) throw new ApiError(422,"IMAGE_UPLOAD_INCOMPLETE","원본 업로드를 완료한 뒤 다시 요청해주세요.");
      const normalized=await normalizeImage(source.data,item.mime_type,item.byte_size);
      // 동시 완료 요청·재시도도 저장된 파일을 덮어쓰지 않는다.
      const saved=await admin.storage.from(imageBucket).upload(imagePath(item),normalized,{contentType:"image/webp",upsert:false,cacheControl:"0"});
      if(saved.error) {
        const existing=await admin.storage.from(imageBucket).info(imagePath(item));
        if(existing.error || !existing.data) throw new ApiError(503,"IMAGE_STORAGE_FAILED","사진 저장에 실패했습니다. 완료 요청을 다시 시도해주세요.");
      }
    }
    const result=await admin.rpc("complete_image",{p_image_id:id,p_owner_id:user.id}).single();
    if(result.error) imageError(result.error);
    const removed=await admin.storage.from(imageBucket).remove([imagePath(item,true)]);
    return json({data:{...result.data as object,url:`/api/images/${id}`,source_cleanup_pending:!!removed.error}});
  });
}
