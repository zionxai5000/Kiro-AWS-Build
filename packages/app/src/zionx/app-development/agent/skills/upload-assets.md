---
name: upload-assets
description: Load when the app accepts image, audio, or file uploads. Pick → manipulate → display → optimistic UI → designed permission-denied states.
---

# Upload assets — the canonical pattern

## Pick

Use `expo-image-picker` for images, `expo-document-picker` for files,
`expo-av` for audio. Always request permission FIRST and handle denial
gracefully.

```tsx
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

async function pickImage() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    setShowPermissionSheet(true);  // designed sheet, NOT alert
    return;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.8,
  });
  if (result.canceled) return;
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  await uploadAsset(result.assets[0]);
}
```

## Manipulate (resize before upload)

Don't upload 4MB phone photos. Use `expo-image-manipulator`:

```tsx
import * as Manipulator from 'expo-image-manipulator';

const compressed = await Manipulator.manipulateAsync(
  asset.uri,
  [{ resize: { width: 1200 } }],
  { compress: 0.7, format: Manipulator.SaveFormat.JPEG },
);
```

## Optimistic upload

Show the image immediately, mark as "uploading," replace with the server's
URL when the response lands. If the upload fails, show a retry chip on the
local thumbnail.

```tsx
const [items, setItems] = useState<Asset[]>([]);

async function uploadAsset(asset: ImagePickerAsset) {
  const tempId = crypto.randomUUID();
  const tempItem: Asset = { id: tempId, localUri: asset.uri, status: 'uploading' };
  setItems((prev) => [...prev, tempItem]);

  try {
    const remoteUrl = await api.upload(asset.uri);
    setItems((prev) => prev.map((i) =>
      i.id === tempId ? { ...i, status: 'ready', remoteUrl } : i
    ));
  } catch (err) {
    setItems((prev) => prev.map((i) =>
      i.id === tempId ? { ...i, status: 'failed' } : i
    ));
  }
}
```

## Display

Use `expo-image` (NOT `<Image>` from react-native) for caching, blurhash
placeholders, and animated transitions:

```tsx
import { Image } from 'expo-image';

<Image
  source={{ uri: item.remoteUrl ?? item.localUri }}
  style={{ aspectRatio: 4 / 3, borderRadius: radius.lg }}
  placeholder={item.blurhash}
  contentFit="cover"
  transition={300}
/>
```

## Permission-denied — designed, not Alert.alert

When permission is denied, show a designed bottom sheet (BlurView background,
gradient hero, "Open Settings" CTA), NEVER `Alert.alert`. Wire the CTA to
`Linking.openSettings()`.

```tsx
function PermissionDeniedSheet({ open, onClose }: Props) {
  return (
    <Modal visible={open} transparent animationType="fade">
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={sheet}>
        <Text style={title}>Photos access needed</Text>
        <Text style={body}>We use the gallery to attach images. Open Settings to allow access.</Text>
        <GradientButton onPress={() => Linking.openSettings()}>Open Settings</GradientButton>
        <Pressable onPress={onClose}><Text style={dismiss}>Not now</Text></Pressable>
      </View>
    </Modal>
  );
}
```

## Storage

Server-side: PUT to S3 with a presigned URL the backend generates. Never
ship S3 keys to the device.

```ts
// shaar handler
const presigned = await s3Client.getSignedUrl('putObject', {
  Bucket: 'zionx-user-uploads',
  Key: `${userId}/${crypto.randomUUID()}.jpg`,
  Expires: 60,
});
res.json({ url: presigned });
```

```tsx
// device
const { url } = await fetch('/api/upload-url').then((r) => r.json());
await fetch(url, { method: 'PUT', body: blob });
```

## Don't ship without

- [ ] Permission requested up-front, designed denial sheet (no `Alert.alert`).
- [ ] Image resized + compressed before upload.
- [ ] Optimistic UI: thumbnail visible immediately, status pill while uploading.
- [ ] Retry affordance on failed uploads.
- [ ] `expo-image` for display (not the RN built-in).
- [ ] Presigned URLs from the server; no S3 keys on the device.
