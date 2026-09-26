'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ClipboardDocumentIcon,
  CheckIcon,
  UserIcon,
  ShieldCheckIcon,
  ArrowTopRightOnSquareIcon,
  ShareIcon
} from '@heroicons/react/24/outline';
import { getCanonicalOrigin } from '@/lib/origin';

interface RegistrationLinksProps {
  slug: string;
  tournamentName?: string;
  isLeague: boolean;
  status: string;
}

export function RegistrationLinks({ slug, tournamentName, isLeague, status }: RegistrationLinksProps) {
  const [copiedPlayer, setCopiedPlayer] = useState(false);
  const [copiedTeam, setCopiedTeam] = useState(false);

  const origin = getCanonicalOrigin();
  const playerUrl = `${origin}/t/${slug}/register/player`;
  const teamUrl = `${origin}/t/${slug}/register/team`;

  const handleCopy = async (url: string, type: 'player' | 'team') => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
      if (type === 'player') {
        setCopiedPlayer(true);
        setTimeout(() => setCopiedPlayer(false), 2000);
      } else {
        setCopiedTeam(true);
        setTimeout(() => setCopiedTeam(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleShare = async (url: string, type: 'player' | 'team') => {
    const title = type === 'player'
      ? `${tournamentName || 'Tournament'} | Player Registration`
      : `${tournamentName || 'Tournament'} | Team Registration`;
    const text = type === 'player'
      ? `Register as a player for ${tournamentName || 'the tournament'} on Tourny:`
      : `Register or apply as a team for ${tournamentName || 'the tournament'} on Tourny:`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        // If user cancelled, do not fallback to copy
        if ((err as Error)?.name === 'AbortError') return;
      }
    }

    // Fallback to clipboard copy
    await handleCopy(url, type);
  };

  const isRegistrationOpen = status === 'REGISTRATION';

  return (
    <div className="mt-8">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-semibold text-text-primary">Registration Links</h2>
        {!isRegistrationOpen && (
          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded">
            Currently Closed
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Player Registration Card */}
        <div className="bg-surface border border-border rounded-xl p-5 flex flex-col">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <UserIcon className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-text-primary">Player Registration</h3>
          </div>
          <p className="text-sm text-text-secondary mb-6 flex-1">
            Share this link with players to register for this tournament.
          </p>
          <div className="flex items-center gap-2 mt-auto">
            <Link
              href={`/t/${slug}/register/player`}
              target="_blank"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Open <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={() => handleShare(playerUrl, 'player')}
              className="flex items-center justify-center gap-1.5 py-2 px-3 bg-surface-muted text-text-primary border border-border text-sm font-medium rounded-lg hover:bg-surface-hover transition-colors"
              title="Share Player Registration Link"
            >
              <ShareIcon className="w-4 h-4 text-primary" />
              <span>Share</span>
            </button>
            <button
              type="button"
              onClick={() => handleCopy(playerUrl, 'player')}
              className="flex items-center justify-center gap-1.5 py-2 px-3 bg-surface-muted text-text-primary border border-border text-sm font-medium rounded-lg hover:bg-surface-hover transition-colors"
              title="Copy Player Registration Link"
            >
              {copiedPlayer ? <CheckIcon className="w-4 h-4 text-emerald-500" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
              <span>{copiedPlayer ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Team Registration Card (Conditional) */}
        {isLeague && (
          <div className="bg-surface border border-border rounded-xl p-5 flex flex-col">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
                <ShieldCheckIcon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-text-primary">Team Registration</h3>
            </div>
            <p className="text-sm text-text-secondary mb-6 flex-1">
              Share this link with team owners to apply or register for this tournament.
            </p>
            <div className="flex items-center gap-2 mt-auto">
              <Link
                href={`/t/${slug}/register/team`}
                target="_blank"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Open <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={() => handleShare(teamUrl, 'team')}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-surface-muted text-text-primary border border-border text-sm font-medium rounded-lg hover:bg-surface-hover transition-colors"
                title="Share Team Registration Link"
              >
                <ShareIcon className="w-4 h-4 text-indigo-400" />
                <span>Share</span>
              </button>
              <button
                type="button"
                onClick={() => handleCopy(teamUrl, 'team')}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-surface-muted text-text-primary border border-border text-sm font-medium rounded-lg hover:bg-surface-hover transition-colors"
                title="Copy Team Registration Link"
              >
                {copiedTeam ? <CheckIcon className="w-4 h-4 text-emerald-500" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                <span>{copiedTeam ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
