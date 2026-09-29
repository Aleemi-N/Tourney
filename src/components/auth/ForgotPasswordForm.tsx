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
    <div className="w-full max-w-md flex flex-col gap-6">
      <div className="flex justify-between items-center px-2">
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
        <div className="bg-surface-raised p-6 sm:p-8 rounded-2xl shadow-2xl shadow-black/20 border border-border text-center flex flex-col gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center font-bold text-xl">
            ✓
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Check your email</h1>
          <p className="text-text-secondary text-sm leading-relaxed">
            If an account exists for this email, a password reset link has been sent. Please check your inbox and spam folder.
          </p>
          <Link 
            href="/login" 
            className="mt-4 flex justify-center items-center h-12 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary-hover transition-colors"
          >
            Return to Sign In
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 bg-surface-raised p-6 sm:p-8 rounded-2xl shadow-2xl shadow-black/20 border border-border">
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-1">Reset Password</h1>
            <p className="text-sm text-text-secondary">Enter your registered email address to receive a reset link.</p>
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
              placeholder="you@example.com"
              className="p-3 rounded-xl border border-border bg-surface-muted text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>

          <button 
            type="submit" 
            disabled={status === 'pending'}
            className="mt-2 flex justify-center items-center h-12 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-colors"
          >
            {status === 'pending' ? 'Sending reset link...' : 'Send Reset Link'}
          </button>

          <div className="mt-2 text-center text-sm text-text-secondary">
            Remember your password?{' '}
            <Link href="/login" className="text-primary font-medium hover:underline">
              Sign In
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
