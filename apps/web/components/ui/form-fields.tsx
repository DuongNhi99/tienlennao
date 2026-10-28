'use client';

import { CircleAlert, Eye, EyeOff } from 'lucide-react';
import { type ComponentProps, type ReactNode, useId, useState } from 'react';
import { cn } from '@/lib/cn';

const INPUT =
  'block min-h-11 w-full rounded-lg border bg-felt-950/60 px-3 text-base text-white placeholder:text-white/40 transition-colors focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/40 disabled:opacity-60';

function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: ReactNode }) {
  if (error) {
    return (
      <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm text-red-300">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>{error}</span>
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className="mt-1.5 text-sm text-white/60">
        {hint}
      </p>
    );
  }
  return null;
}

type TextFieldProps = ComponentProps<'input'> & {
  label: string;
  error?: string;
  hint?: ReactNode;
  trailing?: ReactNode;
};

export function TextField({
  label,
  error,
  hint,
  trailing,
  id,
  className,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-white/90">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={cn(
            INPUT,
            error ? 'border-red-400' : 'border-white/20',
            trailing ? 'pr-12' : null,
          )}
          {...props}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>
        ) : null}
      </div>
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

export function PasswordField(props: Omit<TextFieldProps, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="grid size-10 place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={visible}
        >
          {visible ? (
            <EyeOff aria-hidden className="size-5" />
          ) : (
            <Eye aria-hidden className="size-5" />
          )}
        </button>
      }
    />
  );
}

type SelectFieldProps = ComponentProps<'select'> & {
  label: string;
  error?: string;
  hint?: ReactNode;
};

export function SelectField({
  label,
  error,
  hint,
  id,
  className,
  children,
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const messageId = `${selectId}-message`;
  return (
    <div className={className}>
      <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-white/90">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={cn(INPUT, error ? 'border-red-400' : 'border-white/20')}
        {...props}
      >
        {children}
      </select>
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

type CheckboxFieldProps = Omit<ComponentProps<'input'>, 'type'> & {
  label: ReactNode;
  error?: string;
};

export function CheckboxField({ label, error, id, className, ...props }: CheckboxFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  return (
    <div className={className}>
      <div className="flex items-start gap-3">
        <input
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? messageId : undefined}
          className="mt-0.5 size-5 shrink-0 accent-gold-400"
          {...props}
        />
        <label htmlFor={inputId} className="text-sm text-white/85">
          {label}
        </label>
      </div>
      <FieldMessage id={messageId} error={error} />
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-red-400/40 bg-red-950/40 px-3 py-2.5 text-sm text-red-200"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
