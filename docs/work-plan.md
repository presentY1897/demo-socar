# 작업 계획 — 확장 로드맵 M0~M5 인덱스

> 기준일 2026-09-01 (v4 — 3차 피드백 반영: M5를 "MOCAR 비즈니스 — 법인 플릿/리스 관리 서비스 분리"로 재설계). [project-review.md](project-review.md) §5 로드맵의 실행 계획.
> **개별 작업의 상세(목적·세부 작업·산출물·테스트·완료 기준)는 [task/](task/) 폴더의 문서 1개씩으로 관리**하고, 이 파일은 전체 현황 인덱스다.
> ⚠️ 내부 작업 문서 — public 전환 전 제거/정리 대상.

## 확정된 결정 (2026-09-01)

| 항목 | 결정 |
|---|---|
| 스마트키 시동 (Q3) | **가상키에 시동 포함** — UNLOCK / LOCK / HAZARD / HORN / IGNITION_ON / IGNITION_OFF |
| 차트 라이브러리 (Q6) | **Chart.js 전면 통일** — 기존 Recharts 차트도 교체 |
| README 배지 (2차) | **M0-1 취소** — 링크가 이미 있어 최상단 이동 불필요 판정 |
| 프론트 테스트 (2차) | **MSW 목 서버 기반** — Vitest + RTL + MSW, 모든 프론트 작업에 필수 테스트 포함 |
| 법인 권한 (2차) | **등급 체계 신설(M5)** — 등급 부여 기능 + 등급별 조회/편집 권한 분리 |
| 법인 서비스 (3차) | **리스 관리 서비스 관점으로 분리 구성** — "MOCAR 비즈니스" 바운디드 컨텍스트(`/biz` 웹 영역 + API 네임스페이스, 추출 가능 경계), `LeaseContract` 도메인, 전용 차량 = 리스 계약으로 개념 통합 |

## 기본값으로 진행 예정 (이견 있으면 해당 작업 시작 전에 표시)

| 항목 | 기본값 |
|---|---|
| 사진 저장 (Q2) | 클라이언트 압축(1280px/JPEG, 장당 ~200KB) 후 DB 저장 — Neon 무료 0.5GB 내, 외부 의존 없음 |
| 텔레메트리 모의 (Q4) | 조회 시점 계산 + SSE 주기 갱신 — 백그라운드 워커 없음 |
| 스코프 아웃 (Q5) | 패스포트 · 하이패스 · 실제 보험사 청구 연동은 계속 제외 |
| 진행 순서 (Q1) | M0 → M1 → M2 → M3 → M4 → M5. **M5는 독립적이라 앞으로 당길 수 있음** (예: M1 직후) — 원하는 시점 지정 가능 |

## 운영 규칙

- 작업 1개 = [task/](task/)의 문서 1개 = 검증 가능한 커밋 1개 이상. **작업 문서의 완료 기준을 만족해야 ☑**
- 상태 변경 시 **작업 문서의 상태 줄과 이 인덱스를 같은 커밋에서 갱신**
- 각 마일스톤의 마지막 작업은 "검증·문서·배포" — 백/프론트 테스트 전건 + 배포 스모크 + 문서 갱신
- DB 스키마 변경은 마일스톤당 마이그레이션 1건으로 모은다 (각 마일스톤 첫 작업)
- 시드 변경 작업은 `SEED_VERSION +1` 포함

### 공통 테스트 기준 (모든 작업에 적용 — 2차 피드백)

- **백엔드**: 신규 엔드포인트마다 통합 테스트(supertest, 실제 DB) 필수 — 정상 경로 + 권한/게이트 위반(403·409·400) 최소 1건씩. 순수 로직(요금·모의 엔진·스코어링)은 단위 테스트
- **프론트**: 신규 화면/컴포넌트마다 Vitest + React Testing Library 테스트 필수 — **API는 MSW 목 서버로 대체**(M0-2 기반), 핵심 인터랙션(제출·상태 전환·검증 에러 표시)과 요청 페이로드 검증 포함
- 각 작업 문서의 "테스트" 섹션이 그 작업의 최소 테스트 목록 — 이를 통과해야 완료

---

## M0 — 기반 정비 (활성 1개)

