import type { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const VARIANTS = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'border border-border-strong bg-surface text-text-primary hover:bg-surface-muted',
  ghost: 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
  danger: 'bg-danger text-text-inverse hover:opacity-90',
  'danger-outline': 'border border-danger/40 text-danger hover:bg-danger/10',
} as const;

// md and lg meet the 44px touch target; sm is for dense desktop rows only.
const SIZES = {
  sm: 'min-h-10 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-5 text-base',
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

/** Button look for links and other elements that must not be a <button>. */
export function buttonClasses({ variant = 'primary', size = 'md', className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({
  variant,
  size,
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
