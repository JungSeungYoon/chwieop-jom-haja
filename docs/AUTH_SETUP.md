# GitHub 로그인 연결

현재 상태: GitHub OAuth 앱·Supabase Provider 연결과 실제 회원 로그인·프로필 등록·수정·새로고침·로그아웃·재로그인 검증 완료. 탐색 화면 로그인도 연결했으며 프로필 설정 UI와 배포 환경의 인증 연결은 후속 단계다.

탐색 단계에서는 서비스 메인 화면의 GitHub 로그인·로그아웃을 연결했다. `loginWithGitHub("/")`가 현재 origin의 메인 화면으로 반환하며, 기존 Site URL인 `http://localhost:3000`에서 실제 PKCE 코드 교환·프로필 복원을 확인했다. 개발 검증 도구는 기본 인수 `/auth/check`를 유지한다. 콜백 code는 SDK의 세션 초기화 완료 후 URL에서 제거한다. 배포 origin과 프로필 설정 UI는 후속 단계다.

## 설정할 값

| 위치 | 항목 | 값 |
|---|---|---|
| GitHub OAuth App | Application name | 취업좀하자 |
| GitHub OAuth App | Homepage URL | `http://localhost:3000` |
| GitHub OAuth App | Authorization callback URL | `https://vstocgnybjuubtqlujsr.supabase.co/auth/v1/callback` |
| GitHub OAuth App | Enable Device Flow | 사용하지 않음 |
| Supabase → Sign In / Providers → GitHub | Client ID / Secret | 등록한 OAuth 앱의 값 |
| Supabase → URL Configuration | Site URL | `http://localhost:3000` |
| Supabase → URL Configuration | Redirect URL | `http://localhost:3000/auth/check` |

Client Secret은 Supabase의 GitHub Provider 설정에만 입력한다. GitHub·블로그·프런트엔드·`.env.example`에 저장하지 않는다. 이 서비스의 브라우저 코드는 공개 키만 사용한다. 배포 주소가 정해지면 앱 홈페이지·Site URL·프런트엔드 콜백 주소를 배포 주소에 맞게 변경한다. GitHub에서 Supabase로 돌아오는 callback URL과 Supabase에서 사이트로 돌아오는 redirect URL은 다르다.

## 구현 흐름

1. `/auth/check`에서 GitHub로 로그인한다.
2. Supabase JS 클라이언트가 PKCE 검증값을 보관하고 Supabase Auth를 통해 GitHub 인증 화면으로 이동한다.
3. GitHub 인증 후 Supabase callback을 거쳐 `/auth/check`로 돌아온다.
4. SDK가 인증 코드를 세션으로 교환한다. 로그인 요청은 `read:user user:email`만 사용하고 저장소 권한을 요구하지 않는다.
5. 사용자 access token으로 `/api/me`를 호출한다. 등록 여부에 따라 프로필을 최초 등록하거나 수정한다.
6. SDK가 세션 유지·갱신을 처리한다. 검증 화면에서 로그아웃하면 해당 브라우저의 세션을 종료한다.

`/auth/check`는 개발 환경 전용 임시 화면이다. `npm run dev`에서만 제공하고 프로덕션 빌드에서는 404를 반환한다. 최종 프런트엔드에서 로그인 화면과 반환 경로를 연결한다. UI에 토큰·이메일·Client Secret을 출력하지 않는다.

## 확인한 결과

| 검사 | 결과 |
|---|---|
| 실제 GitHub 첫 로그인 | 성공, 미등록 회원으로 확인 |
| 실제 프로필 최초 등록 | 성공, 주소 `jungseungyoon`, 닉네임 `승윤` |
| 소개 부분 수정 | 성공, 수정한 소개로 공개 API 응답도 일치 |
| 새로고침 | 기존 프로필과 수정한 소개 유지 |
| 로그아웃 | 완료, 회원 폼 제거 |
| 인증 헤더 없는 `/api/me` | 401 |
| 실제 GitHub 재로그인 | 성공, 주소·닉네임·수정한 소개 복원 |

로컬 테스트 12개, 타입 검사와 빌드도 통과했다. 주소 중복·입력 검증·타인 변경 차단은 모의 API 및 로컬 PostgreSQL RLS 검사로 확인했다. 실제 두 계정 사이의 권한 검사, OAuth 취소·외부 장애, 만료 시각에 따른 토큰 갱신은 아직 실계정으로 재현하지 않았다. 설정된 자동 갱신 기능과 실제 갱신 검증을 구분한다.

등록한 프로필은 검증 후에도 DB에 유지한다. 초기 닉네임·주소·소개는 변경할 수 있다. 토큰과 이메일은 검증 기록에 출력하지 않았다.

공식 연결 방법: [Supabase GitHub 로그인](https://supabase.com/docs/guides/auth/social-login/auth-github).

## 운영 배포 설정

운영 GitHub 로그인과 프로필 복원을 확인했다. Site URL은 https://chwieop-jom-haja.vercel.app 이며 운영 루트와 로컬 루트를 Redirect URLs에 등록했다. 위 표는 초기 로컬 설정 기록이다. 현재 적용 값과 검증 범위는 [DEPLOYMENT.md](DEPLOYMENT.md)를 참고한다. GitHub OAuth 홈페이지 표시 주소는 기존 로컬 값, Supabase callback은 그대로 유지했다.
