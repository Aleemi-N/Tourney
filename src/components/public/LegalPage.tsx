import Link from 'next/link';
import type { ReactNode } from 'react';

/** The contact address shown on the legal pages; set NEXT_PUBLIC_CONTACT_EMAIL for your deployment. */
export function contactEmail(): string {
  return process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'support@example.com';
}

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Link href="/" className="text-sm font-medium text-text-secondary hover:text-text-primary">← Back to Tourny</Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-text-muted">Last updated {updated}</p>
      <div className="mt-8 space-y-4 text-base leading-7 text-text-secondary [&_a]:text-primary [&_a]:underline [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-text-primary [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_strong]:text-text-primary">
        {children}
      </div>
    </main>
  );
}
