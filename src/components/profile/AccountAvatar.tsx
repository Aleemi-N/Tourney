'use client';

import Image from 'next/image';
import { useState } from 'react';

type AccountAvatarProps = {
  name: string;
  photoUrl: string | null;
};

export function AccountAvatar({ name, photoUrl }: AccountAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = name.trim().slice(0, 2).toUpperCase() || 'TU';

  return (
    <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-strong bg-primary/15 text-3xl font-bold uppercase text-primary">
      {photoUrl && !imageFailed ? (
        <Image
          src={photoUrl}
          alt={`${name}'s profile photo`}
          fill
          sizes="96px"
          className="object-cover object-[center_22%]"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-label={`${name}'s initials`}>{initials}</span>
      )}
    </div>
  );
}
