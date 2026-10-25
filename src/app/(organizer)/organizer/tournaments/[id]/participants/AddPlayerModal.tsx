'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Loader2, UserPlus, CheckCircle2 } from 'lucide-react';
import { manualRegisterPlayerAction } from '@/app/actions/participants';
import { ImageUpload } from '@/components/forms/ImageUpload';
import { createClient } from '@/lib/supabase/client';

const POSITIONS = [
  { value: 'OUTSIDE_HITTER', label: 'Outside Hitter' },
  { value: 'MIDDLE_BLOCKER', label: 'Middle Blocker' },
  { value: 'OPPOSITE',       label: 'Opposite' },
  { value: 'SETTER',         label: 'Setter' },
  { value: 'LIBERO',         label: 'Libero' },
  { value: 'RIGHT_SIDE',     label: 'Right Side' },
];

const JERSEY_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

interface AddPlayerModalProps {
  tournamentId: string;
  open: boolean;
  onClose: () => void;
}

export function AddPlayerModal({ tournamentId, open, onClose }: AddPlayerModalProps) {
  const router = useRouter();
  const [organizerUserId, setOrganizerUserId] = useState<string>('');
  const [photoPath, setPhotoPath] = useState<string>('');
  const [form, setForm] = useState({
    displayName: '',
    phone: '',
    primaryPosition: '',
    secondaryPosition: '',
    jerseyName: '',
    jerseyNumber: '',
    jerseySize: '',
    heightCm: '',
    place: '',
    notes: '',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          setOrganizerUserId(data.user.id);
        }
      });
    }
  }, [open]);

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const reset = () => {
    setForm({
      displayName: '',
      phone: '',
      primaryPosition: '',
      secondaryPosition: '',
      jerseyName: '',
      jerseyNumber: '',
      jerseySize: '',
      heightCm: '',
      place: '',
      notes: '',
    });
    setPhotoPath('');
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);

    try {
      const result = await manualRegisterPlayerAction({
        tournamentId,
        displayName: form.displayName.trim(),
        phone: form.phone.trim(),
        photoPath: photoPath || undefined,
        primaryPosition: form.primaryPosition || undefined,
        secondaryPosition: form.secondaryPosition || undefined,
        jerseyName: form.jerseyName.trim() || undefined,
        jerseyNumber: form.jerseyNumber ? parseInt(form.jerseyNumber, 10) : null,
        jerseySize: form.jerseySize || undefined,
        heightCm: form.heightCm ? parseInt(form.heightCm, 10) : null,
        place: form.place.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        router.refresh();
        setTimeout(() => {
          handleClose();
        }, 1800);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="bd"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60"
            onClick={handleClose}
          />
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed inset-x-4 bottom-0 z-50 mx-auto max-w-xl rounded-t-3xl border border-glass-border bg-surface shadow-card sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
            role="dialog"
            aria-modal="true"
            aria-label="Add player manually"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
                  <UserPlus className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-text-primary">Add Player Manually</h2>
                  <span className="text-xs font-semibold text-warning uppercase tracking-wider">Added to Pending Queue</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              {success ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-3 py-8 text-center"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/15 text-warning">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <p className="text-lg font-bold text-warning">Player Registered!</p>
                  <p className="text-sm text-text-secondary">
                    The player has been added to the Pending list for classification and approval.
                  </p>
                </motion.div>
              ) : (
                <form id="add-player-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
                  <p className="text-sm text-text-secondary">
                    Register a player on their behalf. They will appear in the <strong>Pending</strong> list for review and category classification.
                  </p>

                  {error && (
                    <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
                      {error}
                    </div>
                  )}

                  {/* Photo Upload */}
                  {organizerUserId && (
                    <div className="rounded-2xl border border-border bg-surface p-4">
                      <ImageUpload
                        userId={organizerUserId}
                        bucket="avatars"
                        onUploadSuccess={(_url, path) => setPhotoPath(path)}
                        label="Player Photo (Optional)"
                      />
                    </div>
                  )}

                  {/* Required Fields */}
                  <fieldset className="flex flex-col gap-3">
                    <legend className="mb-1 text-xs font-bold uppercase tracking-widest text-text-muted">
                      Required
                    </legend>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="apm-name" className="text-xs font-semibold text-text-secondary">
                          Full Name <span className="text-danger">*</span>
                        </label>
                        <input
                          id="apm-name"
                          type="text"
                          required
                          value={form.displayName}
                          onChange={set('displayName')}
                          placeholder="Rahul Kumar"
                          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="apm-phone" className="text-xs font-semibold text-text-secondary">
                          Phone <span className="text-danger">*</span>
                        </label>
                        <input
                          id="apm-phone"
                          type="tel"
                          required
                          value={form.phone}
                          onChange={set('phone')}
                          placeholder="9876543210"
                          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                    </div>
                  </fieldset>

                  {/* Kit Details */}
                  <fieldset className="flex flex-col gap-3">
                    <legend className="mb-1 text-xs font-bold uppercase tracking-widest text-text-muted">
                      Kit Details
                    </legend>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="apm-jname" className="text-xs font-semibold text-text-secondary">
                          Jersey Name
                        </label>
                        <input
                          id="apm-jname"
                          type="text"
                          maxLength={12}
                          value={form.jerseyName}
                          onChange={set('jerseyName')}
                          placeholder="RAHUL"
                          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm uppercase text-text-primary placeholder:normal-case placeholder:text-text-muted focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="apm-jnum" className="text-xs font-semibold text-text-secondary">
                          Number
                        </label>
                        <input
                          id="apm-jnum"
                          type="number"
                          min={1}
                          max={99}
                          value={form.jerseyNumber}
                          onChange={set('jerseyNumber')}
                          placeholder="7"
                          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="apm-jsize" className="text-xs font-semibold text-text-secondary">
                          Size
                        </label>
                        <select
                          id="apm-jsize"
                          value={form.jerseySize}
                          onChange={set('jerseySize')}
                          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text-primary focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                        >
                          <option value="">—</option>
                          {JERSEY_SIZES.map(s => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </fieldset>

                  {/* Player Details */}
                  <fieldset className="flex flex-col gap-3">
                    <legend className="mb-1 text-xs font-bold uppercase tracking-widest text-text-muted">
                      Player Details (optional)
                    </legend>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="apm-pos1" className="text-xs font-semibold text-text-secondary">
                          Primary Position
                        </label>
                        <select
                          id="apm-pos1"
                          value={form.primaryPosition}
                          onChange={set('primaryPosition')}
                          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text-primary focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                        >
                          <option value="">Select...</option>
                          {POSITIONS.map(p => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="apm-pos2" className="text-xs font-semibold text-text-secondary">
                          Secondary Position
                        </label>
                        <select
                          id="apm-pos2"
                          value={form.secondaryPosition}
                          onChange={set('secondaryPosition')}
                          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text-primary focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                        >
                          <option value="">Select...</option>
                          {POSITIONS.map(p => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="apm-height" className="text-xs font-semibold text-text-secondary">
                          Height (cm)
                        </label>
                        <input
                          id="apm-height"
                          type="number"
                          min={140}
                          max={230}
                          value={form.heightCm}
                          onChange={set('heightCm')}
                          placeholder="175"
                          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="apm-place" className="text-xs font-semibold text-text-secondary">
                          Home Town
                        </label>
                        <input
                          id="apm-place"
                          type="text"
                          value={form.place}
                          onChange={set('place')}
                          placeholder="Thrissur"
                          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="apm-notes" className="text-xs font-semibold text-text-secondary">
                        Organizer Notes
                      </label>
                      <textarea
                        id="apm-notes"
                        rows={2}
                        maxLength={500}
                        value={form.notes}
                        onChange={set('notes')}
                        placeholder="e.g. Added manually, player had login issues"
                        className="resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                      />
                    </div>
                  </fieldset>
                </form>
              )}
            </div>

            {/* Footer */}
            {!success && (
              <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="add-player-form"
                  disabled={pending}
                  className="flex min-w-[120px] items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-card shadow-primary/30 transition-all hover:bg-primary-hover active:scale-95 disabled:opacity-50"
                >
                  {pending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Adding...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" /> Add Player
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}