import type { Metadata } from 'next';
import { ReceiptView } from './ReceiptView';

export const metadata: Metadata = { title: 'Receipt', robots: { index: false } };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto min-h-screen max-w-lg px-5 py-10">
      <ReceiptView paymentId={id} />
    </main>
  );
}
