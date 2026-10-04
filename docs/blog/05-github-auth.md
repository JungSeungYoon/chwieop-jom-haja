## GitHub 로그인 연결과 실제 프로필 검증

Supabase의 GitHub Provider를 사용하는 PKCE 로그인 코드를 추가했다. 인증 과정에서 저장소 권한은 요청하지 않고 사용자 정보·이메일 범위만 사용하도록 했다. 로그인 후 API 요청에는 Supabase access token을 전달한다.

`lib/browser-auth.ts`는 OAuth 시작, 세션 유지·갱신, 인증된 프로필 API 요청을 담당한다. `app/auth/check`는 실제 백엔드 연동을 확인하기 위한 임시 화면이다. GitHub 로그인과 프로필 등록·수정을 확인할 수 있고, 배포 빌드에서는 이 검증 화면을 공개하지 않는다. 서비스 화면 디자인은 이후 진행한다.

추가한 모의 검사에서는 미로그인 요청 차단, OAuth 요청 권한·반환 주소, API로 전달한 인증 토큰, 주소 중복 실패를 확인했다. 전체 로컬 테스트 12개와 타입 검사가 통과했다.

브라우저 GitHub 로그인 후 OAuth 앱을 등록했다. Supabase에는 Client ID·Client Secret을 설정하고 GitHub Provider를 활성화했다. 로그인 반환 주소는 `http://localhost:3000/auth/check`로 저장했다. GitHub의 동의 화면에서도 요청 권한이 이메일·프로필 읽기이며 저장소 권한은 없는 것을 확인했다.

프로덕션 빌드도 통과했고, 프로덕션 서버의 `/auth/check`가 실제 HTTP `404`를 반환하는 것을 확인했다. 검증 화면과 등록 준비 화면은 각각 `screenshots/05-auth-check-ready.png`, `screenshots/05-github-oauth-registration.png`에 보관했다.

### 실제 계정으로 확인한 흐름

1. GitHub 첫 로그인과 동의 후 사이트로 돌아와 ‘프로필 등록이 필요합니다’ 상태를 확인했다.
2. 개인 주소 `jungseungyoon`, 닉네임 `승윤`, 소개를 등록하여 저장 성공을 확인했다.
3. 소개를 ‘개발·통신·보안 프로젝트와 공부 기록을 정리합니다.’로 수정했다.
4. 공개 프로필 API를 별도 HTTP 요청으로 조회해 `200`과 수정한 내용을 확인했다.
5. 새로고침 후 같은 프로필이 유지되는 것을 확인했다.
6. 로그아웃 후 회원 폼이 사라지고, 인증 헤더 없는 내 계정 요청은 `401`을 반환했다.
7. 다시 GitHub로 로그인하여 주소·닉네임·수정한 소개가 그대로 복원되는 것을 확인했다.

기록 화면: `screenshots/05-profile-reloaded.png`, `screenshots/05-profile-logout.png`, `screenshots/05-profile-relogin.png`. 로그인 반환 설정과 최초 동의 화면도 함께 보관했다. Client Secret·사용자 토큰·실제 이메일은 글이나 이미지에 노출하지 않는다.

### 설정 과정에서 확인한 문제

처음 저장했다고 생각한 뒤에도 Provider 목록은 Disabled였고, Client ID가 비어 있었다. Client ID를 다시 입력하고 GitHub enabled를 켠 상태로 저장한 뒤, 새로고침하여 Enabled를 확인했다. 이후 실제 OAuth 요청이 GitHub 동의 화면까지 정상 이동했다. 인증 설정 입력과 저장된 상태를 구분해 확인했다.

주소 중복·타인 변경 차단은 로컬 API·PostgreSQL 권한 검사로 확인한 내용이다. 실제 두 계정의 상호 권한, 로그인 취소·외부 장애, 만료 후 토큰 갱신은 추후 통합 검증에서 확인한다. 현재 실제 계정으로 통과한 범위와 이후 확인할 범위를 구분했다.
