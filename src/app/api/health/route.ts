import { NextResponse } from 'next/server';
import { createClient } from '@/lib/api/server';

// Opt out of caching, this must be dynamic
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const api = await createClient();
    
    // Lightweight check: Can we read from the database?
    // We use a safe query against a known public table, limiting to 1 row.
    const { error } = await api
      .from('tournaments')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Health Check - Database Error:', error.message);
      return NextResponse.json(
        { status: 'error', message: 'Database connection failed' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { 
        status: 'healthy',
        timestamp: new Date().toISOString()
      },
      { status: 200 }
    );
    
  } catch (err) {
    console.error('Health Check - Unexpected Error:', err);
    return NextResponse.json(
      { status: 'error', message: 'Service unavailable' },
      { status: 503 }
    );
  }
}
