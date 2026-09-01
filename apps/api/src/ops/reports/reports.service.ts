import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  REPORT_DEFAULT_RANGE_DAYS,
  REPORT_METRIC_META,
  shiftDate,
  type ReportGroupBy,
  type ReportOptionsRes,
  type ReportQueryDto,
  type ReportResponseRes,
  type ReportRowRes,
} from '@socar/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** 가동률 분모에 쓰는 예약 상태 — 취소된 예약은 차를 잡고 있지 않았다 */
const OCCUPYING_STATUSES = Prisma.sql`('CONFIRMED', 'IN_USE', 'COMPLETED')`;

const HOUR_MS = 3600 * 1000;

/** SQL이 돌려주는 원시 행 — 값은 전부 float8로 캐스팅해 받는다 (SUM(int)는 bigint) */
interface RawRow {
  key: string;
  label: string;
  value: number;
}

/** 비율 지표는 행마다 분자·분모를 함께 받아 전체 값을 **가중 평균**으로 낸다 */
interface RatioRow extends RawRow {
  numerator: number;
  denominator: number;
}

/**
 * 리포트 빌더 (M4-2) — 지표 5종 × 기간/축/필터를 한 응답 형태로 낸다.
 *
 * 지표마다 세는 대상이 다르지만(결제·예약 시간·차량 배치·작업·반납) 밖으로 나가는 모양은
 * `{ meta, rows }` 하나다. 차트·표·Export가 같은 응답을 나눠 쓰기 때문에, 여기서 형태가
 * 갈리면 "차트에는 있는데 CSV에는 없는 행"이 생긴다.
 *
 * 집계는 전부 SQL 한 번(비율 지표는 분모용 질의를 더해 최대 2번)이다. 존·차종별 값을
 * 그룹 수만큼 질의하면 존 31개짜리 리포트가 질의 31번이 된다.
 *
 * **기준 시각은 KST 달력**이다. `from`/`to`는 날짜(YYYY-MM-DD)로 받아 그날 00:00 KST부터
 * 다음 날 00:00 KST까지를 하루로 본다 — "8월 1일 매출"이 보는 사람마다 달라지지 않도록.
 */
