'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ReloadButton() {
  return (
    <Button
      size="lg"
      onClick={() => window.location.reload()}
      icon={<RefreshCw aria-hidden className="size-5" />}
    >
      Thử kết nối lại
    </Button>
  );
}
