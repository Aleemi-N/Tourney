'use client';

import { useState } from 'react';
import { requestPasswordReset } from '@/app/actions/auth';
import Link from 'next/link';
import { VolleyballIcon } from '../landing/VolleyballIcon';
import { APP_CONFIG } from '@/lib/config';

export function ForgotPasswordForm() {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'pending') return;
    
    setStatus('pending');
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await requestPasswordReset(formData);

    if (result?.error) {
      setError(result.error);
      setStatus('idle');
    } else {
      setStatus('success');
    }
  }

  return (
    <div className="relative w-full max-w-md flex flex-col gap-6">
      {/* Subtle background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/20 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative z-10 flex justify-between items-center px-2">
        <Link href="/" className="flex items-center gap-2 group">
          <VolleyballIcon className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
          <span className="font-bold text-xl tracking-tight text-text-primary">
            {APP_CONFIG.shortName}
          </span>
        </Link>
        <Link href="/login" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
          Back to Sign In
        </Link>
      </div>

      {status === 'success' ? (
        <div className="relative z-10 bg-surface-raised/80 backdrop-blur-2xl p-8 rounded-3xl shadow-[0_8px_40px_rgb(0,0,0,0.2)] border border-glass-border text-center flex flex-col gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center font-bold text-xl shadow-inner border border-primary/20">
            ✓
          </div>
          <h1 className="text-3xl font-extrabold text-text-primary drop-shadow-sm">Check your email</h1>
          <p className="text-text-secondary text-sm font-medium leading-relaxed">
            If an account exists for this email, a password reset link has been sent. Please check your inbox and spam folder.
          </p>
          <Link 
            href="/login" 
            className="mt-6 flex justify-center items-center h-14 bg-gradient-to-r from-primary to-primary-hover shadow-[0_4px_15px_rgb(79,70,229,0.3)] hover:shadow-[0_8px_25px_rgb(79,70,229,0.4)] hover:-translate-y-0.5 active:scale-95 text-primary-foreground font-bold rounded-xl transition-all duration-300"
          >
            Return to Sign In
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="relative z-10 flex flex-col gap-5 w-full bg-surface-raised/80 backdrop-blur-2xl p-8 rounded-3xl shadow-[0_8px_40px_rgb(0,0,0,0.2)] border border-glass-border">
          <div className="mb-2">
            <h1 className="text-3xl font-extrabold text-text-primary mb-2 drop-shadow-sm">Reset Password</h1>
            <p className="text-sm font-medium text-text-secondary">Enter your registered email address to receive a reset link.</p>
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
              placeholder="you@example.com"
              className="p-3.5 rounded-xl border border-glass-border bg-surface/50 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-inner"
            />
          </div>

          <button 
            type="submit" 
            disabled={status === 'pending'}
            className="mt-4 flex justify-center items-center h-14 bg-gradient-to-r from-primary to-primary-hover shadow-[0_4px_15px_rgb(79,70,229,0.3)] hover:shadow-[0_8px_25px_rgb(79,70,229,0.4)] hover:-translate-y-0.5 active:scale-95 text-primary-foreground font-bold rounded-xl disabled:opacity-50 transition-all duration-300"
          >
            {status === 'pending' ? 'Sending reset link...' : 'Send Reset Link'}
          </button>

          <div className="mt-4 pt-4 border-t border-glass-border/50 text-center text-sm text-text-secondary">
            Remember your password?{' '}
            <Link href="/login" className="text-primary font-bold hover:underline transition-all">
              Sign In
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
