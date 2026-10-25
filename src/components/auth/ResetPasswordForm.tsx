'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resetPassword } from '@/app/actions/auth';
import Link from 'next/link';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { VolleyballIcon } from '../landing/VolleyballIcon';
import { APP_CONFIG } from '@/lib/config';

export function ResetPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<'pending' | 'valid' | 'invalid'>('pending');
  
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setSessionStatus('invalid');
        setError('Your password reset link is invalid or has expired. Please request a new one.');
      } else {
        setSessionStatus('valid');
      }
    });
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await resetPassword(formData);

    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-md flex flex-col gap-6">
      <div className="flex justify-between items-center px-2">
        <Link href="/" className="flex items-center gap-2 group">
          <VolleyballIcon className="w-6 h-6 text-primary transition-transform" />
          <span className="font-bold text-xl tracking-tight text-text-primary">
            {APP_CONFIG.shortName}
          </span>
        </Link>
        <Link href="/login" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
          Back to Sign In
        </Link>
      </div>

      {sessionStatus === 'invalid' ? (
        <div className="bg-surface-raised p-6 sm:p-8 rounded-2xl shadow-card shadow-black/20 border border-border text-center flex flex-col gap-4">
          <h1 className="text-2xl font-bold text-text-primary">Invalid or Expired Link</h1>
          <p className="text-text-secondary text-sm leading-relaxed">
            {error}
          </p>
          <Link 
            href="/forgot-password" 
            className="mt-4 flex justify-center items-center h-12 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary-hover transition-colors"
          >
            Request New Link
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 bg-surface-raised p-6 sm:p-8 rounded-2xl shadow-card shadow-black/20 border border-border">
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-1">Set New Password</h1>
            <p className="text-sm text-text-secondary">Please enter your new password below.</p>
          </div>
          
          {error && (
            <div className="p-3 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary" htmlFor="password">New Password</label>
            <div className="relative">
              <input 
                id="password"
                name="password" 
                type={showPassword ? "text" : "password"} 
                autoComplete="new-password"
                required
                minLength={6}
                disabled={sessionStatus === 'pending'}
                className="w-full p-3 pr-12 rounded-xl border border-border bg-surface-muted text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                disabled={sessionStatus === 'pending'}
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

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary" htmlFor="confirmPassword">Confirm Password</label>
            <div className="relative">
              <input 
                id="confirmPassword"
                name="confirmPassword" 
                type={showConfirmPassword ? "text" : "password"} 
                autoComplete="new-password"
                required
                minLength={6}
                disabled={sessionStatus === 'pending'}
                className="w-full p-3 pr-12 rounded-xl border border-border bg-surface-muted text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                disabled={sessionStatus === 'pending'}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? (
                  <EyeSlashIcon className="w-5 h-5" />
                ) : (
                  <EyeIcon className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={pending || sessionStatus === 'pending'}
            className="mt-2 flex justify-center items-center h-12 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-colors"
          >
            {pending ? 'Saving new password...' : 'Update Password'}
          </button>
        </form>
      )}
    </div>
  );
}