@Injectable()
export class OpsReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 필터 폼의 선택지 — 존·차종은 시드가 만든 값이라 화면이 손으로 적을 수 없다 */
  async options(): Promise<ReportOptionsRes> {
    const [zones, models] = await Promise.all([
      this.prisma.zone.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.vehicle.findMany({
        select: { modelName: true },
        distinct: ['modelName'],
        orderBy: { modelName: 'asc' },
      }),
    ]);
    return { zones, models: models.map((m) => m.modelName) };
  }

  async build(query: ReportQueryDto, now = new Date()): Promise<ReportResponseRes> {
    const range = resolveRange(query, now);
    const start = kstStart(range.from);
    const end = kstStart(shiftDate(range.to, 1));

    const { rows, total } = await this.rowsFor(query, range, start, end);

    return {
      meta: {
        metric: query.metric,
        groupBy: query.groupBy,
        unit: REPORT_METRIC_META[query.metric].unit,
        range,
        filters: { zoneId: query.zoneId ?? null, model: query.model ?? null },
        total: round1(total),
      },
      rows: rows.map((r) => ({ ...r, value: round1(r.value) })),
    };
  }

  private async rowsFor(
    query: ReportQueryDto,
    range: { from: string; to: string },
    start: Date,
    end: Date,
  ): Promise<{ rows: ReportRowRes[]; total: number }> {
    switch (query.metric) {
      case 'revenue':
        return this.sumMetric(await this.revenue(query, start, end), query.groupBy, range);
      case 'taskThroughput':
        return this.sumMetric(await this.taskThroughput(query, start, end), query.groupBy, range);
      case 'utilization':
        return this.utilization(query, range, start, end);
      case 'lateReturnRate':
        return this.ratioMetric(await this.lateReturnRate(query, start, end), query.groupBy, range);
      case 'zoneOccupancy':
        return this.ratioMetric(await this.zoneOccupancy(query), query.groupBy, range);
    }
  }

  // ─────────────────────────── 지표별 질의 ───────────────────────────

  /** 매출 — 기간 안에 승인된 이용 결제(CAPTURED) 합계 */
  private revenue(query: ReportQueryDto, start: Date, end: Date): Promise<RawRow[]> {
    const bucket = vehicleBucket(query.groupBy, Prisma.sql`p."approvedAt"`);
    return this.prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT ${bucket.key} AS key, ${bucket.label} AS label,
             COALESCE(SUM(p."amountKrw"), 0)::float8 AS value
      FROM "Payment" p
      JOIN "Reservation" r ON r."id" = p."reservationId"
      JOIN "Vehicle" v ON v."id" = r."vehicleId"
      JOIN "Zone" z ON z."id" = v."zoneId"
      WHERE p."status" = 'CAPTURED'
        AND p."approvedAt" >= ${start} AND p."approvedAt" < ${end}
        ${vehicleFilter(query)}
      GROUP BY 1, 2
    `);
  }

  /**
   * 작업 처리량 — 기간 안에 완료된 핸들러 작업 수.
   * 존 축은 **출발 존**(fromZone)이다: 작업은 "어디서 시작해 어디로 갔나"이고, 운영자가
   * 보고 싶은 건 어느 존에서 손이 많이 갔는가라서 존 필터도 출발 존에 건다.
   */
  private taskThroughput(query: ReportQueryDto, start: Date, end: Date): Promise<RawRow[]> {
    const key =
      query.groupBy === 'day'
        ? kstDay(Prisma.sql`t."completedAt"`)
        : Prisma.sql`t."fromZoneId"`;
    const label = query.groupBy === 'day' ? key : Prisma.sql`z."name"`;
    return this.prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT ${key} AS key, ${label} AS label, COUNT(*)::float8 AS value
      FROM "HandlerTask" t
      JOIN "Vehicle" v ON v."id" = t."vehicleId"
      JOIN "Zone" z ON z."id" = t."fromZoneId"
      WHERE t."status" = 'DONE'
        AND t."completedAt" >= ${start} AND t."completedAt" < ${end}
        ${query.zoneId ? Prisma.sql`AND t."fromZoneId" = ${query.zoneId}` : Prisma.empty}
        ${query.model ? Prisma.sql`AND v."modelName" = ${query.model}` : Prisma.empty}
      GROUP BY 1, 2
    `);
  }

  /** 지연 반납률 — 기간 안에 반납된 이용 중 지연(lateMinutes > 0) 비율 */
  private lateReturnRate(query: ReportQueryDto, start: Date, end: Date): Promise<RatioRow[]> {
    const bucket = vehicleBucket(query.groupBy, Prisma.sql`rt."returnedAt"`);
    return this.prisma.$queryRaw<RatioRow[]>(Prisma.sql`
      SELECT ${bucket.key} AS key, ${bucket.label} AS label,
             COUNT(*) FILTER (WHERE rt."lateMinutes" > 0)::float8 AS numerator,
             COUNT(*)::float8 AS denominator,
             (COUNT(*) FILTER (WHERE rt."lateMinutes" > 0)::float8 * 100
               / NULLIF(COUNT(*), 0))::float8 AS value
      FROM "Rental" rt
      JOIN "Reservation" r ON r."id" = rt."reservationId"
      JOIN "Vehicle" v ON v."id" = r."vehicleId"
      JOIN "Zone" z ON z."id" = v."zoneId"
      WHERE rt."status" = 'COMPLETED'
        AND rt."returnedAt" >= ${start} AND rt."returnedAt" < ${end}
        ${vehicleFilter(query)}
      GROUP BY 1, 2
    `);
  }

  /**
   * 존 점유율 — 지금 존에 배정된 차량 수 ÷ 면수.
   * **기간에 반응하지 않는다**(현재 스냅샷). 차량이 언제 어느 존에 있었는지의 이력을 남기지
   * 않기 때문이고, 화면은 이 비대칭을 shared의 `periodSensitive: false`로 읽어 표기한다.
   * 차량이 없는 존도 0%로 남긴다 — 빈 존이야말로 점유율에서 보고 싶은 값이다.
   */
  private zoneOccupancy(query: ReportQueryDto): Promise<RatioRow[]> {
    return this.prisma.$queryRaw<RatioRow[]>(Prisma.sql`
      SELECT z."id" AS key, z."name" AS label,
             COUNT(v."id")::float8 AS numerator,
             z."capacity"::float8 AS denominator,
             (COUNT(v."id")::float8 * 100 / NULLIF(z."capacity", 0))::float8 AS value
      FROM "Zone" z
      LEFT JOIN "Vehicle" v ON v."zoneId" = z."id"
        ${query.model ? Prisma.sql`AND v."modelName" = ${query.model}` : Prisma.empty}
      WHERE TRUE ${query.zoneId ? Prisma.sql`AND z."id" = ${query.zoneId}` : Prisma.empty}
      GROUP BY z."id", z."name", z."capacity"
    `);
  }

  /**
   * 가동률 — 예약이 차지한 시간 ÷ (차량 수 × 기간).
   *
   * 분자는 예약과 조회 구간의 **겹치는 시간**이라 일자별로는 하루씩 잘라 더해야 한다.
   * 분모는 그룹마다 다르므로(존에 3대 있는 곳과 20대 있는 곳) 차량 수를 따로 세어 맞춘다.
   * 예약된 시간은 앞으로의 예약도 포함한다 — "얼마나 잡혀 있나"를 보는 값이라서.
   */
  private async utilization(
    query: ReportQueryDto,
    range: { from: string; to: string },
    start: Date,
    end: Date,
  ): Promise<{ rows: ReportRowRes[]; total: number }> {
    const windowHours = (end.getTime() - start.getTime()) / HOUR_MS;

    if (query.groupBy === 'day') {
      const [hours, vehicleCount] = await Promise.all([
        this.prisma.$queryRaw<RawRow[]>(Prisma.sql`
          WITH veh AS (
            SELECT v."id" FROM "Vehicle" v WHERE TRUE ${vehicleFilter(query)}
          ),
          days AS (
            SELECT generate_series(${range.from}::date, ${range.to}::date, '1 day'::interval)::date AS day
          ),
          bounds AS (
            SELECT day,
                   (day::timestamp AT TIME ZONE 'Asia/Seoul') AS s,
                   ((day + 1)::timestamp AT TIME ZONE 'Asia/Seoul') AS e
            FROM days
          )
          SELECT to_char(b.day, 'YYYY-MM-DD') AS key, to_char(b.day, 'YYYY-MM-DD') AS label,
                 SUM(EXTRACT(EPOCH FROM (LEAST(r."endAt", b.e) - GREATEST(r."startAt", b.s))) / 3600)::float8 AS value
          FROM bounds b
          JOIN "Reservation" r
            ON r."status" IN ${OCCUPYING_STATUSES} AND r."startAt" < b.e AND r."endAt" > b.s
          JOIN veh ON veh."id" = r."vehicleId"
          GROUP BY b.day
        `),
        this.matchingVehicleCount(query),
      ]);

      const perDay = vehicleCount * 24;
      const rows = fillDays(range, hours).map((r) => ({
        ...r,
        value: perDay > 0 ? (r.value / perDay) * 100 : 0,
      }));
      const totalHours = hours.reduce((sum, r) => sum + r.value, 0);
      return {
        rows,
        total: vehicleCount > 0 ? (totalHours / (vehicleCount * windowHours)) * 100 : 0,
      };
    }

    const bucket = vehicleBucket(query.groupBy, Prisma.sql`r."startAt"`);
    const [hours, fleet] = await Promise.all([
      this.prisma.$queryRaw<RawRow[]>(Prisma.sql`
        SELECT ${bucket.key} AS key, ${bucket.label} AS label,
               SUM(EXTRACT(EPOCH FROM (LEAST(r."endAt", ${end}) - GREATEST(r."startAt", ${start}))) / 3600)::float8 AS value
        FROM "Reservation" r
        JOIN "Vehicle" v ON v."id" = r."vehicleId"
        JOIN "Zone" z ON z."id" = v."zoneId"
        WHERE r."status" IN ${OCCUPYING_STATUSES}
          AND r."startAt" < ${end} AND r."endAt" > ${start}
          ${vehicleFilter(query)}
        GROUP BY 1, 2
      `),
      // 그룹별 분모 — 차량이 몇 대 서 있는 그룹인지 (질의 1번, 그룹 수와 무관)
      this.prisma.$queryRaw<{ key: string; value: number }[]>(Prisma.sql`
        SELECT ${query.groupBy === 'zone' ? Prisma.sql`v."zoneId"` : Prisma.sql`v."modelName"`} AS key,
               COUNT(*)::float8 AS value
        FROM "Vehicle" v
        WHERE TRUE ${vehicleFilter(query)}
        GROUP BY 1
      `),
    ]);

    const fleetByKey = new Map(fleet.map((f) => [f.key, f.value]));
    const totalVehicles = fleet.reduce((sum, f) => sum + f.value, 0);
    const rows = hours.map((r) => {
      const capacity = (fleetByKey.get(r.key) ?? 0) * windowHours;
      return { key: r.key, label: r.label, value: capacity > 0 ? (r.value / capacity) * 100 : 0 };
    });
    const totalHours = hours.reduce((sum, r) => sum + r.value, 0);
    return {
      rows: sortRows(rows, query.groupBy),
      total: totalVehicles > 0 ? (totalHours / (totalVehicles * windowHours)) * 100 : 0,
    };
  }

  private matchingVehicleCount(query: ReportQueryDto): Promise<number> {
    return this.prisma.vehicle.count({
      where: { zoneId: query.zoneId, modelName: query.model },
    });
  }

  // ─────────────────────────── 공통 마무리 ───────────────────────────

  /** 합계형 지표(원·건) — 전체 값은 행의 단순 합 */
  private sumMetric(
    raw: RawRow[],
    groupBy: ReportGroupBy,
    range: { from: string; to: string },
  ): { rows: ReportRowRes[]; total: number } {
    const rows = groupBy === 'day' ? fillDays(range, raw) : sortRows(raw, groupBy);
    return { rows, total: raw.reduce((sum, r) => sum + r.value, 0) };
  }

  /**
   * 비율형 지표(%) — 전체 값은 행 평균이 아니라 **분자 합 ÷ 분모 합**이다.
   * 예약 2건짜리 존의 100%와 200건짜리 존의 10%를 평균 내면 아무 뜻도 없는 55%가 나온다.
   */
  private ratioMetric(
    raw: RatioRow[],
    groupBy: ReportGroupBy,
    range: { from: string; to: string },
  ): { rows: ReportRowRes[]; total: number } {
    const plain = raw.map((r) => ({ key: r.key, label: r.label, value: r.value ?? 0 }));
    const rows = groupBy === 'day' ? fillDays(range, plain) : sortRows(plain, groupBy);
    const numerator = raw.reduce((sum, r) => sum + r.numerator, 0);
    const denominator = raw.reduce((sum, r) => sum + r.denominator, 0);
    return { rows, total: denominator > 0 ? (numerator / denominator) * 100 : 0 };
  }
}

