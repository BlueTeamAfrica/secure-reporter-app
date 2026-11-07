import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { getWorkingReport } from "../../src/state/editorDraft";
import { getReportById } from "../../src/state/drafts";
import { hasReporterProfileComplete } from "../../src/state/reporterProfile";
import { fmt, t } from "../../src/i18n";
import { colors } from "../../src/theme/colors";
import { poppins, lh } from "../../src/theme/fonts";

export default function ReviewScreen() {
  const { id, title, body, status } = useLocalSearchParams<{
    id?: string;
    title: string;
    body: string;
    status?: string;
  }>();

  const currentStatus = status ?? "draft";
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      async function loadAttachments() {
        if (typeof id === "string") {
          const working = await getWorkingReport();
          if (working?.reportId === id && (working.attachments?.length ?? 0) > 0) {
            setAttachmentNames(working.attachments.map((a) => a.name));
            return;
          }
          const stored = await getReportById(id);
          setAttachmentNames((stored?.attachments ?? []).map((a) => a.name));
          return;
        }

        const working = await getWorkingReport();
        const names =
          working && !working.reportId ? (working.attachments ?? []).map((a) => a.name) : [];
        setAttachmentNames(names);
      }

      loadAttachments();
    }, [id])
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
    >
      <Text style={{ color: colors.text, fontSize: 24, marginBottom: 16, ...poppins("700") }}>
        {t().legacy.preview}
      </Text>

      <View
        style={{
          backgroundColor: colors.surface,
          padding: 16,
          borderRadius: 14,
          marginBottom: 20,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 18, marginBottom: 10, ...poppins("600") }}>
          {title}
        </Text>

        <Text style={{ color: colors.text, marginBottom: 12, lineHeight: lh(24), ...poppins("400") }}>
          {body}
        </Text>

        {attachmentNames.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6, ...poppins("600") }}>
              {fmt(t().home.files, { count: attachmentNames.length })}
            </Text>
            {attachmentNames.map((name, index) => (
              <Text
                key={`${name}-${index}`}
                numberOfLines={2}
                style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4, ...poppins("400") }}
              >
                · {name}
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={{ color: colors.textMuted, fontSize: 12, ...poppins("600") }}>
          {fmt(t().legacy.status, {
            status:
              currentStatus === "ready"
                ? t().home.statusReady
                : currentStatus === "queued"
                  ? t().home.statusWaiting
                  : t().home.statusDraft,
          })}
        </Text>
      </View>

      <Pressable
        onPress={() => {
          router.push({
            pathname: "/report/upload",
            params: {
              ...(id ? { id } : {}),
              title,
              body,
              status: "draft",
            },
          });
        }}
        style={{
          backgroundColor: colors.surface,
          padding: 16,
          borderRadius: 14,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ color: colors.text, textAlign: "center", ...poppins("600") }}>
          {t().common.save}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          router.push({
            pathname: "/report/upload",
            params: {
              ...(id ? { id } : {}),
              title,
              body,
              status: "ready",
            },
          });
        }}
        style={{
          backgroundColor: colors.success,
          padding: 16,
          borderRadius: 14,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: colors.onAccent, textAlign: "center", ...poppins("600") }}>
          {t().legacy.makeReady}
        </Text>
      </Pressable>

      <Pressable
        onPress={async () => {
          const ok = await hasReporterProfileComplete();
          if (!ok) {
            Alert.alert(t().editor.nameNeededTitle, t().editor.nameNeededBody, [
              { text: t().common.cancel, style: "cancel" },
              { text: t().editor.addName, onPress: () => router.push("/reporter-profile") },
            ]);
            return;
          }
          router.push({
            pathname: "/report/upload",
            params: {
              ...(id ? { id } : {}),
              title,
              body,
              status: "queued",
            },
          });
        }}
        style={{
          backgroundColor: colors.warning,
          padding: 16,
          borderRadius: 14,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: colors.onAccent, textAlign: "center", ...poppins("600") }}>
          {t().legacy.addToWaiting}
        </Text>
      </Pressable>

      <Pressable
        onPress={() =>
          router.push({
            pathname: "/report/new",
            params: {
              ...(id ? { id } : {}),
              title,
              body,
              ...(status ? { status } : {}),
            },
          })
        }
        style={{
          padding: 16,
          borderRadius: 14,
        }}
      >
        <Text style={{ color: colors.textMuted, textAlign: "center", ...poppins("500") }}>
          {t().legacy.edit}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
