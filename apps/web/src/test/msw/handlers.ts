import { http, HttpResponse } from 'msw';
import {
  availabilitySchema,
  handlerQueueSchema,
  handlerTaskSchema,
  conditionReportSchema,
  bizLeaseSchema,
  corpMemberSchema,
  creditSchema,
  fleetListSchema,
  fleetVehicleDetailSchema,
  opsAccountingSummarySchema,
  opsAlertSchema,
  opsFleetDetailSchema,
  opsFleetVehicleSchema,
  opsInquirySchema,
  opsLeaseSchema,
  opsMaintenanceNoteSchema,
  opsOverviewSchema,
  opsUserDetailSchema,
  opsUserRiskSchema,
  opsZoneSchema,
  handlerCandidateSchema,
  metricsDailyRowSchema,
  metricsSummarySchema,
  reportOptionsSchema,
  pricingPlanSchema,
  dispatchBoardSchema,
  dispatchRequestSchema,
  loginResponseSchema,
  quoteBreakdownSchema,
  quote,
  applyControl,
  incidentResultSchema,
  inquirySchema,
  rentalSchema,
  rentalUsageSchema,
  reservationSchema,
  vehicleControlResultSchema,
  vehicleDetailSchema,
  vehicleManualSchema,
  zoneDetailSchema,
  zoneMarkerSchema,
  type HandlerTaskRes,
  type QuoteRequestDto,
  type VehicleControlActionValue,
} from '@socar/shared';
import {
  allZones,
  handlerQueue,
  handlerTasksById,
  conditionCheckIn,
  conditionCheckOut,
  corpMembers,
  couponWelcome,
  rentalCompleted,
  rentalInUse,
  dispatchBoard,
  fleetList,
  fleetVehicleDetail,
  opsAccountingSummary,
  opsAlerts,
  opsFleet,
  opsFleetById,
  opsFleetDetail,
  opsInquiries,
  opsLeases,
  opsCandidates,
  opsOverview,
  opsPlans,
  opsTaskPendingLate,
  opsTasks,
  metricsDaily,
  metricsSummary,
  makeReport,
  reportOptions,
  opsUserDetail,
  opsUsersRisk,
  opsZonePaid,
  opsZones,
  dispatchRecommended,
  reservationConfirmed,
  incidentResultFull,
  inquiryAnswered,
  inquiryOpen,
  reservationDelivery,
  reservationInUse,
  reservationOneway,
  smartKeyLocked,
  usageEmpty,
  userCorpAdmin,
  userCorpApprover,
  userCorpMember,
  userCorpViewer,
  userHandler,
  userOpsAdmin,
  userPersonal,
  vehicleAvante,
  vehicleIoniq,
  vehicleManuals,
  zoneDetails,
  zoneGangnam,
  zoneMarkers,
} from './fixtures';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const url = (path: string) => `${API}${path}`;

/** 응답을 shared 스키마로 검증한 뒤 내보낸다 — 목이 실제 계약을 벗어나면 테스트가 실패한다 */
const json = <T>(schema: { parse: (v: unknown) => T }, body: unknown, status = 200) =>
  HttpResponse.json(schema.parse(body) as object, { status });

const vehiclesById = Object.fromEntries(
  [vehicleAvante, vehicleIoniq].map((v) => [v.id, v]),
);

const reservationsById = Object.fromEntries(
  [reservationConfirmed, reservationInUse, reservationOneway, reservationDelivery].map((r) => [
    r.id,
    r,
  ]),
);

/** 로그인 목이 아는 계정 — 로그인 화면의 데모 계정 버튼과 같은 목록이어야 한다 */
const DEMO_ACCOUNTS = [
  userPersonal,
  userCorpViewer,
  userCorpMember,
  userCorpApprover,
  userCorpAdmin,
  userOpsAdmin,
  userHandler,
];

/** 작업 상태 전이 목 — 실제 API처럼 갱신된 작업 1건을 돌려준다 */
const transitionTask = (id: string, patch: Partial<HandlerTaskRes>) => {
  const task = handlerTasksById[id];
  if (!task) return HttpResponse.json({ message: '작업을 찾을 수 없습니다' }, { status: 404 });
  return json(handlerTaskSchema, { ...task, ...patch }, 201);
};

