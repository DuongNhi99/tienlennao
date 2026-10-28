'use client';

import { ErrorState } from '@/components/ui/states';

// Never renders error details: they may contain internal information.
export default function GlobalRouteError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md items-center px-6">
      <ErrorState
        title="Đã xảy ra lỗi"
        message="Trang không thể hiển thị. Vui lòng thử lại."
        onRetry={reset}
        className="w-full"
      />
    </main>
  );
}
