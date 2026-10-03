import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = await createClient();

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, status, format, league_mode')
    .limit(20);

  const { data: auctions } = await supabase
    .from('auctions')
    .select('id, tournament_id, status')
    .limit(20);

  return NextResponse.json({
    tournaments,
    auctions,
  });
}
