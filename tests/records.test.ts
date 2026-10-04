import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parsePublication } from "../lib/record.ts";
import { POST } from "../app/api/drafts/[id]/publish/route.ts";
import { GET } from "../app/api/records/[id]/route.ts";

const owner = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const id = "00000000-0000-0000-0000-000000000003";
const context = { params: Promise.resolve({ id }) };

test("발행 입력·API: 버전·범위 검증, RPC 오류 변환, 익명/인증 조회", async () => {
  const valid = { draft_version: 1, record_version: 0, visibility: "public" };
  assert.deepEqual(parsePublication(valid), { p_draft_version: 1, p_record_version: 0, p_visibility: "public" });
  for (const input of [null, {}, { ...valid, owner_id: other }, { ...valid, visibility: ["public"] },
    { ...valid, visibility: "everyone" }, { ...valid, draft_version: "1" }, { ...valid, record_version: -1 }]) assert.throws(() => parsePublication(input));
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
  const request = (body = valid) => new Request("http://localhost/api/drafts/id/publish", { method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    assert.equal((await POST(new Request("http://localhost", { method: "POST" }), context)).status, 401);
    replies = [{ data: user }, { data: { id, visibility: "public", version: 1 } }];
    assert.equal((await POST(request(), context)).status, 201);
    assert.equal(calls[1].url.pathname, "/rest/v1/rpc/apply_record");
    assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { p_draft_id: id, p_draft_version: 1, p_record_version: 0, p_visibility: "public" });
    for (const [code, status] of [["P0002", 404], ["P0003", 409], ["P0004", 409], ["22023", 400], ["42501", 403]] as const) {
      replies = [{ data: user }, { data: { code, message: "private detail" }, status: 400 }];
      const response = await POST(request(), context); assert.equal(response.status, status); assert.ok(!(await response.text()).includes("private detail"));
    }
    replies = [{ data: { id, visibility: "public" } }]; calls.length = 0;
    const response = await GET(new Request("http://localhost/api/records/id"), context);
    assert.equal(response.status, 200); assert.equal(calls.length, 1); assert.equal(response.headers.get("cache-control"), "no-store");
    replies = [{ data: null }]; assert.equal((await GET(new Request("http://localhost"), context)).status, 404);
    replies = [{ data: user }, { data: { id, visibility: "private" } }];
    assert.equal((await GET(new Request("http://localhost", { headers: { Authorization: "Bearer test-token" } }), context)).status, 200);
  } finally { globalThis.fetch = original; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; }
});

test("발행 PostgreSQL: 초안 분리·필수값·권한·버전 충돌", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth, public to anon, authenticated;
      insert into auth.users values ('${owner}'), ('${other}');`);
    for (const name of ["202610050001_profiles.sql", "202610050002_record_drafts.sql", "202610050003_records.sql"]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
    }
    await db.exec(`insert into profiles(id,handle,nickname) values ('${owner}','owner-user','회원'), ('${other}','other-user','타인');
      set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
    const draft = (await db.query<{ id: string }>("insert into record_drafts(owner_id,record_type) values ($1,'study') returning id", [owner])).rows[0];
    const apply = (dv: number, rv: number, visibility = "public") => db.query<{ version: number; source_version: number; body: string; visibility: string }>("select * from public.apply_record($1,$2,$3,$4)", [draft.id, dv, rv, visibility]);
    await assert.rejects(apply(1, 0), { code: "22023" });
    await db.query("update record_drafts set title='TCP 공부',body='최초 공개 내용' where id=$1", [draft.id]);
    assert.equal((await apply(2, 0)).rows[0].version, 1);
    await assert.rejects(db.query("update records set visibility='public'"), { code: "42501" });
    await assert.rejects(db.query("insert into records(id,owner_id,record_type,title,body,details,tags,visibility,source_version) select id,owner_id,record_type,title,body,details,tags,'public',version from record_drafts"), { code: "42501" });
    await db.query("update record_drafts set body='수정 중인 비공개 초안' where id=$1", [draft.id]);
    assert.equal((await db.query<{ body: string }>("select body from records")).rows[0].body, "최초 공개 내용");
    await assert.rejects(apply(2, 1), { code: "P0003" });
    await assert.rejects(apply(3, 0), { code: "P0004" });
    assert.equal((await apply(3, 1)).rows[0].body, "수정 중인 비공개 초안");
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
    assert.equal((await db.query("select * from records")).rows.length, 1);
    await assert.rejects(apply(3, 2), { code: "P0002" });
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
    assert.equal((await apply(3, 2, "private")).rows[0].version, 3);
    await assert.rejects(apply(3, 2, "public"), { code: "P0004" });
    assert.equal((await db.query<{ visibility: string }>("select visibility from records")).rows[0].visibility, "private");
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
    assert.equal((await db.query("select * from records")).rows.length, 0);
    await db.exec("set role anon; select set_config('request.jwt.claim.sub','',false);");
    assert.equal((await db.query("select * from records")).rows.length, 0);
    await assert.rejects(apply(3, 3), { code: "42501" });
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
    await assert.rejects(db.query("select public.record_body_has_content('검사')"), { code: "42501" });
    await db.exec("reset role;");
    for (const empty of [" \n\t", "# **__~~", "<p><br></p>", "```ts\n  \n```", "$$  $$"]) {
      assert.equal((await db.query<{ valid: boolean }>("select public.record_body_has_content($1) valid", [empty])).rows[0].valid, false);
    }
    for (const body of ["본문", "```text\n++\n```", "$$+$$", "![실습 사진](https://example.com/image.png)"]) {
      assert.equal((await db.query<{ valid: boolean }>("select public.record_body_has_content($1) valid", [body])).rows[0].valid, true);
    }
  } finally { await db.close(); }
});