// ─────────────────────────── SQL 조각 ───────────────────────────

/**
 * KST 달력 하루로 자른 날짜 문자열 — 차트 x축 키이자 CSV의 일자 열.
 *
 * 결제 승인·반납·작업 완료 시각은 스키마에 `@db.Timestamptz`가 없어 **tz 없는 UTC 벽시계**로
 * 저장돼 있다(예약의 startAt/endAt만 timestamptz다). 그래서 `AT TIME ZONE 'UTC'`로 "이 값은
 * UTC다"를 먼저 선언한 뒤 KST로 옮긴다 — 곧바로 `AT TIME ZONE 'Asia/Seoul'`을 걸면 저장값을
 * KST 벽시계로 **읽어** 9시간이 반대로 밀리고, 자정 근처 결제가 전날로 넘어간다.
 */
const kstDay = (column: Prisma.Sql) =>
  Prisma.sql`to_char(date_trunc('day', (${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM-DD')`;

/**
 * 차량을 타고 흐르는 지표(매출·가동률·지연 반납률)의 그룹 키.
 * 존은 **차량의 현재 배정 존**이다 — 예약 시점의 존 이력을 남기지 않기 때문이고,
 * 차를 옮기면 과거 매출의 귀속 존도 함께 움직인다.
 */
function vehicleBucket(groupBy: ReportGroupBy, dayColumn: Prisma.Sql) {
  switch (groupBy) {
    case 'day': {
      const day = kstDay(dayColumn);
      return { key: day, label: day };
    }
    case 'zone':
      return { key: Prisma.sql`v."zoneId"`, label: Prisma.sql`z."name"` };
    case 'model':
      return { key: Prisma.sql`v."modelName"`, label: Prisma.sql`v."modelName"` };
  }
}

