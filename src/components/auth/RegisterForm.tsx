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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-md bg-surface p-6 rounded-2xl shadow-sm border border-border">
      <h1 className="text-2xl font-bold text-text-primary mb-1">Create Account</h1>
      <p className="text-text-secondary text-sm mb-4">Set up your Tourny profile.</p>

      {error && (
        <div className="p-3 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg">
          {error}
        </div>
      )}

      <input type="hidden" name="nextUrl" value={nextUrl} />

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-secondary" htmlFor="fullName">Full Name</label>
        <input 
          id="fullName"
          name="fullName" 
          type="text" 
          required 
          className="p-3 rounded-lg border border-border bg-surface-muted text-text-primary focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-secondary" htmlFor="email">Email</label>
        <input 
          id="email"
          name="email" 
          type="email" 
          required 
          className="p-3 rounded-lg border border-border bg-surface-muted text-text-primary focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-secondary" htmlFor="password">Password</label>
        <input 
          id="password"
          name="password" 
          type="password" 
          required
          minLength={6}
          className="p-3 rounded-lg border border-border bg-surface-muted text-text-primary focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      <button 
        type="submit" 
        disabled={pending}
        className="mt-4 p-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors flex justify-center items-center h-12"
      >
        {pending ? 'Creating Account...' : 'Create Account'}
      </button>

      <div className="mt-4 text-sm text-center text-text-secondary flex flex-col gap-2">
        <span>
          Already have an account?{' '}
          <Link href={`/login${nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : ''}`} className="text-primary font-medium hover:underline">
            Sign In
          </Link>
        </span>
      </div>
    </form>
  );
}
