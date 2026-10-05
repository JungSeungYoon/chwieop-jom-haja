# Vercel 배포

현재 배포 준비 중이다. 실제 배포 주소와 결과는 완료 후 기록한다.

## 프로젝트 설정

- GitHub: `JungSeungYoon/chwieop-jom-haja`
- Production Branch: `codex/planning` (현재 GitHub 기본 브랜치)
- Framework: Next.js, Root Directory: `./`
- Node.js: 24.x
- Build Command: `npm run build`, Install Command: `npm ci`
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
- GitHub OAuth 앱의 Homepage URL을 production origin으로 변경한다.
- GitHub Authorization callback은 기존 Supabase `/auth/v1/callback`을 유지한다. Vercel 주소로 바꾸지 않는다.
- Preview 주소를 광범위한 와일드카드로 허용하지 않는다.

## 배포 검사

```powershell
node scripts/check-deployment.mjs https://실제-서비스.vercel.app
```

공개 화면 200, 개발 검증 화면/환경 파일 404, 토큰 없는 회원 API 401, 공개 피드 형식과 캐시 정책을 검사한다. 이 검사는 DB에 쓰지 않는다. GitHub 로그인·프로필 복원·초안 저장과 사진 등은 브라우저에서 실제 계정으로 확인하고 결과를 구분해 기록한다.

공식 문서: [Git 배포](https://vercel.com/docs/git), [환경 변수](https://vercel.com/docs/environment-variables), [함수 리전 설정](https://vercel.com/docs/functions/configuring-functions/region), [리전 목록](https://vercel.com/docs/regions).
