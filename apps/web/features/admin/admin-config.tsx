'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_GAME_RULES, REPORT_REASON_LABELS_VI } from '@tienlen/shared';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckboxField, SelectField, TextField } from '@/components/ui/form-fields';
import { LoadingSkeleton, QueryErrorState } from '@/components/ui/states';
import { errorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { showToast } from '@/lib/toast-store';
import { adminApi } from './admin-api';
import { AdminCard, ReasonDialog } from './admin-shell';

const REPORT_STATUS_LABELS = {
  OPEN: 'Đang mở',
  REVIEWING: 'Đang xem xét',
  RESOLVED: 'Đã xử lý',
  DISMISSED: 'Bỏ qua',
} as const;

export function AdminReportsView() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('OPEN');
  const [resolving, setResolving] = useState<{
    id: string;
    status: 'RESOLVED' | 'DISMISSED';
  } | null>(null);
  const reports = useQuery({
    queryKey: ['admin', 'reports', status],
    queryFn: () => adminApi.reports(status || undefined),
  });
  const resolve = useMutation({
    mutationFn: (reason: string) =>
      adminApi.resolveReport(resolving!.id, resolving!.status, reason),
    onSuccess: () => {
      showToast('Đã cập nhật báo cáo.', { variant: 'success' });
      setResolving(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
    },
    onError: (error) => showToast(errorMessage(error), { variant: 'error' }),
  });
  return (
    <>
      <h1 className="text-2xl font-bold">Báo cáo người chơi</h1>
      <SelectField label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">Tất cả</option>
        {Object.entries(REPORT_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      <AdminCard>
        {reports.isPending ? (
          <LoadingSkeleton className="h-40" />
        ) : reports.isError ? (
          <QueryErrorState error={reports.error} onRetry={() => void reports.refetch()} />
        ) : reports.data.length === 0 ? (
          <p className="text-sm text-white/60">Không có báo cáo nào.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/10 text-sm">
            {reports.data.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-3">
                <p>
                  <strong>{REPORT_REASON_LABELS_VI[r.reason]}</strong> ·{' '}
                  <Link href={`/admin/users/${r.reported.id}`} className="hover:underline">
                    {r.reported.displayName}
                  </Link>{' '}
                  bị báo cáo bởi{' '}
                  <Link href={`/admin/users/${r.reporter.id}`} className="hover:underline">
                    {r.reporter.displayName}
                  </Link>
                </p>
                {r.details ? <p className="text-white/80">“{r.details}”</p> : null}
                <p className="text-xs text-white/60">
                  {formatDateTime(r.createdAt)} · {REPORT_STATUS_LABELS[r.status]}
                  {r.matchId ? (
                    <>
                      {' · '}
                      <Link href={`/admin/matches/${r.matchId}`} className="hover:underline">
                        Xem ván đấu
                      </Link>
                    </>
                  ) : null}
                  {r.resolutionNote ? ` · Ghi chú: ${r.resolutionNote}` : ''}
                </p>
                {r.status === 'OPEN' || r.status === 'REVIEWING' ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => setResolving({ id: r.id, status: 'RESOLVED' })}
                    >
                      Đã xử lý
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setResolving({ id: r.id, status: 'DISMISSED' })}
                    >
                      Bỏ qua
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
      <ReasonDialog
        key={resolving?.id ?? 'closed'}
        open={resolving !== null}
        title={resolving?.status === 'RESOLVED' ? 'Đánh dấu đã xử lý' : 'Bỏ qua báo cáo'}
        confirmLabel="Xác nhận"
        pending={resolve.isPending}
        onConfirm={(reason) => resolve.mutate(reason)}
        onClose={() => setResolving(null)}
      />
    </>
  );
}

const parseNumbers = (text: string) =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number);

export function AdminPresetsView() {
  const queryClient = useQueryClient();
  const presets = useQuery({ queryKey: ['admin', 'presets'], queryFn: adminApi.rulePresets });
  const active = presets.data?.find((p) => p.isActive);
  const [form, setForm] = useState<{
    name: string;
    fees: string;
    timers: string;
    rules: string;
    activate: boolean;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const startNew = () =>
    setForm({
      name: active?.name ?? 'Tiến Lên Miền Nam — mặc định',
      fees: (active?.allowedEntryFees ?? [0]).join(', '),
      timers: (active?.allowedTurnTimers ?? [15, 30, 45]).join(', '),
      rules: JSON.stringify(active?.rules ?? DEFAULT_GAME_RULES, null, 2),
      activate: true,
    });

  const create = useMutation({
    mutationFn: (reason: string) => {
      let rules: unknown;
      try {
        rules = JSON.parse(form!.rules);
      } catch {
        throw new Error('Luật chơi phải là JSON hợp lệ.');
      }
      return adminApi.createRulePreset({
        name: form!.name,
        rules,
        allowedEntryFees: parseNumbers(form!.fees),
        allowedTurnTimers: parseNumbers(form!.timers),
        activate: form!.activate,
        reason,
      });
    },
    onSuccess: (preset) => {
      showToast(`Đã tạo phiên bản ${preset.version}.`, { variant: 'success' });
      setConfirming(false);
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'presets'] });
    },
    onError: (error) =>
      showToast(
        error instanceof Error && !('code' in error) ? error.message : errorMessage(error),
        {
          variant: 'error',
        },
      ),
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-2xl font-bold">Cấu hình luật chơi</h1>
        {form ? null : <Button onClick={startNew}>Tạo phiên bản mới</Button>}
      </div>
      <p className="text-sm text-white/70">
        Mỗi thay đổi tạo một phiên bản mới; phiên bản cũ không bao giờ bị sửa. Phòng đã tạo giữ
        nguyên phiên bản của mình và mỗi ván lưu bản sao luật khi bắt đầu. Phần thưởng hằng ngày và
        tỉ lệ chia thưởng được quy định trong docs/ECONOMY.md.
      </p>
      {form ? (
        <AdminCard title="Phiên bản mới">
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setConfirming(true);
            }}
          >
            <TextField
              label="Tên"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <TextField
              label="Mức cược cho phép (xu, cách nhau bởi dấu phẩy)"
              required
              value={form.fees}
              onChange={(e) => setForm({ ...form, fees: e.target.value })}
            />
            <TextField
              label="Thời gian mỗi lượt (giây, cách nhau bởi dấu phẩy)"
              required
              value={form.timers}
              onChange={(e) => setForm({ ...form, timers: e.target.value })}
            />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Luật chơi (JSON, kiểm tra trên máy chủ theo docs/GAME_RULES.md)
              <textarea
                rows={14}
                value={form.rules}
                onChange={(e) => setForm({ ...form, rules: e.target.value })}
                className="rounded-lg border border-white/20 bg-felt-950/60 p-3 font-mono text-xs"
              />
            </label>
            <CheckboxField
              label="Kích hoạt ngay cho phòng mới"
              checked={form.activate}
              onChange={(e) => setForm({ ...form, activate: e.target.checked })}
            />
            <div className="flex gap-2">
              <Button type="submit">Tạo phiên bản</Button>
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>
                Hủy
              </Button>
            </div>
          </form>
        </AdminCard>
      ) : null}
      <AdminCard title="Các phiên bản">
        {presets.isPending ? (
          <LoadingSkeleton className="h-40" />
        ) : presets.isError ? (
          <QueryErrorState error={presets.error} onRetry={() => void presets.refetch()} />
        ) : (
          <ul className="flex flex-col divide-y divide-white/10 text-sm">
            {presets.data.map((p) => (
              <li key={p.id} className="flex flex-wrap gap-x-3 py-2">
                <span className="font-semibold">v{p.version}</span>
                <span>{p.name}</span>
                {p.isActive ? <span className="text-emerald-300">Đang dùng</span> : null}
                <span className="text-white/60">
                  Cược: {p.allowedEntryFees.join(', ')} · Lượt: {p.allowedTurnTimers.join(', ')}{' '}
                  giây
                </span>
                <span className="text-white/60">
                  {formatDateTime(p.createdAt)}
                  {p.createdBy ? ` · ${p.createdBy}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
      <ReasonDialog
        key={confirming ? 'open' : 'closed'}
        open={confirming}
        title="Tạo phiên bản luật mới"
        confirmLabel="Tạo"
        pending={create.isPending}
        onConfirm={(reason) => create.mutate(reason)}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}
