# M1-2 — 사진 업로드 파이프라인

- 마일스톤: M1 (이용 플로우 완성) · 규모 M
- 상태: ☐ 대기
- 의존: M0-2(프론트 테스트 기반), M1-1

## 목적

체크인/아웃(M1-3), 사고 접수(M1-7), 핸들러 완료 인증(M2-3)이 공유할 사진 촬영→압축→저장 공통 경로를 만든다. 무료 인프라 유지를 위해 외부 스토리지 없이 DB에 저장한다(Q2 기본값).

## 작업 내용

- [ ] **shared** — `packages/shared/src/schemas/`에 사진 스키마: base64 data + mime(`image/jpeg`만) · 장당 디코드 후 200KB 제한 · 건당 최대 5장. API 검증과 웹 검증이 같은 스키마 사용
- [ ] **웹** — 공용 `PhotoCapture` 컴포넌트 (`apps/web/src/components/`):
  - `<input type="file" accept="image/*" capture="environment">` (모바일 카메라 우선)
  - canvas로 최대 변 1280px 리사이즈 → JPEG 품질 0.7 인코딩 → 200KB 초과 시 품질 단계 하향
  - 다중 첨부 · 미리보기 썸네일 · 삭제
- [ ] **API** — 사진 저장/조회 공통 모듈: 저장(`ConditionPhoto` insert), 조회는 `data:` URI로 응답 (별도 정적 서빙 불필요)

## 산출물

- `packages/shared/src/schemas/photo.ts`(신규) · `apps/web/src/components/PhotoCapture.tsx`(신규) · `apps/api/src/photos/`(공통 모듈)

## 완료 기준

- 3MB급 원본 사진이 200KB 이하로 저장되고, 상세 화면에서 다시 렌더됨
- 200KB 초과 페이로드·jpeg 외 mime은 shared 검증에서 400

## 테스트

- **백엔드**: shared 사진 스키마 단위 테스트 — 200KB 초과 거부 · jpeg 외 mime 거부 · 5장 초과 거부 / 저장→조회 통합 1건
- **프론트(MSW)**: PhotoCapture 컴포넌트 — 파일 선택 → 압축 → 미리보기 렌더 · 5장 초과 시 에러 표시 · 삭제 동작. 업로드 API는 MSW 목

## 참고

- [project-review.md](../project-review.md) §5.2 · Q2 기본값(이견 시 이 작업 시작 전에 Cloudinary로 전환 결정)
