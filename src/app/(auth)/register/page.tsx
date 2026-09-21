import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata: Metadata = { title: 'Create Account' };

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Suspense fallback={<div className="w-full max-w-md h-96 bg-surface rounded-2xl animate-pulse" />}>
        <RegisterForm />
      </Suspense>
    </main>
  );
}
