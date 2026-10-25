import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const cardClasses = 'rounded-2xl border border-border bg-surface shadow-card';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn(cardClasses, className)} />;
}

/** Page title block: optional eyebrow, title, description and right-aligned actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{eyebrow}</p> : null}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
