import type { ReactNode } from 'react';

export function EmptyState({ title, description, action, icon }: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  const headingId = `empty-${title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <section className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-5 py-8 text-center sm:px-8" aria-labelledby={headingId}>
      {icon ? <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-white/55" aria-hidden="true">{icon}</div> : null}
      <h2 id={headingId} className="text-base font-bold text-white">{title}</h2>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/55">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </section>
  );
}
