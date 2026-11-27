'use client';

import Image, { type ImageProps } from 'next/image';

// ponytail: one client wrapper for every landing photo. Rendering next/image straight from several landing
// server components made Next 16.3's dev bundler hand the browser an empty component ("Lazy element type
// must resolve to a class or function"); drop this wrapper if a later Next fixes that.
export function LandingPhoto({ alt, ...props }: ImageProps) {
  return <Image alt={alt} {...props} />;
}