/**
 * 기본 핸들러 — 대부분의 화면이 이 상태에서 렌더된다.
 * 테스트별 예외(에러 응답·빈 목록·특정 페이로드 검증)는 `server.use(...)`로 덮어쓴다.
 */
export const handlers = [
  // ── 존 ──────────────────────────────────────────
  http.get(url('/zones'), () =>
    HttpResponse.json(zoneMarkers.map((z) => zoneMarkerSchema.parse(z))),
  ),

  // 편도 반납 후보 — 실제 API와 같이 같은 region의 다른 존만 돌려준다
  http.get(url('/zones/:id/return-zones'), ({ params }) => {
    const from = allZones.find((z) => z.id === params.id);
    return HttpResponse.json(
      allZones
        .filter((z) => z.id !== params.id && (!from || z.region === from.region))
        .map((z) => zoneMarkerSchema.omit({ vehicleCount: true }).parse(z)),
    );
  }),

  http.get(url('/zones/:id'), ({ params }) => {
    const detail = zoneDetails[String(params.id)];
    if (!detail) return HttpResponse.json({ message: '존을 찾을 수 없습니다' }, { status: 404 });
    return json(zoneDetailSchema, detail);
  }),

  // ── 차량 ────────────────────────────────────────
  http.get(url('/vehicles/:id/manual'), ({ params }) => {
    const manual = vehicleManuals[String(params.id)];
    if (!manual) return HttpResponse.json({ message: '차량을 찾을 수 없습니다' }, { status: 404 });
    return json(vehicleManualSchema, manual);
  }),

  http.get(url('/vehicles/:id/availability'), ({ request }) => {
    const date = new URL(request.url).searchParams.get('date') ?? '2030-01-02';
    return json(availabilitySchema, { date, busy: [] });
  }),

  http.get(url('/vehicles/:id'), ({ params }) => {
    const vehicle = vehiclesById[String(params.id)];
    if (!vehicle) return HttpResponse.json({ message: '차량을 찾을 수 없습니다' }, { status: 404 });
    return json(vehicleDetailSchema, { ...vehicle, zone: zoneGangnam });
  }),

  // ── 인증 / 내 정보 ──────────────────────────────
  http.post(url('/auth/login'), async ({ request }) => {
    const { email } = (await request.json()) as { email?: string };
    const user = DEMO_ACCOUNTS.find((u) => u.email === email);
    if (!user) {
      return HttpResponse.json({ message: '이메일 또는 비밀번호가 올바르지 않습니다' }, { status: 401 });
    }
    return json(loginResponseSchema, { accessToken: `mock-token-${user.id}`, user });
  }),

  http.get(url('/me/coupons'), () => HttpResponse.json([couponWelcome])),
  http.get(url('/me/credit'), () => json(creditSchema, { balanceKrw: 3000 })),

  // ── 예약 ────────────────────────────────────────
  // 견적은 실제 요금 엔진을 그대로 돌린다 — 목이 요금 규칙을 따로 흉내내지 않도록.
  http.post(url('/reservations/quote'), async ({ request }) => {
    const dto = (await request.json()) as QuoteRequestDto;
    const vehicle = vehiclesById[dto.vehicleId] ?? vehicleAvante;
    return json(
      quoteBreakdownSchema,
      quote({
        plan: vehicle.plan,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        insurance: dto.insurance,
      }),
    );
  }),

  http.get(url('/reservations/mine'), () =>
    HttpResponse.json([reservationSchema.parse(reservationConfirmed)]),
  ),

  http.get(url('/reservations/:id'), ({ params }) => {
    const resv = reservationsById[String(params.id)];
    if (!resv) return HttpResponse.json({ message: '예약을 찾을 수 없습니다' }, { status: 404 });
    return json(reservationSchema, resv);
  }),

  // 예약 변경 — 서버가 재견적한 예약을 그대로 돌려준다 (금액 검증은 API 통합 테스트 몫)
  http.patch(url('/reservations/:id'), async ({ params, request }) => {
    const resv = reservationsById[String(params.id)];
    if (!resv) return HttpResponse.json({ message: '예약을 찾을 수 없습니다' }, { status: 404 });
    const body = (await request.json()) as { startAt: string; endAt: string; returnZoneId: string | null };
    const returnZone = allZones.find((z) => z.id === body.returnZoneId) ?? null;
    return json(reservationSchema, {
      ...resv,
      startAt: body.startAt,
      endAt: body.endAt,
      returnZoneId: returnZone?.id ?? null,
      returnZone,
    });
  }),

  http.post(url('/reservations'), () => json(reservationSchema, reservationConfirmed, 201)),

  // ── 이용 플로우 (체크인/아웃·반납) ──────────────
  // 기본값은 "이용 시작 직후" — 단계 진행이 필요한 테스트는 server.use로 상태를 갈아끼운다.
  http.get(url('/rentals/:id/usage'), () => json(rentalUsageSchema, usageEmpty)),

  http.post(url('/rentals/start'), () => json(rentalSchema, rentalInUse, 201)),

  http.post(url('/rentals/:id/check-in'), () => json(conditionReportSchema, conditionCheckIn, 201)),

  http.post(url('/rentals/:id/check-out'), () =>
    json(conditionReportSchema, conditionCheckOut, 201),
  ),

  // 스마트키는 실제 상태 머신을 그대로 돌린다 — 목이 규칙을 따로 흉내내지 않도록
  http.post(url('/rentals/:id/control'), async ({ request }) => {
    const { action } = (await request.json()) as { action: VehicleControlActionValue };
    const outcome = applyControl(smartKeyLocked, action);
    if (!outcome.ok) return HttpResponse.json({ message: outcome.reason }, { status: 400 });
    return json(vehicleControlResultSchema, {
      action,
      at: '2030-01-02T01:05:00.000Z',
      state: { ...outcome.state, lastAction: action, lastActionAt: '2030-01-02T01:05:00.000Z' },
    });
  }),

  http.post(url('/rentals/:id/return'), () => json(rentalSchema, rentalCompleted, 201)),

  http.post(url('/rentals/:id/extend'), () => json(rentalSchema, rentalInUse, 201)),

  http.post(url('/rentals/:id/settle'), () => json(rentalSchema, rentalCompleted, 201)),

  // ── 문의 / 사고 접수 ────────────────────────────
  http.get(url('/me/inquiries'), () =>
    HttpResponse.json([inquiryOpen, inquiryAnswered].map((i) => inquirySchema.parse(i))),
  ),

  http.post(url('/inquiries'), () => json(inquirySchema, inquiryOpen, 201)),

  http.post(url('/rentals/:id/incident'), () => json(incidentResultSchema, incidentResultFull, 201)),
  // ── 비즈니스(법인) 배차 ─────────────────────────
  http.get(url('/biz/dispatch/requests'), () =>
    HttpResponse.json([dispatchRequestSchema.parse(dispatchRecommended)]),
  ),

  http.post(url('/biz/dispatch/requests'), () =>
    json(dispatchRequestSchema, dispatchRecommended, 201),
  ),

  http.post(url('/biz/dispatch/requests/:id/approve'), () =>
    json(dispatchRequestSchema, { ...dispatchRecommended, status: 'APPROVED', reservation: { id: 'resv-1', status: 'CONFIRMED' } }),
  ),

  http.post(url('/biz/dispatch/requests/:id/reject'), () =>
    json(dispatchRequestSchema, { ...dispatchRecommended, status: 'REJECTED', rejectReason: '차량 부족' }),
  ),

  http.get(url('/biz/dispatch/board'), () => json(dispatchBoardSchema, dispatchBoard)),

  // ── 비즈니스(법인) 멤버 · 등급 ──────────────────
  http.get(url('/biz/members'), () =>
    HttpResponse.json(corpMembers.map((m) => corpMemberSchema.parse(m))),
  ),

  http.patch(url('/biz/members/:id/grade'), async ({ params, request }) => {
    const { grade } = (await request.json()) as { grade: string };
    const target = corpMembers.find((m) => m.id === params.id);
    if (!target) {
      return HttpResponse.json({ message: '법인 멤버를 찾을 수 없습니다' }, { status: 404 });
    }
    return json(corpMemberSchema, { ...target, corpGrade: grade });
  }),

  // ── 비즈니스(법인) 플릿 · 리스 ──────────────────
  http.get(url('/biz/fleet'), () => json(fleetListSchema, fleetList)),

  http.get(url('/biz/fleet/:id'), ({ params }) => {
    if (params.id !== fleetVehicleDetail.id) {
      return HttpResponse.json({ message: '차량을 찾을 수 없습니다' }, { status: 404 });
    }
    return json(fleetVehicleDetailSchema, fleetVehicleDetail);
  }),

  http.post(url('/biz/leases/:id/extend-request'), () =>
    json(
      bizLeaseSchema,
      {
        ...fleetVehicleDetail.lease,
        status: 'EXTENSION_REQUESTED',
        requestedEndAt: '2031-01-14T00:00:00.000Z',
        vehicle: { id: fleetVehicleDetail.id, modelName: fleetVehicleDetail.modelName, plateNo: fleetVehicleDetail.plateNo },
      },
      201,
    ),
  ),

  http.post(url('/biz/leases/:id/terminate-request'), () =>
    json(
      bizLeaseSchema,
      {
        ...fleetVehicleDetail.lease,
        status: 'TERMINATION_REQUESTED',
        vehicle: { id: fleetVehicleDetail.id, modelName: fleetVehicleDetail.modelName, plateNo: fleetVehicleDetail.plateNo },
      },
      201,
    ),
  ),

  // ── 운영 어드민 리스 처리 ───────────────────────
  http.get(url('/ops/leases'), () =>
    HttpResponse.json(opsLeases.map((l) => opsLeaseSchema.parse(l))),
  ),

  http.post(url('/ops/leases/:id/approve'), () =>
    json(opsLeaseSchema, { ...opsLeases[0], status: 'ACTIVE', requestedEndAt: null }, 201),
  ),

  http.post(url('/ops/leases/:id/reject'), () =>
    json(opsLeaseSchema, { ...opsLeases[0], status: 'ACTIVE', requestedEndAt: null }, 201),
  ),

  // ── 핸들러 작업 (M2-5) ──────────────────────────
  // 상태 전이는 요청받은 작업에 그대로 반영해 돌려준다. 전이 후 큐가 바뀌는 흐름을
  // 검증하는 테스트는 server.use로 상태를 들고 있는 목을 세운다.
  http.get(url('/handler/tasks'), () => json(handlerQueueSchema, handlerQueue)),

  http.post(url('/handler/tasks/:id/accept'), ({ params }) =>
    transitionTask(String(params.id), { status: 'ASSIGNED', assigneeId: 'user-handler', assigneeName: '한기사' }),
  ),

  http.post(url('/handler/tasks/:id/start'), ({ params }) =>
    transitionTask(String(params.id), { status: 'EN_ROUTE' }),
  ),

  http.post(url('/handler/tasks/:id/complete'), async ({ params, request }) => {
    const body = (await request.json()) as { note: string };
    return transitionTask(String(params.id), { status: 'DONE', completionNote: body.note });
  }),

  // ── 운영 센터 /ops (M3-3 · 화면은 M3-4~6) ───────
  // 백엔드 계약대로 기본 응답만 세워 둔다. 상태가 바뀌는 흐름(등록 → 표 반영, 답변 → ANSWERED)은
  // 각 테스트가 server.use로 상태를 들고 있는 목을 덮어써서 검증한다.
  http.get(url('/ops/overview'), () => json(opsOverviewSchema, opsOverview)),

  http.get(url('/ops/alerts'), () =>
    HttpResponse.json(opsAlerts.map((a) => opsAlertSchema.parse(a))),
  ),

  http.get(url('/ops/fleet'), ({ request }) => {
    const state = new URL(request.url).searchParams.get('state');
    const rows = state ? opsFleet.filter((v) => v.state === state) : opsFleet;
    return HttpResponse.json(rows.map((v) => opsFleetVehicleSchema.parse(v)));
  }),

  http.get(url('/ops/fleet/:id'), ({ params }) => {
    const detail = opsFleetById[String(params.id)];
    return detail
      ? json(opsFleetDetailSchema, detail)
      : HttpResponse.json({ message: '차량을 찾을 수 없습니다' }, { status: 404 });
  }),

  http.post(url('/ops/fleet/:id/notes'), async ({ params, request }) => {
    const body = (await request.json()) as { body: string };
    return json(
      opsMaintenanceNoteSchema,
      {
        id: 'note-new',
        vehicleId: String(params.id),
        body: body.body,
        authorName: '최운영',
        createdAt: new Date().toISOString(),
      },
      201,
    );
  }),

  http.get(url('/ops/plans'), () =>
    HttpResponse.json(opsPlans.map((p) => pricingPlanSchema.parse(p))),
  ),

  http.post(url('/ops/vehicles'), async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return json(
      opsFleetDetailSchema,
      {
        ...opsFleetDetail,
        id: 'veh-new',
        modelName: String(body.modelName ?? '신규 차량'),
        plateNo: String(body.plateNo ?? '99허 0001'),
        state: 'IDLE',
        nextReservation: null,
      },
      201,
    );
  }),

  http.get(url('/ops/zones'), () =>
    HttpResponse.json(opsZones.map((z) => opsZoneSchema.parse(z))),
  ),

  http.patch(url('/ops/zones/:id/contract'), async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return json(opsZoneSchema, {
      ...opsZonePaid,
      id: String(params.id),
      contract: {
        ...opsZonePaid.contract,
        isPaid: Boolean(body.isPaid),
        partnerName: (body.partnerName as string | null) ?? null,
        monthlyFeeKrw: Number(body.monthlyFeeKrw ?? 0),
      },
    });
  }),

  http.get(url('/ops/users/risk'), () =>
    HttpResponse.json(opsUsersRisk.map((u) => opsUserRiskSchema.parse(u))),
  ),

  http.get(url('/ops/users/:id'), () => json(opsUserDetailSchema, opsUserDetail)),

  http.get(url('/ops/inquiries'), ({ request }) => {
    const status = new URL(request.url).searchParams.get('status');
    const rows = status ? opsInquiries.filter((i) => i.status === status) : opsInquiries;
    return HttpResponse.json(rows.map((i) => opsInquirySchema.parse(i)));
  }),

  http.post(url('/ops/inquiries/:id/answer'), async ({ params, request }) => {
    const body = (await request.json()) as { answer: string };
    return json(
      opsInquirySchema,
      {
        ...opsInquiries[0],
        id: String(params.id),
        status: 'ANSWERED',
        answer: body.answer,
        answeredAt: new Date().toISOString(),
        answeredBy: { id: 'user-ops', name: '최운영' },
      },
      201,
    );
  }),

  http.get(url('/ops/accounting/summary'), () =>
    json(opsAccountingSummarySchema, opsAccountingSummary),
  ),

  // ── 작업/배차 (M2-4 API · 화면은 M3-6) ──────────
  http.get(url('/ops/tasks'), ({ request }) => {
    const params = new URL(request.url).searchParams;
    const status = params.get('status');
    const type = params.get('type');
    const rows = opsTasks.filter(
      (t) => (!status || t.status === status) && (!type || t.type === type),
    );
    return HttpResponse.json(rows.map((t) => handlerTaskSchema.parse(t)));
  }),

  http.post(url('/ops/tasks'), async ({ request }) => {
    const body = (await request.json()) as { vehicleId: string; toZoneId: string; dueAt: string };
    return json(
      handlerTaskSchema,
      { ...opsTaskPendingLate, id: 'task-new', dueAt: body.dueAt },
      201,
    );
  }),

  http.get(url('/ops/tasks/:id/candidates'), () =>
    HttpResponse.json(opsCandidates.map((c) => handlerCandidateSchema.parse(c))),
  ),

  http.post(url('/ops/tasks/:id/assign'), async ({ params, request }) => {
    const body = (await request.json()) as { handlerId: string };
    const candidate = opsCandidates.find((c) => c.handlerId === body.handlerId);
    return transitionTask(String(params.id), {
      status: 'ASSIGNED',
      assigneeId: body.handlerId,
      assigneeName: candidate?.name ?? '한기사',
    });
  }),

  // ── 회계 탭 전용 지표 (기존 /metrics) ───────────
  http.get(url('/metrics/summary'), () => json(metricsSummarySchema, metricsSummary)),

  http.get(url('/metrics/daily'), () =>
    HttpResponse.json(metricsDaily.map((d) => metricsDailyRowSchema.parse(d))),
  ),

  // ── 리포트 빌더 (M4-2) ──────────────────────────
  // 필터 조합이 곧 응답이라 요청 쿼리를 읽어 만든다 (fixtures.makeReport)
  http.get(url('/ops/reports/options'), () => json(reportOptionsSchema, reportOptions)),

  http.get(url('/ops/reports'), ({ request }) =>
    HttpResponse.json(makeReport(new URL(request.url).searchParams)),
  ),

  // ── 헬스체크 (ServerWarmup) ─────────────────────
  http.get(url('/health'), () => HttpResponse.json({ status: 'ok' })),
];
