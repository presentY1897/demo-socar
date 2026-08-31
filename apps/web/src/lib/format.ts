import dayjs from 'dayjs';
import 'dayjs/locale/ko';

dayjs.locale('ko');

export const krw = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export const fmtDateTime = (d: string | Date) => dayjs(d).format('M월 D일 (ddd) HH:mm');
export const fmtTime = (d: string | Date) => dayjs(d).format('HH:mm');
export const fmtDate = (d: string | Date) => dayjs(d).format('YYYY-MM-DD');

export const todayKst = () => dayjs().format('YYYY-MM-DD');

/** YYYY-MM-DD + 'HH:mm' → ISO (KST) */
export const kstIso = (date: string, time: string) => `${date}T${time}:00+09:00`;

export const RESERVATION_STATUS_LABEL: Record<string, string> = {
  CONFIRMED: '예약 완료',
  IN_USE: '이용 중',
  COMPLETED: '이용 완료',
  CANCELED: '취소됨',
};

export const DISPATCH_STATUS_LABEL: Record<string, string> = {
  REQUESTED: '접수됨',
  RECOMMENDED: '결정 대기',
  APPROVED: '승인됨',
  REJECTED: '반려됨',
  CANCELED: '취소됨',
};

import { INSURANCE_META } from '@socar/shared';

/** 자기부담금 한도 기준 면책상품 명칭 (실속/표준/완전보장) */
export const INSURANCE_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(INSURANCE_META).map(([k, v]) => [k, v.label]),
);
export { INSURANCE_META };
