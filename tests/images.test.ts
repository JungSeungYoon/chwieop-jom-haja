import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile,readdir} from "node:fs/promises";
import sharp from "sharp";
import {PGlite} from "@electric-sql/pglite";
import {normalizeImage,parseImageReservation,imagePath} from "../lib/image.ts";
import {POST as reserve} from "../app/api/drafts/[id]/images/route.ts";
import {POST as complete} from "../app/api/images/[id]/complete/route.ts";
import {GET,DELETE} from "../app/api/images/[id]/route.ts";
import {GET as recordImages} from "../app/api/records/[id]/images/route.ts";
const owner="00000000-0000-0000-0000-000000000001",other="00000000-0000-0000-0000-000000000002",draft="00000000-0000-0000-0000-000000000003",id="00000000-0000-0000-0000-000000000004";
const context={params:Promise.resolve({id})};
const image={id,draft_id:draft,owner_id:owner,mime_type:"image/png",byte_size:1,ready:false,attached:true,created_at:"2026-10-05T00:00:00Z"};

test("사진 검증: 크기·필드·실제 디코딩·MIME 일치·재인코딩·메타데이터 제거",async()=>{
  const input={draft_version:1,mime_type:"image/png",byte_size:5242880};
  assert.equal(parseImageReservation(input).p_byte_size,5242880);
  for(const value of [null,{...input,byte_size:5242881},{...input,byte_size:0},{...input,mime_type:"image/svg+xml"},{...input,owner_id:other},{...input,draft_version:0},{...input,mime_type:["image/png"]}]) assert.throws(()=>parseImageReservation(value));
  for(const format of ["png","jpeg","webp"] as const) {
    const source=await sharp({create:{width:16,height:12,channels:3,background:"blue"}}).toFormat(format).withMetadata().toBuffer();
    const result=await normalizeImage(new Blob([new Uint8Array(source)]),format==="jpeg"?"image/jpeg":`image/${format}`,source.length);
    const meta=await sharp(result).metadata();assert.equal(meta.format,"webp");assert.equal(meta.exif,undefined);assert.equal(meta.width,16);
    await assert.rejects(normalizeImage(new Blob([new Uint8Array(source)]),"image/gif",source.length),{code:"INVALID_IMAGE"});
  }
  for(const value of ["<svg xmlns='http://www.w3.org/2000/svg'></svg>","not an image","<script>alert(1)</script>"]) await assert.rejects(normalizeImage(new Blob([value]),"image/png",Buffer.byteLength(value)),{code:"INVALID_IMAGE"});
  await assert.rejects(normalizeImage(new Blob(["a"]),"image/png",2),{code:"INVALID_IMAGE"});
  const large=await sharp({create:{width:5000,height:5000,channels:3,background:"white"}}).png().toBuffer();
  await assert.rejects(normalizeImage(new Blob([new Uint8Array(large)]),"image/png",large.length),{code:"INVALID_IMAGE"});
});

