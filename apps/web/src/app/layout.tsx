import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';
import { RegisterSW } from '@/components/RegisterSW';
import { ServerWarmup } from '@/components/ServerWarmup';
import { SessionProvider } from '@/lib/session';

export const metadata: Metadata = {
  title: 'MOCAR — 카셰어링 데모',
  description: '쏘카 스타일 카셰어링 데모 프로젝트 (채용 지원용, ㈜쏘카와 무관)',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0ea5e9',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
        <ServerWarmup />
        <RegisterSW />
      </body>
    </html>
  );
}
