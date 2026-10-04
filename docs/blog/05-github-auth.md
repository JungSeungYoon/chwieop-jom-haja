## GitHub 로그인 코드와 검증 화면 준비

Supabase의 GitHub Provider를 사용하는 PKCE 로그인 코드를 추가했다. 인증 과정에서 저장소 권한은 요청하지 않고 사용자 정보·이메일 범위만 사용하도록 했다. 로그인 후 API 요청에는 Supabase access token을 전달한다.

`lib/browser-auth.ts`는 OAuth 시작, 세션 유지·갱신, 인증된 프로필 API 요청을 담당한다. `app/auth/check`는 실제 백엔드 연동을 확인하기 위한 임시 화면이다. GitHub 로그인과 프로필 등록·수정을 확인할 수 있고, 배포 빌드에서는 이 검증 화면을 공개하지 않는다. 서비스 화면 디자인은 이후 진행한다.

추가한 모의 검사에서는 미로그인 요청 차단, OAuth 요청 권한·반환 주소, API로 전달한 인증 토큰, 주소 중복 실패를 확인했다. 전체 로컬 테스트 12개와 타입 검사가 통과했다.

브라우저 GitHub 로그인 후 OAuth 앱 등록 폼에 서비스 이름, 로컬 홈페이지와 서울 Supabase 콜백 주소를 준비했다. OAuth 앱의 최종 등록·Client Secret 생성·Supabase Provider 설정·실제 로그인과 회원 데이터 저장 검증은 아직 완료하지 않았다. 완료한 코드 검사와 실제 계정 검증을 구분해서 기록한다.

프로덕션 빌드도 통과했고, 프로덕션 서버의 `/auth/check`가 실제 HTTP `404`를 반환하는 것을 확인했다. 검증 화면과 등록 준비 화면은 각각 `screenshots/05-auth-check-ready.png`, `screenshots/05-github-oauth-registration.png`에 보관했다.

Client Secret은 Supabase 설정에만 보관하며 글이나 이미지에 노출하지 않는다. 실제 연결 결과와 화면 캡처는 설정을 완료한 뒤 추가한다.
