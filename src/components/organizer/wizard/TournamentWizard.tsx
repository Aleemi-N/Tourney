/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveTournamentDraft, publishTournament } from '@/app/actions/tournament';

const steps = [
  { id: 1, name: 'Basic Info' },
  { id: 2, name: 'Format' },
  { id: 3, name: 'Volleyball Rules' },
  { id: 4, name: 'Settings' },
  { id: 5, name: 'Review' },
];

export function TournamentWizard({ initialData }: { initialData?: any }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<any>(initialData || {
    name: '',
    slug: '',
    description: '',
    format: 'KNOCKOUT',
    league_mode: 'REGISTERED_TEAM',
    settings: {
      owner_registration_mode: 'OPEN',
      player_registration_enabled: true,
      public_live_enabled: true,
      min_squad_size: 6,
      max_squad_size: 14,
    },
    volleyball_rules: {
      sets_to_win: 2,
      win_by_two: true,
    }
  });
  
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleUpdate = (section: string, field: string, value: any) => {
    setFormData((prev: any) => {
      if (section) {
        return {
          ...prev,
          [section]: {
            ...prev[section],
            [field]: value
          }
        };
      }
      return {
        ...prev,
        [field]: value
      };
    });
  };

  const handleSaveDraft = async () => {
    setPending(true);
    setError(null);
    const result = await saveTournamentDraft(formData);
    setPending(false);

    if (result.error) {
      setError(result.error);
    } else if (result.id && !formData.id) {
      setFormData((prev: any) => ({ ...prev, id: result.id }));
      // optionally update URL without reload to add ?id=...
      window.history.replaceState(null, '', `/organizer/tournaments/new?id=${result.id}`);
    }
    return result;
  };

  const handleNext = async () => {
    // Save draft on every step progression to ensure it's backed in DB
    const res = await handleSaveDraft();
    if (!res.error) {
      setCurrentStep(s => Math.min(s + 1, steps.length));
    }
  };

  const handlePublish = async () => {
    const res = await handleSaveDraft();
    if (!res.error && formData.id || res.id) {
      const pubRes = await publishTournament(formData.id || res.id);
      if (pubRes.error) {
        setError(pubRes.error);
      } else {
        router.push('/organizer/dashboard');
      }
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-8 bg-surface rounded-2xl border border-border overflow-hidden min-h-[600px]">
      
      {/* Desktop Stepper */}
      <div className="hidden md:flex flex-col w-64 bg-surface-muted p-6 border-r border-border">
        <nav aria-label="Progress">
          <ol role="list" className="overflow-hidden">
            {steps.map((step, stepIdx) => (
              <li key={step.name} className={`relative ${stepIdx !== steps.length - 1 ? 'pb-10' : ''}`}>
                {stepIdx !== steps.length - 1 ? (
                  <div className="absolute left-4 top-4 -ml-px mt-0.5 h-full w-0.5 bg-border" aria-hidden="true" />
                ) : null}
                <div className="relative flex items-start group cursor-default">
                  <span className="h-9 flex items-center">
                    <span className={`relative z-10 w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold
                      ${currentStep > step.id ? 'bg-primary text-primary-foreground' : 
                        currentStep === step.id ? 'bg-surface border-2 border-primary text-primary' : 
                        'bg-surface border-2 border-border text-text-muted'}`}
                    >
                      {step.id}
                    </span>
                  </span>
                  <span className="ml-4 min-w-0 flex flex-col mt-1.5">
                    <span className={`text-sm font-medium ${currentStep >= step.id ? 'text-primary' : 'text-text-muted'}`}>
                      {step.name}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {/* Mobile Stepper Header */}
      <div className="md:hidden p-4 border-b border-border bg-surface-muted flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">Step {currentStep} of {steps.length}</span>
        <span className="text-sm font-semibold text-primary">{steps.find(s => s.id === currentStep)?.name}</span>
      </div>

      {/* Main Form Content */}
      <div className="flex-1 flex flex-col p-6 md:p-8">
        
        {error && (
          <div className="mb-6 p-4 bg-danger/10 border border-danger/20 text-danger rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex-1">
          {currentStep === 1 && (
            <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-xl font-bold text-text-primary">Basic Information</h2>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-text-secondary">Tournament Name</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => handleUpdate('', 'name', e.target.value)}
                  placeholder="e.g. Summer Spikes 2026"
                  className="p-3 rounded-lg border border-border bg-surface-muted text-text-primary focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-text-secondary">URL Slug</label>
                <input 
                  type="text" 
                  value={formData.slug}
                  onChange={(e) => handleUpdate('', 'slug', e.target.value)}
                  placeholder="e.g. summer-spikes-26"
                  pattern="^[a-z0-9-]+$"
                  className="p-3 rounded-lg border border-border bg-surface-muted text-text-primary focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-text-secondary">Description</label>
                <textarea 
                  value={formData.description || ''}
                  onChange={(e) => handleUpdate('', 'description', e.target.value)}
                  rows={3}
                  className="p-3 rounded-lg border border-border bg-surface-muted text-text-primary focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-xl font-bold text-text-primary">Format</h2>
              
              <div className="flex flex-col gap-3">
                <label className="text-sm font-medium text-text-secondary">Tournament Structure</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className={`cursor-pointer border p-4 rounded-xl transition-all ${formData.format === 'KNOCKOUT' ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:border-text-muted'}`}>
                    <input 
                      type="radio" 
                      name="format" 
                      value="KNOCKOUT"
                      checked={formData.format === 'KNOCKOUT'}
                      onChange={() => handleUpdate('', 'format', 'KNOCKOUT')}
                      className="sr-only"
                    />
                    <div className="font-semibold text-text-primary">Knockout</div>
                    <div className="text-sm text-text-secondary mt-1">Direct elimination bracket.</div>
                  </label>

                  <label className={`cursor-pointer border p-4 rounded-xl transition-all ${formData.format === 'LEAGUE' ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:border-text-muted'}`}>
                    <input 
                      type="radio" 
                      name="format" 
                      value="LEAGUE"
                      checked={formData.format === 'LEAGUE'}
                      onChange={() => handleUpdate('', 'format', 'LEAGUE')}
                      className="sr-only"
                    />
                    <div className="font-semibold text-text-primary">League</div>
                    <div className="text-sm text-text-secondary mt-1">Round-robin points table.</div>
                  </label>
                </div>
              </div>

              {formData.format === 'LEAGUE' && (
                <div className="flex flex-col gap-3 pt-4 border-t border-border animate-in fade-in slide-in-from-bottom-2">
                  <label className="text-sm font-medium text-text-secondary">League Mode</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className={`cursor-pointer border p-4 rounded-xl transition-all ${formData.league_mode === 'REGISTERED_TEAM' ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:border-text-muted'}`}>
                      <input 
                        type="radio" 
                        name="league_mode" 
                        value="REGISTERED_TEAM"
                        checked={formData.league_mode === 'REGISTERED_TEAM'}
                        onChange={() => handleUpdate('', 'league_mode', 'REGISTERED_TEAM')}
                        className="sr-only"
                      />
                      <div className="font-semibold text-text-primary">Registered Teams</div>
                      <div className="text-sm text-text-secondary mt-1">Owners bring their own squads.</div>
                    </label>

                    <label className={`cursor-pointer border p-4 rounded-xl transition-all ${formData.league_mode === 'AUCTION' ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:border-text-muted'}`}>
                      <input 
                        type="radio" 
                        name="league_mode" 
                        value="AUCTION"
                        checked={formData.league_mode === 'AUCTION'}
                        onChange={() => handleUpdate('', 'league_mode', 'AUCTION')}
                        className="sr-only"
                      />
                      <div className="font-semibold text-text-primary">Auction League</div>
                      <div className="text-sm text-text-secondary mt-1">Players register individually and are bid on.</div>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-xl font-bold text-text-primary">Volleyball Rules</h2>
              <p className="text-sm text-text-secondary">These rules will apply to the entire tournament. You can override them per stage later.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-text-secondary">Sets required to win</label>
                  <select 
                    value={formData.volleyball_rules?.sets_to_win || 2}
                    onChange={(e) => handleUpdate('volleyball_rules', 'sets_to_win', parseInt(e.target.value))}
                    className="p-3 rounded-lg border border-border bg-surface-muted text-text-primary focus:outline-none focus:border-primary transition-colors"
                  >
                    <option value={1}>1 Set</option>
                    <option value={2}>Best of 3 (Win 2)</option>
                    <option value={3}>Best of 5 (Win 3)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-2 p-4 border border-border rounded-lg bg-surface-muted">
                <input 
                  type="checkbox" 
                  id="winByTwo"
                  checked={formData.volleyball_rules?.win_by_two ?? true}
                  onChange={(e) => handleUpdate('volleyball_rules', 'win_by_two', e.target.checked)}
                  className="w-5 h-5 accent-primary"
                />
                <label htmlFor="winByTwo" className="text-sm font-medium text-text-primary cursor-pointer">
                  Require Win by 2 Points
                </label>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-xl font-bold text-text-primary">Settings</h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-text-secondary">Minimum Squad Size</label>
                  <input 
                    type="number"
                    min={1} 
                    value={formData.settings?.min_squad_size || 6}
                    onChange={(e) => handleUpdate('settings', 'min_squad_size', parseInt(e.target.value))}
                    className="p-3 rounded-lg border border-border bg-surface-muted text-text-primary focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-text-secondary">Maximum Squad Size</label>
                  <input 
                    type="number"
                    min={1} 
                    value={formData.settings?.max_squad_size || 14}
                    onChange={(e) => handleUpdate('settings', 'max_squad_size', parseInt(e.target.value))}
                    className="p-3 rounded-lg border border-border bg-surface-muted text-text-primary focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1 mt-2">
                <label className="text-sm font-medium text-text-secondary">Team Owner Registration Mode</label>
                <select 
                  value={formData.settings?.owner_registration_mode || 'OPEN'}
                  onChange={(e) => handleUpdate('settings', 'owner_registration_mode', e.target.value)}
                  className="p-3 rounded-lg border border-border bg-surface-muted text-text-primary focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="OPEN">Open - Anyone can apply</option>
                  <option value="INVITE_ONLY">Invite Only - By code</option>
                  <option value="ORGANIZER_ADDED">Organizer Added - No public form</option>
                </select>
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-xl font-bold text-text-primary">Review & Publish</h2>
              <p className="text-sm text-text-secondary">Confirm your tournament details. Registration will be enabled once published.</p>
              
              <div className="bg-surface-muted p-5 rounded-xl border border-border flex flex-col gap-4">
                <div>
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Tournament</span>
                  <p className="text-lg font-bold text-text-primary">{formData.name || 'Unnamed'}</p>
                  <p className="text-sm text-text-secondary">/{formData.slug || 'no-slug'}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Format</span>
                    <p className="text-sm font-medium text-text-primary">{formData.format} {formData.format === 'LEAGUE' ? `(${formData.league_mode})` : ''}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Scoring</span>
                    <p className="text-sm font-medium text-text-primary">Best of {formData.volleyball_rules?.sets_to_win === 2 ? '3' : formData.volleyball_rules?.sets_to_win === 3 ? '5' : '?'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="mt-8 pt-6 border-t border-border flex flex-col-reverse sm:flex-row items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setCurrentStep(s => Math.max(s - 1, 1))}
            disabled={currentStep === 1 || pending}
            className="w-full sm:w-auto px-6 py-3 font-semibold text-text-secondary bg-surface-muted rounded-lg hover:bg-border transition-colors disabled:opacity-50"
          >
            Back
          </button>
          
          <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-3">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={pending}
              className="w-full sm:w-auto px-6 py-3 font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              Save Draft
            </button>
            {currentStep < steps.length ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={pending || !formData.name || !formData.slug}
                className="w-full sm:w-auto px-6 py-3 font-semibold text-primary-foreground bg-primary rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {pending ? 'Saving...' : 'Continue'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePublish}
                disabled={pending}
                className="w-full sm:w-auto px-6 py-3 font-semibold text-white bg-success rounded-lg hover:bg-success/80 transition-colors disabled:opacity-50"
              >
                {pending ? 'Publishing...' : 'Open Registration'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
