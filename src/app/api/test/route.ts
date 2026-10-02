import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();

  const { data: categories, error: catError } = await supabase
    .from('tournament_auction_categories')
    .select('*')
    .eq('tournament_id', '90200000-0000-0000-0000-000000000001');

  const { data: members, error: memError } = await supabase
    .from('tournament_members')
    .select('*')
    .eq('tournament_id', '90200000-0000-0000-0000-000000000001');

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', '90200000-0000-0000-0000-000000000001')
    .single();

  return NextResponse.json({
    user: user ? { id: user.id, email: user.email } : null,
    userError: userErr ? userErr.message : null,
    tournament,
    categories,
    categoriesError: catError,
    members,
    membersError: memError
  });
}
