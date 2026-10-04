# 취업좀하자

공대생이 프로젝트와 공부 기록을 작성하고, 자신의 포트폴리오와 아카이브를 만드는 웹 서비스.

현재 단계: 백엔드 기능별 구현. 첫 기능인 회원 프로필 등록·조회·수정 API와 DB 마이그레이션을 작성했습니다. 실제 Supabase 프로젝트 연결·GitHub 로그인·프런트엔드·배포는 아직 진행하지 않았습니다.

- [개발 계획서](docs/PLAN.md)
- [기능명세서](docs/FEATURES.md)
- [API 명세서](docs/API.md)
- [ERD와 DB 권한](docs/ERD.md)
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
3. SQL Editor에서 `supabase/migrations/202610050001_profiles.sql`을 한 번 실행합니다. 이미 적용한 테이블에 다시 실행하지 않습니다.
4. GitHub Provider·OAuth 앱·콜백 URL 설정은 다음 연결 단계에서 진행합니다. 임의의 GitHub 토큰은 이 API의 인증 토큰으로 사용할 수 없습니다.
5. 서버를 재시작한 뒤 [API 명세서](docs/API.md)에 따라 요청합니다.

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

## 현재 파일 역할

| 파일 | 역할 |
|---|---|
| `app/api/me/route.ts` | 내 인증 사용자와 프로필·등록 필요 여부 조회 |
| `app/api/profiles/route.ts` | 인증된 회원의 프로필 등록·부분 수정 |
| `app/api/profiles/[handle]/route.ts` | 개인 주소로 공개 프로필 조회 |
| `lib/api.ts` | 인증 확인, Supabase 연결, JSON 제한, 공통 응답·오류 |
| `lib/profile.ts` | 프로필 필드·주소·길이 입력 검증 |
| `supabase/migrations/202610050001_profiles.sql` | 테이블, 제약, 갱신 트리거, 권한·RLS |
| `tests/*.test.ts` | API 흐름·입력·DB 권한 검증 |

현재 `/` 웹 화면은 제공하지 않습니다. API는 `http://localhost:3000/api/...`에서 실행합니다.

GitHub: https://github.com/JungSeungYoon/chwieop-jom-haja

개발 기록: https://iamjsy.tistory.com/3
