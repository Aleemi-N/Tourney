import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { Body, Button, ErrorText } from '@/components/ui';
import { api, imageUrl } from '@/lib/api';

/**
 * Picks an image and uploads it under the signed-in user's folder (the storage rule), then reports
 * the stored path. Only JPEG, PNG and WebP up to 2 MB are accepted by the API.
 */
export function PhotoField({ bucket, userId, label, path, onChange }: {
  bucket: 'avatars' | 'logos'; userId: string; label: string; path: string | null; onChange: (path: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setBusy(true);
    try {
      const response = await fetch(asset.uri);
      const bytes = await response.arrayBuffer();
      const type = asset.mimeType ?? 'image/jpeg';
      const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
      const name = `${userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await api.storage.from(bucket).upload(name, bytes, { contentType: type, upsert: true });
      if (uploadError) throw uploadError;
      onChange(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The image could not be uploaded.');
    } finally {
      setBusy(false);
    }
  }

  const url = imageUrl(bucket, path);
  return (
    <View style={{ gap: 8 }}>
      <Body muted>{label}</Body>
      {url ? <Image accessibilityLabel={`${label} preview`} source={{ uri: url }} style={{ width: 96, height: 96, borderRadius: 16 }} /> : null}
      <Button tone="secondary" title={path ? 'Change image' : 'Choose image'} onPress={() => void pick()} loading={busy} />
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}
