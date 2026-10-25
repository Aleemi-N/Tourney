'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Dialog on the native <dialog> element: it traps focus, closes on Escape and
 * makes the page behind inert. A bottom sheet on phones, centred from sm up.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  footer,
  size = 'md',
  dismissible = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** false while a request is in flight, so Escape and backdrop clicks are ignored. */
  dismissible?: boolean;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
      className={cn(
        'm-0 mt-auto w-full max-w-none rounded-t-2xl border border-border bg-surface-raised p-0 text-text-primary shadow-overlay backdrop:bg-black/50 sm:m-auto sm:rounded-2xl',
        { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size],
      )}
    >
      {open ? (
        <div className="flex max-h-[90dvh] flex-col">
          <header className="flex items-start gap-3 border-b border-border px-5 py-4">
            {icon ? <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">{icon}</span> : null}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-base font-semibold text-text-primary">{title}</h2>
              {description ? <p id={descriptionId} className="mt-0.5 text-sm text-text-secondary">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={!dismissible}
              aria-label="Close"
              className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}
