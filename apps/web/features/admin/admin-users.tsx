'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WALLET_TRANSACTION_LABELS_VI } from '@tienlen/shared';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/form-fields';
import { LoadingSkeleton, QueryErrorState } from '@/components/ui/states';
import { useSessionUser } from '@/features/auth/session-context';
import { errorMessage } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { formatCoinDelta, formatCoins, formatDateTime } from '@/lib/format';
import { showToast } from '@/lib/toast-store';
import { adminApi } from './admin-api';
import { AdminCard, ReasonDialog } from './admin-shell';

const STATUS_LABELS = { ACTIVE: 'Hoạt động', SUSPENDED: 'Bị khóa', DELETED: 'Đã xóa' } as const;

export function AdminUsersView() {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const users = useQuery({
    queryKey: ['admin', 'users', q],
    queryFn: () => adminApi.searchUsers(q),
  });
  return (
    <>
      <h1 className="text-2xl font-bold">Người dùng</h1>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(input.trim());
        }}
      >
        <TextField
          label="Tìm theo tên hiển thị, email hoặc mã người dùng"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="min-w-64 flex-1"
        />
        <Button type="submit">Tìm</Button>
      </form>
      <AdminCard>
        {users.isPending ? (
          <LoadingSkeleton className="h-40" />
        ) : users.isError ? (
          <QueryErrorState error={users.error} onRetry={() => void users.refetch()} />
        ) : users.data.length === 0 ? (
          <p className="text-sm text-white/60">Không tìm thấy người dùng.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/10">
            {users.data.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/admin/users/${u.id}`}
                  className="flex flex-wrap items-center gap-x-3 py-2 hover:bg-white/5"
                >
                  <span className="font-semibold">{u.displayName}</span>
                  <span className="text-sm text-white/60">{u.email}</span>
                  {u.role === 'ADMIN' ? (
                    <span className="rounded bg-gold-400 px-1.5 text-xs text-felt-950">
                      Quản trị
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      'ml-auto text-sm',
                      u.status === 'ACTIVE' ? 'text-emerald-300' : 'text-red-300',
                    )}
                  >
                    {STATUS_LABELS[u.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </>
  );
}

type Dialog = 'status' | 'sessions' | 'coins' | 'notice' | null;

export function AdminUserDetailView({ userId }: { userId: string }) {
  const me = useSessionUser();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState({ title: '', body: '' });
  const user = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => adminApi.user(userId),
  });
  const matches = useQuery({
    queryKey: ['admin', 'user', userId, 'matches'],
    queryFn: () => adminApi.userMatches(userId),
  });
  const ledger = useQuery({
    queryKey: ['admin', 'user', userId, 'ledger'],
    queryFn: () => adminApi.userTransactions(userId),
  });

  const done = (message: string) => {
    showToast(message, { variant: 'success' });
    setDialog(null);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] });
  };
  const onError = (error: unknown) => showToast(errorMessage(error), { variant: 'error' });
  const action = useMutation({
    mutationFn: async (reason: string) => {
      const u = user.data!;
      switch (dialog) {
        case 'status':
          await adminApi.setStatus(userId, u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE', reason);
          return u.status === 'ACTIVE' ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.';
        case 'sessions': {
          const { revokedSessions } = await adminApi.revokeSessions(userId, reason);
          return `Đã đăng xuất ${revokedSessions} phiên.`;
        }
        case 'coins': {
          const { balance } = await adminApi.adjustCoins(userId, {
            amount: Number(amount),
            reason,
            requestId: crypto.randomUUID(),
          });
          return `Đã điều chỉnh. Số dư mới: ${formatCoins(balance)} xu.`;
        }
        default:
          return '';
      }
    },
    onSuccess: done,
    onError,
  });
  const sendNotice = useMutation({
    mutationFn: () => adminApi.sendNotice(userId, notice),
    onSuccess: () => {
      setNotice({ title: '', body: '' });
      done('Đã gửi thông báo.');
    },
    onError,
  });

  if (user.isPending) return <LoadingSkeleton className="h-64" />;
  if (user.isError)
    return <QueryErrorState error={user.error} onRetry={() => void user.refetch()} />;
  const u = user.data;
  const self = u.id === me?.id;

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold">{u.displayName}</h1>
        <p className="text-sm text-white/70">
          {u.email} · <span className="font-mono">{u.id}</span>
        </p>
      </div>
      <AdminCard title="Tài khoản">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['Trạng thái', STATUS_LABELS[u.status]],
              ['Vai trò', u.role === 'ADMIN' ? 'Quản trị' : 'Người chơi'],
              ['Email đã xác minh', u.emailVerified ? 'Có' : 'Chưa'],
              ['Phiên đang mở', formatCoins(u.activeSessions)],
              ['Số dư', `${formatCoins(u.balance)} xu`],
              ['Số ván / thắng', `${u.matchesPlayed} / ${u.matchesWon}`],
              ['Tạo lúc', formatDateTime(u.createdAt)],
              ['Đăng nhập gần nhất', u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-white/60">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        {u.suspensionReason ? (
          <p className="mt-3 text-sm text-red-300">Lý do khóa: {u.suspensionReason}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {!self ? (
            <Button
              variant={u.status === 'ACTIVE' ? 'danger' : 'secondary'}
              onClick={() => setDialog('status')}
            >
              {u.status === 'ACTIVE' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => setDialog('sessions')}>
            Đăng xuất mọi phiên
          </Button>
          <Button variant="secondary" onClick={() => setDialog('coins')}>
            Điều chỉnh xu
          </Button>
        </div>
      </AdminCard>

      <AdminCard title="Gửi thông báo">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            sendNotice.mutate();
          }}
        >
          <TextField
            label="Tiêu đề"
            required
            maxLength={120}
            value={notice.title}
            onChange={(event) => setNotice({ ...notice, title: event.target.value })}
          />
          <TextField
            label="Nội dung"
            required
            maxLength={500}
            value={notice.body}
            onChange={(event) => setNotice({ ...notice, body: event.target.value })}
          />
          <Button type="submit" className="self-start" loading={sendNotice.isPending}>
            Gửi
          </Button>
        </form>
      </AdminCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminCard title="Ván đấu gần đây">
          {matches.isPending ? (
            <LoadingSkeleton className="h-32" />
          ) : matches.isError ? (
            <QueryErrorState error={matches.error} onRetry={() => void matches.refetch()} />
          ) : matches.data.items.length === 0 ? (
            <p className="text-sm text-white/60">Chưa có ván nào.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-white/10 text-sm">
              {matches.data.items.map((m) => {
                const mine = m.players.find((p) => p.userId === userId);
                return (
                  <li key={m.matchId}>
                    <Link
                      href={`/admin/matches/${m.matchId}`}
                      className="flex gap-2 py-2 hover:bg-white/5"
                    >
                      <span className="flex-1">
                        {formatDateTime(m.startedAt)} · {m.roomCode}
                      </span>
                      <span>
                        {m.status === 'ABORTED' ? 'Đã hủy' : `Hạng ${mine?.placement ?? '—'}`}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </AdminCard>
        <AdminCard title="Sổ cái">
          {ledger.isPending ? (
            <LoadingSkeleton className="h-32" />
          ) : ledger.isError ? (
            <QueryErrorState error={ledger.error} onRetry={() => void ledger.refetch()} />
          ) : (
            <ul className="flex flex-col divide-y divide-white/10 text-sm">
              {ledger.data.items.map((t) => (
                <li key={t.id} className="flex gap-2 py-2">
                  <span className="flex-1">
                    {WALLET_TRANSACTION_LABELS_VI[t.type]}
                    {t.reason ? <span className="text-white/60"> · {t.reason}</span> : null}
                    <span className="block text-xs text-white/50">
                      {formatDateTime(t.createdAt)}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    {formatCoinDelta(t.amount)}
                    <span className="block text-xs text-white/50">
                      {formatCoins(t.balanceAfter)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>

      <ReasonDialog
        key={dialog ?? 'closed'}
        open={dialog !== null}
        title={
          dialog === 'status'
            ? u.status === 'ACTIVE'
              ? 'Khóa tài khoản'
              : 'Mở khóa tài khoản'
            : dialog === 'sessions'
              ? 'Đăng xuất mọi phiên'
              : 'Điều chỉnh xu'
        }
        description={
          dialog === 'coins'
            ? 'Tạo một bút toán điều chỉnh mới; các giao dịch cũ không bao giờ bị sửa hay xóa.'
            : undefined
        }
        confirmLabel="Xác nhận"
        danger={dialog === 'status' && u.status === 'ACTIVE'}
        pending={action.isPending}
        extra={
          dialog === 'coins' ? (
            <TextField
              label="Số xu (dương để cộng, âm để trừ)"
              type="number"
              required
              step={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          ) : null
        }
        onConfirm={(reason) => action.mutate(reason)}
        onClose={() => setDialog(null)}
      />
    </>
  );
}
