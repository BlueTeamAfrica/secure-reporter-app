import type { TextStyle } from "react-native";

import { isArabic } from "../i18n";

/** Loaded at runtime by useFonts in app/_layout.tsx. */
const poppinsFamilies = {
  "400": "Poppins_400Regular",
  "500": "Poppins_500Medium",
  "600": "Poppins_600SemiBold",
  "700": "Poppins_700Bold",
} as const;

/**
 * Embedded at build time by the expo-font config plugin (app.json). On Android the family name
 * is the file name. Cairo also covers Latin, so mixed text renders in one face.
 */
const cairoFamilies = {
  "400": "Cairo_400Regular",
  "500": "Cairo_500Medium",
  "600": "Cairo_600SemiBold",
  "700": "Cairo_700Bold",
} as const;

export type FontWeight = keyof typeof poppinsFamilies;

/** Face for the given weight in the active language. Use this, never `fontWeight`. */
export function font(weight: FontWeight = "400"): Pick<TextStyle, "fontFamily"> {
  return { fontFamily: (isArabic ? cairoFamilies : poppinsFamilies)[weight] };
}

/** Older name for font(); returns Cairo in Arabic. */
export const poppins = font;

/** Arabic script needs more vertical room: scales an explicit lineHeight in Arabic only. */
export function lh(lineHeight: number): number {
  return isArabic ? Math.round(lineHeight * 1.3) : lineHeight;
}
