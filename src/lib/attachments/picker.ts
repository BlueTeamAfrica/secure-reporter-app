import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { refreshSession, setDocumentPickerTransientActive } from "../../state/session";

export type PickedAsset = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
};

/**
 * Field-friendly document picker (images + docs). Uses system picker; no in-app editor.
 */
export async function pickAttachments(): Promise<PickedAsset[]> {
  if (Platform.OS === "web") {
    return [];
  }

  setDocumentPickerTransientActive(true);
  console.log("[session] document picker opened");

  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "image/*",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "audio/*",
      ],
      multiple: true,
      copyToCacheDirectory: true,
    });

    console.log("[session] document picker returned", {
      canceled: result.canceled,
      assetCount: result.assets?.length ?? 0,
    });

    if (result.canceled || !result.assets?.length) {
      return [];
    }

    return result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.name ?? "attachment",
      mimeType: asset.mimeType ?? "application/octet-stream",
      size: typeof asset.size === "number" ? asset.size : 0,
    }));
  } finally {
    setDocumentPickerTransientActive(false);
    refreshSession();
    console.log("[session] document picker closed");
  }
}
