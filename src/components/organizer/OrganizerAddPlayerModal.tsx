'use client';

import { useState, useEffect, useMemo } from 'react';
import { XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { quickAddPlayerToAuctionAction, getEligiblePlayersAction, type EligiblePlayerResult } from '@/app/actions/auction';
import type { AuctionCategory } from '@/lib/organizer/organizer-auction';
import { formatVolleyballPosition } from '@/lib/volleyball-positions';

export function OrganizerAddPlayerModal({
  tournamentId,
  auctionId,
  categories,
  onClose,
  onSuccess,
}: {
  tournamentId: string;
  auctionId: string;
  categories: AuctionCategory[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<'NEW' | 'EXISTING'>('EXISTING');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  
  // New player fields
  const [displayName, setDisplayName] = useState('');
  const [primaryPosition, setPrimaryPosition] = useState('OUTSIDE_HITTER');
  const [secondaryPosition, setSecondaryPosition] = useState('');
  const [phone, setPhone] = useState('');

  // Existing player fields
  const [eligiblePlayers, setEligiblePlayers] = useState<EligiblePlayerResult[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [existingPlayerId, setExistingPlayerId] = useState('');

  useEffect(() => {
    async function load() {
      const res = await getEligiblePlayersAction(tournamentId);
      if (res.ok && res.data) {
        setEligiblePlayers(res.data);
      }
      setLoadingPlayers(false);
    }
    load();
  }, [tournamentId]);

  const filteredPlayers = useMemo(() => {
    if (!searchQuery.trim()) return eligiblePlayers;
    const q = searchQuery.toLowerCase();
    return eligiblePlayers.filter(p => 
      p.display_name.toLowerCase().includes(q) || 
      formatVolleyballPosition(p.primary_position).toLowerCase().includes(q)
    );
  }, [eligiblePlayers, searchQuery]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) {
      setError('Please select an auction category.');
      return;
    }
    if (mode === 'NEW' && !displayName.trim()) {
      setError('Display name is required for new players.');
      return;
    }
    if (mode === 'EXISTING' && !existingPlayerId) {
      setError('Please select a player.');
      return;
    }

    setBusy(true);
    setError('');

    const res = await quickAddPlayerToAuctionAction(
      auctionId,
      categoryId,
      mode === 'EXISTING' ? existingPlayerId : undefined,
      mode === 'NEW' ? displayName.trim() : undefined,
      mode === 'NEW' ? primaryPosition : undefined,
      mode === 'NEW' ? secondaryPosition : undefined,
      mode === 'NEW' ? phone.trim() : undefined
    );

    if (res.error) {
      setError(res.error);
      setBusy(false);
      return;
    }

    onSuccess();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="relative w-full max-w-lg rounded-2xl bg-surface border border-border shadow-card flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-5 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-text-primary">Add Player to Queue</h2>
            <p className="text-sm text-text-secondary mt-1">Player will be added to the end of the WAITING queue.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-text-secondary hover:bg-surface-muted hover:text-text-primary transition">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Mode Switcher */}
            <div className="flex rounded-lg bg-surface p-1">
              <button
                type="button"
                onClick={() => setMode('EXISTING')}
                className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${mode === 'EXISTING' ? 'bg-primary text-primary-foreground shadow' : 'text-text-secondary hover:text-primary-foreground'}`}
              >
                Existing Player
              </button>
              <button
                type="button"
                onClick={() => setMode('NEW')}
                className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${mode === 'NEW' ? 'bg-primary text-primary-foreground shadow' : 'text-text-secondary hover:text-primary-foreground'}`}
              >
                Quick Add New
              </button>
            </div>

            {error && (
              <div className="rounded-xl bg-danger/15 p-4 text-sm font-semibold text-danger border border-danger/30">
                {error}
              </div>
            )}

            {mode === 'NEW' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">Display Name *</label>
                  <input required type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full rounded-xl border border-border bg-surface p-3 text-text-primary focus:border-primary/30 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">Primary Position *</label>
                  <select required value={primaryPosition} onChange={e => setPrimaryPosition(e.target.value)} className="w-full rounded-xl border border-border bg-surface p-3 text-text-primary focus:border-primary/30 focus:outline-none appearance-none">
                    <option value="SETTER">Setter</option>
                    <option value="LIBERO">Libero</option>
                    <option value="MIDDLE_BLOCKER">Middle Blocker</option>
                    <option value="OUTSIDE_HITTER">Outside Hitter</option>
                    <option value="OPPOSITE">Opposite</option>
                    <option value="UNIVERSAL">Universal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">Secondary Position</label>
                  <select value={secondaryPosition} onChange={e => setSecondaryPosition(e.target.value)} className="w-full rounded-xl border border-border bg-surface p-3 text-text-primary focus:border-primary/30 focus:outline-none appearance-none">
                    <option value="">None</option>
                    <option value="SETTER">Setter</option>
                    <option value="LIBERO">Libero</option>
                    <option value="MIDDLE_BLOCKER">Middle Blocker</option>
                    <option value="OUTSIDE_HITTER">Outside Hitter</option>
                    <option value="OPPOSITE">Opposite</option>
                    <option value="UNIVERSAL">Universal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">Phone (Optional)</label>
                  <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-xl border border-border bg-surface p-3 text-text-primary focus:border-primary/30 focus:outline-none" />
                </div>
              </div>
            ) : (
              <div className="space-y-3 flex flex-col h-[300px]">
                <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">Select Player *</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-text-muted">
                    <MagnifyingGlassIcon className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name or position..."
                    className="w-full rounded-xl border border-border bg-surface py-2 pl-10 pr-4 text-sm text-text-primary focus:border-primary focus:outline-none"
                  />
                </div>
                
                <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-surface divide-y divide-border">
                  {loadingPlayers ? (
                    <div className="p-4 text-center text-sm text-text-secondary">Loading eligible players...</div>
                  ) : filteredPlayers.length === 0 ? (
                    <div className="p-4 text-center text-sm text-text-secondary">No eligible players found.</div>
                  ) : (
                    filteredPlayers.map((p) => (
                      <label
                        key={p.id}
                        className={`flex cursor-pointer items-center gap-3 p-3 transition hover:bg-surface-muted ${existingPlayerId === p.id ? 'bg-primary/10' : ''}`}
                      >
                        <input
                          type="radio"
                          name="existing_player"
                          value={p.id}
                          checked={existingPlayerId === p.id}
                          onChange={() => setExistingPlayerId(p.id)}
                          className="h-4 w-4 border-border-strong bg-transparent text-primary focus:ring-primary focus:ring-offset-0"
                        />
                        {p.photo_path ? (
                          <img src={`${process.env.NEXT_PUBLIC_API_URL}/storage/object/public/avatars/${p.photo_path}`} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover bg-surface-muted" />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-bold text-text-secondary">
                            {p.display_name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-text-primary truncate">{p.display_name}</div>
                          <div className="text-xs text-text-secondary flex gap-2">
                            <span>{formatVolleyballPosition(p.primary_position)}</span>
                            {p.registration_status !== 'APPROVED' && (
                              <span className="text-danger font-medium">({p.registration_status})</span>
                            )}
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">Auction Category *</label>
              <select required value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full rounded-xl border border-border bg-surface p-3 text-text-primary focus:border-primary/30 focus:outline-none appearance-none">
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.display_name} — ₹{Number(c.base_price).toLocaleString('en-IN')}</option>
                ))}
              </select>
            </div>

          </div>

          <div className="p-5 border-t border-border shrink-0 bg-surface">
            <button
              type="submit"
              disabled={busy || (mode === 'EXISTING' && !existingPlayerId)}
              className="w-full rounded-xl bg-primary py-3.5 text-sm font-black text-primary-foreground transition hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? 'Processing…' : 'Add to Auction Queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
