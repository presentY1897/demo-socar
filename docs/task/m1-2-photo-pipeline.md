# M1-2 — 사진 업로드 파이프라인

- 마일스톤: M1 (이용 플로우 완성) · 규모 M
- 상태: ☑ 완료
- 의존: M0-2(프론트 테스트 기반), M1-1

## 목적

체크인/아웃(M1-3), 사고 접수(M1-7), 핸들러 완료 인증(M2-3)이 공유할 사진 촬영→압축→저장 공통 경로를 만든다. 무료 인프라 유지를 위해 외부 스토리지 없이 DB에 저장한다(Q2 기본값).

## 작업 내용

- [x] **shared** — `packages/shared/src/schemas/`에 사진 스키마: base64 data + mime(`image/jpeg`만) · 장당 디코드 후 200KB 제한 · 건당 최대 5장. API 검증과 웹 검증이 같은 스키마 사용
- [x] **웹** — 공용 `PhotoCapture` 컴포넌트 (`apps/web/src/components/`):
  - `<input type="file" accept="image/*" capture="environment">` (모바일 카메라 우선)
  - canvas로 최대 변 1280px 리사이즈 → JPEG 품질 0.7 인코딩 → 200KB 초과 시 품질 단계 하향
  - 다중 첨부 · 미리보기 썸네일 · 삭제
- [x] **API** — 사진 저장/조회 공통 모듈: 저장(`ConditionPhoto` insert), 조회는 `data:` URI로 응답 (별도 정적 서빙 불필요)

## 산출물

- `packages/shared/src/schemas/photo.ts`(신규) · `apps/web/src/components/PhotoCapture.tsx`(신규) · `apps/api/src/photos/`(공통 모듈)

## 완료 기준

- 3MB급 원본 사진이 200KB 이하로 저장되고, 상세 화면에서 다시 렌더됨
- 200KB 초과 페이로드·jpeg 외 mime은 shared 검증에서 400

## 테스트

- **백엔드**: shared 사진 스키마 단위 테스트 — 200KB 초과 거부 · jpeg 외 mime 거부 · 5장 초과 거부 / 저장→조회 통합 1건
- **프론트(MSW)**: PhotoCapture 컴포넌트 — 파일 선택 → 압축 → 미리보기 렌더 · 5장 초과 시 에러 표시 · 삭제 동작. 업로드 API는 MSW 목

## 결과 (2026-09-01)

- `packages/shared/src/schemas/photo.ts` — 상한 상수(200KB·5장·1280px·품질 4단계) + `photoSchema`/`photosSchema`/`requiredPhotosSchema` + 순수 계산 `base64Bytes`·`fitWithin`·`toDataUri`. 웹 압축과 API 검증이 이 파일 하나를 본다
- `apps/api/src/photos/photo-storage.ts` — `toPhotoRows`(→ Prisma nested create) · `toStoredPhotos`(→ `data:` URI 응답). `bytes`는 클라이언트 값을 믿지 않고 서버에서 다시 계산한다. `ConditionPhoto`/`IncidentPhoto`가 같은 컬럼 규격이라 두 테이블이 함께 쓴다
- `apps/web/src/lib/image.ts` — `createImageBitmap` → 최대 변 1280px 리사이즈 → 품질 0.7/0.55/0.4/0.3 순으로 낮추며 200KB 이하가 되는 첫 결과를 채택, 실패 시 `PhotoTooLargeError`
- `apps/web/src/components/PhotoCapture.tsx` — `capture="environment"` 다중 첨부 · 선택 즉시 압축(제출 때 몰아서 하면 버튼이 멈춘 것처럼 보인다) · 썸네일/삭제 · 장수 초과 에러
- **사진 필수 여부는 스키마를 나눠 표현**: 사진이 증빙 자체인 체크인/체크아웃은 `requiredPhotosSchema`(1~5장), 사진이 없을 수도 있는 사고 접수는 `photosSchema`(0~5장)
- 테스트: shared 단위 19건 · API 단위 2건 · API 통합 1건(200KB 사진 DB 왕복) · 프론트 9건(압축 로직 5 + PhotoCapture 4)
- 업로드 엔드포인트 자체의 MSW 페이로드 검증은 엔드포인트가 생기는 M1-3(체크인/아웃)·M1-7(사고)에서 함께 한다

## 참고

- [project-review.md](../project-review.md) §5.2 · Q2 기본값(이견 시 이 작업 시작 전에 Cloudinary로 전환 결정)
