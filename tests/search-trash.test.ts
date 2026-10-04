import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parseSearch, searchResult } from "../lib/search.ts";
import { parseLifecycle } from "../lib/record.ts";
import { GET as search } from "../app/api/records/route.ts";
import { GET as archive } from "../app/api/archive/route.ts";
import { DELETE } from "../app/api/drafts/[id]/route.ts";
import { POST as restore } from "../app/api/drafts/[id]/restore/route.ts";

const owner = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const id = "00000000-0000-0000-0000-000000000003";
const context = { params: Promise.resolve({ id }) };

test("검색·삭제 입력: 태그 AND 조건·중복 제거·길이·페이지·버전 검증", () => {
  assert.deepEqual(parseSearch(new URL(`http://localhost?q= TCP &tag=보안&tag=TCP&tag=TCP&owner=${owner}`)), {
    p_query: "TCP", p_type: null, p_tags: ["보안", "TCP"], p_offset: 0, p_owner: owner,
  });
  for (const query of ["type=bad", "offset=-1", "offset=1.5", "offset=1000000", "q=a&q=b", "tag=", "owner=bad", "user_id=x", `q=${"x".repeat(101)}`]) {
    assert.throws(() => parseSearch(new URL(`http://localhost?${query}`)));
  }
  assert.throws(() => parseSearch(new URL("http://localhost?state=bad"), true));
  assert.throws(() => parseSearch(new URL(`http://localhost?owner=${owner}`), true));
  assert.deepEqual(parseLifecycle({ draft_version: 2, record_version: 0 }), { p_draft_version: 2, p_record_version: 0 });
  assert.throws(() => parseLifecycle({ draft_version: 2, record_version: 0, visibility: "public" }));
  assert.equal(searchResult(Array.from({ length: 21 }, (_, index) => index)).page.has_more, true);
  assert.deepEqual(searchResult([]), { data: [], page: { limit: 20, has_more: false } });
});

test("검색·휴지통 API: 인증·RPC 인수·오류·페이지 반환", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
  const original = globalThis.fetch;
  const calls: { url: URL; init?: RequestInit }[] = [];
  let replies: { data: unknown; status?: number }[] = [];
  const user = { id: owner, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-05T00:00:00Z" };
  globalThis.fetch = async (input, init) => {
    calls.push({ url: new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url), init });
    const reply = replies.shift(); assert.ok(reply); return Response.json(reply.data, { status: reply.status ?? 200 });
  };
  const req = (method = "GET", suffix = "", body?: unknown) => new Request(`http://localhost/api/archive${suffix}`, {
    method, headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    assert.equal((await archive(new Request("http://localhost/api/archive"))).status, 401);
    assert.equal((await DELETE(new Request("http://localhost", { method: "DELETE" }), context)).status, 401);
    assert.equal((await restore(new Request("http://localhost", { method: "POST" }), context)).status, 401);
    replies = [{ data: Array.from({ length: 21 }, (_, n) => ({ id: n })) }];
    const result = await (await search(new Request("http://localhost/api/records?q=TCP&tag=보안"))).json();
    assert.equal(result.data.length, 20); assert.equal(result.page.has_more, true);
    assert.equal(calls[0].url.pathname, "/rest/v1/rpc/search_records");
    assert.equal(JSON.parse(String(calls[0].init?.body)).p_query, "TCP");
    replies = [{ data: user }, { data: [] }];
    assert.equal((await archive(req("GET", "?state=deleted"))).status, 200);
    assert.equal(JSON.parse(String(calls.at(-1)?.init?.body)).p_state, "deleted");
    for (const [handler, method, deleted] of [[DELETE, "DELETE", true], [restore, "POST", false]] as const) {
      replies = [{ data: user }, { data: { id, deleted, draft_version: 3, record_version: 2 } }];
      assert.equal((await handler(req(method, "", { draft_version: 2, record_version: 1 }), context)).status, 200);
      assert.equal(JSON.parse(String(calls.at(-1)?.init?.body)).p_deleted, deleted);
      replies = [{ data: user }, { data: { code: "P0003" }, status: 400 }];
      assert.equal((await handler(req(method, "", { draft_version: 2, record_version: 1 }), context)).status, 409);
    }
    replies = [{ data: { code: "PGRST000", message: "private" }, status: 503 }];
    assert.equal((await search(new Request("http://localhost/api/records"))).status, 503);
  } finally { globalThis.fetch = original; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; }
});

