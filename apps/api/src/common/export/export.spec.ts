import { BadRequestException } from '@nestjs/common';
import { csvBody, csvCell, csvFile, UTF8_BOM } from './csv';
import {
  buildExportFile,
  contentDisposition,
  exportDateStamp,
  exportFilename,
  parseExportFormat,
  type ExportSpec,
} from './export';

describe('CSV 직렬화 — 엑셀에서 바로 열려야 한다', () => {
  it('평범한 값은 그대로 쓴다', () => {
    expect(csvCell('아반떼')).toBe('아반떼');
    expect(csvCell(120000)).toBe('120000');
    expect(csvCell(38.4)).toBe('38.4');
  });

  it('빈 값은 빈 칸 — 0과 구분된다', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(false)).toBe('false');
  });

  it('쉼표가 든 값은 감싼다 — 안 감싸면 열이 밀린다', () => {
    expect(csvCell('강남구 테헤란로 1, 지하 2층')).toBe('"강남구 테헤란로 1, 지하 2층"');
  });

  it('따옴표는 두 번 적고 감싼다 (RFC 4180)', () => {
    expect(csvCell('앞유리 "긁힘" 있음')).toBe('"앞유리 ""긁힘"" 있음"');
  });

  it('개행이 든 값도 한 칸에 머문다 — 안 감싸면 행이 갈라진다', () => {
    expect(csvCell('1줄\n2줄')).toBe('"1줄\n2줄"');
    expect(csvCell('1줄\r\n2줄')).toBe('"1줄\r\n2줄"');
  });

  it('헤더와 행을 CRLF로 잇는다', () => {
    const body = csvBody(['차종', '대수'], [['아반떼', 3]]);
    expect(body).toBe('차종,대수\r\n아반떼,3\r\n');
  });

  it('파일 내용에는 BOM이 붙는다 — 없으면 엑셀이 한글을 깨뜨린다', () => {
    const file = csvFile(['차종'], [['아반떼']]);
    expect(file.startsWith(UTF8_BOM)).toBe(true);
    expect(file.charCodeAt(0)).toBe(0xfeff);
    expect(file.slice(1)).toBe('차종\r\n아반떼\r\n');
  });
});

describe('Export 파일 만들기', () => {
  interface Row {
    name: string;
    nested: { pct: number } | null;
  }
  const spec: ExportSpec<Row> = {
    name: '테스트',
    asciiName: 'test',
    columns: [
      { header: '이름', value: (r) => r.name },
      // 중첩은 자동으로 펴지 않는다 — 열 정의가 이름을 붙인다
      { header: '점유율(%)', value: (r) => r.nested?.pct },
    ],
  };
  const rows: Row[] = [
    { name: '강남 1호점', nested: { pct: 50 } },
    { name: '성수, 2호점', nested: null },
  ];

  it('CSV는 열 정의대로 평탄화된다 (없는 중첩은 빈 칸)', () => {
    const file = buildExportFile({ format: 'csv', spec, rows, parts: ['2026-09-01'] });

    expect(file.contentType).toBe('text/csv; charset=utf-8');
    expect(file.filename).toBe('테스트_2026-09-01.csv');
    expect(file.body).toBe(`${UTF8_BOM}이름,점유율(%)\r\n강남 1호점,50\r\n"성수, 2호점",\r\n`);
  });

  it('JSON은 행을 그대로 낸다', () => {
    const file = buildExportFile({ format: 'json', spec, rows });

    expect(file.contentType).toBe('application/json; charset=utf-8');
    expect(file.filename).toBe('테스트.json');
    expect(JSON.parse(file.body)).toEqual(rows);
  });

  it('JSON 본문을 따로 줄 수 있다 — 리포트는 meta까지 통째로 나간다', () => {
    const file = buildExportFile({ format: 'json', spec, rows, json: { meta: { total: 50 }, rows } });

    expect(JSON.parse(file.body)).toEqual({ meta: { total: 50 }, rows });
  });

  it('빈 목록도 헤더는 남는다 — 열이 무엇인지는 알 수 있어야 한다', () => {
    const file = buildExportFile({ format: 'csv', spec, rows: [] });
    expect(file.body).toBe(`${UTF8_BOM}이름,점유율(%)\r\n`);
  });
});

describe('파일명과 Content-Disposition', () => {
  it('조건이 파일명에 남는다 (빈 조각은 건너뛴다)', () => {
    expect(exportFilename('차량목록', ['대기', null, '2026-09-01'], 'csv')).toBe(
      '차량목록_대기_2026-09-01.csv',
    );
    expect(exportFilename('유의유저', [], 'json')).toBe('유의유저.json');
  });

  it('파일명에 못 쓰는 문자는 걷어내되 한글은 그대로 둔다', () => {
    expect(exportFilename('리포트/매출', ['일자별'], 'csv')).toBe('리포트-매출_일자별.csv');
  });

  it('한글 파일명은 RFC 5987로 함께 싣고 ASCII 대체본을 남긴다', () => {
    const header = contentDisposition('차량목록_2026-09-01.csv', 'fleet_2026-09-01.csv');

    expect(header).toContain('attachment;');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent('차량목록_2026-09-01.csv'));
    // 대체본은 읽을 수 있는 이름이어야 한다 — 못 읽는 클라이언트가 받는 건 이쪽이다
    expect(/filename="([^"]+)"/.exec(header)![1]).toBe('fleet_2026-09-01.csv');
  });

  it('ASCII 이름을 안 주면 한글이 밑줄이 되지만 밑줄 더미로 남기지는 않는다', () => {
    const header = contentDisposition('차량목록_2026-09-01.csv');

    // `_____2026-09-01.csv`처럼 읽을 수 없는 이름이 내려가지 않게 연속 밑줄을 접는다
    expect(/filename="([^"]+)"/.exec(header)![1]).toBe('2026-09-01.csv');
  });

  it('생성일은 KST 달력 기준이다 — UTC 자정 직후에도 한국 날짜로 남는다', () => {
    expect(exportDateStamp(new Date('2026-09-01T15:30:00Z'))).toBe('2026-09-02');
    expect(exportDateStamp(new Date('2026-09-01T00:30:00Z'))).toBe('2026-09-01');
  });
});

describe('format 파라미터', () => {
  it('csv·json만 받는다', () => {
    expect(parseExportFormat('csv')).toBe('csv');
    expect(parseExportFormat('json')).toBe('json');
  });

  it('없거나 비면 "지정 안 함" — 기존 JSON 응답 그대로', () => {
    expect(parseExportFormat(undefined)).toBeUndefined();
    expect(parseExportFormat('')).toBeUndefined();
  });

  it('알 수 없는 값은 조용히 무시하지 않고 400', () => {
    expect(() => parseExportFormat('xlsx')).toThrow(BadRequestException);
  });
});
