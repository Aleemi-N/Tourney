import React from 'react';
import { LandingPhoto } from './LandingPhoto';
import { Reveal } from './LandingMotion';
import { PHOTOS } from './photos';

const SHOTS = [
  { photo: PHOTOS.indoorMen, kicker: 'Every rally', line: 'Scored live, point by point.', className: 'sm:col-span-2 sm:row-span-2' },
  { photo: PHOTOS.indoorWomen, kicker: 'Every bid', line: 'Auctions everyone can watch.', className: '' },
  { photo: PHOTOS.dig, kicker: 'Every player', line: 'One profile, every season.', className: '' },
];

/** A photo mosaic: the feel of game day, with what Tourny does for each moment. */
export function GameDaySection() {
  return (
    <section className="w-full bg-background pb-8 pt-16 lg:pt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mb-10 max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-widest text-primary">Built for game day</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-text-primary md:text-5xl">You bring the energy. We handle the rest.</h2>
        </Reveal>
        <div className="grid auto-rows-[220px] grid-cols-1 gap-4 sm:grid-cols-3 sm:auto-rows-[240px]">
          {SHOTS.map((s, i) => (
            <Reveal key={s.kicker} delay={i * 0.1} className={`group relative overflow-hidden rounded-3xl ${s.className}`}>
              <LandingPhoto
                src={s.photo.src}
                alt={s.photo.alt}
                fill
                sizes={i === 0 ? '(min-width: 640px) 66vw, 100vw' : '(min-width: 640px) 33vw, 100vw'}
                className="object-cover transition duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div data-theme="dark" className="absolute inset-x-0 bottom-0 bg-transparent p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">{s.kicker}</p>
                <p className={`mt-1 font-black text-text-primary ${i === 0 ? 'text-2xl sm:text-4xl' : 'text-xl'}`}>{s.line}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
