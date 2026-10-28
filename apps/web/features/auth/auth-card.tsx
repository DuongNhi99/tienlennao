import type { ReactNode } from 'react';
import { LogoMark } from '@/components/ui/logo';

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main id="main" className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-felt-800/80 p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <LogoMark className="size-12" />
          <h1 className="text-2xl font-bold">{title}</h1>
          {description ? <p className="text-sm text-white/75">{description}</p> : null}
        </div>
        {children}
        {footer ? <div className="mt-6 text-center text-sm text-white/75">{footer}</div> : null}
      </div>
    </main>
  );
}
