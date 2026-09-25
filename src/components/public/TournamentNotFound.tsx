import Link from 'next/link';
import { Trophy } from 'lucide-react';

interface Props {
  message?: string;
}

export function TournamentNotFound({ message }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center"
      style={{ background: '#09090e', color: '#f0f0f4' }}>
      <Trophy className="h-12 w-12 mb-4" style={{ color: '#6366f1' }} />
      <h1 className="text-2xl font-bold mb-2">Tournament Not Found</h1>
      <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.45)' }}>
        {message ?? 'This tournament is private or does not exist.'}
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors"
        style={{ background: 'rgba(99,102,241,0.18)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
      >
        ← Back to Tourny
      </Link>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div
      className="rounded-2xl p-10 text-center text-sm"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px dashed rgba(255,255,255,0.12)',
        color: 'rgba(255,255,255,0.4)',
      }}
    >
      {text}
    </div>
  );
}
