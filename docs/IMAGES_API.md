# 사진 API 명세

[전체 API 명세서](API.md)의 사진 기능 상세다. 모든 ID는 UUID, 변경 JSON은 최대 8192바이트다. 인증은 Supabase access token의 Bearer 헤더를 사용한다. 크기는 원본 기준 5MiB(5,242,880바이트) 이하이며 글당 예약·첨부 합계 최대 10장이다.

## 업로드 순서

1. `POST /api/drafts/{id}/images`로 사진을 예약한다.
2. 응답의 bucket·upload_path로 로그인한 브라우저 Supabase 클라이언트의 `storage.from(bucket).upload(upload_path, file, {contentType: file.type, upsert: false})`를 호출한다. 원본 바이트를 Next.js 함수 본문에 보내지 않는다.
3. `POST /api/images/{image_id}/complete`로 실제 디코딩·WebP 변환·완료 처리를 요청한다.
4. 완료 응답의 `draft_version`을 반영하거나 초안을 다시 읽는다. 본문에 `![설명](/api/images/{image_id})`를 삽입하고 초안을 저장한다.
5. 기존 발행 API를 명시적으로 호출해야 방문자에게 공개된다.

Vercel 함수의 요청·응답 한도는 4.5MB이므로 5MiB 원본은 Storage에 직접 업로드한다. 서버는 최대 2560×2560 범위의 WebP로 변환하고 출력은 4,000,000바이트 이하로 제한한다. [Vercel 함수 제한](https://vercel.com/docs/functions/limitations)

## 예약과 본인 목록

`POST /api/drafts/{id}/images` — 인증 필수.

```json
{"draft_version":1,"mime_type":"image/png","byte_size":2048}
```

허용 MIME은 image/jpeg, image/png, image/webp다. 미등록 초안·타인 초안·휴지통은 거부한다. 소유자와 경로는 서버가 결정하며 알 수 없는 필드는 거부한다. 최신 초안 버전 검사와 10장 제한을 DB 행 잠금 안에서 수행한다. 예약 자체는 초안 버전을 변경하지 않는다. 서버 키 미설정이면 예약을 남기기 전에 503으로 중단한다.

성공 `201`: data는 아래 사진 객체와 bucket=`record-images`, upload_path=`소유자/초안/사진.upload`, url=`/api/images/사진ID`를 포함한다. ready=false는 표시 가능한 첨부가 아니다.

```json
{"id":"사진 UUID","draft_id":"초안 UUID","owner_id":"회원 UUID","mime_type":"image/png","byte_size":2048,"ready":false,"attached":true,"created_at":"ISO 시각"}
```

`GET /api/drafts/{id}/images` — 인증 필수, 본인만 허용. `200 {"data":{"draft_version":2,"images":[사진객체]}}`. 완료·미완료 예약·해제한 정리 대상을 모두 반환한다. 휴지통에서도 본인 정리용 조회가 가능하다. mime_type·byte_size는 **원본 정보**이며 저장된 공개 파일은 WebP다.

## 완료

`POST /api/images/{id}/complete` — 인증 필수, JSON 본문 없음.

먼저 사용자 JWT로 사진 소유권을 확인한 뒤 서버 전용 키를 사용한다. 크기가 예약 정보와 정확히 일치해야 한다. Sharp로 실제 JPEG·PNG·WebP 디코더 형식과 선언 MIME 일치를 확인하고 손상 파일·지원하지 않는 형식·감지된 다중 프레임·2,000만 화소 초과를 거부한다. WebP로 재인코딩하며 방향 정보를 적용하고 EXIF 등 메타데이터를 제거한다. 원본 다운로드/저장은 15초 네트워크 제한, 재인코딩에는 5초 처리 제한을 둔다.

검증된 경로는 일반 회원의 INSERT·UPDATE를 허용하지 않는다. 서버도 upsert=false로 저장하여 동시 완료·재시도가 이전 사진을 덮어쓰지 않는다. DB 완료 함수는 service_role만 호출할 수 있으며 저장 객체의 존재와 소유자·활성 초안을 다시 확인한다. 사진 ready=true와 초안 버전 증가는 원자적이며 이미 완료한 재요청은 버전을 중복 증가시키지 않는다.

`200 {"data":{"id":"사진 UUID","draft_version":2,"url":"/api/images/사진UUID","source_cleanup_pending":false}}`. 성공 후 원본을 Storage API로 지운다. 원본 정리만 실패하면 source_cleanup_pending=true이며 같은 완료 요청으로 재시도할 수 있다.

실패 시 예약은 미완료 상태로 남는다. 완료를 재시도하거나 최신 초안 버전으로 DELETE하여 정리한다. 파일 저장 후 DB 완료가 실패한 경우에도 파일을 공개 완료로 표시하지 않는다. 해제된 사진의 완료는 거부한다.

## 접근과 발행 목록

`GET /api/images/{id}` — 인증 선택.

- 본인은 완료한 사진을 읽는다. 방문자·타인은 현재 공개·정상 발행본의 record_images에 연결된 사진만 읽는다.
- 초안 사진·수정 중 새 사진·비공개·휴지통 사진은 방문자에게 404다.
- 성공은 JSON이 아닌 WebP 바이너리이며 Content-Type=image/webp, Cache-Control=private, no-store, X-Content-Type-Options=nosniff다.
- 비공개 미리보기는 인증 헤더로 fetch한 Blob을 Object URL로 표시한다. JWT를 URL에 넣지 않는다. 공개 사진은 일반 img src로 조회할 수 있다.
- 버킷은 private이며 같은 접근 규칙을 Storage RLS에도 적용한다. 서명 URL이나 public 버킷 주소를 발급하지 않는다. 비공개 전환 후 새로운 요청은 차단하지만 이미 다운로드한 파일은 회수할 수 없다.

`GET /api/records/{id}/images` — 인증 선택. 글 상세와 같은 접근 규칙으로 현재 발행본의 사진 객체 배열을 `200 {"data":[...]}`로 반환한다. 초안에만 있는 새 사진은 포함하지 않는다. 비공개 발행본은 본인만 조회한다. 휴지통/미발행/타인 비공개는 404다.

## 첨부 해제와 파일 정리

`DELETE /api/images/{id}` — 인증 필수.

```json
{"draft_version":2}
```

본인 사진의 초안 첨부를 해제한다. 완료 사진이면 초안 버전이 증가하고, 미완료 예약 취소는 버전을 바꾸지 않는다. 이미 해제한 요청은 최신 버전으로 재시도 가능하다. 휴지통에서도 정리 가능하다. 본문 문자열은 자동 변경하지 않으므로 편집기에서 링크도 제거한 뒤 저장한다.

`200 {"data":{"id":"사진 UUID","draft_version":3,"retained":true,"cleanup_pending":false}}`.

retained=true는 현재 발행본에 참조가 남아 파일을 보존했다는 뜻이다. 비공개·휴지통 발행본도 복원을 위해 참조를 보존한다. 공개 글 수정 중 삭제한 사진은 새 내용을 적용하기 전까지 기존 방문자가 볼 수 있다. 다음 발행에서 첨부 목록을 다시 복사하고, 참조가 사라진 해제 사진은 Storage API 삭제 후 DB 메타데이터를 정리한다. SQL로 storage.objects만 삭제하지 않는다. [Supabase 파일 삭제](https://supabase.com/docs/guides/storage/management/delete-objects)

물리 삭제 실패 시 `202`와 cleanup_pending=true다. 첨부 해제는 이미 성공했으므로 DELETE를 재시도한다. 발행 시 자동 정리는 한 요청에 최대 20개를 시도하고 남은 항목은 image_cleanup_pending=true로 알린다. 예약의 자동 만료·주기적 청소는 현재 없다. 중단한 예약은 목록에서 직접 취소한다. 계정 탈퇴·물리적인 DB 삭제는 현재 API 범위 밖이며 Storage 정리를 포함한 별도 절차가 필요하다.

## 주요 실패 응답

| HTTP | code | 의미 |
|---|---|---|
| 400 | INVALID_INPUT | UUID·사진 정보·버전·타입·추가 필드 오류 |
| 401 | UNAUTHORIZED | 미로그인/만료 인증 |
| 404 | IMAGE_NOT_FOUND / DRAFT_NOT_FOUND / RECORD_NOT_FOUND | 존재하지 않거나 접근할 수 없음 |
| 409 | IMAGE_LIMIT / DRAFT_VERSION_CONFLICT | 10장 제한/초안 버전 충돌 |
| 413 / 415 | PAYLOAD_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE | JSON 요청 크기/Content-Type 오류 |
| 422 | INVALID_IMAGE / IMAGE_UPLOAD_INCOMPLETE | 위장·손상·제한 초과 이미지/원본 미업로드 |
| 503 | IMAGE_SERVER_NOT_CONFIGURED / IMAGE_STORAGE_FAILED / SERVICE_UNAVAILABLE | 서버 키/파일 저장소/DB 연결 문제 |

Storage 직접 업로드는 버킷 크기·MIME 제한과 RLS를 따르며 Storage SDK의 error로 실패를 전달한다. 해당 실패는 업로드 완료로 표시하지 않는다.
