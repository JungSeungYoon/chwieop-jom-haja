"use client";
import { useEffect,useState } from "react";
import { browserAuth,profileRequest } from "../../../lib/browser-auth.ts";
import type { ImageItem } from "../../../lib/image.ts";

export default function ImageCheck() {
  const [id,setId]=useState(""); const [version,setVersion]=useState(0);
  const [items,setItems]=useState<ImageItem[]>([]); const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("검증할 초안 ID를 입력하고 목록을 조회해주세요.");
  const [preview,setPreview]=useState(""); const [file,setFile]=useState<File|null>(null);
  useEffect(()=>()=>{if(preview) URL.revokeObjectURL(preview);},[preview]);
  async function load() {
    const data=await profileRequest(`/api/drafts/${id}/images`);
    setVersion(data.draft_version);setItems(data.images);return data;
  }
  async function run(action:()=>Promise<void>) {
    setBusy(true);setMessage("요청 중");
    try {await action();} catch(error) {setMessage(error instanceof Error?error.message:"사진 요청 실패");}
    finally {setBusy(false);}
  }
  async function upload(input:File) {
    if(!["image/jpeg","image/png","image/webp"].includes(input.type)||input.size>5242880||input.size<1) throw new Error("JPG·PNG·WebP 한 장, 5MiB 이하를 선택해주세요.");
    const current=await load();
    const reserved=await profileRequest(`/api/drafts/${id}/images`,"POST",{draft_version:current.draft_version,mime_type:input.type,byte_size:input.size});
    // 원본을 서버리스 함수 본문에 넣지 않아 5MiB 직접 업로드를 지원한다.
    const uploaded=await browserAuth().storage.from(reserved.bucket).upload(reserved.upload_path,input,{contentType:input.type,upsert:false,cacheControl:"0"});
    if(uploaded.error) {await load();throw new Error("원본 업로드 실패 — 남은 예약은 목록에서 삭제 후 다시 시도해주세요.");}
    await profileRequest(`/api/images/${reserved.id}/complete`,"POST");
    await load();setMessage("사진 검증·저장 완료 — 아직 공개되지 않았습니다. 초안 버전이 변경되었습니다.");
  }
  async function show(item:ImageItem,anonymous=false) {
    const session=anonymous?null:(await browserAuth().auth.getSession()).data.session;
    const response=await fetch(`/api/images/${item.id}`,{headers:session?{Authorization:`Bearer ${session.access_token}`}:{}});
    if(!response.ok) {const result=await response.json();setPreview("");throw new Error(`사진 조회 ${response.status}: ${result.error?.message}`);}
    setPreview(URL.createObjectURL(await response.blob()));setMessage(`${anonymous?"방문자":"본인"} 사진 조회 200`);
  }
  async function publish(visibility:"public"|"private") {
    const draft=await profileRequest(`/api/drafts/${id}`);
    let recordVersion=0;
    try {recordVersion=(await profileRequest(`/api/records/${id}`)).version;} catch(error) {if(!(error instanceof Error && "status" in error && error.status===404)) throw error;}
    const data=await profileRequest(`/api/drafts/${id}/publish`,"POST",{draft_version:draft.version,record_version:recordVersion,visibility});
    setMessage(`사진 포함 ${visibility} 적용 완료 / 발행 v${data.version}`);
  }
  return <section>
    <h2>사진 업로드·접근 권한 API 검증</h2>
    <p>개발용 도구입니다. 삭제는 초안 첨부를 해제하며 기존 발행본 참조가 있으면 파일을 유지합니다.</p>
    <p role="status">{message}</p>
    <fieldset disabled={busy}>
      <p><label>사진 검증 초안 ID <input value={id} onChange={event=>{setId(event.target.value);setVersion(0);setItems([]);setPreview("");}} /></label> <button onClick={()=>{void run(async()=>{await load();setMessage("사진 목록 조회 완료");});}}>사진 목록 조회</button></p>
      <p><label>사진 파일 <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>setFile(event.target.files?.[0]??null)} /></label> <button disabled={!file} onClick={()=>{void run(async()=>{if(file) await upload(file);});}}>선택한 사진 업로드</button></p>
      <button onClick={()=>{void run(async()=>{const canvas=document.createElement("canvas");canvas.width=160;canvas.height=90;const ctx=canvas.getContext("2d")!;ctx.fillStyle="#1d4ed8";ctx.fillRect(0,0,160,90);ctx.fillStyle="white";ctx.font="16px sans-serif";ctx.fillText("MJSEC image",20,50);const blob=await new Promise<Blob>(resolve=>canvas.toBlob(value=>resolve(value!),"image/png"));await upload(new File([blob],"image-check.png",{type:"image/png"}));});}}>검증용 PNG 생성·업로드</button>{" "}
      <button onClick={()=>{void run(async()=>{const current=await load();const invalid=new File(["not an image"],"fake.png",{type:"image/png"});const reserved=await profileRequest(`/api/drafts/${id}/images`,"POST",{draft_version:current.draft_version,mime_type:invalid.type,byte_size:invalid.size});const result=await browserAuth().storage.from(reserved.bucket).upload(reserved.upload_path,invalid,{contentType:invalid.type});if(result.error) throw new Error("원본 업로드 실패");await load();await profileRequest(`/api/images/${reserved.id}/complete`,"POST");});}}>위장 PNG 거부 검사</button>
      <p><button onClick={()=>{void run(()=>publish("public"));}}>사진 포함 공개 적용</button>{" "}<button onClick={()=>{void run(()=>publish("private"));}}>사진 포함 비공개 적용</button></p>
      <button onClick={()=>{void run(async()=>{const data=await profileRequest(`/api/records/${id}/images`);setMessage(`발행본 사진 목록 조회 성공 / ${data.length}장: ${data.map((item:ImageItem)=>item.id).join(", ")}`);});}}>발행본 사진 목록 조회</button>
      <p>초안 v{version} / 첨부·예약 {items.filter(item=>item.attached).length}/10</p>
      <ul>{items.map(item=><li key={item.id}>{item.id} / {item.ready?"완료":"예약·미완료"} / {item.attached?"초안 첨부":"해제·정리 대상"}{" "}
        {item.ready && <><button onClick={()=>{void run(()=>show(item));}}>본인 사진 조회</button>{" "}<button onClick={()=>{void run(()=>show(item,true));}}>방문자 사진 조회</button>{" "}<code>![사진](/api/images/{item.id})</code>{" "}</>}
        {!item.ready && item.attached && <button onClick={()=>{void run(async()=>{await profileRequest(`/api/images/${item.id}/complete`,"POST");await load();setMessage("사진 완료 재시도 성공");});}}>완료 재시도</button>}{" "}
        <button onClick={()=>{void run(async()=>{const current=await load();const result=await profileRequest(`/api/images/${item.id}`,"DELETE",{draft_version:current.draft_version});await load();setMessage(result.retained?"초안 첨부 해제 — 발행본 사진 유지":result.cleanup_pending?"첨부 해제 완료 — 파일 정리 재시도 필요":"첨부 해제·파일 정리 완료");});}}>사진 해제·정리</button>
      </li>)}</ul>
    </fieldset>
    {preview && <img src={preview} width={320} alt="검증 사진 미리보기" />}
  </section>;
}
