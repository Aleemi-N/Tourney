'use client';

import { useState } from 'react';
import { login } from '@/app/actions/auth';
import Link from 'next/link';
import { VolleyballIcon } from '../landing/VolleyballIcon';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { APP_CONFIG } from '@/lib/config';

export function LoginForm({ nextUrl }: { nextUrl?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await login(formData);

    if (result?.error) {
      // Don't leak exact Supabase internal errors if they are too technical
      const message = result.error.includes('Invalid login') 
        ? 'Invalid email or password.'
        : 'An error occurred during sign in. Please try again.';
      setError(message);
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-md flex flex-col gap-6">
      <div className="flex justify-between items-center px-2">
        <Link href="/" className="flex items-center gap-2 group">
          <VolleyballIcon className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
          <span className="font-bold text-xl tracking-tight text-text-primary">
            {APP_CONFIG.shortName}
          </span>
        </Link>
        <Link href="/" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
          Back to Home
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 bg-surface p-6 sm:p-8 rounded-2xl shadow-sm border border-border">
        {nextUrl && <input type="hidden" name="nextUrl" value={nextUrl} />}
        
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-1">Sign In</h1>
          <p className="text-sm text-text-secondary">Welcome back to Tourny.</p>
        </div>
        
        {error && (
          <div className="p-3 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-secondary" htmlFor="email">Email</label>
          <input 
            id="email"
            name="email" 
            type="email" 
            autoComplete="email"
            required 
            className="p-3 rounded-xl border border-border bg-surface-muted text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-secondary" htmlFor="password">Password</label>
          <div className="relative">
            <input 
              id="password"
              name="password" 
              type={showPassword ? "text" : "password"} 
              autoComplete="current-password"
              required 
              className="w-full p-3 pr-12 rounded-xl border border-border bg-surface-muted text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-secondary hover:text-text-primary transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeSlashIcon className="w-5 h-5" />
              ) : (
                <EyeIcon className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={pending}
          className="mt-2 flex justify-center items-center h-12 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-colors"
        >
          {pending ? 'Signing in...' : 'Sign In'}
        </button>

        <div className="mt-2 flex flex-col gap-3 text-sm text-center text-text-secondary">
          <Link href="/forgot-password" className="hover:text-primary transition-colors">
            Forgot your password?
          </Link>
          <div className="h-px bg-border my-1" />
          <p>
            New to Tourny?{' '}
            <Link href={`/register${nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : ''}`} className="text-primary font-medium hover:underline">
              Create Account
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
