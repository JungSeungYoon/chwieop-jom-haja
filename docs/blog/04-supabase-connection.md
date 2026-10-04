## Supabase 프로젝트와 DB 연결

현재 상태: 서울 프로젝트 생성, 프로필 테이블·권한 적용과 로컬 API 연결 검사 완료. GitHub 인증 연결 및 실제 회원 등록·수정 검증은 다음 단계다.

Supabase에 로그인한 뒤 서비스용 조직 `취업좀하자`를 Free 요금제로 생성했다. 프로젝트 생성 화면에는 `chwieop-jom-haja` 이름과 Asia-Pacific 리전을 준비했다. Data API는 사용하고, `Automatically expose new tables`는 해제하여 마이그레이션에서 필요한 테이블 권한을 직접 부여하도록 했다.

DB 비밀번호는 사용자가 직접 설정·보관한다. 비밀번호나 사용자 인증 토큰은 블로그·스크린샷·GitHub에 기록하지 않는다.

일반 리전인 Asia-Pacific으로 생성한 최초 프로젝트는 도쿄(`ap-northeast-1`)에 배정됐다. 국내 사용자를 고려해 서울의 특정 리전(`ap-northeast-2`)을 직접 선택하여 새 프로젝트로 진행하기로 했다. 새 프로젝트 이름은 `chwieop-jom-haja-seoul`이며 기존 도쿄 프로젝트는 아직 삭제하지 않았다.

서울 프로젝트 `chwieop-jom-haja-seoul`의 상태가 Healthy이고 리전이 `Northeast Asia (Seoul)`, `ap-northeast-2`인 것을 확인했다. 연결 URL과 publishable key는 `.env`에 저장했다. DB 비밀번호·관리자 secret 키는 로컬 서버에서 사용하지 않는다.

SQL Editor에서 `202610050001_profiles.sql`을 실행하여 테이블, 입력 제약, 중복 주소 제한, 수정 시각 트리거, 컬럼 권한과 RLS 정책을 적용했다. 실행 결과는 `Success. No rows returned.`였다. SQL Editor로 직접 적용했으므로 Supabase CLI의 마이그레이션 이력 등록과는 구분한다.

## 실제 확인 결과

| 검사 | 결과 |
|---|---|
| 프로필 테이블의 RLS 활성화 | true |
| 접근 정책 3개 존재 | true |
| 방문자의 공개 프로필 조회 권한 | true |
| 방문자의 닉네임 수정 차단 | true |
| 회원의 ID 수정 차단 | true |
| 회원의 닉네임 수정 권한, 행별 소유자 제한은 RLS로 적용 | true |
| 실제 Supabase REST 프로필 조회 | 200, 현재 빈 목록 |
| 로컬 API의 미등록 주소 조회 | 404 PROFILE_NOT_FOUND |
| 잘못된 주소 형식 | 400 INVALID_INPUT |
| 인증 누락·잘못된 토큰 | 각각 401 UNAUTHORIZED |

재현 명령은 `npm run check:connection -- http://localhost:3100`이다. 프로덕션 서버를 3100 포트에서 실행해 확인했으며, 검사 스크립트는 데이터나 계정을 생성하지 않는다. 실제 로그인한 두 회원의 등록·수정·타인 변경 차단은 GitHub 인증 연결 후 별도로 확인한다.

## 연결 과정에서 해결한 문제

Supabase 설정 전에 만든 프로덕션 빌드를 그대로 실행하니 공개 프로필 API가 `503`을 반환했다. `.env`에 설정한 `NEXT_PUBLIC_` 변수를 반영하도록 `npm run build`를 다시 실행하고 서버를 재시작했다. 이후 공개 프로필 조회는 DB에 정상 연결되어 미등록 주소의 `404`를 반환했다.

생성 준비 화면: `screenshots/04-supabase-project-setup.png`, 서울 리전 선택 화면: `screenshots/04-supabase-seoul-setup.png`, 실제 권한 확인 화면: `screenshots/04-supabase-profile-permissions.png`.