| 상태 | ID | 작업 | 의존 |
|---|---|---|---|
| ✖ | [M0-1](task/m0-1-readme-badges.md) | ~~README 배지 승격~~ — 취소 (링크 이미 존재, 이동 불필요 판정) | — |
| ☑ | [M0-2](task/m0-2-front-test-setup.md) | 프론트 테스트 기반 구축 — Vitest + RTL + **MSW 목 서버**, 예시 테스트 2건 | — |

## M1 — 이용 플로우 완성 (L · 8개)

| 상태 | ID | 작업 | 의존 |
|---|---|---|---|
| ☑ | [M1-1](task/m1-1-domain-migration.md) | 도메인 마이그레이션 — ConditionReport·ControlLog·Inquiry·Incident 등 | — |
| ☑ | [M1-2](task/m1-2-photo-pipeline.md) | 사진 업로드 파이프라인 — PhotoCapture 압축→DB 저장 공통 경로 | M0-2, M1-1 |
| ☑ | [M1-3](task/m1-3-checkin-checkout.md) | 체크인/체크아웃 API + 예약 상세 단계형 UI | M1-2 |
| ☑ | [M1-4](task/m1-4-smart-key.md) | 가상 스마트키 — 문열림/잠금/비상등/경적 + 시동(확정) | M1-3 |
| ☑ | [M1-5](task/m1-5-return-zone-change.md) | 예약 변경 시 반납존 변경 — 차액 정산 + 위치 체인 재검증 | M1-1 |
| ☑ | [M1-6](task/m1-6-vehicle-manual.md) | 차종별 매뉴얼 — 모의 콘텐츠·API·페이지 | M1-1 |
| ☑ | [M1-7](task/m1-7-inquiry-incident.md) | 문의 + 사고 접수(모의, 면책 안내) | M1-2 |
| ☑ | [M1-8](task/m1-8-verify-deploy.md) | 검증·문서 — ADR-007, E2E 동선 완주 (배포는 스코프 아웃) | M1-3~7 |

## M2 — 핸들러(운송기사) 시스템 (M · 6개)

| 상태 | ID | 작업 | 의존 |
|---|---|---|---|
| ☑ | [M2-1](task/m2-1-handler-domain.md) | 핸들러 도메인 + 데모 계정 — HANDLER 역할·HandlerTask | M1 |
| ☑ | [M2-2](task/m2-2-task-autocreate.md) | 작업 자동 생성 — 부름 결제→배달, 반납→회수 | M2-1 |
| ☑ | [M2-3](task/m2-3-handler-api.md) | 핸들러 API — 작업 큐·상태 전이·완료 시 차량 위치 반영 | M2-2 |
| ☑ | [M2-4](task/m2-4-assign-api.md) | 배정 API — /ops/tasks·거리 추천·REPOSITION 생성 | M2-1 |
| ☑ | [M2-5](task/m2-5-handler-page.md) | /handler 페이지 — 배달앱 기사 문법 작업 큐/상세 | M2-3 |
| ☑ | [M2-6](task/m2-6-verify-deploy.md) | 검증·문서·배포 — ADR-008, 부름 전 과정 완주 | M2-2~5 |

## M3 — 운영 백오피스 전면 재설계 (L · 7개)

| 상태 | ID | 작업 | 의존 |
|---|---|---|---|
| ☑ | [M3-1](task/m3-1-domain-migration.md) | 도메인 마이그레이션 — Telemetry·ZoneContract·VehicleFinance | M2 |
| ☑ | [M3-2](task/m3-2-telemetry-engine.md) | 텔레메트리 모의 엔진 — 조회 시점 계산 + SSE | M3-1 |
| ☑ | [M3-3](task/m3-3-ops-api.md) | /ops API — fleet·계약·리스크·문의 답변·회계·경고 | M3-2 |
| ☑ | [M3-4](task/m3-4-home-fleet-tabs.md) | 운영 홈 + Fleet 탭 UI — 경고 피드·실시간 지도·차량 등록 | M3-3 |
| ☑ | [M3-5](task/m3-5-contract-customer-tabs.md) | 존/계약 + 고객 탭 UI — 잔여 자리·유의 유저·문의함 | M3-3 |
| ☑ | [M3-6](task/m3-6-dispatch-accounting-tabs.md) | 작업/배차 + 회계 탭 UI — 배정 화면·손익 격리 | M3-3 |
| ☑ | [M3-7](task/m3-7-verify-deploy.md) | 검증·문서·배포 — ADR-009, 6탭 완주 | M3-4~6 |

