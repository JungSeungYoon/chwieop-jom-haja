import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./profile.ts";
import { databaseError } from "./api.ts";
import { recordMutationError } from "./record.ts";

export const imageBucket = "record-images";
export const imageFields = "id,draft_id,owner_id,mime_type,byte_size,ready,attached,created_at";
export type ImageItem = { id:string; draft_id:string; owner_id:string; mime_type:string; byte_size:number; ready:boolean; attached:boolean; created_at:string };
export const imagePath = (image: ImageItem, source=false) => `${image.owner_id}/${image.draft_id}/${image.id}.${source ? "upload" : "webp"}`;
export function parseImageReservation(value: unknown) {
  if (!value || typeof value!=="object" || Array.isArray(value)) throw new ApiError(400,"INVALID_INPUT","사진 정보를 입력해주세요.");
  const input = value as Record<string,unknown>;
  if (Object.keys(input).some(key => !["draft_version","mime_type","byte_size"].includes(key)) ||
    !Number.isSafeInteger(input.draft_version) || Number(input.draft_version)<1 || Number(input.draft_version)>=2147483647 ||
    typeof input.mime_type!=="string" || !["image/jpeg","image/png","image/webp"].includes(input.mime_type) ||
    !Number.isSafeInteger(input.byte_size) || Number(input.byte_size)<1 || Number(input.byte_size)>5242880) {
    throw new ApiError(400,"INVALID_INPUT","JPG·PNG·WebP 한 장, 5MiB 이하, 최신 초안 버전이 필요합니다.");
  }
  return { p_draft_version:input.draft_version as number,p_mime_type:input.mime_type as string,p_byte_size:input.byte_size as number };
}
export function imageError(error: { code:string }): never {
  if (error.code==="P0005") throw new ApiError(409,"IMAGE_LIMIT","글에는 업로드 중인 사진을 포함해 최대 10장까지 첨부할 수 있습니다.");
  if (error.code==="P0002") throw new ApiError(404,"IMAGE_NOT_FOUND","사진 또는 초안을 찾을 수 없습니다.");
  return recordMutationError(error);
}
export function imageAdmin() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new ApiError(503,"IMAGE_SERVER_NOT_CONFIGURED","서버 전용 Supabase 이미지 검증 키를 설정해주세요.");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
}
export async function normalizeImage(blob: Blob, mime: string, bytes: number) {
  if (blob.size!==bytes || blob.size>5242880) throw new ApiError(422,"INVALID_IMAGE","업로드한 파일 크기가 예약 정보와 다릅니다.");
  try {
    const image=sharp(Buffer.from(await blob.arrayBuffer()),{limitInputPixels:20000000,failOn:"warning"});
    const metadata=await image.metadata();
    const formats:Record<string,string>={jpeg:"image/jpeg",png:"image/png",webp:"image/webp"};
    if (!metadata.format || formats[metadata.format]!==mime || (metadata.pages ?? 1)>1) throw new Error("unsupported image");
    // ponytail: 웹 표시용 정적 사진만 저장한다. 원본·애니메이션 보존은 필요해질 때 별도 제공한다.
    const result=await image.autoOrient().resize({width:2560,height:2560,fit:"inside",withoutEnlargement:true}).webp({quality:85}).timeout({seconds:5}).toBuffer();
    if (result.byteLength>4000000) throw new Error("output too large");
    return result;
  } catch { throw new ApiError(422,"INVALID_IMAGE","실제 JPG·PNG·정적 WebP 사진인지 확인해주세요. 최대 2,000만 화소를 지원합니다."); }
}
export async function findImage(client: SupabaseClient,id:string,owner?:string) {
  let query=client.from("images").select(imageFields).eq("id",id);
  if (owner) query=query.eq("owner_id",owner);
  const {data,error}=await query.maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new ApiError(404,"IMAGE_NOT_FOUND","사진을 찾을 수 없습니다.");
  return data as ImageItem;
}
export async function cleanupImage(client: SupabaseClient,item:ImageItem) {
  try {
  if (item.attached) return false;
  const {data:refs,error:refError}=await client.from("record_images").select("image_id").eq("image_id",item.id).limit(1);
  if (refError || refs?.length) return false;
  const {error}=await client.storage.from(imageBucket).remove([imagePath(item,true),imagePath(item)]);
  if (error) return false;
  const result=await client.rpc("purge_image",{p_image_id:item.id});
  return !result.error && result.data===true;
  } catch { return false; }
}
export async function cleanupDraftImages(client: SupabaseClient,id:string) {
  try {
  const {data,error}=await client.from("images").select(imageFields).eq("draft_id",id).eq("attached",false).limit(21);
  if (error) return true;
  let pending=(data?.length??0)>20;
  for (const item of (data ?? []).slice(0,20) as ImageItem[]) if (!await cleanupImage(client,item)) pending=true;
  return pending;
  } catch {return true;}
}
