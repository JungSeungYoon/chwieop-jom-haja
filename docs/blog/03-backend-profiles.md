## 백엔드부터 구현 — 회원 프로필 API

백엔드를 기능별로 구현하고 검증한 뒤, 프런트엔드 화면을 구성하는 순서로 진행하기로 했다. 첫 기능은 회원 프로필 등록·조회·수정이다. GitHub 로그인으로 인증된 사용자와 서비스 프로필 등록 여부를 구분하도록 설계했다.

### 파일 역할과 요청 흐름

| 파일 | 역할 |
|---|---|
| `app/api/me/route.ts` | 인증 회원과 프로필 등록 필요 여부 확인 |
| `app/api/profiles/route.ts` | 본인 프로필 등록·부분 수정 |
| `app/api/profiles/[handle]/route.ts` | 개인 주소로 공개 프로필 조회 |
| `lib/api.ts` | 인증 토큰 검증, DB 연결, 본문 제한, 공통 응답·오류 |
| `lib/profile.ts` | 필수 항목, 주소 형식, 길이, 허용 필드 검사 |
| `supabase/migrations/202610050001_profiles.sql` | 테이블·중복 제약·소유자 RLS·수정 시각 갱신 |
| `tests/*.test.ts` | API 흐름과 DB 권한 검사 |

등록 요청은 `Authorization`의 Supabase 사용자 토큰을 확인한 뒤 JSON 입력을 검사한다. 사용자 ID는 요청 본문을 신뢰하지 않고 인증 결과에서 가져온다. 이후 같은 사용자 토큰으로 DB에 등록하고, 성공 응답으로 저장된 프로필을 반환한다. 화면에서 이 응답을 표시하는 작업은 프런트엔드 단계에 남겨두었다.

DB에는 개인 주소 중복 제한과 사용자별 RLS를 적용했다. 다른 회원의 공개 프로필은 조회할 수 있지만 타인의 프로필을 수정하거나 ID·등록 시각을 변경할 수 없다. 프로필 테이블에는 이메일이나 인증 토큰을 저장하지 않는다.

### 확인한 결과

- `npm test`: 11개 검사 통과. 입력 오류·주소 중복·미등록 회원·인증 만료·저장 실패와 타인 변경 차단을 확인했다.
- API 테스트는 Supabase 응답을 모의했다. DB 검사는 PGlite PostgreSQL 엔진에 실제 마이그레이션을 실행하고 사용자 역할을 바꾸어 검사했다.
- `npm run typecheck`, `npm run build`: 통과.
- 빌드한 서버를 실행해 실제 HTTP 요청도 확인했다. 인증 없는 `/api/me`는 `401 UNAUTHORIZED`, 설정 전 공개 프로필 요청은 `503 SERVICE_UNAVAILABLE`, 잘못된 주소 요청은 `400 INVALID_INPUT`을 반환했다. 세 응답의 캐시 정책도 `no-store`였다.
- 실제 Supabase 프로젝트는 아직 만들지 않았다. 호스팅 DB 연결·GitHub OAuth 로그인·토큰 갱신은 연결 후 검증해야 한다.

### 발생한 오류와 해결

최초 타입 검사에서 PGlite의 Emscripten 관련 타입과 Next.js의 URLPattern 관련 외부 선언 오류가 발생했다. TypeScript 설정에 `skipLibCheck`를 적용하여 외부 라이브러리 선언 검사를 제외했고, 프로젝트 코드의 `strict` 타입 검사는 유지했다. 변경 후 타입 검사와 빌드가 통과했다.

환경 변수 항목은 `.env.example`에 빈 값으로 제공하고 실제 `.env`는 Git에서 제외했다. API 명세서에는 요청·응답·인증·오류를, ERD에는 인증 회원과 프로필의 관계·권한을 작성했다.

관련 자료: [API 명세서](https://github.com/JungSeungYoon/chwieop-jom-haja/blob/codex/planning/docs/API.md), [ERD](https://github.com/JungSeungYoon/chwieop-jom-haja/blob/codex/planning/docs/ERD.md).

이 단계에는 프런트엔드 화면 캡처가 없다. 티스토리에는 전체 작업 후 이 설명과 실제 검증 자료를 이어 붙인다.
