'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Settings, Save, AlertTriangle } from 'lucide-react';
import type { createClient } from '@/lib/supabase/client';
import type { QueuePlayer } from '@/lib/organizer/organizer-auction';

interface ConfigureQueueModalProps {
  open: boolean;
  onClose: () => void;
  queue: QueuePlayer[];
  playerNameMap: Record<string, string>;
  supabase: ReturnType<typeof createClient>;
  onSaved: () => void;
}

type QueueItem = { id: string; order: number | ''; name: string; basePrice: number; category: string | null };

function toItems(queue: QueuePlayer[], playerNameMap: Record<string, string>): QueueItem[] {
  return [...queue]
    .sort((a, b) => a.auction_order - b.auction_order)
    .map((p) => ({
      id: p.auction_player_id,
      order: p.auction_order,
      name: playerNameMap[p.player_id] || 'Unknown',
      basePrice: p.base_price,
      category: p.category_code,
    }));
}

export function ConfigureQueueModal({
  open,
  onClose,
  queue,
  playerNameMap,
  supabase,
  onSaved,
}: ConfigureQueueModalProps) {
  // The parent mounts this modal only while it is open, so the queue is read once per opening.
  const [items, setItems] = useState<QueueItem[]>(() => toItems(queue, playerNameMap));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleOrderChange = (id: string, value: string) => {
    const newOrder = parseInt(value, 10);
    setItems(prev => prev.map(item => item.id === id ? { ...item, order: isNaN(newOrder) ? '' : newOrder } : item));
  };

  const handleSave = async () => {
    setBusy(true);
    setError('');
    
    // Validation
    const orders = items.map(i => Number(i.order));
    if (orders.some(isNaN)) {
      setError('All players must have a valid number.');
      setBusy(false);
      return;
    }

    try {
      // Execute all updates in parallel
      const promises = items.map(item => 
        supabase
          .from('auction_players')
          .update({ auction_order: Number(item.order) })
          .eq('id', item.id)
      );
      
      const results = await Promise.all(promises);
      const failed = results.find(r => r.error);
      
      if (failed?.error) {
        throw new Error(failed.error.message);
      }
      
      onSaved();
      onClose();
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Failed to update numbers. Check for duplicates!');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/60"
            onClick={busy ? undefined : onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed left-1/2 top-1/2 z-[70] max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden flex flex-col rounded-3xl border border-glass-border bg-surface-raised shadow-card"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/15 text-warning border border-warning/30">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-text-primary">Configure Auction Order</h2>
                  <p className="text-xs text-text-secondary">Manually set the exact sequence of players</p>
                </div>
              </div>
              <button onClick={onClose} disabled={busy} className="rounded-lg p-2 text-text-secondary hover:bg-surface-muted hover:text-text-primary">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-surface-muted">
              {error && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="rounded-2xl border border-border bg-surface overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface border-b border-border text-xs font-bold uppercase tracking-wider text-text-secondary">
                    <tr>
                      <th className="px-4 py-3">Player Name</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3 w-32 text-right">Auction #</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((item, index) => (
                      <tr key={item.id} className="hover:bg-surface-muted transition-colors">
                        <td className="px-4 py-2 font-bold text-text-primary truncate max-w-[200px]">{item.name}</td>
                        <td className="px-4 py-2 text-text-secondary">{item.category || '-'}</td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            min="1"
                            value={item.order}
                            onChange={(e) => handleOrderChange(item.id, e.target.value)}
                            className="w-20 rounded-lg border border-border-strong bg-black px-3 py-1.5 text-right font-mono font-bold text-warning focus:border-warning focus:outline-none focus:ring-1 focus:ring-warning"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border p-5 bg-surface-raised">
              <button onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-bold text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={busy} className="flex items-center gap-2 rounded-xl bg-success px-6 py-2.5 text-sm font-bold text-text-inverse shadow-card disabled:opacity-50 transition-all">
                <Save className="h-4 w-4" />
                {busy ? 'Saving...' : 'Save Order'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
