import { Hammer } from 'lucide-react';
import { ButtonLink } from './button';
import { EmptyState } from './states';

/** Honest placeholder for screens whose backend arrives in a later phase. */
export function ComingSoon({
  title,
  phase,
  description,
}: {
  title: string;
  phase: number;
  description: string;
}) {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <EmptyState
        icon={Hammer}
        title="Tính năng đang được phát triển"
        description={`${description} (dự kiến ở giai đoạn ${phase}).`}
        action={
          <ButtonLink href="/lobby" variant="secondary">
            Về sảnh
          </ButtonLink>
        }
      />
    </section>
  );
}
