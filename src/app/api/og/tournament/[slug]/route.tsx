import { ImageResponse } from 'next/og';
import { getPublicTournamentMetadata } from '@/lib/public-tournament-metadata';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tournament = await getPublicTournamentMetadata(slug);
  const name = tournament?.name || 'Tourny Volleyball';
  const registrationLabel = tournament?.status === 'REGISTRATION'
    ? 'REGISTRATION OPEN'
    : tournament?.status === 'LIVE'
      ? 'LIVE NOW'
      : 'TOURNAMENT';

  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', overflow: 'hidden', padding: '68px 76px', color: '#f8fafc', background: 'linear-gradient(135deg, #09090e 0%, #15152a 58%, #312e81 100%)', fontFamily: 'sans-serif' }}>
      <div style={{ position: 'absolute', width: 430, height: 430, borderRadius: 999, right: -80, top: -120, background: 'rgba(99,102,241,0.22)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 30, fontWeight: 800 }}>
          <div style={{ display: 'flex', width: 46, height: 46, borderRadius: 999, border: '4px solid #818cf8', alignItems: 'center', justifyContent: 'center', color: '#a5b4fc' }}>×</div>
          Tourny
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 42 }}>
          {tournament?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tournament.logoUrl} alt="" width="190" height="190" style={{ objectFit: 'contain', borderRadius: 32, padding: 18, background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.13)' }} />
          ) : (
            <div style={{ display: 'flex', width: 190, height: 190, borderRadius: 999, alignItems: 'center', justifyContent: 'center', fontSize: 100, color: '#a5b4fc', background: 'rgba(99,102,241,0.18)', border: '3px solid rgba(165,180,252,0.45)' }}>×</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 760 }}>
            <div style={{ color: '#a5b4fc', fontSize: 23, fontWeight: 800, letterSpacing: 6, marginBottom: 16 }}>VOLLEYBALL</div>
            <div style={{ fontSize: name.length > 38 ? 48 : 60, lineHeight: 1.04, fontWeight: 900, letterSpacing: -2 }}>{name}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 21, color: '#cbd5e1' }}>Tournament powered by Tourny</div>
          <div style={{ padding: '13px 23px', borderRadius: 999, fontSize: 19, fontWeight: 800, letterSpacing: 2, color: '#eef2ff', background: 'rgba(99,102,241,0.45)', border: '1px solid rgba(165,180,252,0.5)' }}>{registrationLabel}</div>
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
