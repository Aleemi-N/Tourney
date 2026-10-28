'use client';

/** Opens the browser's print dialog (choose "Save as PDF" to keep a file). */
export function PrintButton({ label = 'Print or save as PDF' }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover print:hidden">{label}</button>;
}
