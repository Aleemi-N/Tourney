export type Certificate = {
  cert_key: string; kind: string; title: string; recipient: string; team_name: string | null; detail: string | null; awarded_on: string | null; tournament_name: string; tournament_slug: string;
};

export const KIND_LABEL: Record<string, string> = { CHAMPION: 'Champions', RUNNER_UP: 'Runners-up', AWARD: 'Awards', MVP: 'Player of the match', PARTICIPANT: 'Participation' };

const date = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');

/** One A4-landscape certificate. Prints cleanly (the page sets the paper size) and works in light and dark themes. */
export function CertificateSheet({ cert, logoUrl }: { cert: Certificate; logoUrl?: string | null }) {
  return (
    <section
      aria-label={`${cert.title} certificate for ${cert.recipient}`}
      className="certificate relative mx-auto flex aspect-[297/210] w-full max-w-4xl flex-col items-center justify-between overflow-hidden border-[10px] border-double border-[#b08d3c] bg-white p-10 text-center text-[#1b1d2a] print:max-w-none print:break-after-page print:border-[10px]"
      style={{ colorScheme: 'light' }}
    >
      <header className="flex flex-col items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a public tournament logo
          <img src={logoUrl} alt="" className="h-16 w-auto object-contain" />
        ) : null}
        <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#b08d3c]">{cert.tournament_name}</p>
      </header>
      <div className="space-y-4">
        <h1 className="font-serif text-5xl font-bold">{cert.title}</h1>
        <p className="text-sm uppercase tracking-[0.25em] text-[#5c6075]">This certificate is proudly presented to</p>
        <p className="font-serif text-6xl font-bold italic text-[#b08d3c]">{cert.recipient}</p>
        {cert.team_name ? <p className="text-lg font-semibold text-[#3b3e52]">{cert.team_name}</p> : null}
        {cert.detail ? <p className="mx-auto max-w-2xl text-lg text-[#3b3e52]">{cert.detail}</p> : null}
      </div>
      <footer className="flex w-full items-end justify-between text-sm text-[#5c6075]">
        <div className="w-56 border-t border-[#8a8ea3] pt-1">{date(cert.awarded_on) || 'Date'}</div>
        <div className="w-56 border-t border-[#8a8ea3] pt-1">Tournament organizer</div>
      </footer>
    </section>
  );
}
