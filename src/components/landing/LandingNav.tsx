'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';
import { APP_CONFIG } from '@/lib/config';
import { VolleyballIcon } from './VolleyballIcon';
import { logout } from '@/app/actions/auth';
import { PwaInstallAction } from '@/components/pwa/PwaInstallAction';

interface LandingNavProps {
  isAuthenticated?: boolean;
  isOrganizer?: boolean;
  userProfile?: { full_name: string; photo_url?: string | null } | null;
}

export function LandingNav({ isAuthenticated = false, isOrganizer = false, userProfile = null }: LandingNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isProfileMenuOpen) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isProfileMenuOpen]);

  async function handleLogout(e: React.FormEvent) {
    e.preventDefault();
    setIsLoggingOut(true);
    await logout();
  }

  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur-2xl bg-[#09090e]/70 border-b border-glass-border shadow-[0_4px_30px_rgb(0,0,0,0.1)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <VolleyballIcon className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg tracking-tight text-text-primary">
              {APP_CONFIG.shortName}
            </span>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#tournaments" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
              Tournaments
            </a>
            <Link href="#features" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
              Features
            </Link>
            <Link href="#how-it-works" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
              How It Works
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-4">
            {!isAuthenticated ? (
              <>
                <PwaInstallAction className="flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary" />
                <Link href="/login" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
                  Sign In
                </Link>
                <Link 
                  href="/register" 
                  className="px-5 py-2.5 bg-surface-raised/50 backdrop-blur-xl border border-glass-border hover:border-primary/50 text-text-primary text-sm font-semibold rounded-xl transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
                >
                  Create Account
                </Link>
                <Link 
                  href="/organizer/tournaments/new" 
                  className="px-5 py-2.5 bg-gradient-to-r from-primary to-primary-hover shadow-lg shadow-primary/25 hover:shadow-primary/40 text-primary-foreground text-sm font-bold rounded-xl transition-all duration-300 hover:-translate-y-0.5"
                >
                  Create Tournament
                </Link>
              </>
            ) : (
              <>
                {isOrganizer && (
                  <Link href="/organizer/dashboard" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
                    Organizer Dashboard
                  </Link>
                )}
                <div className="relative z-50">
                  <button 
                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                    aria-expanded={isProfileMenuOpen}
                    aria-haspopup="true"
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-text-primary hover:bg-white/5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary relative z-50"
                  >
                    <div className="relative w-8 h-8 overflow-hidden rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold uppercase">
                      {userProfile?.photo_url ? <Image src={userProfile.photo_url} alt="" fill sizes="32px" className="object-cover object-[center_22%]" /> : (userProfile?.full_name ? userProfile.full_name.substring(0, 2) : 'U')}
                    </div>
                    <span className="max-w-28 truncate">{userProfile?.full_name || 'Account'}</span>
                  </button>
                  {isProfileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-surface-raised/90 backdrop-blur-2xl border border-glass-border rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] py-2 z-50 overflow-hidden">
                      <Link href="/profile" onClick={() => setIsProfileMenuOpen(false)} className="block px-4 py-2 text-sm text-text-primary hover:bg-white/5">
                        My Profile
                      </Link>
                      <Link href="/profile#my-tournaments" onClick={() => setIsProfileMenuOpen(false)} className="block px-4 py-2 text-sm text-text-primary hover:bg-white/5">
                        My Tournaments
                      </Link>
                      <PwaInstallAction onComplete={() => setIsProfileMenuOpen(false)} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-primary hover:bg-white/5" />
                      <form onSubmit={handleLogout}>
                        <button type="submit" disabled={isLoggingOut} className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:text-danger hover:bg-white/5 transition-colors disabled:opacity-50">
                          {isLoggingOut ? 'Signing Out...' : 'Sign Out'}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
                {isProfileMenuOpen && (
                  <div className="fixed inset-0 z-40" onClick={() => setIsProfileMenuOpen(false)} />
                )}
                <Link 
                  href="/organizer/tournaments/new" 
                  className="px-5 py-2.5 bg-gradient-to-r from-primary to-primary-hover shadow-lg shadow-primary/25 hover:shadow-primary/40 text-primary-foreground text-sm font-bold rounded-xl transition-all duration-300 hover:-translate-y-0.5"
                >
                  Create Tournament
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-4">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 text-text-secondary hover:text-text-primary"
              aria-label="Toggle menu"
              aria-expanded={isOpen}
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isOpen && (
        <div className="md:hidden absolute top-16 inset-x-0 bg-surface-raised/95 backdrop-blur-3xl border-b border-glass-border shadow-2xl p-4 flex flex-col gap-4">
          <a href="#tournaments" onClick={() => setIsOpen(false)} className="text-base font-medium text-text-secondary hover:text-text-primary py-2 border-b border-white/5">
            Tournaments
          </a>
          <Link href="#features" onClick={() => setIsOpen(false)} className="text-base font-medium text-text-secondary hover:text-text-primary py-2 border-b border-white/5">
            Features
          </Link>
          <Link href="#how-it-works" onClick={() => setIsOpen(false)} className="text-base font-medium text-text-secondary hover:text-text-primary py-2 border-b border-white/5">
            How It Works
          </Link>
          <div className="flex flex-col gap-3 mt-2">
            {!isAuthenticated ? (
              <>
                <Link 
                  href="/login" 
                  onClick={() => setIsOpen(false)}
                  className="w-full py-3 text-center text-sm font-medium text-text-primary border border-white/10 rounded-xl"
                >
                  Sign In
                </Link>
                <Link 
                  href="/register" 
                  onClick={() => setIsOpen(false)}
                  className="w-full py-3 text-center text-sm font-medium text-text-primary border border-white/10 rounded-xl"
                >
                  Create Account
                </Link>
              </>
            ) : (
              <>
                {isOrganizer && (
                  <Link 
                    href="/organizer/dashboard" 
                    onClick={() => setIsOpen(false)}
                    className="w-full py-3 text-center text-sm font-medium text-text-primary border border-white/10 rounded-xl"
                  >
                    Organizer Dashboard
                  </Link>
                )}
                <Link 
                  href="/profile" 
                  onClick={() => setIsOpen(false)}
                  className="w-full py-3 text-center text-sm font-medium text-text-primary border border-white/10 rounded-xl"
                >
                  My Profile
                </Link>
                <Link
                  href="/profile#my-tournaments"
                  onClick={() => setIsOpen(false)}
                  className="w-full py-3 text-center text-sm font-medium text-text-primary border border-white/10 rounded-xl"
                >
                  My Tournaments
                </Link>
                <PwaInstallAction onComplete={() => setIsOpen(false)} className="flex w-full items-center justify-center gap-2 py-3 text-sm font-medium text-text-primary rounded-xl border border-white/10" />
                <form onSubmit={(e) => { handleLogout(e); setIsOpen(false); }}>
                  <button 
                    type="submit"
                    disabled={isLoggingOut}
                    className="w-full py-3 text-center text-sm font-medium text-danger border border-white/10 rounded-xl disabled:opacity-50"
                  >
                    {isLoggingOut ? 'Signing Out...' : 'Sign Out'}
                  </button>
                </form>
              </>
            )}
            <Link
              href="/organizer/tournaments/new" 
              onClick={() => setIsOpen(false)}
              className="w-full py-2 text-center text-sm font-semibold text-primary hover:text-primary-hover"
            >
              Create Tournament
            </Link>
            {!isAuthenticated && <PwaInstallAction onComplete={() => setIsOpen(false)} className="flex w-full items-center justify-center gap-2 py-2 text-sm font-medium text-text-secondary hover:text-text-primary" />}
          </div>
        </div>
      )}
    </nav>
  );
}
