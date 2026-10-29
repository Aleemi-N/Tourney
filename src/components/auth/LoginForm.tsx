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
      // Don't leak exact internal errors if they are too technical
      const message = result.error.includes('Invalid login') 
        ? 'Invalid email or password.'
        : 'An error occurred during sign in. Please try again.';
      setError(message);
      setPending(false);
    }
  }

  return (
    <div className="relative w-full max-w-md flex flex-col gap-6">
      {/* Subtle background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/20 rounded-full blur-[80px] pointer-events-none" />
      
      <div className="relative z-10 flex justify-between items-center px-2">
        <Link href="/" className="flex items-center gap-2 group">
          <VolleyballIcon className="w-6 h-6 text-primary transition-transform" />
          <span className="font-bold text-xl tracking-tight text-text-primary">
            {APP_CONFIG.shortName}
          </span>
        </Link>
        <Link href="/" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
          Back to Home
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="relative z-10 flex flex-col gap-5 w-full bg-surface-raised p-8 rounded-3xl shadow-card border border-glass-border">
        {nextUrl && <input type="hidden" name="nextUrl" value={nextUrl} />}
        
        <div className="mb-2">
          <h1 className="text-3xl font-extrabold text-text-primary mb-2">Sign In</h1>
          <p className="text-sm font-medium text-text-secondary">Welcome back to Tourny.</p>
        </div>
        
        {error && (
          <div className="p-3 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-wider text-text-muted" htmlFor="email">Email</label>
          <input 
            id="email"
            name="email" 
            type="email" 
            autoComplete="email"
            required 
            className="p-3.5 rounded-xl border border-glass-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-card"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold uppercase tracking-wider text-text-muted" htmlFor="password">Password</label>
            <Link href="/forgot-password" className="text-xs font-bold text-primary hover:underline transition-colors">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input 
              id="password"
              name="password" 
              type={showPassword ? "text" : "password"} 
              autoComplete="current-password"
              required 
              className="w-full p-3.5 pr-12 rounded-xl border border-glass-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-card"
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
          className="mt-4 p-3.5 bg-primary shadow-card active:scale-95 text-primary-foreground font-bold rounded-xl disabled:opacity-50 transition-all duration-300 flex justify-center items-center h-14"
        >
          {pending ? 'Signing in...' : 'Sign In'}
        </button>

        <div className="mt-4 pt-4 border-t border-glass-border/50 text-sm text-center text-text-secondary flex flex-col gap-3">
          <Link href="/forgot-password" className="hover:text-primary transition-all font-medium">
            Forgot your password?
          </Link>
          <div className="h-px bg-glass-border my-1" />
          <p>
            New to Tourny?{' '}
            <Link href={`/register${nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : ''}`} className="text-primary font-bold hover:underline transition-all">
              Create Account
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
