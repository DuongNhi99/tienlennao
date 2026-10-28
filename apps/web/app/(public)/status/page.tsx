import type { DependencyCheck } from '@tienlen/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchReadiness } from '@/lib/api/health';
import { serverEnv } from '@/lib/server-env';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Trạng thái hệ thống',
};

type RowStatus = 'up' | 'down' | 'unknown';

const STATUS_LABEL: Record<RowStatus, string> = {
  up: 'Hoạt động',
  down: 'Gián đoạn',
  unknown: 'Không xác định',
};

const STATUS_STYLE: Record<RowStatus, string> = {
  up: 'bg-emerald-400',
  down: 'bg-red-400',
  unknown: 'bg-zinc-400',
};

function StatusRow({
  label,
  status,
  latencyMs,
}: {
  label: string;
  status: RowStatus;
  latencyMs?: number;
}) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-2 text-sm">
        <span aria-hidden="true" className={`size-2.5 rounded-full ${STATUS_STYLE[status]}`} />
        <span>{STATUS_LABEL[status]}</span>
        {latencyMs !== undefined && status === 'up' ? (
          <span className="text-white/60">({latencyMs} ms)</span>
        ) : null}
      </span>
    </li>
  );
}

function dependency(check: DependencyCheck | undefined): { status: RowStatus; latencyMs?: number } {
  return check ? { status: check.status, latencyMs: check.latencyMs } : { status: 'unknown' };
}

export default async function StatusPage() {
  const result = await fetchReadiness(serverEnv.API_INTERNAL_URL);
  const checks = result.kind === 'reachable' ? result.data.checks : undefined;
  const apiStatus: RowStatus = result.kind === 'unreachable' ? 'down' : 'up';

  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-xl flex-col justify-center gap-6 px-4 py-12 sm:px-6"
    >
      <h1 className="text-3xl font-bold">Trạng thái hệ thống</h1>

      <section
        aria-labelledby="services-heading"
        className="rounded-xl border border-white/10 bg-felt-800 px-5 py-2 shadow-lg"
      >
        <h2 id="services-heading" className="sr-only">
          Dịch vụ
        </h2>
        <ul className="divide-y divide-white/10">
          <StatusRow label="Máy chủ API" status={apiStatus} />
          <StatusRow label="Cơ sở dữ liệu (PostgreSQL)" {...dependency(checks?.database)} />
          <StatusRow label="Redis" {...dependency(checks?.redis)} />
        </ul>
      </section>

      {result.kind === 'unreachable' ? (
        <p role="alert" className="text-sm text-red-300">
          Không thể kết nối tới máy chủ API. Hãy kiểm tra máy chủ đã được khởi động chưa.
        </p>
      ) : null}
      {result.kind === 'invalid-response' ? (
        <p role="alert" className="text-sm text-red-300">
          Máy chủ API trả về phản hồi không hợp lệ (HTTP {result.httpStatus}).
        </p>
      ) : null}

      <Link href="/" className="text-sm text-gold-300 underline underline-offset-4">
        Về trang chủ
      </Link>
    </main>
  );
}
