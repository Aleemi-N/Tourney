type PublicStorageClient = {
  storage: {
    from: (bucket: string) => {
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

export function resolvePublicStorageUrl(
  supabase: PublicStorageClient,
  bucket: 'avatars' | 'logos',
  pathOrUrl?: string | null,
) {
  if (!pathOrUrl) return null;

  if (
    pathOrUrl.startsWith('http://') ||
    pathOrUrl.startsWith('https://') ||
    pathOrUrl.startsWith('blob:') ||
    pathOrUrl.startsWith('/')
  ) {
    return pathOrUrl;
  }

  return supabase.storage.from(bucket).getPublicUrl(pathOrUrl).data.publicUrl;
}
