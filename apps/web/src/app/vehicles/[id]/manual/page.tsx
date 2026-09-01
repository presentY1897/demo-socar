'use client';

import { use } from 'react';
import { VehicleManualView } from '@/components/VehicleManualView';

export default function VehicleManualPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <VehicleManualView id={id} />;
}
