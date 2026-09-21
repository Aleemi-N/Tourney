/**
 * Auth route group layout.
 *
 * Wraps: login, register, forgot-password.
 * Unauthenticated access only — redirect authenticated users away.
 * Placeholder shell — auth redirect logic to be added in the auth phase.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      {children}
    </div>
  );
}
