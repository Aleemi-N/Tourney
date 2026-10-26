import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import type { ComponentRef } from 'react';
import { Platform, type View } from 'react-native';

/** What a ref on a View points at. */
export type ViewHandle = ComponentRef<typeof View>;

/** Captures a view as a PNG and opens the phone's share sheet (WhatsApp and the rest). On the web it downloads the image. */
export async function shareView(view: ViewHandle | null, fileName: string, title: string): Promise<void> {
  if (!view) throw new Error('Nothing to share yet.');
  if (Platform.OS === 'web') {
    const uri = await captureRef(view, { format: 'png', quality: 1, result: 'data-uri' });
    const a = document.createElement('a');
    a.href = uri;
    a.download = fileName;
    a.click();
    return;
  }
  const uri = await captureRef(view, { format: 'png', quality: 1, result: 'tmpfile' });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: title, UTI: 'public.png' });
}
