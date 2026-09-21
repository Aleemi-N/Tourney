'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from 'react';
import { PlayerReviewCard } from '@/components/player/PlayerReviewCard';
import { approvePlayerAction, rejectPlayerAction, approveTeamOwnerAction, rejectTeamOwnerAction, reopenPlayerRegistrationAction, revokePlayerApprovalAction } from '@/app/actions/participants';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function ParticipantManager({ 
  tournament, 
  players, 
  teamOwners 
}: { 
  tournament: any, 
  players: any[], 
  teamOwners: any[] 
}) {
  const [tab, setTab] = useState<'PLAYERS' | 'TEAM_OWNERS'>('PLAYERS');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const isAuctionLeague = tournament.format === 'LEAGUE' && tournament.league_mode === 'AUCTION';
  
  // Supabase client for storage URL generation
  const supabase = createClient();
  
  // Local loading states
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [correction, setCorrection] = useState<{ id: string; name: string; action: 'revoke' | 'reopen'; reason: string } | null>(null);
  
  // Classification state for players
  const [classifications, setClassifications] = useState<Record<string, string>>({});

  const router = useRouter();

  const filteredPlayers = players.filter(p => statusFilter === 'ALL' || p.status === statusFilter);
  const filteredOwners = teamOwners.filter(o => statusFilter === 'ALL' || o.status === statusFilter);

  const getPlayerCount = (status: string) => status === 'ALL' ? players.length : players.filter(p => p.status === status).length;
  const getOwnerCount = (status: string) => status === 'ALL' ? teamOwners.length : teamOwners.filter(o => o.status === status).length;
  const getCount = (status: string) => tab === 'PLAYERS' ? getPlayerCount(status) : getOwnerCount(status);

  const handleApprovePlayer = async (regId: string) => {
    setMessage(null);
    setLoadingId(regId);
    try {
      const cls = classifications[regId];
      if (isAuctionLeague && !cls) {
        setMessage({ type: 'error', text: 'Please select an auction classification.' });
        return;
      }
      const res = await approvePlayerAction(regId, isAuctionLeague ? cls : null);
      if (res.error) {
        setMessage({ type: 'error', text: res.error });
        router.refresh();
      }
      else {
        setMessage({ type: 'success', text: 'Player application approved.' });
        router.refresh();
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleRejectPlayer = async (regId: string) => {
    setMessage(null);
    setLoadingId(regId);
    try {
      const res = await rejectPlayerAction(regId);
      if (res.error) {
        setMessage({ type: 'error', text: res.error });
        router.refresh();
      } else {
        setMessage({ type: 'success', text: 'Player application rejected.' });
        router.refresh();
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleApproveOwner = async (appId: string) => {
    setMessage(null);
    setLoadingId(appId);
    try {
      const res = await approveTeamOwnerAction(appId);
      if (res.error) {
        setMessage({ type: 'error', text: res.error });
        router.refresh();
      } else {
        setMessage({ type: 'success', text: 'Team owner application approved.' });
        router.refresh();
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleRejectOwner = async (appId: string) => {
    setMessage(null);
    setLoadingId(appId);
    try {
      const res = await rejectTeamOwnerAction(appId);
      if (res.error) {
        setMessage({ type: 'error', text: res.error });
        router.refresh();
      } else {
        setMessage({ type: 'success', text: 'Team owner application rejected.' });
        router.refresh();
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleCorrection = async () => {
    if (!correction) return;
    setMessage(null);
    setLoadingId(correction.id);
    try {
      const result = correction.action === 'revoke'
        ? await revokePlayerApprovalAction(correction.id, correction.reason)
        : await reopenPlayerRegistrationAction(correction.id, correction.reason);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({
          type: 'success',
          text: correction.action === 'revoke'
            ? 'Player approval revoked. The registration is pending review.'
            : 'Player application reopened. The registration is pending review.',
        });
      }
      setCorrection(null);
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {message && (
        <div
          role="status"
          className={`rounded-xl border p-3 text-sm ${message.type === 'error' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'}`}
        >
          {message.text}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg w-fit">
          <button
            onClick={() => setTab('PLAYERS')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === 'PLAYERS' 
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Players ({players.length})
          </button>
          <button
            onClick={() => setTab('TEAM_OWNERS')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === 'TEAM_OWNERS' 
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Team Owners ({teamOwners.length})
          </button>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <label htmlFor="statusFilter" className="text-sm font-medium text-slate-600 dark:text-slate-400">Filter:</label>
          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">All Statuses ({getCount('ALL')})</option>
            <option value="PENDING">Pending ({getCount('PENDING')})</option>
            <option value="APPROVED">Approved ({getCount('APPROVED')})</option>
            <option value="REJECTED">Rejected ({getCount('REJECTED')})</option>
          </select>
        </div>
      </div>

      <div className="mt-4">
        {tab === 'PLAYERS' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {filteredPlayers.length === 0 ? (
              <p className="text-slate-500 text-sm col-span-full">
                {statusFilter === 'ALL' ? 'No players found.' : `No ${statusFilter.toLowerCase()} players.`}
              </p>
            ) : (
              filteredPlayers.map(p => {
                const profile = p.player_profiles;
                const isSubmitting = loadingId === p.id;
                
                return (
                  <PlayerReviewCard
                    key={p.id}
                    player={{
                      id: profile.id,
                      display_name: profile.display_name,
                      primary_position: profile.primary_position,
                      secondary_position: profile.secondary_position,
                      // Use Supabase client getPublicUrl for correct, consistent URL generation
                      photo_path: profile.photo_path
                        ? supabase.storage.from('avatars').getPublicUrl(profile.photo_path).data.publicUrl
                        : undefined,
                      place: profile.place,
                      height_cm: profile.height_cm
                    }}
                    status={p.status}
                    classification={classifications[p.id] || p.auction_category || undefined}
                    onClassify={isAuctionLeague ? (val) => setClassifications(prev => ({ ...prev, [p.id]: val })) : undefined}
                    onApprove={['PENDING', 'CHANGES_REQUESTED'].includes(p.status) ? () => handleApprovePlayer(p.id) : undefined}
                    onReject={['PENDING', 'CHANGES_REQUESTED'].includes(p.status) ? () => handleRejectPlayer(p.id) : undefined}
                    onRevokeApproval={p.status === 'APPROVED' ? () => setCorrection({ id: p.id, name: profile.display_name, action: 'revoke', reason: '' }) : undefined}
                    onReopenApplication={p.status === 'REJECTED' ? () => setCorrection({ id: p.id, name: profile.display_name, action: 'reopen', reason: '' }) : undefined}
                    isSubmitting={isSubmitting}
                  />
                );
              })
            )}
          </div>
        )}

        {tab === 'TEAM_OWNERS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredOwners.length === 0 ? (
              <p className="text-slate-500 text-sm col-span-full">
                {statusFilter === 'ALL' ? 'No team owner applications found.' : `No ${statusFilter.toLowerCase()} team owner applications.`}
              </p>
            ) : (
              filteredOwners.map(o => (
                <div key={o.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
                  <div className="h-32 bg-slate-100 dark:bg-slate-800 relative flex items-center justify-center border-b border-slate-200 dark:border-slate-800">
                    {o.logo_path ? (
                      <Image
                        src={supabase.storage.from('logos').getPublicUrl(o.logo_path).data.publicUrl}
                        alt="Team Logo"
                        fill
                        className="object-contain p-2"
                        unoptimized
                      />
                    ) : (
                      <div className="text-slate-400 dark:text-slate-600 font-bold text-2xl">{o.team_short_name || 'TEAM'}</div>
                    )}
                  </div>
                  <div className="p-4 flex flex-col gap-3 flex-1">
                    <div>
                      <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 truncate">{o.proposed_team_name}</h3>
                      <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex flex-col gap-0.5">
                        {o.profiles?.full_name && <span>Applicant: {o.profiles.full_name}</span>}
                        {o.place && <span>Place: {o.place}</span>}
                      </div>
                    </div>
                    
                    {['PENDING', 'CHANGES_REQUESTED'].includes(o.status) && (
                    <div className="mt-auto pt-4 flex flex-col-reverse min-[350px]:flex-row gap-2 w-full">
                        <button
                          type="button"
                          onClick={() => handleRejectOwner(o.id)}
                          disabled={loadingId === o.id}
                          className="h-10 flex-1 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-4 text-sm font-medium text-red-600 dark:text-red-400 shadow-sm hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                          {loadingId === o.id && <Loader2 className="h-4 w-4 animate-spin" />}
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveOwner(o.id)}
                          disabled={loadingId === o.id}
                          className="h-10 flex-1 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                          {loadingId === o.id && <Loader2 className="h-4 w-4 animate-spin" />}
                          Approve
                        </button>
                    </div>
                    )}
                    
                    {o.status === 'APPROVED' && (
                      <div className="mt-auto pt-2">
                        <span className="block w-full text-center px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase">
                          Approved
                        </span>
                      </div>
                    )}
                    {o.status === 'REJECTED' && (
                      <div className="mt-auto pt-2">
                        <span className="block w-full text-center px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-bold uppercase">
                          Rejected
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {correction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="correction-title"
            aria-describedby="correction-description"
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6"
          >
            <h2 id="correction-title" className="text-xl font-bold text-text-primary">
              {correction.action === 'revoke' ? 'Revoke approval?' : 'Reopen application?'}
            </h2>
            <p id="correction-description" className="mt-2 text-sm leading-6 text-text-secondary">
              {correction.action === 'revoke'
                ? `${correction.name}'s registration will return to Pending for review. Their profile and registration information will be preserved.`
                : `${correction.name}'s registration will return to Pending for review.`}
            </p>
            <label className="mt-5 block text-sm font-medium text-text-primary">
              Reason <span className="font-normal text-text-muted">(optional)</span>
              <textarea
                value={correction.reason}
                maxLength={1000}
                rows={3}
                onChange={(event) => setCorrection({ ...correction, reason: event.target.value })}
                placeholder="Add an internal audit note"
                className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={loadingId === correction.id} onClick={() => setCorrection(null)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-text-secondary hover:bg-surface-muted disabled:opacity-50">
                Cancel
              </button>
              <button type="button" disabled={loadingId === correction.id} onClick={handleCorrection} className={`min-h-11 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50 ${correction.action === 'revoke' ? 'bg-danger hover:bg-danger/90' : 'bg-primary hover:bg-primary-hover'}`}>
                {loadingId === correction.id ? 'Updating…' : correction.action === 'revoke' ? 'Revoke Approval' : 'Reopen Application'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
