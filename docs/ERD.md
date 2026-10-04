# 데이터 구조 — 회원 프로필·비공개 초안

현재 프로필·비공개 초안·발행 기록을 구현했다. 핀·보관·연결·사진 테이블은 각 기능 구현 단계에서 추가한다.

```mermaid
erDiagram
    AUTH_USERS ||--o| PROFILES : "서비스 프로필 등록"
    PROFILES ||--o{ RECORD_DRAFTS : "비공개 초안 작성"
    RECORD_DRAFTS ||--o| RECORDS : "명시적 정식 저장"
    PROFILES ||--o{ RECORDS : "발행 글 소유"
    AUTH_USERS {
        uuid id PK "Supabase Auth 관리"
    }
    RECORDS {
        uuid id PK,FK "원본 초안 ID"
        uuid owner_id FK "소유자 프로필"
        text record_type "글 유형"
        text title "필수 제목"
        text body "필수 Markdown 본문"
        jsonb details "선택 안내 항목"
        text_array tags "태그"
        text visibility "public private"
        integer source_version "적용한 초안 버전"
        integer version "발행본 버전"
        timestamptz created_at "최초 정식 저장"
        timestamptz updated_at "마지막 적용"
    }
    RECORD_DRAFTS {
        uuid id PK "초안 ID"
        uuid owner_id FK "작성자 프로필"
        text record_type "project study other"
        text title "미완성 허용"
        text body "Markdown 본문"
        jsonb details "유형별 선택 안내 항목"
        text_array tags "최대 10개"
        integer version "수정마다 증가"
        timestamptz created_at "생성 시각"
        timestamptz updated_at "수정 시각"
    }
    PROFILES {
        uuid id PK,FK "인증 사용자 ID"
        text handle UK "개인 주소"
        text nickname "닉네임"
        text major "전공"
        text interests "관심 분야"
        text bio "짧은 소개"
        timestamptz created_at "등록 시각"
        timestamptz updated_at "수정 시각"
    }
```

- `auth.users`는 Supabase Auth가 관리한다. 회원 가입만으로 서비스 프로필을 자동 생성하지 않는다.
- 인증 사용자 한 명당 프로필은 0개 또는 1개다. 인증 사용자 삭제 시 프로필도 삭제한다.
- `handle`에는 고유 제약, 입력 필드에는 길이·형식 제약을 적용한다.
- `created_at`은 DB가 설정하고 `updated_at`은 수정 트리거로 갱신한다. 일반 사용자는 ID·시각을 수정할 수 없다.
- 이 테이블의 모든 필드는 공개 프로필 정보다. 이메일·인증 토큰·비공개 데이터를 추가하지 않는다.

## DB 권한

| 역할 | 조회 | 등록 | 수정 | 삭제 |
|---|---|---|---|---|
| `anon` 방문자 | 공개 프로필 | 불가 | 불가 | 불가 |
| `authenticated` 회원 | 공개 프로필 | 본인 ID만 | 본인 프로필의 입력 필드만 | 불가 |

PostgreSQL 권한과 RLS 정책을 함께 적용한다. 클라이언트가 Next.js API를 거치지 않고 Supabase API를 직접 호출해도 소유자 규칙을 적용한다. 프로필 삭제 API와 탈퇴는 이번 기능 범위에 포함하지 않았다.

마이그레이션: `supabase/migrations/202610050001_profiles.sql`.

## 비공개 초안 권한과 저장 버전

프로필당 초안 여러 개를 저장한다. 프로필 삭제 시 소유 초안도 삭제한다. `owner_id, updated_at desc, id` 인덱스는 목록 조회를 지원한다. 제목·본문 길이, 태그 개수·길이, 안내 키와 값 형식은 DB 제약으로도 검사한다.

익명은 조회·변경 권한이 없다. 회원은 RLS를 통해 본인 행만 조회·생성·수정한다. ID·소유자·버전·시각의 직접 수정과 삭제 권한은 부여하지 않는다. 트리거가 버전과 수정 시각을 변경하고 API는 현재 버전을 조건으로 원자적으로 수정한다. 공개 프로필 조회로 초안이 노출되지 않는다.

두 번째 마이그레이션은 `supabase/migrations/202610050002_record_drafts.sql`이다. 기존 프로필 마이그레이션 다음에 한 번 적용한다.

## 발행본과 원자적 적용

`records`는 초안 하나당 발행본 0개 또는 1개를 갖는다. 초안 저장은 발행본을 변경하지 않는다. 발행 시 초안 콘텐츠를 복사해 공개/비공개 상태로 저장한다. 초안 삭제 시 발행본도 삭제되는 외래 키를 적용했다. 실제 삭제 API는 아직 구현하지 않았다.

익명은 공개 행만, 회원은 공개 행과 본인 비공개 행만 조회한다. INSERT·UPDATE·DELETE 권한은 두 역할 모두에 없다. `apply_record` 함수만 인증 회원에게 실행을 허용한다. `SECURITY DEFINER` 함수에 빈 search_path·명시적 스키마를 적용하고 내부에서 `auth.uid()`·소유자·두 버전을 검증한다. 익명 및 PUBLIC의 실행 권한은 회수했다.

초안 행과 발행본을 잠근 뒤 한 트랜잭션에서 복사하여 초안 저장과 발행 요청이 엇갈리지 않도록 한다. 오래된 요청이 비공개 상태를 다시 공개하는 것도 발행 버전 검사로 차단한다. 원본 초안 버전은 `source_version`에 보관한다.

세 번째 마이그레이션: `supabase/migrations/202610050003_records.sql`. 발행 이력 전체 대신 마지막 적용본만 저장한다.
