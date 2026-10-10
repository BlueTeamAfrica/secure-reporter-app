import { View, Text, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { colors } from "../src/theme/colors";
import { poppins } from "../src/theme/fonts";

const FAKE_NOTES = [
  {
    id: "1",
    title: "Shopping List",
    body: "Tea, sugar, bread, rice, soap",
    updatedAt: "Updated today",
  },
  {
    id: "2",
    title: "Weekend Tasks",
    body: "Laundry, clean desk, call family",
    updatedAt: "Updated yesterday",
  },
  {
    id: "3",
    title: "Ideas",
    body: "Check domain names and write a few content ideas",
    updatedAt: "Updated recently",
  },
];

const card = {
  backgroundColor: colors.surface,
  padding: 16,
  borderRadius: 14,
  marginBottom: 12,
  borderWidth: 1,
  borderColor: colors.border,
};

export default function CoverScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 24 }}>
      <Pressable
        onLongPress={() => router.replace("/unlock")}
        delayLongPress={3000}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 28,
            marginBottom: 20,
            ...poppins("700"),
          }}
        >
          Notes
        </Text>
      </Pressable>

      <Pressable
        style={{
          backgroundColor: colors.accent,
          paddingVertical: 14,
          borderRadius: 12,
          marginBottom: 20,
        }}
      >
        <Text
          style={{
            color: colors.onAccent,
            textAlign: "center",
            fontSize: 16,
            ...poppins("600"),
          }}
        >
          New Note
        </Text>
      </Pressable>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {FAKE_NOTES.map((note) => (
          <Pressable key={note.id} style={card}>
            <Text
              style={{
                color: colors.text,
                fontSize: 16,
                marginBottom: 6,
                ...poppins("600"),
              }}
            >
              {note.title}
            </Text>

            <Text
              style={{
                color: colors.textMuted,
                marginBottom: 8,
                lineHeight: 22,
                ...poppins("400"),
              }}
              numberOfLines={2}
            >
              {note.body}
            </Text>

            <Text
              style={{
                color: colors.textMuted,
                fontSize: 12,
                ...poppins("400"),
              }}
            >
              {note.updatedAt}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
