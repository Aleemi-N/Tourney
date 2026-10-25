'use client';

import React from 'react';
import { PlayerCard } from '@/components/player/PlayerCard';
import { PlayerReviewCard } from '@/components/player/PlayerReviewCard';

export default function TestCardsPage() {
  const mockFallback = {
    id: '1',
    display_name: 'Jane Doe',
    primary_position: 'OUTSIDE_HITTER',
    height_cm: 185,
    place: 'Springfield VBC'
  };

  const mockPhoto = {
    id: '2',
    display_name: 'John Smith',
    primary_position: 'LIBERO',
    photo_path: '/sample-photo.png',
    place: 'Metro City Volleyball Club'
  };

  const mockLongName = {
    id: '3',
    display_name: 'Alexander Bartholomew Montgomery III',
    primary_position: 'MIDDLE_BLOCKER',
    photo_path: '/sample-photo.png',
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 bg-surface-muted dark:bg-surface min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-8 text-text-primary dark:text-text-primary">Player Card Polish</h1>
        
        <div className="space-y-12">
          {/* Base Cards */}
          <section>
            <h2 className="text-xl font-semibold mb-4 text-text-muted">Variants</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6">
              
              <PlayerCard player={mockPhoto} />
              
              <PlayerCard player={mockFallback} />
              
              <PlayerCard player={mockLongName} />
              
              <PlayerCard 
                player={mockPhoto} 
                status="PENDING" 
              />
              
              <PlayerCard 
                player={mockFallback} 
                classification="ICON_LOT" 
                tournamentColor="#0ea5e9"
              />
              
              <PlayerCard 
                player={mockPhoto} 
                classification="SETTER_LOT" 
                tournamentColor="#f59e0b"
              />
              
              <PlayerCard 
                player={mockFallback} 
                classification="MAIN_AUCTION" 
                tournamentColor="#f43f5e"
              />
            </div>
          </section>

          {/* Review Cards */}
          <section>
            <h2 className="text-xl font-semibold mb-4 text-text-muted">Review Cards</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6">
              
              <PlayerReviewCard 
                player={mockFallback} 
                status="PENDING"
                onApprove={() => {}}
                onReject={() => {}}
              />
              
              <PlayerReviewCard 
                player={mockPhoto} 
                status="PENDING"
                classification="MAIN_AUCTION"
                onClassify={() => {}}
                onApprove={() => {}}
                onReject={() => {}}
                tournamentColor="#f43f5e"
              />
              
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
