import Link from 'next/link';
import { ArrowLeft, Trophy } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';

interface Props {
  message?: string;
}

export function TournamentNotFound({ message }: Props) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center text-text-primary">
      <Trophy className="mb-4 h-12 w-12 text-primary" aria-hidden="true" />
      <h1 className="mb-2 text-2xl font-bold">Tournament not found</h1>
      <p className="mb-8 text-sm text-text-secondary">{message ?? 'This tournament is private or does not exist.'}</p>
      <Link href="/" className={buttonClasses({ variant: 'secondary' })}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Tourny
      </Link>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-strong bg-surface p-10 text-center text-sm text-text-secondary">
      {text}
    </div>
  );
}
