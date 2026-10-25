import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// 16px text on phones stops iOS from zooming into focused fields.
export const inputClasses =
  'block w-full min-h-11 rounded-xl border border-border-strong bg-surface px-3 text-base text-text-primary placeholder:text-text-muted transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60 aria-[invalid=true]:border-danger sm:text-sm';

/** Label + control + hint or error. Pass the control's id as htmlFor. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-text-primary">
        {label}
        {required ? <span className="text-danger" aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClasses, className)} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputClasses, 'pr-8', className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClasses, 'min-h-24 py-2.5', className)} />;
}
