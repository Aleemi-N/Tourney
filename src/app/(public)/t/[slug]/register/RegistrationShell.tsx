import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

type RegistrationShellProps = {
  slug: string;
  tournamentName?: string;
  title: string;
  children: React.ReactNode;
};

export function RegistrationShell({
  slug,
  tournamentName,
  title,
  children,
}: RegistrationShellProps) {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-text-primary sm:px-6 sm:py-10 lg:px-8 lg:py-14">
      <div className="mx-auto max-w-3xl">
        <header className="mb-7 sm:mb-8">
          <Link
            href={`/t/${slug}`}
            className="mb-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
            Back to Tournament
          </Link>
          {tournamentName && (
            <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
              {tournamentName}
            </h1>
          )}
          <p className={tournamentName ? 'mt-1 text-text-secondary' : 'text-3xl font-bold text-text-primary'}>
            {title}
          </p>
        </header>
        {children}
      </div>
    </main>
  );
}

export const registrationCardClass =
  'rounded-xl border border-border bg-surface-raised p-5 shadow-card shadow-black/20 sm:p-6';

export const registrationStatusClass =
  'rounded-lg border border-border bg-surface-muted p-4';
