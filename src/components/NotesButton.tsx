import { Pressable, Text, View } from "react-native";

import { t } from "../i18n";
import { colors } from "../theme/colors";
import { font } from "../theme/fonts";
import { NOTES_BUTTON_HEIGHT, NOTES_BUTTON_WIDTH } from "../ui/topBand";

/** Plain notebook glyph drawn with views: no icon font to load, so it shows on first frame. */
function NotebookGlyph() {
  return (
    <View
      style={{
        width: 16,
        height: 20,
        borderWidth: 2,
        borderColor: colors.text,
        borderRadius: 3,
        paddingTop: 4,
        paddingHorizontal: 3,
        gap: 3,
      }}
    >
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ height: 1.5, backgroundColor: colors.text }} />
      ))}
    </View>
  );
}

/** The visible Notes button in the top band. The caller passes the panic handler. */
export default function NotesButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      android_disableSound
      accessibilityRole="button"
      accessibilityLabel={t().common.notesButton}
      style={({ pressed }) => ({
        width: NOTES_BUTTON_WIDTH,
        height: NOTES_BUTTON_HEIGHT,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.accentSoft : colors.surface,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 4,
        gap: 2,
      })}
    >
      <NotebookGlyph />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.3}
        style={{ color: colors.text, fontSize: 12, lineHeight: 16, ...font("600") }}
      >
        {t().common.notesButton}
      </Text>
    </Pressable>
  );
}
