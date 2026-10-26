import { OwnerPage } from '@/components/owner';
import { OwnerMatches } from '@/components/owner-matches';

export default function OwnerFixtures() {
  return <OwnerPage tab="fixtures" title="Fixtures">{(team) => <OwnerMatches team={team} results={false} />}</OwnerPage>;
}
