import type { TextInputProps } from "react-native";

/**
 * Props for every text field (S4): no autocorrect, no spell check, no autofill, no suggestions.
 * On Android, autoCorrect={false} sets TYPE_TEXT_FLAG_NO_SUGGESTIONS, so keyboards show no
 * suggestion strip for the field; most also stop learning words from it. React Native has no
 * prop for the IME "no personalized learning" flag, so a keyboard may still learn: see the
 * report's risks.
 */
export const PRIVATE_TEXT_INPUT = {
  autoCorrect: false,
  spellCheck: false,
  autoComplete: "off",
  importantForAutofill: "no",
  textContentType: "none",
} as const satisfies Partial<TextInputProps>;