test("사진 API: 인증·예약·서버 전용 검증·완료·비공개 404·no-store·정리 실패",async()=>{
  const original=globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://example.supabase.co";process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="test-key";process.env.SUPABASE_SECRET_KEY="sb_secret_test-only";
  const user={id:owner,aud:"authenticated",role:"authenticated",app_metadata:{},user_metadata:{},created_at:image.created_at};
  let responses:Response[]=[];const calls:{url:string;headers:Headers;body:unknown}[]=[];
  globalThis.fetch=async(input,init)=>{calls.push({url:String(input),headers:new Headers(init?.headers),body:init?.body});const response=responses.shift();assert.ok(response,`unexpected ${input}`);return response;};
  const req=(method="POST",body?:unknown)=>new Request("http://localhost",{method,headers:{Authorization:"Bearer test-token",...(body===undefined?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)});
  const json=(data:unknown,status=200)=>Response.json(data,{status});
  try {
    assert.equal((await reserve(new Request("http://localhost",{method:"POST"}),context)).status,401);
    assert.equal((await complete(new Request("http://localhost",{method:"POST"}),context)).status,401);
    responses=[json(user),json(image)];
    assert.equal((await reserve(req("POST",{draft_version:1,mime_type:"image/png",byte_size:1}),context)).status,201);
    assert.equal(JSON.parse(String(calls.at(-1)?.body)).p_draft_id,id);
    delete process.env.SUPABASE_SECRET_KEY;responses=[json(user)];
    assert.equal((await reserve(req("POST",{}),context)).status,503);
    process.env.SUPABASE_SECRET_KEY="sb_secret_test-only";
    const source=await sharp({create:{width:2,height:2,channels:3,background:"blue"}}).png().toBuffer();
    responses=[json(user),json({...image,byte_size:source.length}),new Response(new Uint8Array(source)),json({Key:"path"}),json({id,draft_version:2}),json([])];
    const result=await complete(req(),context);assert.equal(result.status,200);assert.equal((await result.json()).data.draft_version,2);
    const finalize=calls.find(call=>call.url.endsWith("/rpc/complete_image"));assert.ok(finalize);
    assert.equal(finalize.headers.get("apikey"),"sb_secret_test-only");assert.deepEqual(JSON.parse(String(finalize.body)),{p_image_id:id,p_owner_id:owner});
    assert.equal(calls.find(call=>call.url.includes("/storage/v1/object/record-images/") && call.headers.has("x-upsert"))?.headers.get("x-upsert"),"false");
    responses=[json(user),json({...image,byte_size:source.length}),new Response(new Uint8Array(source)),json({message:"duplicate",statusCode:"409"},409),json({id,name:"existing.webp"}),json({id,draft_version:2}),json([])];
    assert.equal((await complete(req(),context)).status,200);
    responses=[json(null)];assert.equal((await GET(new Request("http://localhost"),context)).status,404);
    responses=[json(null)];assert.equal((await recordImages(new Request("http://localhost"),context)).status,404);
    responses=[json({id}),json([{image:{...image,ready:true}}])];
    assert.equal((await (await recordImages(new Request("http://localhost"),context)).json()).data[0].id,id);
    responses=[json({...image,ready:true}),new Response("webp",{headers:{"Content-Type":"image/webp"}})];
    const publicImage=await GET(new Request("http://localhost"),context);assert.equal(publicImage.status,200);assert.match(publicImage.headers.get("cache-control")!,/no-store/);assert.equal(publicImage.headers.get("x-content-type-options"),"nosniff");
    responses=[json(user),json(image),json({id,draft_version:1,retained:false}),json([]),json({message:"storage unavailable"},503)];
    const removed=await DELETE(req("DELETE",{draft_version:1}),context);assert.equal(removed.status,202);assert.equal((await removed.json()).data.cleanup_pending,true);
    for(const draft_version of [0,2147483647,"1"]) {
      responses=[json(user),json(image)];assert.equal((await DELETE(req("DELETE",{draft_version}),context)).status,400);
    }
    responses=[json(user),json({...image,byte_size:12}),new Response("not an image")];assert.equal((await complete(req(),context)).status,422);
    responses=[json(user),json({code:"P0005",message:"secret"},400)];assert.equal((await reserve(req("POST",{draft_version:1,mime_type:"image/png",byte_size:1}),context)).status,409);
    assert.ok(!responses.length);
  } finally {globalThis.fetch=original;delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;delete process.env.SUPABASE_SECRET_KEY;}
});

test("사진 PostgreSQL: Storage RLS·검증 완료 권한·10장·발행 스냅샷·삭제/복원·파일 참조 정리",async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
      create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;grant select on storage.objects to anon,authenticated;grant insert,delete on storage.objects to authenticated;
      insert into auth.users values('${owner}'),('${other}');`);
    for(const name of (await readdir(new URL("../supabase/migrations/",import.meta.url))).filter(name=>name.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),"utf8"));
    await db.exec(`insert into profiles(id,handle,nickname) values('${owner}','owner-user','회원'),('${other}','other-user','타인');set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
    const d=(await db.query<{id:string}>("insert into record_drafts(owner_id,record_type,title,body) values($1,'project','사진 검증','본문') returning id",[owner])).rows[0].id;
    const reserveOne=async(version:number)=>(await db.query<typeof image>("select * from reserve_image($1,$2,'image/png',12)",[d,version])).rows[0];
    const version=async()=>(await db.query<{version:number}>("select version from record_drafts where id=$1",[d])).rows[0].version;
    const storageInsert=(path:string)=>db.query("insert into storage.objects values('record-images',$1)",[path]);
    const first=await reserveOne(1);
    await storageInsert(imagePath(first,true));
    await assert.rejects(storageInsert(imagePath(first)),{code:"42501"});
    await assert.rejects(db.query("select * from complete_image($1,$2)",[first.id,owner]),{code:"42501"});
    await assert.rejects(db.query("update images set ready=true"),{code:"42501"});
    await assert.rejects(db.query("select * from apply_record_content($1,1,0,'public')",[d]),{code:"42501"});
    async function finish(item:typeof image) {
      await db.exec("reset role;");await storageInsert(imagePath(item));await db.exec("set role service_role;");
      await db.query("select * from complete_image($1,$2)",[item.id,owner]);await db.exec("set role authenticated;");
    }
    await finish(first);assert.equal(await version(),2);
    await db.query("select * from apply_record($1,2,0,'public')",[d]);
    const second=await reserveOne(2);await storageInsert(imagePath(second,true));await finish(second);assert.equal(await version(),3);
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
    assert.equal((await db.query("select * from images")).rows.length,1);
    await assert.rejects(db.query("select * from detach_image($1,3)",[first.id]),{code:"P0002"});
    await assert.rejects(storageInsert(imagePath(second,true)+"x"),{code:"42501"});
    await db.exec("set role anon;select set_config('request.jwt.claim.sub','',false);");
    assert.equal((await db.query("select * from storage.objects")).rows.length,1);
    assert.equal((await db.query("select * from images")).rows.length,1);
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
    assert.equal((await db.query<{retained:boolean}>("select * from detach_image($1,3)",[first.id])).rows[0].retained,true);
    assert.equal(await version(),4);
    assert.equal((await db.query("delete from storage.objects where name=$1 returning name",[imagePath(first)])).rows.length,0);
    assert.equal((await db.query<{purge_image:boolean}>("select purge_image($1)",[first.id])).rows[0].purge_image,false);
    await db.exec("set role anon;select set_config('request.jwt.claim.sub','',false);");
    assert.equal((await db.query("select * from images")).rows.length,1);
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
    await db.query("select * from apply_record($1,4,1,'public')",[d]);
    await db.query("delete from storage.objects where name=any($1)",[[imagePath(first,true),imagePath(first)]]);
    assert.equal((await db.query<{purge_image:boolean}>("select purge_image($1)",[first.id])).rows[0].purge_image,true);
    await db.query("select * from set_record_deleted($1,4,2,true)",[d]);
    await db.exec("set role anon;select set_config('request.jwt.claim.sub','',false);");assert.equal((await db.query("select * from storage.objects")).rows.length,0);
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
    await db.query("select * from set_record_deleted($1,5,3,false)",[d]);
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);assert.equal((await db.query("select * from images")).rows.length,0);
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
    await db.query("select * from apply_record($1,6,4,'public')",[d]);
    for(let n=0;n<9;n++) await reserveOne(6);
    await assert.rejects(reserveOne(6),{code:"P0005"});
    await assert.rejects(reserveOne(5),{code:"P0003"});
    const pending=(await db.query<typeof image>("select * from images where draft_id=$1 and not ready limit 1",[d])).rows[0];
    await db.query("select * from detach_image($1,6)",[pending.id]);assert.equal(await version(),6);
    await reserveOne(6);
    await db.exec("set role anon;select set_config('request.jwt.claim.sub','',false);");
    assert.equal((await db.query("select * from images")).rows.length,1);
    await assert.rejects(db.query("select * from reserve_image($1,6,'image/png',1)",[d]),{code:"42501"});
  } finally {await db.close();}
});
