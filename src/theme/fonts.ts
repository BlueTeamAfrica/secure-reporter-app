import type { TextStyle } from "react-native";

const families = {
  "400": "Poppins_400Regular",
  "500": "Poppins_500Medium",
  "600": "Poppins_600SemiBold",
  "700": "Poppins_700Bold",
} as const;

export type PoppinsWeight = keyof typeof families;

/** Poppins face for the given weight. Prefer this over `fontWeight` to avoid synthetic bold. */
export function poppins(weight: PoppinsWeight = "400"): Pick<TextStyle, "fontFamily"> {
  return { fontFamily: families[weight] };
}
