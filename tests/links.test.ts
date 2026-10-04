import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parseLink, relatedOffset } from "../lib/link.ts";
import { PUT, DELETE } from "../app/api/links/route.ts";
import { GET as publicRelated } from "../app/api/records/[id]/related/route.ts";
import { GET as ownRelated } from "../app/api/drafts/[id]/related/route.ts";

const owner = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const project = "abcdef00-0000-0000-0000-000000000003";
const study = "00000000-0000-0000-0000-000000000004";

test("연결 입력: 서로 다른 UUID·허용 필드·페이지 조건", () => {
  assert.deepEqual(parseLink({ project_id: project.toUpperCase(), study_id: study }), { p_project_id: project, p_study_id: study });
  for (const value of [null, [], {}, { project_id: project, study_id: project.toUpperCase() }, { project_id: project, study_id: "bad" }, { project_id: project, study_id: study, owner_id: owner }]) assert.throws(() => parseLink(value));
  assert.equal(relatedOffset(new URL("http://localhost?offset=20")),20);
  for (const query of ["offset=-1", "offset=1000000", "offset=0&offset=20", "owner=x"]) assert.throws(() => relatedOffset(new URL("http://localhost?" + query)));
});

test("연결 API: 인증·등록/해제 인수·공개와 본인 조회·오류", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
  const original = globalThis.fetch; let replies: { data: unknown; status?: number }[] = [];
  const calls: { url: URL; init?: RequestInit }[] = [];
  const user = { id: owner, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-05T00:00:00Z" };
  globalThis.fetch = async (input, init) => { calls.push({ url: new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url), init }); const reply = replies.shift(); assert.ok(reply); return Response.json(reply.data, { status: reply.status ?? 200 }); };
  const req = (method = "GET", body?: unknown) => new Request("http://localhost/api/links", { method, headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const context = { params: Promise.resolve({ id: project }) };
  try {
    assert.equal((await PUT(new Request("http://localhost", { method: "PUT" }))).status,401);
    assert.equal((await ownRelated(new Request("http://localhost"),context)).status,401);
    for (const [handler, method, linked] of [[PUT,"PUT",true],[DELETE,"DELETE",false]] as const) {
      replies = [{ data: user }, { data: [{ project_id: project, study_id: study, linked }] }];
      assert.deepEqual(await (await handler(req(method,{ project_id: project, study_id: study }))).json(), { data: { project_id: project, study_id: study, linked } });
      assert.deepEqual(JSON.parse(String(calls.at(-1)?.init?.body)), { p_project_id: project, p_study_id: study, p_linked: linked });
    }
    replies = [{ data: Array.from({ length: 21 },(_,id) => ({ id })) }];
    const response = await publicRelated(new Request("http://localhost?offset=20"),context);
    assert.equal(response.headers.get("cache-control"),"no-store"); const result = await response.json();
    assert.equal(result.data.length,20); assert.equal(result.page.has_more,true);
    assert.equal(calls.at(-1)?.url.pathname,"/rest/v1/rpc/list_public_related");
    replies = [{ data: user }, { data: [] }];
    assert.equal((await ownRelated(req(),context)).status,200);
    assert.equal(calls.at(-1)?.url.pathname,"/rest/v1/rpc/list_own_related");
    for (const [code,status] of [["P0002",404],["22023",400],["PGRST000",503]] as const) {
      replies = [{ data: user }, { data: { code, message: "secret" }, status: 400 }];
      const response = await PUT(req("PUT",{ project_id: project, study_id: study }));
      assert.equal(response.status,status); assert.ok(!(await response.text()).includes("secret"));
    }
  } finally { globalThis.fetch=original; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; }
});

test("연결 PostgreSQL: 다대다·양방향·소유자·공개본 분리·삭제/복원·유형 변경·페이지", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to anon,authenticated; insert into auth.users values ('${owner}'),('${other}');`);
    for (const name of ["202610050001_profiles.sql","202610050002_record_drafts.sql","202610050003_records.sql","202610050004_search_trash.sql","202610050005_pins_bookmarks.sql","202610050006_record_links.sql"]) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),"utf8"));
    await db.exec(`insert into profiles(id,handle,nickname) values ('${owner}','owner-user','회원'),('${other}','other-user','타인'); set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
    const create = async (type: string) => (await db.query<{ id: string }>("insert into record_drafts(owner_id,record_type,title,body) values ($1,$2,$2,'원래 본문') returning id",[owner,type])).rows[0].id;
    const p = await create("project"), s = await create("study"), p2 = await create("project"), s2 = await create("study");
    const link = (project: string,study: string,linked=true) => db.query("select * from set_record_link($1,$2,$3)",[project,study,linked]);
    const own = (id: string,offset=0) => db.query<{ id: string; title: string; state: string }>("select * from list_own_related($1,$2)",[id,offset]);
    const visible = (id: string,offset=0) => db.query<{ id: string; title: string }>("select * from list_public_related($1,$2)",[id,offset]);
    await link(p,s); await link(p,s); await link(p,s2); await link(p2,s);
    assert.equal((await own(p)).rows.length,2); assert.equal((await own(s)).rows.length,2);
    assert.equal((await own(p)).rows[0].state,"draft");
    await assert.rejects(link(p,p2),{code:"22023"}); await assert.rejects(link(s,s2),{code:"22023"});
    await assert.rejects(db.query("insert into record_links(owner_id,project_id,study_id) values ($1,$2,$3)",[owner,p2,s2]),{code:"42501"});
    await db.query("select * from apply_record($1,1,0,'public')",[p]);
    await db.query("select * from apply_record($1,1,0,'private')",[s]);
    assert.equal((await visible(p)).rows.length,0);
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
    await assert.rejects(link(p,s),{code:"P0002"}); await assert.rejects(own(p),{code:"P0002"});
    await link(p,s,false); assert.equal((await db.query("select * from record_links")).rows.length,0);
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
    assert.equal((await own(p)).rows.length,2);
    await db.query("select * from apply_record($1,1,1,'public')",[s]);
    assert.equal((await visible(p)).rows.length,1); assert.equal((await visible(s)).rows.length,1);
    await db.query("update record_drafts set title='未公開 새 제목' where id=$1",[s]);
    assert.equal((await own(p)).rows.find((row)=>row.id===s)?.title,"未公開 새 제목");
    assert.equal((await visible(p)).rows[0].title,"study");
    await db.exec("set role anon; select set_config('request.jwt.claim.sub','',false);");
    assert.equal((await db.query("select * from record_links")).rows.length,1);
    await assert.rejects(own(p),{code:"42501"}); await assert.rejects(link(p,s),{code:"42501"});
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
    await db.query("select * from set_record_deleted($1,2,2,true)",[s]);
    assert.equal((await visible(p)).rows.length,0); assert.equal((await own(p)).rows.length,1);
    await assert.rejects(own(s),{code:"P0002"}); await assert.rejects(visible(s),{code:"P0002"});
    await assert.rejects(link(p,s),{code:"P0002"});
    await db.query("select * from set_record_deleted($1,3,3,false)",[s]);
    assert.equal((await own(p)).rows.length,2); assert.equal((await visible(p)).rows.length,0);
    await db.query("select * from apply_record($1,4,4,'public')",[s]);
    assert.equal((await visible(p)).rows.length,1);
    await link(p,s,false); await link(p,s,false);
    assert.equal((await visible(p)).rows.length,0); assert.equal((await own(s)).rows.length,1);
    await db.query("update record_drafts set record_type='other' where id=$1",[s]);
    assert.equal((await own(p2)).rows.length,0); assert.equal((await own(s)).rows.length,0);
    for (let n=0;n<21;n++) { const extra=await create("study"); await db.query("select * from apply_record($1,1,0,'public')",[extra]); await link(p,extra); }
    const first=(await visible(p)).rows, next=(await visible(p,20)).rows;
    assert.equal(first.length,21); assert.equal(next.length,1);
    assert.ok(!first.slice(0,20).some((row)=>next.some((item)=>item.id===row.id)));
    assert.equal((await own(p)).rows.length,21);
    await assert.rejects(visible(p,-1),{code:"22023"});
    await db.query("select * from set_record_deleted($1,1,1,true)",[p]);
    await assert.rejects(visible(p),{code:"P0002"});
    await db.exec("set role anon; select set_config('request.jwt.claim.sub','',false);");
    assert.equal((await db.query("select * from record_links")).rows.length,0);
    await assert.rejects(db.query("select remove_changed_type_links()"),{code:"42501"});
  } finally { await db.close(); }
});
