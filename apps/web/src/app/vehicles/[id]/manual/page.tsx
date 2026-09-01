'use client';

import { useParams } from 'next/navigation';
import { VehicleManualView } from '@/components/VehicleManualView';

/** 라우트 파라미터는 `useParams()`로 읽는다 (src/test/README.md — 동적 라우트 화면 규약) */
export default function VehicleManualPage() {
  const { id } = useParams<{ id: string }>();
  return <VehicleManualView id={id} />;
}
