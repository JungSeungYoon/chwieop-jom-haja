# Vercel 배포

배포 주소: https://chwieop-jom-haja.vercel.app

Vercel Hobby에서 실제 Production 배포가 Ready 상태임을 확인했다. 최초 배포 커밋은 `46ed6fe`다.

## 프로젝트 설정

- GitHub: `JungSeungYoon/chwieop-jom-haja`
- Production Branch: `codex/planning` (현재 GitHub 기본 브랜치)
- Framework: Next.js, Root Directory: `./`
- Node.js: Vercel 기본 설정, 저장소 engines는 `>=22.18.0`. 실제 배포 런타임의 정확한 버전은 별도 확인하지 않았다.
- Build/Install Command: Next.js 프레임워크 기본 설정을 사용한다.
- Hobby 요금제를 사용한다. 별도의 도메인 구매 없이 Vercel 제공 주소로 배포한다.
- `vercel.json`의 함수 리전은 Supabase DB와 같은 서울 `icn1`이다.

## 환경 변수

Vercel 프로젝트의 Production 환경에 아래 이름으로 설정한다. 값은 로컬 `.env` 또는 Supabase 설정에서 옮기며 Git에 넣지 않는다.

| 이름 | 용도 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 서울 Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 브라우저 공개 키, 사용자 인증/RLS와 함께 사용 |
| `SUPABASE_SECRET_KEY` | 서버에서만 사진 검증·저장·정리 처리 |
| `NEXT_PUBLIC_DEMO_MODE` | `false`, 실제 피드가 기본 |

서버 전용 키에 `NEXT_PUBLIC_`를 붙이지 않는다. 환경 변수 변경 후 새 빌드가 필요하다. Preview 배포에 운영 DB 키를 자동으로 공유하지 않는다.

## GitHub 로그인 반환 주소

- Supabase → Authentication → URL Configuration의 Site URL을 실제 production origin으로 설정한다.
- Redirect URLs에 production origin의 `/`를 정확히 추가한다. 로컬 개발 주소도 유지한다.
- GitHub OAuth 앱의 Homepage URL은 기존 로컬 주소를 유지한다. 홈페이지 표시용 값이며 실제 운영 로그인 반환은 아래 Supabase 설정으로 검증했다.
- GitHub Authorization callback은 기존 Supabase `/auth/v1/callback`을 유지한다. Vercel 주소로 바꾸지 않는다.
- Preview 주소를 광범위한 와일드카드로 허용하지 않는다.

## 배포 검사

```powershell
node scripts/check-deployment.mjs https://chwieop-jom-haja.vercel.app
```

공개 화면 200, 개발 검증 화면/환경 파일 404, 토큰 없는 회원 API 401, 공개 피드 형식과 캐시 정책을 검사한다. 이 검사는 DB에 쓰지 않는다. GitHub 로그인·프로필 복원·초안 저장과 사진 등은 브라우저에서 실제 계정으로 확인하고 결과를 구분해 기록한다.

공식 문서: [Git 배포](https://vercel.com/docs/git), [환경 변수](https://vercel.com/docs/environment-variables), [함수 리전 설정](https://vercel.com/docs/functions/configuring-functions/region), [리전 목록](https://vercel.com/docs/regions).

## 실제 적용·검증 결과

- Production 환경에 위 네 변수를 설정했다. Preview에는 운영 키를 추가하지 않았다.
- Supabase Site URL: `https://chwieop-jom-haja.vercel.app`.
- Redirect URLs: `https://chwieop-jom-haja.vercel.app/`, `http://localhost:3000/`, 기존 `http://localhost:3000/auth/check`.
- 읽기 검사 15개 통과: 화면 200, 비인증 회원 API 401, 환경 파일·개발 검증 화면 404, 공개 목록 형식·캐시 정책·잘못된 검색 조건 처리.
- 운영 주소에서 GitHub 로그인, 프로필 복원, 비공개 초안 저장·발행, 사진 업로드·변환·미리보기, 새로고침 복원, 내 아카이브 표시 확인.
- 검증용 비공개 기록과 사진은 비로그인 요청에서 각각 404. 공개 피드는 비공개 기록을 표시하지 않는다.
- 검증 데이터는 비공개로 유지했다. 다른 계정 보관, 토큰 만료·갱신, 운영 공개 발행은 이번 배포에서 재검증하지 않았다.
- 개인 공개 포트폴리오·핀/보관함 목록·연결 관리 UI는 후속 범위다. 현재 구현 상태를 전체 계획 기능 완료로 보지 않는다.
- 자료와 실제 화면은 [배포 단계 기록](blog/16-deployment.md)에 정리했다. 티스토리에는 게시하지 않았다.
