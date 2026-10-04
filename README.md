# 취업좀하자

공대생이 프로젝트와 공부 기록을 작성하고, 자신의 포트폴리오와 아카이브를 만드는 웹 서비스.

현재 단계: 백엔드 기능별 구현. Supabase 서울 프로젝트(`chwieop-jom-haja-seoul`, `ap-northeast-2`)에 GitHub 인증·프로필·초안·발행·검색·휴지통·대표 프로젝트 핀·보관함·프로젝트–공부 기록 연결을 구현했습니다. GitHub 가져오기·사진, 최종 프런트엔드·배포는 후속 단계입니다.

- [개발 계획서](docs/PLAN.md)
- [기능명세서](docs/FEATURES.md)
- [API 명세서](docs/API.md)
- [ERD와 DB 권한](docs/ERD.md)
- [GitHub 로그인 설정·검증](docs/AUTH_SETUP.md)
- [블로그 게시 자료](docs/blog/README.md)
- 프로젝트 / 공부 기록 / 기타를 구분한 항목 안내형 작성 + 자유 본문
- 공개·비공개, 대표 프로젝트 핀, 보관함, 검색, 프로젝트–공부 기록 연결
- 개발 환경: VS Code
- 배포·DB: Vercel + Supabase
- 댓글·팔로우·좋아요는 후속 확장 범위

## 개발 순서

계획 정리 → 기능명세서 → 백엔드 기능별 구현·API 명세·ERD·검증 → 화면 설계·프런트엔드 → 통합 검증·배포.

기능마다 구현·검증 후 한국어 커밋 메시지로 GitHub에 기록합니다. 초기 개발 계획서는 기획 당시의 문서로 보존합니다.

## 설치와 실행

Node.js 22.18 이상과 npm을 사용합니다. 현재 작업 환경은 Node.js 24.15입니다.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

이미 `.env`가 있다면 복사하여 덮어쓰지 않습니다. Supabase 연결 전에는 인증 없는 요청의 `401`, 입력 오류, 연결 설정 누락의 `503`을 확인할 수 있습니다. 성공적인 회원 프로필 요청에는 실제 Supabase 연결과 사용자 access token이 필요합니다.

## Supabase 연결 준비

1. Supabase 프로젝트를 생성합니다.
2. Settings의 API 설정에서 프로젝트 URL과 publishable key를 확인하여 `.env`의 두 항목에 입력합니다.
3. SQL Editor에서 `supabase/migrations/`의 SQL 파일을 이름 순서로 각각 한 번 실행합니다. 이미 적용한 마이그레이션은 다시 실행하지 않습니다.
4. [GitHub 로그인 설정](docs/AUTH_SETUP.md)에 따라 Provider·OAuth 앱·콜백 URL을 연결합니다. 현재 서울 프로젝트는 설정을 완료했습니다. 임의의 GitHub 토큰은 이 API의 인증 토큰으로 사용할 수 없습니다.
5. 서버를 재시작한 뒤 [API 명세서](docs/API.md)에 따라 요청합니다.

현재 서울 프로젝트에는 프로필·초안·발행본·검색/휴지통·핀/보관함·관련 기록 마이그레이션 6개를 SQL Editor로 적용했습니다. 다시 실행하지 않습니다. 도쿄의 초기 프로젝트는 사용하지 않으며 아직 삭제하지 않았습니다. 프로덕션 실행에서는 `NEXT_PUBLIC_` 환경 변수를 바꾼 후 `npm run build`로 다시 빌드합니다.

publishable key는 사용자 인증 토큰을 대신하지 않습니다. 이 백엔드는 관리자 `service_role`/secret 키가 필요하지 않습니다. 실제 설정 값·사용자 토큰은 GitHub에 커밋하지 않습니다. `.env`는 `.gitignore`로 제외하며 `.env.example`에는 빈 설정 항목만 둡니다.

## 검증

```powershell
npm test
npm run typecheck
npm run build
npm start
```