## M4 — 지표·차트·Export (M · 5개)

| 상태 | ID | 작업 | 의존 |
|---|---|---|---|
| ☑ | [M4-1](task/m4-1-chartjs-migration.md) | Chart.js 전면 전환 — Recharts 제거(확정) | M3 |
| ☑ | [M4-2](task/m4-2-report-api.md) | 리포트 빌더 API — 지표 5종 × 기간/groupBy/필터 | M3-3 |
| ☑ | [M4-3](task/m4-3-report-ui.md) | 리포트 UI — 필터→차트+표 즉시 렌더 | M4-1·2 |
| ☑ | [M4-4](task/m4-4-export.md) | Export — 리포트+목록 4종 CSV/JSON (BOM, 필터 반영) | M4-2 |
| ☑ | [M4-5](task/m4-5-verify-deploy.md) | 검증·문서·배포 + 지원 준비 트랙 재개 리뷰 | M4-1~4 |

## M5 — MOCAR 비즈니스: 법인 플릿/리스 관리 서비스 분리 (L · 6개, 2·3차 피드백)

법인 기능을 소비자 앱 부속이 아닌 **분리 가능한 B2B 서비스**로 재구성: `/biz` 웹 영역 + API 바운디드 컨텍스트, 법인이 리스한 차량(= 기존 전용 차량)의 계약·비용·이용을 직접 관리. 등급: `VIEWER`(조회) → `REQUESTER`(+요청) → `APPROVER`(+승인·보드) → `MANAGER`(+등급·플릿/리스 관리). M1~M4와 독립 — 순서 앞당김 가능.

| 상태 | ID | 작업 | 의존 |
|---|---|---|---|
| ☑ | [M5-1](task/m5-1-corp-grade-domain.md) | 법인 등급 + 리스 도메인 — corpGrade·권한 상수·`LeaseContract`(전용 차량 백필)·viewer 계정 | — |
| ☑ | [M5-2](task/m5-2-biz-separation.md) | 비즈 서비스 분리 — `/biz` 라우트 그룹+BizShell, API biz 컨텍스트 재배치, 추출 경계 정리 | M5-1 |
| ☑ | [M5-3](task/m5-3-permission-guards.md) | 권한 가드 + 등급 관리 API — biz dispatch 적용·/biz/members | M5-2 |
| ☑ | [M5-4](task/m5-4-grade-ui.md) | 등급 관리 UI + 등급별 화면 분기 — /biz/members·버튼/탭 노출 제어 | M5-3 |
| ☑ | [M5-5](task/m5-5-fleet-lease-mgmt.md) | 법인 플릿/리스 관리 — /biz/fleet(만기·이용률·운행일지), 리스 연장/해지 워크플로(ops 처리) | M5-2·3 |
| ☑ | [M5-6](task/m5-6-verify-deploy.md) | 검증·문서 — 권한 매트릭스·리스 워크플로 전수, ADR-010(분리 경계+권한 모델) (배포는 스코프 아웃) | M5-4·5 |

---

## 진행 현황 요약

| 마일스톤 | 활성 작업 | 완료 | 상태 |
|---|---|---|---|
| M0 기반 정비 | 1 (+취소 1) | 1 | ✅ 완료 |
| M1 이용 플로우 | 8 | 8 | ✅ 완료 |
| M2 핸들러 | 6 | 6 | ✅ 완료 |
| M3 백오피스 | 7 | 7 | ✅ 완료 |
| M4 지표·Export | 5 | 5 | ✅ 완료 |
| M5 MOCAR 비즈니스 | 6 | 6 | ✅ 완료 |
| **계** | **33** | **33** | ✅ 전건 완료 |

작성 기준: [project-review.md](project-review.md) §5 v2 로드맵 + 1·2차 피드백(2026-09-01). 문서 체계: [adr/](adr/) = 설계 결정 기록(왜) / [task/](task/) = 실행 작업 문서(무엇을·어떻게) / 이 파일 = 인덱스.
