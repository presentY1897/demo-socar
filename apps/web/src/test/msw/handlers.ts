import { http, HttpResponse } from 'msw';
import {
  availabilitySchema,
  conditionReportSchema,
  creditSchema,
  loginResponseSchema,
  quoteBreakdownSchema,
  quote,
  applyControl,
  rentalSchema,
  rentalUsageSchema,
  reservationSchema,
  vehicleControlResultSchema,
  vehicleDetailSchema,
  zoneDetailSchema,
  zoneMarkerSchema,
  type QuoteRequestDto,
  type VehicleControlActionValue,
} from '@socar/shared';
import {
  conditionCheckIn,
  conditionCheckOut,
  couponWelcome,
  rentalCompleted,
  rentalInUse,
  reservationConfirmed,
  reservationInUse,
  smartKeyLocked,
  usageEmpty,
  userCorpAdmin,
  userOpsAdmin,
  userPersonal,
  vehicleAvante,
  vehicleIoniq,
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

const DEMO_ACCOUNTS = [userPersonal, userCorpAdmin, userOpsAdmin];

const reservationsById = Object.fromEntries(
  [reservationConfirmed, reservationInUse].map((r) => [r.id, r]),
);

/**
 * 기본 핸들러 — 대부분의 화면이 이 상태에서 렌더된다.
 * 테스트별 예외(에러 응답·빈 목록·특정 페이로드 검증)는 `server.use(...)`로 덮어쓴다.
 */
export const handlers = [
  // ── 존 ──────────────────────────────────────────
  http.get(url('/zones'), () =>
    HttpResponse.json(zoneMarkers.map((z) => zoneMarkerSchema.parse(z))),
  ),

  http.get(url('/zones/:id/return-zones'), ({ params }) =>
    HttpResponse.json(
      zoneMarkers
        .filter((z) => z.id !== params.id)
        .map((z) => zoneMarkerSchema.omit({ vehicleCount: true }).parse(z)),
    ),
  ),

  http.get(url('/zones/:id'), ({ params }) => {
    const detail = zoneDetails[String(params.id)];
    if (!detail) return HttpResponse.json({ message: '존을 찾을 수 없습니다' }, { status: 404 });
    return json(zoneDetailSchema, detail);
  }),

  // ── 차량 ────────────────────────────────────────
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

  // ── 헬스체크 (ServerWarmup) ─────────────────────
  http.get(url('/health'), () => HttpResponse.json({ status: 'ok' })),
];
