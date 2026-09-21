'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  ClipboardDocumentIcon, 
  CheckIcon,
  UserIcon,
  ShieldCheckIcon,
  ArrowTopRightOnSquareIcon
} from '@heroicons/react/24/outline';

interface RegistrationLinksProps {
  slug: string;
  isLeague: boolean;
  status: string;
}

export function RegistrationLinks({ slug, isLeague, status }: RegistrationLinksProps) {
  const [copiedPlayer, setCopiedPlayer] = useState(false);
  const [copiedTeam, setCopiedTeam] = useState(false);

  const playerUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/t/${slug}/register/player`;
  const teamUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/t/${slug}/register/team`;

  const handleCopy = async (url: string, type: 'player' | 'team') => {
    try {
      await navigator.clipboard.writeText(url);
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
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Open <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            </Link>
            <button
              onClick={() => handleCopy(playerUrl, 'player')}
              className="flex items-center justify-center gap-2 py-2 px-4 bg-surface-muted text-text-primary border border-border text-sm font-medium rounded-lg hover:bg-surface-hover transition-colors"
            >
              {copiedPlayer ? <CheckIcon className="w-4 h-4 text-emerald-500" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
              {copiedPlayer ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Team Owner Registration Card (Conditional) */}
        {isLeague && (
          <div className="bg-surface border border-border rounded-xl p-5 flex flex-col">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
                <ShieldCheckIcon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-text-primary">Team Owner Registration</h3>
            </div>
            <p className="text-sm text-text-secondary mb-6 flex-1">
              Share this link with team owners to apply for this tournament.
            </p>
            <div className="flex items-center gap-2 mt-auto">
              <Link 
                href={`/t/${slug}/register/team`}
                target="_blank"
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Open <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              </Link>
              <button
                onClick={() => handleCopy(teamUrl, 'team')}
                className="flex items-center justify-center gap-2 py-2 px-4 bg-surface-muted text-text-primary border border-border text-sm font-medium rounded-lg hover:bg-surface-hover transition-colors"
              >
                {copiedTeam ? <CheckIcon className="w-4 h-4 text-emerald-500" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                {copiedTeam ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
