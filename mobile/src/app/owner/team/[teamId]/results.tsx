import { OwnerPage } from '@/components/owner';
import { OwnerMatches } from '@/components/owner-matches';

export default function OwnerResults() {
  return <OwnerPage tab="results" title="Match results">{(team) => <OwnerMatches team={team} results />}</OwnerPage>;
}