test("검색·삭제 PostgreSQL: 비공개 차단·부분검색·태그 AND·페이지·삭제·비공개 복원", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to anon,authenticated;
      insert into auth.users values ('${owner}'),('${other}');`);
    for (const name of ["202610050001_profiles.sql", "202610050002_record_drafts.sql", "202610050003_records.sql", "202610050004_search_trash.sql"]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
    }
    await db.exec(`insert into profiles(id,handle,nickname) values ('${owner}','owner-user','회원'),('${other}','other-user','타인');
      set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
    const draft = (await db.query<{ id: string }>("insert into record_drafts(owner_id,record_type,title,body,tags) values ($1,'study','TCP 분석','통신 공부 100%_완료',array['TCP','보안']) returning id", [owner])).rows[0];
    await db.query("select * from apply_record($1,1,0,'public')", [draft.id]);
    const hidden = (await db.query<{ id: string }>("insert into record_drafts(owner_id,record_type,title,body) values ($1,'project','숨긴 기록','TCP 비밀') returning id", [owner])).rows[0];
    await db.query("select * from apply_record($1,1,0,'private')", [hidden.id]);
    await db.query("insert into record_drafts(owner_id,record_type,title) values ($1,'other','미발행 초안')", [owner]);
    const publicSearch = (q = "", tags: string[] = [], type: string | null = null, offset = 0) => db.query<{ id: string }>("select * from search_records($1,$2,$3,null,$4)", [q, type, tags, offset]);
    const ownSearch = (state = "all", q = "") => db.query<{ id: string; draft_version: number; record_version: number; state: string }>("select * from search_archive($1,null,'{}',$2,0)", [q, state]);
    assert.equal((await ownSearch()).rows.length, 3);
    assert.equal((await ownSearch("draft")).rows.length, 1);
    assert.equal((await ownSearch("private")).rows.length, 1);
    await db.exec("set role anon; select set_config('request.jwt.claim.sub','',false);");
    assert.equal((await publicSearch("tcp", ["TCP", "보안"], "study")).rows.length, 1);
    assert.equal((await publicSearch("통신")).rows.length, 1);
    assert.equal((await publicSearch("보안")).rows.length, 1);
    assert.equal((await publicSearch("%_")).rows.length, 1);
    assert.equal((await publicSearch("없는 검색어")).rows.length, 0);
    assert.equal((await publicSearch("", ["TCP", "React"])).rows.length, 0);
    assert.equal((await publicSearch("", [], "project")).rows.length, 0);
    assert.equal((await db.query("select * from search_records('',null,'{}',$1,0)", [other])).rows.length, 0);
    await assert.rejects(ownSearch(), { code: "42501" });
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${other}',false);`);
    assert.equal((await ownSearch()).rows.length, 0);
    await assert.rejects(db.query("select * from set_record_deleted($1,1,1,true)", [draft.id]), { code: "P0002" });
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
    await assert.rejects(db.query("update record_drafts set deleted_at=now()"), { code: "42501" });
    await assert.rejects(db.query("select * from set_record_deleted($1,9,1,true)", [draft.id]), { code: "P0003" });
    await db.query("select * from set_record_deleted($1,1,1,true)", [draft.id]);
    assert.equal((await publicSearch()).rows.length, 0);
    assert.equal((await ownSearch()).rows.length, 2);
    const trash = (await ownSearch("deleted")).rows[0];
    assert.equal(trash.draft_version, 2); assert.equal(trash.record_version, 2);
    assert.equal((await db.query("update record_drafts set title='삭제 후 수정' where id=$1 returning id", [draft.id])).rows.length, 0);
    await assert.rejects(db.query("select * from apply_record($1,2,2,'public')", [draft.id]), { code: "P0002" });
    await db.query("select * from set_record_deleted($1,2,2,false)", [draft.id]);
    assert.equal((await ownSearch("deleted")).rows.length, 0);
    assert.equal((await ownSearch("private")).rows.length, 2);
    assert.equal((await publicSearch()).rows.length, 0);
    await db.query("select * from apply_record($1,3,3,'public')", [draft.id]);
    for (let n = 0; n < 21; n++) {
      const row = (await db.query<{ id: string }>("insert into record_drafts(owner_id,record_type,title,body) values ($1,'other',$2,'본문') returning id", [owner, `페이지 ${n}`])).rows[0];
      await db.query("select * from apply_record($1,1,0,'public')", [row.id]);
    }
    const first = (await publicSearch()).rows; const next = (await publicSearch("", [], null, 20)).rows;
    assert.equal(first.length, 21); assert.equal(next.length, 2);
    assert.ok(!first.slice(0,20).some((row) => next.some((item) => item.id === row.id)));
    await assert.rejects(db.query("select * from search_records($1,null,'{}',null,0)", ["x".repeat(101)]), { code: "22023" });
  } finally { await db.close(); }
});
