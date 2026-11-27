// Free photos under the Unsplash License (commercial use allowed, no credit required), loaded from Unsplash
// through next/image. If one is ever taken down, swap its id here.
const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}`;

export const PHOTOS = {
  heroSpike: { src: unsplash('1758119354171-f14f082c5e02'), alt: 'A player leaps to spike the ball at a floodlit night game' },
  sunset: { src: unsplash('1612872087720-bb876e2e67d1'), alt: 'Volleyball players silhouetted against a sunset' },
  indoorWomen: { src: unsplash('1547347298-4074fc3086f0'), alt: 'An indoor women’s volleyball match at the net' },
  indoorMen: { src: unsplash('1728971124745-423b12df446d'), alt: 'A player jumps to spike during an indoor men’s match' },
  dig: { src: unsplash('1567781830902-685fb3401f1d'), alt: 'Players ready to dig a serve in a dark arena' },
  ball: { src: unsplash('1666901356149-93f2eb3ba5a2'), alt: 'A volleyball resting on a colourful indoor court' },
};
