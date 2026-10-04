import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// 사용자 토큰 없이 공개 DB 연결과 비인증 접근 처리를 확인한다. 데이터는 변경하지 않는다.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.ok(url && key, ".env에 Supabase URL과 publishable key를 설정해주세요.");
const apiOrigin = new URL(process.argv[2] ?? "http://localhost:3000").origin;
const dbResponse = await fetch(`${url}/rest/v1/profiles?select=handle&limit=1`, {
  headers: { apikey: key }, signal: AbortSignal.timeout(10000),
});
assert.equal(dbResponse.status, 200, "Supabase 공개 프로필 테이블 조회 실패");
assert.ok(Array.isArray(await dbResponse.json()), "Supabase 응답 형식 확인 필요");
console.log("통과: 실제 Supabase 프로필 테이블 조회 200");

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
console.log("실제 회원 로그인·등록·수정 검증은 GitHub OAuth 연결 후 별도로 진행합니다.");
