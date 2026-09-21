'use client';

import { useParams } from 'next/navigation';
import { ReservationDetailView } from '@/components/ReservationDetailView';

/**
 * 예약 상세. 화면 본체는 `ReservationDetailView` — 이용 중에는 홈도 같은 화면을 얹는다.
 * 라우트 파라미터는 `useParams()`로 읽는다 (src/test/README.md — 동적 라우트 화면 규약)
 */
export default function ReservationDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ReservationDetailView id={id} />;
}
