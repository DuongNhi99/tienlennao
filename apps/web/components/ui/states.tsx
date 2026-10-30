import { CircleAlert, Hourglass, type LucideIcon, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiClientError, errorMessage } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { Button } from './button';

export function LoadingSkeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-white/10', className)} />;
}

/** Announces loading to assistive technology while skeletons render visually. */
export function LoadingRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/15 px-6 py-10 text-center',
        className,
      )}
    >
      <Icon aria-hidden className="size-8 text-white/50" />
      <p className="font-semibold">{title}</p>
      {description ? <p className="max-w-sm text-sm text-white/70">{description}</p> : null}
      {action}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Không tải được dữ liệu',
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-red-400/30 bg-red-950/30 px-6 py-8 text-center',
        className,
      )}
    >
      <CircleAlert aria-hidden className="size-8 text-red-300" />
      <p className="font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-white/75">{message}</p>
      {onRetry ? (
        <Button
          variant="secondary"
          onClick={onRetry}
          icon={<RefreshCw aria-hidden className="size-4" />}
        >
          Thử lại
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Error state for a failed query. Features the backend does not offer yet
 * (FEATURE_UNAVAILABLE) show a "coming soon" panel without a pointless retry button.
 */
export function QueryErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  if (error instanceof ApiClientError && error.code === 'FEATURE_UNAVAILABLE') {
    return (
      <EmptyState
        icon={Hourglass}
        title="Sắp ra mắt"
        description={error.message}
        className={className}
      />
    );
  }
  return <ErrorState message={errorMessage(error)} onRetry={onRetry} className={className} />;
}
