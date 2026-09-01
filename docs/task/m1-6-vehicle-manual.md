# M1-6 — 차종별 매뉴얼

- 마일스톤: M1 (이용 플로우 완성) · 규모 S
- 상태: ☐ 대기
- 의존: M1-1

## 목적

피드백 #9 "해당 차량에 맞는 매뉴얼 — 차량별로 다르기만 하면 되고 실제 매뉴얼을 구현할 필요는 없음". 차종별로 다른 모의 매뉴얼을 제공한다.

## 작업 내용

- [ ] 매뉴얼 콘텐츠 — 차종(modelName)별 섹션 구조로 모의 작성:
  - 시동/출발 방법(내연 vs EV 다르게) · 주유/충전 방법(연료 타입별) · 공조/편의 기능 · 반납 전 체크리스트
  - 시드 차종 전체를 커버 (EV는 충전 안내, 내연은 주유 카드 안내 등 실제 톤)
  - 저장 위치는 API 내 정적 데이터(`apps/api/src/vehicles/manuals.ts`)로 시작 — DB 불필요 (M1-1에서 합의된 방향)
- [ ] **API** — `GET /vehicles/:id/manual`: 차량의 modelName·fuel로 매뉴얼 선택 반환
- [ ] **웹** — `/vehicles/[id]/manual` 페이지 (섹션 아코디언) · 예약 상세 스마트키 단계와 차량 상세에서 진입 링크

## 산출물

- `apps/api/src/vehicles/manuals.ts`(신규) · vehicles controller `manual` 액션 · `apps/web/src/app/vehicles/[id]/manual/page.tsx`(신규)

## 완료 기준

- 차종 2개 이상에서 서로 다른 콘텐츠가 렌더됨 (EV/내연 시동·연료 섹션이 실제로 다름)

## 테스트

- **백엔드(통합)**: 차종 2종 이상에서 서로 다른 매뉴얼 응답 · 없는 차량 404
- **프론트(MSW)**: 매뉴얼 페이지 — 섹션 아코디언 렌더 · EV/내연에 따라 다른 섹션 표시

## 참고

- [project-review.md](../project-review.md) §5.2
