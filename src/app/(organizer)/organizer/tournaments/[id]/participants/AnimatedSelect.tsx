'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

export type SelectOption = {
  value: string;
  label: string;
  subtitle?: string;
};

interface AnimatedSelectProps {
  value: string | null;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  placement?: 'top' | 'bottom';
}

export function AnimatedSelect({ value, options, onChange, placeholder = 'Select...', disabled, placement = 'bottom' }: AnimatedSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className="relative w-full text-sm" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-11 w-full items-center justify-between rounded-xl border border-glass-border bg-surface-muted px-3 transition-all  shadow-card ${
          isOpen ? 'border-primary bg-surface-muted ring-2 ring-primary/20' : 'hover:border-primary/50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} text-left`}
      >
        <span className={`block truncate ${selectedOption ? 'text-text-primary font-bold' : 'text-text-muted'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
        >
          <ChevronDown className="h-4 w-4 text-text-secondary" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && !disabled && (
          <motion.div
            key="dropdown-menu"
            initial={{ opacity: 0, y: placement === 'top' ? 10 : -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: placement === 'top' ? 10 : -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`absolute z-50 w-full overflow-hidden rounded-xl border border-glass-border bg-surface-raised  shadow-card ${
              placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
          >
            <div className="max-h-60 overflow-y-auto p-1.5 py-2">
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`relative flex w-full items-center px-3 py-2.5 text-left text-sm transition-all rounded-lg group ${
                    value === opt.value
                      ? 'bg-primary/15 text-primary font-bold shadow-sm'
                      : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                  }`}
                >
                  <div className="flex flex-col gap-0.5 w-full pr-6">
                    <span>{opt.label}</span>
                    {opt.subtitle && (
                      <span className="text-xs text-text-muted font-medium uppercase tracking-wider group-hover:text-text-secondary">
                        {opt.subtitle}
                      </span>
                    )}
                  </div>
                  {value === opt.value && (
                    <motion.div
                      layoutId="check-icon"
                      className="absolute right-3"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      <Check className="h-4 w-4 text-primary" />
                    </motion.div>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
