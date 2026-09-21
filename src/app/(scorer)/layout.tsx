/**
 * Scorer route group layout.
 *
 * Wraps all scorer pages.
 * Requires authenticated Scorer role.
 * Minimal UI — no auction/purse/team admin.
 * Placeholder shell — to be built in the scorer phase.
 */
export default function ScorerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
