'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Settings, Save, AlertTriangle } from 'lucide-react';

interface ConfigureQueueModalProps {
  open: boolean;
  onClose: () => void;
  queue: any[];
  playerNameMap: Record<string, string>;
  supabase: any;
  onSaved: () => void;
}

export function ConfigureQueueModal({
  open,
  onClose,
  queue,
  playerNameMap,
  supabase,
  onSaved,
}: ConfigureQueueModalProps) {
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      const sorted = [...queue].sort((a, b) => a.auction_order - b.auction_order);
      setItems(sorted.map(p => ({
        id: p.auction_player_id,
        order: p.auction_order,
        name: playerNameMap[p.player_id] || 'Unknown',
        basePrice: p.base_price,
        category: p.category_code
      })));
    }
  }, [open, queue, playerNameMap]);

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
      
      if (failed) {
        throw new Error(failed.error.message);
      }
      
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update numbers. Check for duplicates!');
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
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={busy ? undefined : onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed left-1/2 top-1/2 z-[70] max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden flex flex-col rounded-3xl border border-glass-border bg-surface-raised shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Configure Auction Order</h2>
                  <p className="text-xs text-white/50">Manually set the exact sequence of players</p>
                </div>
              </div>
              <button onClick={onClose} disabled={busy} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-black/20">
              {error && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/5 border-b border-white/10 text-xs font-bold uppercase tracking-wider text-white/50">
                    <tr>
                      <th className="px-4 py-3">Player Name</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3 w-32 text-right">Auction #</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {items.map((item, index) => (
                      <tr key={item.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-2 font-bold text-white truncate max-w-[200px]">{item.name}</td>
                        <td className="px-4 py-2 text-white/70">{item.category || '-'}</td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            min="1"
                            value={item.order}
                            onChange={(e) => handleOrderChange(item.id, e.target.value)}
                            className="w-20 rounded-lg border border-white/20 bg-black px-3 py-1.5 text-right font-mono font-bold text-[#e5a93c] focus:border-[#e5a93c] focus:outline-none focus:ring-1 focus:ring-[#e5a93c]"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/10 p-5 bg-surface-raised">
              <button onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white/70 hover:bg-white/10 hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={busy} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg hover:shadow-emerald-500/25 disabled:opacity-50 transition-all">
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
