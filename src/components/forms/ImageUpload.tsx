'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';
import { UploadCloud, X, Loader2 } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

interface ImageUploadProps {
  userId: string;
  bucket: 'avatars' | 'logos';
  currentPhotoUrl?: string | null;
  onUploadSuccess: (publicUrl: string, storagePath: string) => void;
  className?: string;
  label?: string;
}

export function ImageUpload({
  userId,
  bucket,
  currentPhotoUrl,
  onUploadSuccess,
  className,
  label = 'Upload Image'
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentPhotoUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      setError('File must be less than 2MB');
      return;
    }

    // Validate MIME type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Invalid file type. Only JPEG, PNG, and WebP are allowed.');
      return;
    }

    setIsUploading(true);

    try {
      // Show local preview immediately
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);

      const ext = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${ext}`;
      const filePath = `${userId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      onUploadSuccess(publicUrl, filePath);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload image');
      setPreviewUrl(currentPhotoUrl || null);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClear = () => {
    setPreviewUrl(null);
    onUploadSuccess('', ''); // Empty string implies cleared
  };

  const getDisplayUrl = (urlOrPath: string | null) => {
    if (!urlOrPath) return null;
    if (urlOrPath.startsWith('http') || urlOrPath.startsWith('blob:') || urlOrPath.startsWith('/')) {
      return urlOrPath;
    }
    return supabase.storage.from(bucket).getPublicUrl(urlOrPath).data.publicUrl;
  };

  const displayUrl = getDisplayUrl(previewUrl);

  return (
    <div className={twMerge("flex flex-col gap-2", className)}>
      <span className="text-sm font-medium text-text-secondary">
        {label}
      </span>
      
      <div className="flex items-start gap-4">
        {/* Preview Area */}
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-muted">
          {displayUrl ? (
            <Image
              src={displayUrl}
              alt="Preview"
              fill
              className="object-cover pointer-events-none"
              unoptimized={displayUrl.startsWith('blob:')}
            />
          ) : (
            <UploadCloud className="h-8 w-8 text-text-muted" />
          )}
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              id={`${bucket}-upload`}
              disabled={isUploading}
            />
            <label
              htmlFor={`${bucket}-upload`}
              className="cursor-pointer rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-strong hover:bg-surface focus-within:ring-2 focus-within:ring-primary/50 focus-within:ring-offset-2 focus-within:ring-offset-surface-raised"
            >
              Choose File
            </label>
            {previewUrl && (
              <button
                type="button"
                onClick={handleClear}
                disabled={isUploading}
                className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Clear
              </button>
            )}
          </div>
          <p className="text-[11px] text-text-muted">
            JPEG, PNG, WebP up to 2MB.
          </p>
          {error && (
            <p className="text-xs font-medium text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
