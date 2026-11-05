import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { SeriesView } from '@/features/series/series-view';

export const metadata: Metadata = { title: 'Chuỗi ván' };

export default async function Page({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params;
  if (!z.uuid().safeParse(seriesId).success) notFound();
  return <SeriesView seriesId={seriesId} />;
}