- `npm test`: 입력 검증, API의 인증·저장·오류 처리, PostgreSQL 제약·RLS 권한 검사.
- API 테스트는 Supabase 응답을 모의하며, DB 테스트는 PGlite의 PostgreSQL 엔진에 실제 마이그레이션을 실행합니다. Docker나 실제 계정은 필요하지 않습니다.
- 위 테스트는 호스팅된 Supabase의 OAuth·PostgREST 연동 검증을 대신하지 않습니다. 실제 연결 후 별도로 확인합니다.
- `.env`·의존성·빌드 파일은 Git 추적에서 제외합니다.

실제 연결 확인은 서버를 실행한 상태에서 별도 터미널로 수행합니다. 데이터를 추가·변경하지 않고 공개 조회와 인증 거부 응답을 검사합니다.

```powershell
npm run check:connection
# 서버를 다른 포트로 실행했다면:
npm run check:connection -- http://localhost:3100
```

## 현재 파일 역할

| 파일 | 역할 |
|---|---|
| `app/api/me/route.ts` | 내 인증 사용자와 프로필·등록 필요 여부 조회 |
| `app/api/profiles/route.ts` | 인증된 회원의 프로필 등록·부분 수정 |
| `app/api/profiles/[handle]/route.ts` | 개인 주소로 공개 프로필 조회 |
| `app/api/drafts/route.ts`, `app/api/drafts/[id]/route.ts` | 본인 비공개 초안 생성·목록·조회·버전 조건 저장 |
| `lib/draft.ts` | 글 종류·안내 항목·태그·본문·버전 입력 검증 |
| `app/api/drafts/[id]/publish/route.ts` | 초안 버전·발행본 버전 확인 후 공개/비공개 적용 |
| `app/api/records/[id]/route.ts`, `lib/record.ts` | 발행 글 권한 조회·발행 조건 검증 |
| `app/api/records/route.ts`, `app/api/archive/route.ts`, `lib/search.ts` | 공개·본인 검색, 조건 검증, 20개 페이지 응답 |
| `app/api/drafts/[id]/restore/route.ts` | 본인 휴지통 기록의 비공개 복원, 삭제는 초안 상세 경로의 DELETE |
| `app/api/pins/route.ts`, `app/api/bookmarks/`, `lib/collection.ts` | 핀 순서 저장·공개 조회, 본인 보관함·입력 검증 |
| `app/api/links/route.ts`, `app/api/records/[id]/related/route.ts`, `app/api/drafts/[id]/related/route.ts`, `lib/link.ts` | 연결 등록·해제, 양방향 공개/본인 관련 기록 조회 |
| `lib/api.ts` | 인증 확인, Supabase 연결, JSON 제한, 공통 응답·오류 |
| `lib/profile.ts` | 프로필 필드·주소·길이 입력 검증 |
| `supabase/migrations/202610050001_profiles.sql` | 테이블, 제약, 갱신 트리거, 권한·RLS |
| `supabase/migrations/202610050002_record_drafts.sql` | 초안 테이블·제약·버전 트리거·본인 RLS |
| `supabase/migrations/202610050003_records.sql` | 발행본·조회 RLS·잠금과 버전 검사를 사용하는 저장 함수 |
| `supabase/migrations/202610050004_search_trash.sql` | 검색 함수·삭제 상태·접근 정책·삭제/복원 트랜잭션 |
| `supabase/migrations/202610050005_pins_bookmarks.sql` | 핀·보관 테이블·RLS·저장 함수·핀 자동 해제 트리거 |
| `supabase/migrations/202610050006_record_links.sql` | 초안 간 다대다 연결·RLS·공개 필터·유형 변경 시 연결 해제 |
| `tests/*.test.ts` | API 흐름·입력·DB 권한 검증 |
| `scripts/check-connection.mjs` | 실제 Supabase·로컬 API 연결 확인, 데이터 변경 없음 |

현재 `/` 웹 화면은 제공하지 않습니다. API는 `http://localhost:3000/api/...`에서 실행합니다. 개발 환경에서만 `http://localhost:3000/auth/check`에 로그인·프로필 API 검증 화면을 제공합니다. 실제 GitHub OAuth 앱·Provider 설정을 완료했고 설정 값과 검증 범위는 로그인 설정 문서를 참고합니다.

GitHub: https://github.com/JungSeungYoon/chwieop-jom-haja

개발 기록: https://iamjsy.tistory.com/3
