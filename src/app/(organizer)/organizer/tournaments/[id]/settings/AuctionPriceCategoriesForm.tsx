'use client';

import { useState } from 'react';
import { CurrencyRupeeIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { updateAuctionPriceCategoriesAction } from '@/app/actions/auction';
import type { AuctionCategory } from '@/lib/organizer/organizer-auction';

interface AuctionPriceCategoriesFormProps {
  tournamentId: string;
  categories: AuctionCategory[];
  /**
   * True once the auction has been prepared (prepared_at IS NOT NULL).
   * Locks the form to read-only.
   */
  locked: boolean;
}

const CODE_ORDER = ['A', 'B', 'C'] as const;

function CategoryRow({
  code,
  name,
  price,
  locked,
  nameError,
  priceError,
  onNameChange,
  onPriceChange,
}: {
  code: string;
  name: string;
  price: string;
  locked: boolean;
  nameError?: string;
  priceError?: string;
  onNameChange: (v: string) => void;
  onPriceChange: (v: string) => void;
}) {
  const nameId = `cat-name-${code}`;
  const priceId = `cat-price-${code}`;

  if (locked) {
    const priceNum = Number(price);
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-base font-bold text-primary">
          {code}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-text-primary">{name || `Category ${code}`}</p>
        </div>
        <div className="flex items-center gap-1 text-sm font-semibold text-text-primary">
          <CurrencyRupeeIcon className="h-4 w-4 text-text-muted" />
          <span>{priceNum.toLocaleString('en-IN')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-base font-bold text-primary">
          {code}
        </span>
        <span className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Category {code}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Display name */}
        <div>
          <label htmlFor={nameId} className="block text-sm font-medium text-text-primary mb-1.5">
            Display Name
          </label>
          <input
            id={nameId}
            type="text"
            maxLength={80}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={`Category ${code}`}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {nameError && <p className="mt-1 text-xs text-danger">{nameError}</p>}
        </div>

        {/* Base price */}
        <div>
          <label htmlFor={priceId} className="block text-sm font-medium text-text-primary mb-1.5">
            Base Price
          </label>
          <span className="relative block">
            <CurrencyRupeeIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
            <input
              id={priceId}
              type="number"
              min={1}
              step={1}
              value={price}
              onChange={(e) => onPriceChange(e.target.value)}
              placeholder="e.g. 500"
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </span>
          {priceError && <p className="mt-1 text-xs text-danger">{priceError}</p>}
        </div>
      </div>
    </div>
  );
}

export function AuctionPriceCategoriesForm({
  tournamentId,
  categories,
  locked,
}: AuctionPriceCategoriesFormProps) {
  // Build initial state from categories (already sorted by display_order)
  const initial = {
    A: { name: categories.find((c) => c.code === 'A')?.display_name ?? '', price: categories.find((c) => c.code === 'A')?.base_price?.toString() ?? '' },
    B: { name: categories.find((c) => c.code === 'B')?.display_name ?? '', price: categories.find((c) => c.code === 'B')?.base_price?.toString() ?? '' },
    C: { name: categories.find((c) => c.code === 'C')?.display_name ?? '', price: categories.find((c) => c.code === 'C')?.base_price?.toString() ?? '' },
  };

  const [form, setForm] = useState<Record<'A' | 'B' | 'C', { name: string; price: string }>>(initial);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function setField(code: 'A' | 'B' | 'C', field: 'name' | 'price', value: string) {
    setForm((prev) => ({ ...prev, [code]: { ...prev[code], [field]: value } }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[`${code}-${field}`];
      return next;
    });
    setStatus(null);
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};

    for (const code of CODE_ORDER) {
      const { name, price } = form[code];
      if (!name.trim()) {
        errors[`${code}-name`] = 'Display name is required.';
      } else if (name.trim().length > 80) {
        errors[`${code}-name`] = 'Maximum 80 characters.';
      }
      const p = Number(price);
      if (!price || isNaN(p) || p <= 0) {
        errors[`${code}-price`] = 'Base price must be a positive number.';
      }
    }

    if (!errors['A-price'] && !errors['B-price'] && !errors['C-price']) {
      const pA = Number(form.A.price);
      const pB = Number(form.B.price);
      const pC = Number(form.C.price);
      if (pA < pB) errors['B-price'] = 'Category B price must be ≤ Category A.';
      if (pB < pC) errors['C-price'] = 'Category C price must be ≤ Category B.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return;
    if (!validate()) return;

    setLoading(true);
    setStatus(null);

    const result = await updateAuctionPriceCategoriesAction(tournamentId, {
      a_name: form.A.name.trim(),
      a_price: Number(form.A.price),
      b_name: form.B.name.trim(),
      b_price: Number(form.B.price),
      c_name: form.C.name.trim(),
      c_price: Number(form.C.price),
    });

    setLoading(false);

    if (result.error) {
      setStatus({ type: 'error', text: result.error });
    } else {
      setStatus({ type: 'success', text: 'Auction price categories saved.' });
    }
  }

  return (
    <section
      id="auction-price-categories"
      className="scroll-mt-24 rounded-xl border border-border bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="text-lg font-semibold text-text-primary">Auction Price Categories</h2>
        {locked && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning dark:text-warning">
            <LockClosedIcon className="h-3.5 w-3.5" />
            Locked
          </span>
        )}
      </div>
      <p className="mb-5 text-sm text-text-secondary">
        Configure the three stable A/B/C price tiers for this auction. Prices must satisfy{' '}
        <span className="font-medium">A ≥ B ≥ C &gt; 0</span>.
      </p>

      {locked && (
        <div className="mb-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning dark:text-warning">
          <LockClosedIcon className="mb-0.5 mr-1.5 inline h-4 w-4" />
          Category configuration is locked because the auction has been prepared. To reconfigure
          categories you would need to reset the auction preparation.
        </div>
      )}

      {status && (
        <div
          role="status"
          className={`mb-5 rounded-lg border p-4 text-sm ${status.type === 'error'
              ? 'border-danger/20 bg-danger/10 text-danger'
              : 'border-success/30 bg-success/10 text-success'
            }`}
        >
          {status.text}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-3">
          {CODE_ORDER.map((code) => (
            <CategoryRow
              key={code}
              code={code}
              name={form[code].name}
              price={form[code].price}
              locked={locked}
              nameError={fieldErrors[`${code}-name`]}
              priceError={fieldErrors[`${code}-price`]}
              onNameChange={(v) => setField(code, 'name', v)}
              onPriceChange={(v) => setField(code, 'price', v)}
            />
          ))}
        </div>

        {!locked && (
          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="min-h-11 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 hover:bg-primary-hover transition-colors"
            >
              {loading ? 'Saving…' : 'Save Categories'}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
