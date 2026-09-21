import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = { title: 'Reset Password' };

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <ResetPasswordForm />
    </main>
  );
}
