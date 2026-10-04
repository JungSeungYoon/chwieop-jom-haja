import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepository,parseRepositoryUrl } from "../lib/github-import.ts";
import { POST } from "../app/api/imports/github/route.ts";

const input = parseRepositoryUrl({ url:"https://github.com/owner/repo" });
test("GitHub URL: 공개 저장소 주소만 허용·정규화·SSRF 입력 차단",() => {
  assert.deepEqual(parseRepositoryUrl({ url:" https://github.com/owner/repo.git/ " }),input);
  for (const url of ["http://github.com/owner/repo","https://localhost/owner/repo","https://github.com.evil.test/owner/repo","https://user:pw@github.com/owner/repo","https://github.com:8080/owner/repo","https://github.com/owner/repo?x=1","https://github.com/owner/repo#readme","https://github.com/owner/repo/tree/main","https://github.com/owner/a/../repo","https://github.com/owner/%2e%2e","https://github.com/owner/..","https://github.com/owner/.git","https://github.com/owner\\repo","https://github.com/owner/repo\n"]) {
    // 둘레 공백은 허용하므로 마지막 줄바꿈은 유효한 URL이다.
    if (url.endsWith("\n")) continue;
    assert.throws(() => parseRepositoryUrl({ url }));
  }
  assert.throws(() => parseRepositoryUrl({ url:input.url,token:"secret" }));
});

test("GitHub 가져오기: 무인증 공개 정보·언어 순서·README 누락·오류·응답 제한",async () => {
  const original=globalThis.fetch;
  let fail="",missing=false,large=false,content="## 원본 README\n\n<script>raw text</script>";
  const requests: { url:string; init?:RequestInit }[]=[];
  globalThis.fetch=async (url,init) => {
    requests.push({ url:String(url),init });
    if (!String(url).endsWith("/languages") && !String(url).endsWith("/readme")) {
      if (fail==="network") throw new TypeError("secret detail");
      if (fail==="private") return Response.json({ private:true });
      if (fail==="invalid") return Response.json({ private:false,name:"repo",full_name:"bad/full/name",description:null });
      if (fail) return new Response("secret detail",{ status:Number(fail) });
      return Response.json({ private:false,name:"repo",full_name:"owner/repo",description:"프로젝트 설명" });
    }
    if (String(url).endsWith("/languages")) return Response.json({ Python:50,TypeScript:100 });
    if (missing) return new Response(null,{status:404});
    if (large) return new Response("x".repeat(400*1024+1));
    return new Response(content);
  };
  try {
    const result=await importRepository(input);
    assert.equal(result.draft.record_type,"project"); assert.equal(result.draft.title,"repo");
    assert.equal(result.draft.details.intro,"프로젝트 설명"); assert.equal(result.draft.details.tools,"TypeScript, Python");
    assert.deepEqual(result.draft.tags,["TypeScript","Python"]); assert.ok(result.draft.body.includes(content));
    assert.ok(result.draft.body.includes(input.url)); assert.equal(result.readme_missing,false);
    assert.equal(requests.length,3);
    for (const request of requests) { assert.ok(request.url.startsWith("https://api.github.com/repos/owner/repo")); assert.equal(request.init?.redirect,"manual"); assert.equal(new Headers(request.init?.headers).has("authorization"),false); }
    missing=true; assert.equal((await importRepository(input)).readme_missing,true); missing=false;
    for (const [failure,status,code] of [["404",404,"GITHUB_REPOSITORY_NOT_FOUND"],["private",404,"GITHUB_REPOSITORY_NOT_FOUND"],["403",429,"GITHUB_RATE_LIMIT"],["429",429,"GITHUB_RATE_LIMIT"],["301",422,"GITHUB_REPOSITORY_MOVED"],["500",502,"GITHUB_UNAVAILABLE"],["network",502,"GITHUB_UNAVAILABLE"],["invalid",502,"GITHUB_INVALID_RESPONSE"]] as const) {
      fail=failure; await assert.rejects(importRepository(input),{ status,code });
    }
    fail=""; large=true; await assert.rejects(importRepository(input),{ status:422,code:"GITHUB_CONTENT_TOO_LARGE" });
    large=false; content="x".repeat(100000); await assert.rejects(importRepository(input),{ status:422,code:"GITHUB_CONTENT_INVALID" });
    content="NUL\u0000本文"; await assert.rejects(importRepository(input),{ status:422,code:"GITHUB_CONTENT_INVALID" });
  } finally { globalThis.fetch=original; }
});

test("GitHub 가져오기 API: 인증 소유자로 새 초안 생성·실패 시 저장 없음",async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://example.supabase.co"; process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="test-key";
  const original=globalThis.fetch,owner="00000000-0000-0000-0000-000000000001";
  const saved: Record<string,unknown>[]=[]; let fail=false;
  globalThis.fetch=async (input,init) => {
    const url=String(input);
    if (url.includes("/auth/v1/user")) return Response.json({ id:owner,aud:"authenticated",role:"authenticated",app_metadata:{},user_metadata:{},created_at:"2026-10-05T00:00:00Z" });
    if (url.startsWith("https://api.github.com")) {
      assert.equal(new Headers(init?.headers).has("authorization"),false);
      if (fail) return new Response(null,{ status:404 });
      if (url.endsWith("/languages")) return Response.json({});
      if (url.endsWith("/readme")) return new Response(null,{ status:404 });
      return Response.json({ private:false,name:"repo",full_name:"owner/repo",description:null });
    }
    assert.ok(url.includes("/rest/v1/record_drafts")); assert.equal(init?.method,"POST");
    const body=JSON.parse(String(init?.body)); saved.push(body); assert.equal(body.owner_id,owner); assert.ok(!("id" in body));
    return Response.json({ ...body,id:crypto.randomUUID(),version:1 },{ status:201 });
  };
  const req=() => new Request("http://localhost/api/imports/github",{ method:"POST",headers:{ Authorization:"Bearer test-token","Content-Type":"application/json" },body:JSON.stringify({ url:"https://github.com/owner/repo" }) });
  try {
    assert.equal((await POST(new Request("http://localhost",{method:"POST"}))).status,401);
    const first=await POST(req()); assert.equal(first.status,201); assert.equal(first.headers.get("cache-control"),"no-store");
    const data=await first.json(); assert.equal(data.import.readme_missing,true); assert.equal(data.data.record_type,"project");
    const next=await (await POST(req())).json(); assert.notEqual(data.data.id,next.data.id); assert.equal(saved.length,2);
    fail=true; assert.equal((await POST(req())).status,404); assert.equal(saved.length,2);
  } finally { globalThis.fetch=original; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; }
});

test("GitHub 가져오기: 공유 8초 제한의 시간 초과 응답",async () => {
  const originalFetch=globalThis.fetch,originalTimeout=AbortSignal.timeout;
  AbortSignal.timeout=(ms) => { assert.equal(ms,8000); return AbortSignal.abort(new DOMException("timeout","TimeoutError")); };
  globalThis.fetch=async (_input,init) => { assert.ok(init?.signal?.aborted); throw init.signal.reason; };
  try { await assert.rejects(importRepository(input),{ status:504,code:"GITHUB_TIMEOUT" }); }
  finally { globalThis.fetch=originalFetch; AbortSignal.timeout=originalTimeout; }
});
