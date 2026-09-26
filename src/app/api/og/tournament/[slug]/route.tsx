import { ImageResponse } from 'next/og';
import { getPublicTournamentMetadata } from '@/lib/public-tournament-metadata';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const context = url.searchParams.get('context') || 'tournament';

  const tournament = await getPublicTournamentMetadata(slug);
  const name = tournament?.name || 'Tourny Volleyball';

  // Resolve context-specific label
  let badgeLabel = 'VOLLEYBALL';
  switch (context) {
    case 'player':
      badgeLabel = 'PLAYER REGISTRATION';
      break;
    case 'team':
    case 'owner':
      badgeLabel = 'TEAM REGISTRATION';
      break;
    case 'fixtures':
      badgeLabel = 'FIXTURES & SCHEDULE';
      break;
    case 'results':
      badgeLabel = 'MATCH RESULTS';
      break;
    case 'standings':
    case 'table':
      badgeLabel = 'STANDINGS';
      break;
    case 'live':
      badgeLabel = 'LIVE SCOREBOARD';
      break;
    case 'match':
      badgeLabel = 'LIVE MATCH';
      break;
    default:
      badgeLabel = tournament?.status === 'REGISTRATION'
        ? 'REGISTRATION OPEN'
        : tournament?.status === 'LIVE'
          ? 'LIVE NOW'
          : tournament?.status === 'COMPLETED'
            ? 'COMPLETED'
            : 'VOLLEYBALL TOURNAMENT';
      break;
  }

  const primaryColor = tournament?.primaryColor || '#6366f1'; // indigo-500
  const secondaryColor = tournament?.secondaryColor || '#818cf8'; // indigo-400

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('') || 'TV';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          padding: '64px 72px',
          color: '#f8fafc',
          background: 'linear-gradient(135deg, #09090e 0%, #110e24 55%, #1f1b3e 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Ambient brand glow */}
        <div
          style={{
            position: 'absolute',
            width: 500,
            height: 500,
            borderRadius: 999,
            right: -100,
            top: -120,
            background: primaryColor,
            opacity: 0.18,
            filter: 'blur(80px)',
          }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Header row: Tourny mark + Badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  display: 'flex',
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: primaryColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: 22,
                }}
              >
                🏐
              </div>
              <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5, color: '#f8fafc' }}>
                Tourny
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 22px',
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 2,
                color: '#ffffff',
                background: 'rgba(255, 255, 255, 0.10)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
              }}
            >
              {badgeLabel}
            </div>
          </div>

          {/* Center row: Logo or Monogram + Tournament Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 36, margin: '24px 0' }}>
            {tournament?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tournament.logoUrl}
                alt=""
                width="170"
                height="170"
                style={{
                  objectFit: 'contain',
                  borderRadius: 28,
                  padding: 16,
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '2px solid rgba(255, 255, 255, 0.12)',
                }}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  width: 170,
                  height: 170,
                  borderRadius: 28,
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 64,
                  fontWeight: 900,
                  color: secondaryColor,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '2px solid rgba(255, 255, 255, 0.12)',
                }}
              >
                {initials}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 840 }}>
              <div
                style={{
                  color: secondaryColor,
                  fontSize: 18,
                  fontWeight: 800,
                  letterSpacing: 4,
                  marginBottom: 10,
                  textTransform: 'uppercase',
                }}
              >
                Volleyball Tournament
              </div>
              <div
                style={{
                  fontSize: name.length > 36 ? 44 : 54,
                  lineHeight: 1.08,
                  fontWeight: 900,
                  letterSpacing: -1.5,
                  color: '#ffffff',
                }}
              >
                {name}
              </div>
            </div>
          </div>

          {/* Footer row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              paddingTop: 20,
            }}
          >
            <div style={{ fontSize: 18, color: 'rgba(255, 255, 255, 0.55)', fontWeight: 500 }}>
              tournyappfyniti.vercel.app/t/{slug}
            </div>
            <div style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.4)', fontWeight: 600 }}>
              Powered by Tourny Platform
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200, height: 630,
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      },
    }
  );
}
