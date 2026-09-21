import React from 'react';
import Link from 'next/link';
import { APP_CONFIG } from '@/lib/config';
import { VolleyballIcon } from './VolleyballIcon';

export function LandingFooter() {
  return (
    <footer className="w-full bg-[#09090e] border-t border-white/5 py-12 text-sm text-text-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          
          <div className="col-span-2 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <VolleyballIcon className="w-5 h-5 text-primary" />
              <span className="font-bold text-text-primary tracking-tight">
                {APP_CONFIG.shortName}
              </span>
            </div>
            <p className="text-text-secondary max-w-xs">
              Create and manage volleyball tournaments from a single platform.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-text-primary mb-4">Platform</h4>
            <ul className="flex flex-col gap-2">
              <li><a href="#tournaments" className="hover:text-text-primary transition-colors">Tournaments</a></li>
              <li><a href="#features" className="hover:text-text-primary transition-colors">Features</a></li>
              <li><a href="#how-it-works" className="hover:text-text-primary transition-colors">How It Works</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-text-primary mb-4">Account</h4>
            <ul className="flex flex-col gap-2">
              <li><Link href="/login" className="hover:text-text-primary transition-colors">Sign In</Link></li>
              <li><Link href="/organizer/tournaments/new" className="hover:text-text-primary transition-colors">Create Tournament</Link></li>
            </ul>
          </div>

        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p>&copy; {new Date().getFullYear()} {APP_CONFIG.name}.</p>
          {/* 
            Appfyniti URL intentionally omitted — add href when the official URL is confirmed.
            Example: <a href="https://appfyniti.com" ...>Appfyniti</a>
          */}
          <p className="text-text-muted text-xs">Built by Appfyniti</p>
        </div>
      </div>
    </footer>

  );
}
