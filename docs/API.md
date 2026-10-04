# 백엔드 API 명세서

현재 구현 범위: 인증 토큰 검증, 회원 프로필 등록·조회·수정. 기록·검색·보관 API는 다음 기능별 구현에서 추가한다.

## 공통 규칙

- 로컬 주소: `http://localhost:3000`.
- 성공: `{ "data": ... }`, 실패: `{ "error": { "code": "...", "message": "..." } }`.
- 인증 필요 API는 `Authorization: Bearer <Supabase access_token>`을 사용한다. GitHub 개인 액세스 토큰이 아니다.
- 서버는 Supabase Auth `getUser(access_token)`으로 사용자를 확인하고, 동일한 토큰으로 DB에 접근한다. 관리자 키로 RLS를 우회하지 않는다.
- 변경 요청은 `Content-Type: application/json`, UTF-8 본문 최대 8,192바이트다.
- 응답은 `Cache-Control: no-store`로 제공한다. DB의 내부 오류·토큰·이메일은 응답에 포함하지 않는다.
- 현재 API는 같은 사이트의 프런트엔드에서 호출하도록 구성한다. 별도 도메인 CORS 허용과 UI 로그인은 아직 구현하지 않았다.

## 1. 프로필 입력과 응답

| 필드 | 등록 | 수정 | 규칙 |
|---|---|---|---|
| `handle` | 필수 | 선택 | 영문·숫자·하이픈 3~30자. 앞뒤 공백 제거, 소문자 변환. 양 끝은 영문 또는 숫자 |
| `nickname` | 필수 | 선택 | 앞뒤 공백 제거, 2~30자 |
| `major` | 선택 | 선택 | 전공, 50자 이하 |
| `interests` | 선택 | 선택 | 관심 분야, 100자 이하 |
| `bio` | 선택 | 선택 | 짧은 소개, 200자 이하 |

문자 수는 Unicode 코드 포인트 기준이며 제어 문자는 허용하지 않는다. 선택 항목은 문자열이고 빈 문자열로 지울 수 있다. 등록에서 생략하면 빈 문자열을 저장하고, 수정에서 생략하면 기존 값을 유지한다. `null`, 알 수 없는 필드, 클라이언트가 지정한 `id`·시각은 거부한다.

예약 주소: `admin`, `api`, `auth`, `login`, `settings`, `u`, `me`, `explore`, `bookmarks`. 주소는 DB에서도 중복을 금지한다. 개인 주소 수정 후 이전 주소를 보존하는 리다이렉트는 현재 제공하지 않는다.

프로필 응답 예시:

```json
{
  "data": {
    "id": "00000000-0000-0000-0000-000000000001",
    "handle": "seung-yoon",
    "nickname": "승윤",
    "major": "정보통신공학",
    "interests": "개발, 통신, 보안",
    "bio": "프로젝트와 공부를 기록합니다.",
    "created_at": "2026-10-05T00:00:00+00:00",
    "updated_at": "2026-10-05T00:00:00+00:00"
  }
}
```

`id`는 공개 프로필의 식별자다. GitHub 이메일이나 인증 토큰은 프로필 테이블에 저장하지 않는다. 프런트엔드는 프로필 문자열을 일반 텍스트로 표시해야 한다.

## 2. 내 계정·프로필 조회

`GET /api/me` · 인증 필수 · 본문 없음

성공 `200`:

```json
{
  "data": {
    "user": { "id": "00000000-0000-0000-0000-000000000001" },
    "profile": null,
    "needs_profile": true
  }
}
```

프로필을 등록한 회원은 `profile`에 위 프로필 객체가 들어가며 `needs_profile`은 `false`다. 인증 성공과 프로필 등록 완료는 구분한다.

## 3. 최초 프로필 등록

`POST /api/profiles` · 인증 필수

```json
{
  "handle": "seung-yoon",
  "nickname": "승윤",
  "major": "정보통신공학",
  "interests": "개발, 통신, 보안",
  "bio": "프로젝트와 공부를 기록합니다."
}
```

성공 `201`: 프로필 응답 객체. 저장할 사용자 ID는 서버가 인증 결과에서 가져온다. 한 계정당 프로필 하나이며 기존 프로필이 있거나 주소가 겹치면 `409 PROFILE_CONFLICT`다. 등록 요청으로 기존 프로필을 덮어쓰지 않는다.

## 4. 내 프로필 부분 수정

`PATCH /api/profiles` · 인증 필수

```json
{ "bio": "보안 실습과 개발 프로젝트를 기록합니다." }
```

성공 `200`: 수정된 프로필 응답 객체. 최소 한 항목이 필요하다. 본인의 ID로만 수정하며 타인 ID 지정은 불가능하다. 아직 등록하지 않은 회원은 `404 PROFILE_NOT_FOUND`다. 주소를 바꿀 때도 형식·예약·중복 검사를 적용한다.

## 5. 공개 프로필 조회

`GET /api/profiles/{handle}` · 인증 불필요 · 본문 없음

성공 `200`: 프로필 응답 객체. 없으면 `404 PROFILE_NOT_FOUND`. 잘못된 주소 형식은 `400 INVALID_INPUT`. 이 API에는 비공개 기록이나 계정 인증 정보가 포함되지 않는다. 현재 단계에는 `/u/{handle}` 웹 화면이 없다.

## 6. 오류

| 상태 | 코드 | 상황 |
|---|---|---|
| 400 | `INVALID_INPUT` | 필수값·주소 형식·길이·허용 필드 오류, 빈 수정 |
| 400 | `INVALID_JSON` | 비어 있거나 잘못된 JSON/UTF-8 본문 |
| 401 | `UNAUTHORIZED` | 인증 헤더 누락, 만료·유효하지 않은 토큰 |
| 403 | `FORBIDDEN` | DB에서 허용되지 않은 변경 요청 |
| 404 | `PROFILE_NOT_FOUND` | 미등록 프로필 조회·수정 |
| 409 | `PROFILE_CONFLICT` | 계정 프로필 또는 개인 주소 중복 |
| 413 | `PAYLOAD_TOO_LARGE` | 본문 8,192바이트 초과 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | JSON Content-Type 아님 |
| 503 | `SERVICE_UNAVAILABLE` | 환경 설정 누락, 인증·DB 연결 장애 |

오류 예시:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "로그인이 필요합니다." } }
```

## 7. GitHub 로그인 연결 범위

GitHub OAuth는 Supabase Auth의 GitHub Provider를 사용할 계획이다. Supabase 프로젝트 생성, GitHub OAuth 앱 등록, 콜백 URL 설정은 아직 하지 않았다. 실제 로그인·토큰 갱신·로그아웃 UI는 프런트엔드 단계에서 연결한다. 이번 구현은 Supabase가 발급한 사용자 토큰을 검증하는 백엔드다.

구현에 확인한 문서: [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route), [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
