# M4-4 — Export (CSV/JSON)

- 마일스톤: M4 (지표·차트·Export) · 규모 M
- 상태: ☐ 대기
- 의존: M4-2

## 목적

피드백 #6 "필터링해서 json이나 csv등으로 export하는 기능". 리포트와 주요 목록을 적용 중인 필터 그대로 파일로 내려받는다.

## 작업 내용

- [ ] 공통 Export 유틸(API): rows → CSV 직렬화(헤더 한국어 라벨, 값 이스케이프) / JSON 그대로
  - CSV는 **UTF-8 BOM** 포함 (엑셀에서 한글 깨짐 방지) · `Content-Disposition: attachment; filename="..."` (지표·기간 포함한 파일명)
- [ ] 적용 대상: `GET /ops/reports`(M4-2) + 목록 4종 — `GET /ops/fleet` · 예약 목록 · `GET /ops/tasks` · `GET /ops/users/risk` — 전부 `?format=csv|json` 파라미터로 동작 (미지정 시 기존 JSON 응답 그대로)
- [ ] 웹: 리포트 화면(M4-3)과 각 목록 상단에 내보내기 버튼(CSV/JSON) — 현재 필터를 쿼리에 실어 링크로 다운로드

## 산출물

- export 유틸 · 대상 엔드포인트 5곳 확장 · 웹 내보내기 버튼

## 완료 기준

- 통합 테스트: format=csv 응답의 Content-Type/Disposition/BOM · 필터 반영
- 다운로드한 CSV를 엑셀에서 열어 한글·숫자 정상 확인 (수동 1회)

## 테스트

- **백엔드(통합)**: format=csv 응답의 Content-Type·Content-Disposition·UTF-8 BOM · 값 이스케이프(쉼표/줄바꿈 포함 데이터) · 필터 반영 · format 미지정 시 기존 JSON 유지
- **프론트(MSW)**: 내보내기 버튼이 현재 필터를 쿼리에 실어 올바른 다운로드 URL을 구성하는지

## 참고

- [project-review.md](../project-review.md) §5.5
