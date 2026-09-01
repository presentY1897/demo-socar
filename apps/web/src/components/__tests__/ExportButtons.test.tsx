import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { ExportButtons } from '@/components/ExportButtons';
import { filenameFromDisposition } from '@/lib/download';
import { server } from '@/test/msw/server';
import { stubDownloads } from '@/test/download';
import { MOCK_USERS, renderWithProviders, screen, waitFor } from '@/test/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const CSV = '﻿차량 번호,배정 존\r\n12가 3456,"강남 1호점, 지하 2층"\r\n';

/** 서버가 내려주는 파일 응답 흉내 — 요청 URL을 함께 기록한다 */
function stubExportEndpoint(filename = '차량목록_2026-09-01.csv') {
  const asked: string[] = [];
  server.use(
    http.get(`${API}/ops/fleet`, ({ request }) => {
      const url = new URL(request.url);
      asked.push(url.search.slice(1));
      return HttpResponse.text(CSV, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="_.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }),
  );
  return asked;
}

describe('내보내기 버튼', () => {
  it('CSV·JSON 두 형식을 제공한다', () => {
    renderWithProviders(<ExportButtons path="/ops/fleet" label="차량목록" />, {
      user: MOCK_USERS.opsAdmin,
    });

    const group = screen.getByRole('group', { name: '차량목록 내보내기' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'JSON' })).toBeInTheDocument();
  });

  it('화면이 쓰는 쿼리를 그대로 실어 내려받는다 — 표와 파일의 조건이 갈리지 않게', async () => {
    const asked = stubExportEndpoint();
    const saved = stubDownloads();
    const { userEvent } = renderWithProviders(
      <ExportButtons path="/ops/fleet" query="state=IDLE&sort=fuelPct&dir=desc" label="차량목록" />,
      { user: MOCK_USERS.opsAdmin },
    );

    await userEvent.click(screen.getByRole('button', { name: 'CSV' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(asked[0]).toBe('state=IDLE&sort=fuelPct&dir=desc&format=csv');
  });

  it('형식마다 다른 format으로 묻는다', async () => {
    const asked = stubExportEndpoint();
    stubDownloads();
    const { userEvent } = renderWithProviders(
      <ExportButtons path="/ops/fleet" label="차량목록" />,
      { user: MOCK_USERS.opsAdmin },
    );

    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    await waitFor(() => expect(asked[0]).toBe('format=json'));
  });

  it('파일 이름은 서버가 붙인 것을 쓴다 (조건이 들어 있는 한글 이름)', async () => {
    stubExportEndpoint('차량목록_대기_2026-09-01.csv');
    const saved = stubDownloads();
    const { userEvent } = renderWithProviders(
      <ExportButtons path="/ops/fleet" query="state=IDLE" label="차량목록" />,
      { user: MOCK_USERS.opsAdmin },
    );

    await userEvent.click(screen.getByRole('button', { name: 'CSV' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].filename).toBe('차량목록_대기_2026-09-01.csv');
    // FileReader가 BOM을 인코딩 표식으로 보고 걷어낸다 — BOM 자체는 API 쪽 테스트가 지킨다
    expect(await saved[0].text()).toBe(CSV.replace('\ufeff', ''));
    expect(saved[0].revoked).toBe(true); // Blob URL을 회수했다
  });

  it('실패하면 조용히 넘어가지 않고 알린다', async () => {
    server.use(
      http.get(`${API}/ops/fleet`, () => HttpResponse.json({ message: '권한 없음' }, { status: 403 })),
    );
    const saved = stubDownloads();
    const { userEvent } = renderWithProviders(
      <ExportButtons path="/ops/fleet" label="차량목록" />,
      { user: MOCK_USERS.opsAdmin },
    );

    await userEvent.click(screen.getByRole('button', { name: 'CSV' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('내려받지 못했어요');
    expect(saved).toHaveLength(0);
  });
});

describe('Content-Disposition 파일명 읽기', () => {
  it('한글은 RFC 5987 쪽을 먼저 본다 (filename=은 ASCII 대체본이라 깨져 있다)', () => {
    const header = `attachment; filename="_____2026-09-01.csv"; filename*=UTF-8''${encodeURIComponent('차량목록_2026-09-01.csv')}`;
    expect(filenameFromDisposition(header)).toBe('차량목록_2026-09-01.csv');
  });

  it('인코딩된 쪽이 없으면 ASCII 이름을 쓴다', () => {
    expect(filenameFromDisposition('attachment; filename="report.csv"')).toBe('report.csv');
  });

  it('헤더가 없거나 이름이 없으면 null (호출자가 대체 이름을 쓴다)', () => {
    expect(filenameFromDisposition(null)).toBeNull();
    expect(filenameFromDisposition('attachment')).toBeNull();
  });

  it('깨진 인코딩은 ASCII 대체본으로 물러난다', () => {
    expect(filenameFromDisposition(`attachment; filename="fallback.csv"; filename*=UTF-8''%E0%A4%A`)).toBe(
      'fallback.csv',
    );
  });
});
