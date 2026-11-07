import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import Screen from "../src/components/layout/Screen";
import { t } from "../src/i18n";
import { colors } from "../src/theme/colors";
import { font, lh } from "../src/theme/fonts";

/**
 * First-run guide, shown once after setup (after the first name is saved). Two screens; every
 * point is kept: why there are two codes, the Notes button, how to get back, sending online.
 * A real screen, so the Notes button it describes is visible at the top.
 */
export default function GuideScreen() {
  const g = t().guide;
  const [page, setPage] = useState(0);
  const sections =
    page === 0
      ? [
          { title: g.codesTitle, body: g.codesBody },
          { title: g.notesTitle, body: g.notesBody },
        ]
      : [
          { title: g.backTitle, body: g.backBody },
          { title: g.sendTitle, body: g.sendBody },
        ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 20 }}>
          {[0, 1].map((i) => (
            <View
              key={i}
              style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= page ? colors.accent : colors.border }}
            />
          ))}
        </View>

        {sections.map((section) => (
          <View
            key={section.title}
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              padding: 18,
              marginBottom: 14,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 19, marginBottom: 8, ...font("700") }}>{section.title}</Text>
            <Text style={{ color: colors.text, fontSize: 16, lineHeight: lh(24), ...font("400") }}>{section.body}</Text>
          </View>
        ))}

        <Pressable
          onPress={() => (page === 0 ? setPage(1) : router.replace("/home"))}
          style={{ backgroundColor: colors.accent, paddingVertical: 15, borderRadius: 14, marginTop: 8 }}
        >
          <Text style={{ color: colors.onAccent, textAlign: "center", fontSize: 16, ...font("600") }}>
            {page === 0 ? t().common.next : g.start}
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
