import { createClient } from './client';

export type StorageBucket = 'avatars' | 'logos';

export async function uploadImage(
  bucket: StorageBucket,
  userId: string,
  file: File
): Promise<{ path: string; url: string } | { error: string }> {
  try {
    const supabase = createClient();
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return { error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' };
    }

    // Validate size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      return { error: 'File size must be less than 2MB.' };
    }

    // Secure path: userId/filename
    // Use timestamp to break cache if needed, but upsert handles overwrite.
    // However, to keep it simple and UPSERT-friendly, let's just use `photo.webp` or similar?
    // Actually, preserving the extension is useful.
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    // Using a generic name per user, so it simply overwrites and we don't accumulate junk.
    const path = `${userId}/photo.${ext}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      return { error: error.message };
    }

    const { data: publicData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return {
      path: data.path,
      url: publicData.publicUrl,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred during upload';
    return { error: message };
  }
}
