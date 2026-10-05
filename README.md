# 취업좀하자 (chwieop-jom-haja)

공대생이 **프로젝트와 공부 기록을 작성·관리하고, 이를 공개 포트폴리오로 구성할 수 있는 웹 플랫폼**입니다.

단순 게시글 작성 서비스를 넘어 초안 자동 저장, 버전 충돌 방지, 프로젝트-공부 기록 연결, GitHub 저장소 가져오기, 이미지 처리, 공개 포트폴리오, 사용자별 보관 기능을 제공하며 Supabase PostgreSQL의 RLS와 서버 전용 RPC를 중심으로 보안 경계를 구성했습니다.


- [서비스 바로가기](https://chwieop-jom-haja.vercel.app/)
- [개발 과정·최종 산출물](https://iamjsy.tistory.com/3)
- [기능 명세서](docs/FEATURES.md) · [API 명세서](docs/API.md) · [ERD](docs/ERD.md)
- [배포 설정과 검증](docs/DEPLOYMENT.md)

## 주요 기능

- 프로젝트·공부 기록·기타 기록 작성과 공개 포트폴리오
- Markdown·코드·표·수식, 유형별 안내 항목
- 10초간 입력이 멈추면 비공개 초안 자동 저장
- 초안과 발행본 분리, 공개·비공개 발행, 휴지통·복구
- 제목·본문·태그 검색, 유형 필터와 페이지 조회
- 대표 프로젝트 최대 3개 지정·순서 변경
- 다른 사용자의 공개 글 보관, 프로젝트와 공부 기록의 양방향 연결
- GitHub 공개 저장소를 새 프로젝트 초안으로 가져오기
- JPEG·PNG·정적 WebP 원본 최대 5MiB, 이미지 검증·WebP 변환

댓글·팔로우·좋아요와 외부 기록 자동 동기화는 후속 확장 범위입니다.

## 기술 스택

| 영역 | 기술 |
|---|---|
| Runtime | Node.js `>= 22.18.0` |
| Framework | Next.js `16.3.8` App Router |
| Language | TypeScript |
| Styling | Tailwind CSS `4` |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth + GitHub OAuth PKCE |
| Authorization | PostgreSQL RLS |
| Storage | Supabase Private Storage |
| Image | Sharp |
| Deployment | Vercel |

## 설치

```bash
git clone --branch codex/planning https://github.com/JungSeungYoon/chwieop-jom-haja.git
cd chwieop-jom-haja
npm ci
cp .env.example .env
npm run dev
```

위 명령은 Bash 기준입니다. Windows PowerShell에서는 `cp .env.example .env` 대신 다음 명령을 사용합니다. 기존 `.env`가 있다면 덮어쓰지 않습니다.

```powershell
Copy-Item .env.example .env
```

`.env`를 복사한 뒤 실제 Supabase 설정값을 입력해야 합니다. 새 Supabase 프로젝트에서는 `supabase/migrations/`의 SQL 파일 8개를 이름 순서로 각각 한 번 적용하고, [GitHub 로그인 설정](docs/AUTH_SETUP.md)에 따라 Provider와 OAuth 복귀 URL을 설정합니다. 이미 적용한 운영 DB에 마이그레이션을 다시 실행하지 않습니다.

화면만 확인하려면 `http://localhost:3000/?demo=1`에서 명시적인 데모 모드를 사용할 수 있습니다. 데모 보관은 전용 localStorage에 저장하며 실제 DB에 쓰지 않습니다. 작성·프로필·이미지 기능은 실제 인증과 연결 설정이 필요합니다.

프로덕션 Build:

```bash
npm run build
npm start
```

Test:

```bash
npm run test
```

Node Test Runner + PGlite 기반 자동 테스트 **44개**를 구성했습니다. 마지막 구현 단계에서 테스트·타입 검사·프로덕션 빌드가 통과했습니다. 실제 두 GitHub 계정의 브라우저 검증은 수행하지 않았으며, 두 사용자 권한은 자동 테스트로 확인했습니다.

## `.env.example`

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-secret-key
NEXT_PUBLIC_DEMO_MODE=false
```

`SUPABASE_SECRET_KEY`는 서버 전용이다.

`NEXT_PUBLIC_*` 변수에 Secret을 저장해서는 안 된다.

## `.gitignore`

```gitignore
.env
.env.*
!.env.example

.vercel/
supabase/.temp/

node_modules/
.next/
out/
coverage/

*.tsbuildinfo
npm-debug.log*
```

## 실제 Git 커밋 기록

```text
a28f5f8 화면: 작은 화면에서 탐색 메뉴 폭과 줄바꿈 제한
068c68f 화면: 모바일에서 서비스명 줄바꿈 방지
199656a 검증: 포트폴리오 관리 화면 점검과 모바일 메뉴 보완
1976fe8 기능: 개인 포트폴리오·대표 프로젝트·보관함·기록 연결 화면 구현
2034f14 문구: 소개와 화면 안내를 자연스러운 한국어로 수정
ddc5d9a 문서: 배포 기록 줄바꿈 정리
5051ad4 배포: Vercel 운영 연결과 로그인·사진 검증 기록 추가
46ed6fe 배포: Vercel 서울 리전 설정과 배포 점검 준비
0562d8c 기능: 내 아카이브와 프로필 및 기록 작성기 구현
9172eea 기능: 탐색 피드와 기록 상세 화면 구현
b1aefcf 검증: 백엔드 통합 흐름과 실제 연결 점검
4de9a5e 기능: 사진 업로드 검증과 공개·비공개 접근 권한 구현
9a99cbc 기능: GitHub 공개 저장소 가져오기와 프로젝트 초안 생성 구현
b8471fd 기능: 프로젝트·공부 기록 연결과 양방향 관련 기록 조회 구현
1174693 기능: 대표 프로젝트 핀·순서 저장과 개인 보관함 구현
dd0edc3 기능: 글 목록·검색과 휴지통 삭제·복원 구현
23c64ca 기능: 글 공개·비공개 발행과 초안 분리 구현
162d442 기능: 비공개 초안 저장·조회와 버전 충돌 방지 구현
a4e9989 검증: GitHub 로그인과 회원 프로필 저장·유지 확인
80e6525 기능: GitHub PKCE 로그인 코드와 개발용 검증 화면 추가
0f8a4fc 설정: Supabase 서울 DB 연결 및 프로필 권한 검증
959ba90 기능: 회원 프로필 등록·조회·수정 API 구현
222f25e docs: define service features and prepare blog notes
31fa5d2 docs: publish development plan with collapsible blog section
456470c docs: refocus development plan on service features and stack
```

## 검증 방법

`npm test`는 입력·API 모의 응답·PostgreSQL 제약/RLS를 검사하고, `npm run typecheck`는 타입을 검사합니다. 서버를 실행한 상태에서 `npm run check:connection`으로 실제 공개 조회와 인증 거부 응답을 확인할 수 있습니다.

## 보안 설계

### RLS

사용자 데이터는 `auth.uid()`를 기준으로 Row Level Security를 적용한다.

```text
JWT
→ RLS
→ auth.uid()
→ 허용된 Row
```

### XSS

Markdown:

```text
skipHtml=true
rehypeRaw 미사용
```

Raw HTML 실행을 허용하지 않는다.

### SSRF

GitHub Import는 다음과 같은 주소를 거부한다.

```text
127.0.0.1
localhost
::1
RFC1918
169.254.169.254
임의 Host
file:
ftp:
gopher:
```

### 이미지

```text
Untrusted Upload
→ Private Storage
→ Sharp Decode
→ WebP
→ ready=true
→ Authorized Blob
```

### Version Conflict

오래된 자동 저장/삭제/발행 요청은 `409 Conflict`로 거부한다.

## Secret 관리

`SUPABASE_SECRET_KEY`는 RLS 및 일반 DB 권한 경계를 우회할 수 있는 높은 권한의 서버 Secret이므로 Git에 Commit해서는 안 된다.

Git History에 한 번 들어가면 최신 파일에서 삭제하더라도 과거 Commit에 남는다.

유출 시:

- 비공개 데이터 무단 접근
- 데이터 변경/삭제
- Storage 변조
- API Resource Abuse

등으로 이어질 수 있다.

유출 시 원칙:

```text
Secret committed
→ Assume compromised
→ Rotate immediately
```

## 핵심 보안 원칙

1. Secret을 Git에 Commit하지 않는다.
2. Browser 입력을 신뢰하지 않는다.
3. 서버에서 입력을 재검증한다.
4. RLS에서 권한을 다시 검증한다.
5. 객체 ID 자체를 권한으로 간주하지 않는다.
6. Version으로 Lost Update를 차단한다.
7. MIME/확장자를 신뢰하지 않는다.
8. Sharp로 실제 바이너리를 검증한다.
9. Storage는 Private으로 유지한다.
10. GitHub Import의 SSRF를 차단한다.

---
