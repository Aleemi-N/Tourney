'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useId, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';
import { UploadCloud, X, Loader2 } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { resolvePublicStorageUrl } from '@/lib/supabase/storage-url';
import { PhotoCropModal } from './PhotoCropModal';

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
  const [imageFailed, setImageFailed] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const supabase = createClient();

  const validateFile = (file: File) => {
    setError(null);
    if (file.size > 2 * 1024 * 1024) {
      setError('File must be less than 2MB');
      return false;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Invalid file type. Only JPEG, PNG, and WebP are allowed.');
      return false;
    }
    return true;
  };

  const uploadFile = async (file: File) => {
    if (!validateFile(file)) return;

    setIsUploading(true);
    let objectUrl: string | null = null;

    try {
      // Show local preview immediately
      objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      setImageFailed(false);

      const ext = file.type === 'image/webp' ? 'webp' : file.name.split('.').pop();
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

      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      setPreviewUrl(publicUrl);
      onUploadSuccess(publicUrl, filePath);
      setCropFile(null);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload image');
      setPreviewUrl(currentPhotoUrl || null);
      setImageFailed(false);
      setCropFile(null);
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !validateFile(file)) {
      e.target.value = '';
      return;
    }
    if (bucket === 'avatars') {
      setCropFile(file);
      e.target.value = '';
      return;
    }
    void uploadFile(file);
  };

  const handleClear = () => {
    setPreviewUrl(null);
    setImageFailed(false);
    onUploadSuccess('', ''); // Empty string implies cleared
  };

  const displayUrl = resolvePublicStorageUrl(supabase, bucket, previewUrl);

  return (
    <div className={twMerge("flex flex-col gap-2", className)}>
      <span className="text-sm font-medium text-text-secondary">
        {label}
      </span>
      
      <div className="flex min-w-0 flex-col gap-4 min-[360px]:flex-row min-[360px]:items-start">
        {/* Preview Area */}
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-muted">
          {displayUrl && !imageFailed ? (
            <Image
              src={displayUrl}
              alt="Preview"
              fill
              sizes="96px"
              className="pointer-events-none object-cover object-[center_22%]"
              unoptimized={displayUrl.startsWith('blob:')}
              onError={() => setImageFailed(true)}
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
        <div className="flex min-w-0 flex-col gap-2 min-[360px]:pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              id={`${bucket}-${inputId}-upload`}
              disabled={isUploading}
            />
            <label
              htmlFor={`${bucket}-${inputId}-upload`}
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
      {cropFile && (
        <PhotoCropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onApply={uploadFile}
        />
      )}
    </div>
  );
}
