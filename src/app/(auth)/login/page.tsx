import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = { title: 'Sign In' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const isRegistrationFlow = next?.startsWith('/t/') && next.includes('/register/');
  return (
    <main className={`${isRegistrationFlow ? 'dark' : ''} flex min-h-screen w-full min-w-0 items-center justify-center bg-background p-4 text-text-primary`}>
      <LoginForm nextUrl={next} />
    </main>
  );
}
