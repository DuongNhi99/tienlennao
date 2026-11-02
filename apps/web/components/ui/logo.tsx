import Link from 'next/link';
import { cn } from '@/lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden className={cn('size-8', className)}>
      <rect width="512" height="512" rx="112" fill="#0f5d3b" />
      <g transform="rotate(-14 256 300)">
        <rect
          x="118"
          y="116"
          width="196"
          height="276"
          rx="24"
          fill="#b91c1c"
          stroke="#f2c450"
          strokeWidth="8"
        />
        <rect
          x="140"
          y="138"
          width="152"
          height="232"
          rx="14"
          fill="none"
          stroke="#f2c450"
          strokeWidth="5"
          opacity="0.7"
        />
      </g>
      <g transform="rotate(10 256 300)">
        <rect
          x="196"
          y="120"
          width="196"
          height="276"
          rx="24"
          fill="#fdfcf8"
          stroke="#dba631"
          strokeWidth="6"
        />
        <path
          d="M294 322c0 0-62-40-62-82 0-24 18-40 38-40 12 0 20 7 24 15 4-8 12-15 24-15 20 0 38 16 38 40 0 42-62 82-62 82z"
          fill="#c62828"
        />
      </g>
    </svg>
  );
}

export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn('inline-flex min-h-11 items-center gap-2 font-bold tracking-tight', className)}
    >
      <LogoMark />
      <span className="whitespace-nowrap text-lg">
        Tiến Lên <span className="text-gold-400">Online</span>
      </span>
    </Link>
  );
}
