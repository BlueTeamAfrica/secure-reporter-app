import { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { colors } from "../theme/colors";
import { poppins } from "../theme/fonts";

const BASE_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

function shuffle(arr: string[]): string[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

interface PinPadProps {
  value: string;
  onValueChange: (v: string) => void;
  onSubmit: () => void;
  maxLength?: number;
  minLength?: number;
  disabled?: boolean;
  randomize?: boolean;
  /** Optional message shown below the dots display. */
  message?: string;
  messageIsError?: boolean;
}

/**
 * Reusable PIN entry pad.
 * Renders dots display, optional message, and the digit keypad (3×3 + bottom row).
 * The parent owns all state (value, lockout, submit logic).
 */
export default function PinPad({
  value,
  onValueChange,
  onSubmit,
  maxLength = 6,
  minLength = 4,
  disabled = false,
  randomize = false,
  message,
  messageIsError = false,
}: PinPadProps) {
  const digits = useMemo(
    () => (randomize ? shuffle([...BASE_DIGITS]) : [...BASE_DIGITS]),
    [randomize]
  );

  const dots = "●".repeat(Math.min(maxLength, value.length));
  const pad = " ".repeat(Math.max(0, maxLength - value.length));
  const canSubmit = !disabled && value.length >= minLength;

  function appendDigit(d: string) {
    if (disabled || value.length >= maxLength) return;
    onValueChange((value + d).slice(0, maxLength));
  }

  function backspace() {
    if (disabled) return;
    onValueChange(value.slice(0, -1));
  }

  const keyStyle = {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    opacity: disabled ? 0.6 : 1,
  } as const;

  return (
    <View style={{ width: "100%", maxWidth: 360, alignSelf: "center" }}>
      {/* Dots display */}
      <View
        style={{
          width: "100%",
          backgroundColor: colors.surface,
          paddingVertical: 16,
          paddingHorizontal: 16,
          borderRadius: 14,
          marginBottom: 14,
          borderWidth: 1,
          borderColor: colors.border,
          opacity: disabled ? 0.65 : 1,
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 18,
            letterSpacing: 6,
            textAlign: "center",
            ...poppins("500"),
          }}
        >
          {dots}
          <Text style={{ color: "transparent" }}>{pad}</Text>
        </Text>
      </View>

      {/* Message */}
      {message ? (
        <Text
          style={{
            color: messageIsError ? colors.error : colors.textMuted,
            fontSize: 14,
            marginBottom: 18,
            ...poppins("400"),
          }}
        >
          {message}
        </Text>
      ) : (
        <View style={{ height: 20 }} />
      )}

      {/* Rows 1–3: digits[0–8] */}
      {([0, 3, 6] as const).map((offset) => (
        <View key={offset} style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
          {digits.slice(offset, offset + 3).map((d) => (
            <Pressable key={d} onPress={() => appendDigit(d)} disabled={disabled} style={keyStyle}>
              <Text style={{ color: colors.text, fontSize: 18, ...poppins("600") }}>{d}</Text>
            </Pressable>
          ))}
        </View>
      ))}

      {/* Row 4: backspace | digits[9] | submit */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
        <Pressable onPress={backspace} disabled={disabled} style={keyStyle}>
          <Text style={{ color: colors.textMuted, fontSize: 16, ...poppins("600") }}>⌫</Text>
        </Pressable>
        <Pressable onPress={() => appendDigit(digits[9])} disabled={disabled} style={keyStyle}>
          <Text style={{ color: colors.text, fontSize: 18, ...poppins("600") }}>{digits[9]}</Text>
        </Pressable>
        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          style={{
            ...keyStyle,
            backgroundColor: canSubmit ? colors.accent : colors.accentSoft,
            borderWidth: 0,
            opacity: 1,
          }}
        >
          <Text
            style={{
              color: canSubmit ? colors.onAccent : colors.textMuted,
              fontSize: 16,
              ...poppins("700"),
            }}
          >
            ✓
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
