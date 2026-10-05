# 취업좀하자

공대생이 프로젝트와 공부 기록을 작성하고, 자신의 포트폴리오와 아카이브를 만드는 웹 서비스.

현재 단계: 백엔드와 탐색 피드·최소 기록 상세 화면 구현 완료. Supabase 서울 프로젝트(`chwieop-jom-haja-seoul`, `ap-northeast-2`)의 실제 API에 검색·유형/태그 필터·페이지 조회·보관·GitHub 로그인과 기록 상세를 연결했습니다. 자동 테스트 42개, 타입 검사·빌드와 프로덕션 연결 검사를 통과했습니다. 내 아카이브·프로필 설정·Markdown 작성기와 10초 자동 저장·사진·공개/비공개 발행을 추가했습니다. Vercel 운영 배포와 GitHub 로그인·비공개 저장·사진 검증을 완료했습니다. 개인 포트폴리오·핀/보관함·기록 연결 관리 화면은 후속 단계입니다.

- [개발 계획서](docs/PLAN.md)
- [기능명세서](docs/FEATURES.md)
- [API 명세서](docs/API.md)
- [ERD와 DB 권한](docs/ERD.md)
- [백엔드 통합 점검과 검증 범위](docs/BACKEND_CHECK.md)
- [탐색 화면 구현·검증 기록](docs/blog/14-explore-feed.md)
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
2. Settings의 API 설정에서 프로젝트 URL과 publishable key를 확인하여 `.env`에 입력합니다. 사진 검증에는 서버 전용 secret key(또는 legacy service_role key)를 `SUPABASE_SECRET_KEY`에 추가합니다. `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.
3. SQL Editor에서 `supabase/migrations/`의 SQL 파일을 이름 순서로 각각 한 번 실행합니다. 이미 적용한 마이그레이션은 다시 실행하지 않습니다.
4. [GitHub 로그인 설정](docs/AUTH_SETUP.md)에 따라 Provider·OAuth 앱·콜백 URL을 연결합니다. 현재 서울 프로젝트는 설정을 완료했습니다. 임의의 GitHub 토큰은 이 API의 인증 토큰으로 사용할 수 없습니다.
5. 서버를 재시작한 뒤 [API 명세서](docs/API.md)에 따라 요청합니다.

현재 서울 프로젝트에는 사진·Storage 버킷과 공개 피드 메타데이터 함수를 포함한 마이그레이션 8개를 SQL Editor로 적용했습니다. 다시 실행하지 않습니다. 도쿄의 초기 프로젝트는 사용하지 않으며 아직 삭제하지 않았습니다. 프로덕션 실행에서는 `NEXT_PUBLIC_` 환경 변수를 바꾼 후 `npm run build`로 다시 빌드합니다.

publishable key는 사용자 인증 토큰을 대신하지 않습니다. 일반 데이터 API는 사용자 JWT와 RLS를 사용합니다. 서버 전용 키는 소유자를 확인한 사진의 검증·WebP 저장·완료 처리에 사용하며 클라이언트에 전달하지 않습니다. 실제 설정 값·사용자 토큰은 GitHub에 커밋하지 않습니다. `.env`는 `.gitignore`로 제외하며 `.env.example`에는 빈 설정 항목만 둡니다.

## 탐색 화면과 데모

- 실제 피드: `http://localhost:3000/` 또는 `/?demo=0`.
- 데모 피드: `http://localhost:3000/?demo=1`. 24개 샘플은 실제 DB에 저장하지 않습니다.
- 상세: `/records/{UUID}`. 데모 링크에는 `?demo=1`을 유지합니다.
- `NEXT_PUBLIC_DEMO_MODE=true`는 데모를 기본값으로 지정합니다. `?demo=0`으로 실제 모드를 명시적으로 선택할 수 있습니다.
- 데모 보관은 별도의 localStorage 키에 저장합니다. 저장소를 사용할 수 없으면 실패를 안내하고 상태를 되돌립니다.
- 실제 모드의 실패·빈 결과를 데모 데이터로 자동 대체하지 않습니다. 현재 실제 검증 기록들은 비공개 상태이므로 공개 피드가 비어 있는 것이 정상입니다.
- 메인 화면 GitHub 로그인은 `/`로 반환합니다. 프로필 미등록 사용자는 탐색이 가능하며 `/settings/profile`에서 프로필 등록 후 작성·보관할 수 있습니다.
- 카드에는 작성자·대표 프로젝트 핀·공개 공부 기록 연결 수·현재 회원의 보관 여부가 표시됩니다. 본인 기록은 보관할 수 없습니다.
- Tailwind CSS 4 + Lucide를 사용합니다. 본문은 Markdown·코드 블록·수식을 렌더링합니다. HTML 실행과 위험한 링크는 차단하며 사진은 서비스 사진 경로만 표시합니다.

## 실행 검증

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
| `app/api/imports/github/route.ts`, `lib/github-import.ts` | 공개 저장소 조회·응답 제한·새 프로젝트 초안 생성 |
| `app/api/drafts/[id]/images/`, `app/api/images/`, `app/api/records/[id]/images/`, `lib/image.ts` | 직접 업로드 예약·실제 이미지 검증·권한 조회·첨부 해제와 파일 정리 |
| `supabase/migrations/202610050007_images.sql` | 비공개 Storage 버킷·사진과 발행본 참조·RLS·예약/완료/해제 함수 |
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

탐색(`/`), 내 아카이브(`/archive`), 프로필(`/settings/profile`), 작성기(`/write`) 화면을 제공합니다. API는 `http://localhost:3000/api/...`에서 실행합니다. 개발 환경에서만 `http://localhost:3000/auth/check`에 로그인·프로필 API 검증 화면을 제공합니다. 실제 GitHub OAuth 앱·Provider 설정을 완료했고 설정 값과 검증 범위는 로그인 설정 문서를 참고합니다.

GitHub: https://github.com/JungSeungYoon/chwieop-jom-haja

개발 기록: https://iamjsy.tistory.com/3

배포 주소: https://chwieop-jom-haja.vercel.app

배포 설정과 검증: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## 회원 작업 화면

- `/archive`: 본인 기록 검색·상태 필터·페이지 추가 조회, 휴지통 이동과 비공개 복원, 공개 GitHub 저장소 가져오기.
- `/settings/profile`: 개인 주소·닉네임·전공·관심 분야·소개 등록/수정.
- `/write`: 새 기록 작성. `/write?id={UUID}`: 본인 초안 수정.
- 본문은 Markdown 편집과 미리보기를 제공합니다. 안내 항목은 선택 사항이며 코드·표·수식을 지원합니다.
- 입력이 10초 멈추면 비공개 초안만 저장합니다. 공개/비공개 발행은 별도 버튼으로 실행합니다.
- 충돌과 신규 저장 응답 유실은 현재 입력을 유지하고 백업·서버 재조회를 제공합니다. 저장하지 못한 입력의 새로고침 복원은 보장하지 않습니다.
- 사진은 5MB 이하 JPEG·PNG·WebP를 예약→직접 업로드→서버 검증→본문 삽입 순서로 처리합니다. 실패한 예약의 취소, 완료/정리 재시도를 제공합니다.
- 이 화면들은 실제 계정 전용입니다. 탐색의 데모 모드에 쓰기 기능을 혼합하지 않습니다.
- 파일과 실제 검증 자료: [회원 작업 화면 기록](docs/blog/15-member-workspace.md).
