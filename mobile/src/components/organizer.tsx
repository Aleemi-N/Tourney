import { useEffect, useState, type ReactNode } from 'react';
import { TabFrame } from '@/components/tab-frame';
import { api } from '@/lib/api';

const TABS = [
  { key: 'index', label: 'Overview', path: '/organizer/[id]' },
  { key: 'participants', label: 'Players', path: '/organizer/[id]/participants' },
  { key: 'teams', label: 'Teams', path: '/organizer/[id]/teams' },
  { key: 'fixtures', label: 'Fixtures', path: '/organizer/[id]/fixtures' },
  { key: 'lot', label: 'Lot Draw', path: '/organizer/[id]/lot', auctionOnly: true },
  { key: 'auction', label: 'Auction', path: '/organizer/[id]/auction', auctionOnly: true },
  { key: 'awards', label: 'Awards', path: '/organizer/[id]/awards' },
  { key: 'standings', label: 'Standings', path: '/organizer/[id]/standings' },
  { key: 'staff', label: 'Staff', path: '/organizer/[id]/staff' },
  { key: 'settings', label: 'Settings', path: '/organizer/[id]/settings' },
] as readonly { key: string; label: string; path: string; auctionOnly?: boolean }[];

export type OrganizerTab = 'index' | 'participants' | 'teams' | 'fixtures' | 'lot' | 'auction' | 'awards' | 'standings' | 'staff' | 'settings';

/** The tournament name for the page header. */
export function useTournamentName(id: string) {
  const [name, setName] = useState('');
  useEffect(() => {
    api.from('tournaments').select('name').eq('id', id).maybeSingle().then(({ data }) => setName((data?.name as string | undefined) ?? ''));
  }, [id]);
  return name;
}

/** Shared frame of the organizer screens: back link, title, and the page tabs. */
/** True for an auction league, which has the lot draw and auction pages. */
function useIsAuction(id: string) {
  const [auction, setAuction] = useState(false);
  useEffect(() => {
    api.from('tournaments').select('format,league_mode').eq('id', id).maybeSingle().then(({ data }) => setAuction(data?.format === 'LEAGUE' && data?.league_mode === 'AUCTION'));
  }, [id]);
  return auction;
}

export function OrganizerFrame({ id, current, title, subtitle, children }: { id: string; current: OrganizerTab; title: string; subtitle?: string; children: ReactNode }) {
  const isAuction = useIsAuction(id);
  return (
    <TabFrame role="Organizer" backLabel="Back to Dashboard" backHref="/organizer" title={title} subtitle={subtitle} current={current}
      tabs={TABS.filter((tab) => !tab.auctionOnly || isAuction).map((tab) => ({ key: tab.key, label: tab.label, href: { pathname: tab.path as '/organizer/[id]', params: { id } } }))}>
      {children}
    </TabFrame>
  );
}
