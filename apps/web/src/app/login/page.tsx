'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { LoginResponse } from '@socar/shared';
import { api, ApiError, setSession } from '@/lib/api';

const DEMO_ACCOUNTS = [
  { email: 'user@demo.mocar.kr', label: '개인 이용자' },
  { email: 'member@demo.mocar.kr', label: '법인 임직원' },
  { email: 'admin@demo.mocar.kr', label: '법인 배차 담당' },
  { email: 'ops@demo.mocar.kr', label: '운영 어드민' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('user@demo.mocar.kr');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e?: React.FormEvent, overrideEmail?: string) {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email: overrideEmail ?? email, password: 'demo1234' },
      });
      setSession(res.accessToken, res.user);
      router.push('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '로그인에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-10">
      <h1 className="text-2xl font-bold">로그인</h1>
      <p className="mt-1 text-sm text-gray-500">데모 계정 비밀번호는 모두 demo1234</p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-sky-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>

      <div className="mt-8">
        <p className="text-xs font-medium text-gray-400">데모 계정으로 바로 시작</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              onClick={() => submit(undefined, a.email)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs hover:border-sky-400"
            >
              <span className="block font-semibold">{a.label}</span>
              <span className="text-gray-400">{a.email}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
