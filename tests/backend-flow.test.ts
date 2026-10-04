import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {imagePath} from "../lib/image.ts";
import type {ImageItem} from "../lib/image.ts";

test("백엔드 통합: 사진·발행 스냅샷·검색·핀·타인 보관·연결·휴지통·비공개 복원",async()=>{
  const db=new PGlite();
  const owner="00000000-0000-0000-0000-000000000001",reader="00000000-0000-0000-0000-000000000002";
  try {
    // Storage 객체 메타데이터의 RLS를 검사한다. 실제 바이트 전송 검사는 별도로 수행한다.
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
      create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;grant select on storage.objects to anon,authenticated;grant insert,delete on storage.objects to authenticated;
      insert into auth.users values('${owner}'),('${reader}');`);
    for(const name of (await readdir(new URL("../supabase/migrations/",import.meta.url))).filter(name=>name.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),"utf8"));
    const actor=async(id:string|null)=>{await db.exec(`set role ${id?"authenticated":"anon"}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??""]);};
    for(const [id,handle] of [[owner,"owner-user"],[reader,"reader-user"]]) {
      await actor(id);await db.query("insert into profiles(id,handle,nickname) values($1,$2,'회원')",[id,handle]);
    }
    await actor(owner);
    const create=async(type:string,title:string)=>(await db.query<{id:string}>("insert into record_drafts(owner_id,record_type,title,body,tags) values($1,$2,$3,'통합 TCP 본문',array['TCP','보안']) returning id",[owner,type,title])).rows[0].id;
    const project=await create("project","통합 프로젝트"),study=await create("study","TCP 공부 기록");
    const photo=async(version:number)=>{
      const item=(await db.query<ImageItem>("select * from reserve_image($1,$2,'image/png',12)",[project,version])).rows[0];
      await db.query("insert into storage.objects values('record-images',$1)",[imagePath(item,true)]);
      await db.exec("reset role");await db.query("insert into storage.objects values('record-images',$1)",[imagePath(item)]);
      await db.exec("set role service_role");await db.query("select * from complete_image($1,$2)",[item.id,owner]);
      await actor(owner);await db.query("delete from storage.objects where name=$1",[imagePath(item,true)]);return item;
    };
    const original=await photo(1); // 초안 v2
    await db.query("update record_drafts set body=$2 where id=$1",[project,`통합 TCP 본문\n![사진](/api/images/${original.id})`]); // v3
    await db.query("select * from apply_record($1,3,0,'public')",[project]);
    await db.query("select * from apply_record($1,1,0,'public')",[study]);
    await db.query("select * from set_record_link($1,$2,true)",[project,study]);
    await db.query("select * from replace_pins($1)",[[project]]);
    await actor(reader);
    for(const record of [project,study]) await db.query("select * from set_bookmark($1,true)",[record]);
    assert.equal((await db.query("select * from list_bookmarks(0)")).rows.length,2);
    assert.equal((await db.query("select * from record_drafts")).rows.length,0);
    await assert.rejects(db.query("select * from apply_record($1,3,1,'private')",[project]),{code:"P0002"});
    await actor(owner);
    await db.query("update record_drafts set title='미공개 수정 제목',body='새 TCP 본문' where id=$1",[project]); // v4
    const replacement=await photo(4); // v5
    await assert.rejects(db.query("select * from apply_record($1,4,1,'public')",[project]),{code:"P0003"});
    const own=(await db.query<{has_unapplied_changes:boolean;draft_version:number;source_version:number}>("select * from search_archive('',null,'{}','all',0) where id=$1",[project])).rows[0];
    assert.deepEqual([own.has_unapplied_changes,own.draft_version,own.source_version],[true,5,3]);
    await actor(null);
    assert.equal((await db.query("select * from search_records('미공개',null,'{}',null,0)")).rows.length,0);
    assert.equal((await db.query("select * from search_records('TCP','project',array['TCP','보안'],null,0)")).rows.length,1);
    assert.equal((await db.query<{title:string}>("select * from list_pins($1)",[owner])).rows[0].title,"통합 프로젝트");
    assert.equal((await db.query<{title:string}>("select * from list_public_related($1,0)",[study])).rows[0].title,"통합 프로젝트");
    assert.deepEqual((await db.query<{id:string}>("select id from images")).rows.map(row=>row.id),[original.id]);
    assert.equal((await db.query("select * from storage.objects")).rows.length,1);
    await actor(owner);await db.query("select * from detach_image($1,5)",[original.id]); // v6
    await actor(null);assert.equal((await db.query("select * from storage.objects")).rows.length,1);
    await actor(owner);await db.query("select * from apply_record($1,6,1,'private')",[project]); // 발행 v2
    await actor(reader);
    assert.equal((await db.query("select * from list_bookmarks(0)")).rows.length,1);
    assert.equal((await db.query("select * from bookmarks")).rows.length,2); // 보관 참조는 유지, 비공개 콘텐츠는 숨김
    assert.equal((await db.query("select * from images")).rows.length,0);
    assert.equal((await db.query("select * from storage.objects")).rows.length,0);
    assert.equal((await db.query("select * from list_pins($1)",[owner])).rows.length,0);
    assert.equal((await db.query("select * from list_public_related($1,0)",[study])).rows.length,0);
    await actor(owner);await db.query("select * from set_record_deleted($1,6,2,true)",[project]); // 초안 v7·발행 v3
    assert.equal((await db.query("select * from search_archive('',null,'{}','deleted',0)")).rows.length,1);
    assert.equal((await db.query("select * from list_own_related($1,0)",[study])).rows.length,0);
    await assert.rejects(db.query("select * from apply_record($1,7,3,'public')",[project]),{code:"P0002"});
    await db.query("select * from set_record_deleted($1,7,3,false)",[project]); // v8·v4, 비공개
    await actor(null);assert.equal((await db.query("select * from images")).rows.length,0);
    await actor(owner);
    assert.equal((await db.query<{visibility:string}>("select visibility from records where id=$1",[project])).rows[0].visibility,"private");
    assert.equal((await db.query("select * from list_own_related($1,0)",[study])).rows.length,1);
    await db.query("select * from apply_record($1,8,4,'public')",[project]); // 발행 v5
    await assert.rejects(db.query("select * from apply_record($1,8,4,'private')",[project]),{code:"P0004"});
    await actor(reader);
    const saved=(await db.query<{id:string;title:string}>("select * from list_bookmarks(0)")).rows;
    assert.equal(saved.length,2);assert.equal(saved.find(row=>row.id===project)?.title,"미공개 수정 제목");
    assert.deepEqual((await db.query<{id:string}>("select id from images")).rows.map(row=>row.id),[replacement.id]);
    assert.equal((await db.query<{title:string}>("select * from list_public_related($1,0)",[study])).rows[0].title,"미공개 수정 제목");
    assert.equal((await db.query("select * from list_pins($1)",[owner])).rows.length,0); // 핀은 자동 복원하지 않음
    await actor(owner);await db.query("select * from replace_pins($1)",[[project]]);
    await db.query("delete from storage.objects where name=$1",[imagePath(original)]);
    assert.equal((await db.query<{purge_image:boolean}>("select purge_image($1)",[original.id])).rows[0].purge_image,true);
    await actor(null);
    assert.equal((await db.query("select * from list_pins($1)",[owner])).rows.length,1);
    assert.equal((await db.query("select * from storage.objects")).rows.length,1);
    await assert.rejects(db.query("select * from list_bookmarks(0)"),{code:"42501"});
  } finally {await db.close();}
});