/** `AND ...` 조각 — 앞에 반드시 조건이 하나 있는 자리(WHERE TRUE 포함)에 붙인다 */
const vehicleFilter = (query: ReportQueryDto) => Prisma.sql`
  ${query.zoneId ? Prisma.sql`AND v."zoneId" = ${query.zoneId}` : Prisma.empty}
  ${query.model ? Prisma.sql`AND v."modelName" = ${query.model}` : Prisma.empty}
`;

// ─────────────────────────── 순수 계산 ───────────────────────────

/** 기간 미지정이면 최근 30일 (KST 오늘까지) */
function resolveRange(query: ReportQueryDto, now: Date): { from: string; to: string } {
  const to = query.to ?? kstToday(now);
  const from = query.from ?? shiftDate(to, -(REPORT_DEFAULT_RANGE_DAYS - 1));
  return { from, to };
}

/** KST 달력의 오늘 (UTC 기준 +9시간한 날짜) */
const kstToday = (now: Date): string =>
  new Date(now.getTime() + 9 * HOUR_MS).toISOString().slice(0, 10);

/** `YYYY-MM-DD` 00:00 KST의 실제 시각 */
const kstStart = (date: string): Date => new Date(`${date}T00:00:00+09:00`);

/**
 * 데이터가 없는 날을 0으로 채운다.
 * 빠진 날을 그대로 두면 선 그래프가 없는 날을 건너뛰고 이어져 "그날도 팔렸다"처럼 보인다.
 */
function fillDays(range: { from: string; to: string }, rows: RawRow[]): ReportRowRes[] {
  const byDay = new Map(rows.map((r) => [r.key, r.value]));
  const filled: ReportRowRes[] = [];
  for (let day = range.from; day <= range.to; day = shiftDate(day, 1)) {
    filled.push({ key: day, label: day, value: byDay.get(day) ?? 0 });
  }
  return filled;
}

/** 존·차종은 큰 값부터 — 막대 차트에서 눈이 가는 순서와 표의 순서를 맞춘다 */
const sortRows = (rows: ReportRowRes[], groupBy: ReportGroupBy): ReportRowRes[] =>
  groupBy === 'day'
    ? rows
    : [...rows].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'ko'));

const round1 = (n: number): number => Math.round((n + Number.EPSILON) * 10) / 10;
