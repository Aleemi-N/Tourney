'use client';

import { useState } from 'react';
import { register } from '@/app/actions/auth';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next') || '';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await register(formData);

    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <div className="relative w-full max-w-md">
      {/* Subtle background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/20 rounded-full blur-[80px] pointer-events-none" />
      
      <form onSubmit={handleSubmit} className="relative flex flex-col gap-5 w-full bg-surface-raised p-8 rounded-3xl shadow-card border border-glass-border">
        <div className="mb-2">
          <h1 className="text-3xl font-extrabold text-text-primary mb-2">Create Account</h1>
          <p className="text-text-secondary text-sm font-medium">Set up your Tourny profile.</p>
        </div>

      {error && (
        <div className="p-3 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg">
          {error}
        </div>
      )}

      <input type="hidden" name="nextUrl" value={nextUrl} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-bold uppercase tracking-wider text-text-muted" htmlFor="fullName">Full Name</label>
        <input 
          id="fullName"
          name="fullName" 
          type="text" 
          required 
          className="p-3.5 rounded-xl border border-glass-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-card"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-bold uppercase tracking-wider text-text-muted" htmlFor="email">Email</label>
        <input 
          id="email"
          name="email" 
          type="email" 
          required 
          className="p-3.5 rounded-xl border border-glass-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-card"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-bold uppercase tracking-wider text-text-muted" htmlFor="password">Password</label>
        <input 
          id="password"
          name="password" 
          type="password" 
          required
          minLength={6}
          className="p-3.5 rounded-xl border border-glass-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-card"
        />
      </div>

      <button 
        type="submit" 
        disabled={pending}
        className="mt-4 p-3.5 bg-primary shadow-card active:scale-95 text-primary-foreground font-bold rounded-xl disabled:opacity-50 transition-all duration-300 flex justify-center items-center h-14"
      >
        {pending ? 'Creating Account...' : 'Create Account'}
      </button>

      <div className="mt-4 pt-4 border-t border-glass-border/50 text-sm text-center text-text-secondary flex flex-col gap-2">
        <span>
          Already have an account?{' '}
          <Link href={`/login${nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : ''}`} className="text-primary font-bold hover:underline transition-all">
            Sign In
          </Link>
        </span>
      </div>
      </form>
    </div>
  );
}
