import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// 사용자 토큰 없이 공개 DB 연결과 비인증 접근 처리를 확인한다. 데이터는 변경하지 않는다.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.ok(url && key, ".env에 Supabase URL과 publishable key를 설정해주세요.");
const apiOrigin = new URL(process.argv[2] ?? "http://localhost:3000").origin;
for (const table of ["profiles","records","project_pins","record_links","images","record_images"]) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key }, signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status,200,`Supabase ${table} 조회 실패`);
  assert.ok(Array.isArray(await response.json()),"Supabase 응답 형식 확인 필요");
  console.log(`통과: 실제 Supabase ${table} 익명 조회 200 (RLS 적용 결과)`);
}

const unknownHandle = `connection-check-${randomUUID().slice(0, 8)}`;
for (const [path, status, code, headers] of [
  [`/api/profiles/${unknownHandle}`, 404, "PROFILE_NOT_FOUND", {}],
  ["/api/profiles/-invalid", 400, "INVALID_INPUT", {}],
  ["/api/me", 401, "UNAUTHORIZED", {}],
  ["/api/me", 401, "UNAUTHORIZED", { Authorization: "Bearer invalid-test-token" }],
]) {
  const response = await fetch(`${apiOrigin}${path}`, { headers, signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, status, `${path} 상태 코드 확인 필요`);
  assert.equal((await response.json()).error.code, code, `${path} 오류 코드 확인 필요`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  console.log(`통과: ${path} → ${status} ${code}`);
}
const id = randomUUID();
for (const path of ["/api/records", "/api/records?feed=1", `/api/pins?owner=${id}`]) {
  const response = await fetch(`${apiOrigin}${path}`, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status,200,path);
  assert.ok(Array.isArray((await response.json()).data));
  assert.equal(response.headers.get("cache-control"),"no-store");
  console.log(`통과: ${path} → 200 공개 목록`);
}
for (const [path,code] of [[`/api/records/${id}`,"RECORD_NOT_FOUND"],[`/api/records/${id}/images`,"RECORD_NOT_FOUND"],[`/api/records/${id}/related`,"RECORD_NOT_FOUND"],[`/api/images/${id}`,"IMAGE_NOT_FOUND"]]) {
  const response=await fetch(`${apiOrigin}${path}`,{signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,404,path);assert.equal((await response.json()).error.code,code);
  assert.equal(response.headers.get("cache-control"),"no-store");
  console.log(`통과: ${path} → 404 ${code}`);
}
const protectedRoutes = [
  ["GET","/api/drafts"],["POST","/api/drafts"],["POST","/api/profiles"],["PATCH","/api/profiles"],
  ["GET",`/api/drafts/${id}`],["PUT",`/api/drafts/${id}`],["DELETE",`/api/drafts/${id}`],
  ["POST",`/api/drafts/${id}/publish`],["POST",`/api/drafts/${id}/restore`],
  ["GET",`/api/drafts/${id}/related`],["GET",`/api/drafts/${id}/images`],["POST",`/api/drafts/${id}/images`],
  ["POST",`/api/images/${id}/complete`],["DELETE",`/api/images/${id}`],["POST","/api/imports/github"],
  ["GET","/api/archive"],["GET","/api/pins"],["PUT","/api/pins"],
  ["GET","/api/bookmarks"],["PUT",`/api/bookmarks/${id}`],["DELETE",`/api/bookmarks/${id}`],
  ["PUT","/api/links"],["DELETE","/api/links"],
];
for (const [method,path] of protectedRoutes) {
  const response=await fetch(`${apiOrigin}${path}`,{method,signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,401,`${method} ${path}`);
  assert.equal((await response.json()).error.code,"UNAUTHORIZED");
  assert.equal(response.headers.get("cache-control"),"no-store");
  console.log(`통과: ${method} ${path} → 401 UNAUTHORIZED`);
}
console.log("연결·공개 조회·인증 거부 검사를 완료했습니다. 사용자 토큰·서버 키 없이 실행했으며 데이터를 변경하지 않았습니다.");
