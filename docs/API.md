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

GitHub OAuth는 Supabase Auth의 GitHub Provider를 사용한다. Supabase 서울 프로젝트에 OAuth 앱·Provider·콜백/반환 URL 설정을 완료했다. 개발 전용 `/auth/check`에서 실제 로그인·프로필 등록·수정·로그아웃·재로그인을 확인했다. 최종 로그인 UI와 배포 주소 연결은 프런트엔드 단계에서 진행한다. 백엔드는 Supabase가 발급한 사용자 토큰을 검증한다.

실제 연결 검사에서는 공개 DB 조회 `200`, 미등록 프로필 `404`, 잘못된 주소 `400`, 인증 누락·잘못된 토큰 `401`을 확인했다. 실제 회원의 등록·수정 후 공개 조회 `200`에서 저장 내용을 확인하고, 새로고침·재로그인 후에도 유지되는 것을 확인했다. 실계정 두 개의 상호 권한 검사와 실제 토큰 갱신은 추후 통합 검증에서 진행한다.

구현에 확인한 문서: [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route), [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 8. 비공개 초안 저장·조회

모든 초안 API는 인증이 필요하다. 작성자만 조회·수정할 수 있다. 타인 초안은 존재 여부를 노출하지 않고 `404 DRAFT_NOT_FOUND`다. 관리자 키는 사용하지 않는다.

| 메서드·경로 | 동작 | 성공 |
|---|---|---|
| `POST /api/drafts` | 새 초안 생성, 프로필 등록 필요 | 201, 전체 초안 |
| `GET /api/drafts?offset=0` | 본인 목록, 최근 수정 순·동률 ID 오름차순, 20개 | 200, 요약 배열 |
| `GET /api/drafts/{id}` | 본인 초안 전체 조회 | 200, 전체 초안 |
| `PUT /api/drafts/{id}` | 기대 버전과 일치할 때 콘텐츠 전체 교체 | 200, 갱신된 전체 초안 |

목록 요약은 `id`, `record_type`, `title`, `tags`, `version`, `created_at`, `updated_at`이다. 빈 목록은 `{ "data": [] }`. `offset`은 0~999999 정수, 초안 ID는 UUID다.

생성 요청 예시:

```json
{
  "record_type": "project",
  "title": "패킷 분석 실습",
  "body": "## 진행 내용\n\nTCP 패킷을 분석했다.",
  "details": { "role": "캡처와 패킷 분석", "tools": "Wireshark" },
  "tags": ["TCP", "보안"]
}
```

| 필드 | 입력 규칙 |
|---|---|
| `record_type` | 필수, `project`·`study`·`other` |
| `title` | 최대 200자, 앞뒤 공백 제거, 초안은 빈 제목 허용 |
| `body` | 최대 100000자 Markdown 문자열, 줄바꿈·탭·들여쓰기 보존 |
| `details` | 선택 JSON 객체, 값은 각 5000자 이하 문자열 |
| `tags` | 최대 10개, 각 1~30자, 공백 제거 후 동일 문자열 중복 제거 |

프로젝트 안내 키는 `intro` 소개, `goal` 목표, `role` 내 역할, `tools` 기술·도구·장비, `troubleshooting` 문제와 해결, `result` 결과다. 공부 기록은 `topic` 주제, `resources` 참고 자료, `learned` 이해한 내용, `practice` 실습, `questions` 남은 질문이다. 기타는 빈 객체를 사용한다. 안내 항목은 필수가 아니다.

선택 필드 생략 시 빈 문자열·빈 객체·빈 배열로 저장한다. `null`은 허용하지 않는다. 생성 시 사용자 ID·초안 ID·시각·버전 등 미허용 필드는 `400`이다. 요청 본문은 최대 524288바이트이며 초과 시 `413`이다. 본문은 현재 저장만 제공하고 HTML 렌더링은 하지 않는다. 공개 렌더링 단계에서 안전한 링크·HTML 처리를 적용해야 한다.

전체 응답은 콘텐츠에 `id`, `owner_id`, `version`, `created_at`, `updated_at`을 더한 `{ "data": { ... } }`다. DB가 ID·시각·버전을 설정하고 서버가 인증된 소유자를 지정한다. 최초 버전은 1, 수정마다 1 증가한다.

수정 요청은 위 콘텐츠 전체와 현재 `version`(1~2147483646 정수)을 보낸다. 생략한 선택 콘텐츠는 빈 값으로 교체하므로 부분 수정으로 쓰지 않는다. 서버는 `id + 인증 소유자 + version` 조건을 한 번의 UPDATE에 적용한다. 오래된 버전이면 `409 DRAFT_VERSION_CONFLICT`이며 내용은 변경하지 않는다. 입력을 보관하고 최신 초안을 조회한 뒤 사용자가 다시 저장한다.

생성 POST는 멱등 요청이 아니다. 응답을 잃은 경우 무조건 재생성하지 않고 목록을 확인한다. 수정 성공 응답을 잃은 경우에도 동일 버전의 재시도는 `409`가 될 수 있으므로 최신 초안을 조회한다.

추가 오류는 프로필 미등록 생성 `404 PROFILE_NOT_FOUND`, 없음·타인 초안 `404 DRAFT_NOT_FOUND`, 저장 충돌 `409 DRAFT_VERSION_CONFLICT`다. 인증·JSON·DB 장애는 공통 오류 규칙을 따른다. 초안 삭제·10초 자동 저장 UI는 후속 단계에서 구현한다.

## 9. 정식 저장·공개 범위 적용

`POST /api/drafts/{id}/publish` · 인증 필수 · 본인의 저장 초안만 사용

```json
{ "draft_version": 2, "record_version": 0, "visibility": "public" }
```

| 필드 | 규칙 |
|---|---|
| `draft_version` | 적용할 저장 초안 버전, 1~2147483647 정수 |
| `record_version` | 최초 발행은 0, 이후 현재 발행 버전 1~2147483646 |
| `visibility` | `public` 또는 `private` |

추가 필드와 잘못된 타입은 `400`, 본문 제한은 8192바이트다. 본문을 직접 보내지 않으며 화면의 변경 내용은 먼저 초안 API에 저장해야 한다. 제목·유형·실제 본문이 필수다. 공백, 빈 HTML 서식, 기본 Markdown 서식 기호, 빈 코드 블록·수식만 있는 본문은 거부한다. 사진 링크·내용 있는 코드·수식은 인정한다. 이 검사는 콘텐츠 유무 검사이며 HTML 보안 검증·렌더링을 대신하지 않는다.

DB 함수 `apply_record`가 인증 소유자의 초안을 잠그고 버전·필수값을 검사한다. 발행본 버전도 검사한 뒤 콘텐츠 전체를 복사한다. 복사·공개 범위 변경·버전 증가를 한 트랜잭션으로 처리한다. 회원에게 발행 테이블 직접 생성·수정·삭제 권한을 부여하지 않는다.

최초 정식 저장은 `201`, 수정 적용은 `200`이다. 응답은 `{ "data": { ... } }`이며 초안 콘텐츠와 `id`, `owner_id`, `visibility`, `source_version`, `version`, `created_at`, `updated_at`을 포함한다. ID는 원본 초안과 같고 `source_version`은 복사한 초안 버전이다. 발행본 `version`은 최초 1에서 적용마다 증가하고, 초안 버전은 발행만으로 증가하지 않는다. 생성 시각은 최초 정식 저장 시점, 수정 시각은 마지막 적용 시점이다.

초안 저장만으로 공개 내용·범위가 바뀌지 않는다. 수정 내용을 명시적으로 적용해야 새 본문이 보인다. 비공개 적용 후 익명·타인 직접 조회는 `404`다. 핀·보관함·관련 기록의 제외 처리는 각 기능 구현 시 연결한다.

| 상태 | 코드 | 상황 |
|---|---|---|
| 400 | `INVALID_INPUT` | 조건 오류, 제목·본문 미완성 |
| 404 | `DRAFT_NOT_FOUND` | 없음·타인 초안 |
| 409 | `DRAFT_VERSION_CONFLICT` | 적용 전에 초안 변경 |
| 409 | `RECORD_VERSION_CONFLICT` | 다른 요청이 발행본·공개 범위 변경 |

충돌 시 기존 발행본을 유지한다. 최신 초안과 발행본을 조회하고 사용자가 확인한 뒤 재시도한다. 성공 응답을 잃은 뒤 동일 버전을 반복하면 충돌할 수 있으므로 조회로 상태를 확인한다. 발행 이력 전체를 저장하는 기능은 제공하지 않는다.

## 10. 발행 글 상세 조회

`GET /api/records/{id}` · 공개 글은 인증 불필요, 비공개 글은 본인 인증 필요

성공 `200`: 정식 저장과 같은 발행본 객체. 초안은 반환하지 않는다. 미발행·없는 글·비공개 타인 글은 모두 `404 RECORD_NOT_FOUND`다. Authorization을 보냈다면 유효한 인증을 요구하며 잘못된 토큰을 익명으로 처리하지 않는다. 모든 응답에 `Cache-Control: no-store`를 적용한다. 내용은 JSON 문자열로만 제공하며 최종 화면에서 안전하게 렌더링해야 한다.

글 목록·검색·삭제 API는 후속 기능 단계에서 추가한다.
