import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { DraftAttachment } from "../../src/lib/attachments/types";
import { saveReport, updateReport, ReportStatus, getReportById } from "../../src/state/drafts";
import { clearWorkingReport, getWorkingReport } from "../../src/state/editorDraft";
import { colors } from "../../src/theme/colors";
import { poppins } from "../../src/theme/fonts";

export default function UploadScreen() {
  const { id, title, body, status } = useLocalSearchParams<{
    id?: string;
    title?: string;
    body?: string;
    status?: string;
  }>();

  const [error, setError] = useState("");

  useEffect(() => {
    async function run() {
      if (!title?.trim() || !body?.trim()) {
        router.replace("/home");
        return;
      }

      const nextStatus: ReportStatus =
        status === "ready" || status === "queued" || status === "draft"
          ? status
          : "draft";

      try {
        const working = await getWorkingReport();

        let attachments: DraftAttachment[] = [];
        if (typeof id === "string") {
          if (working?.reportId === id) {
            attachments = working.attachments ?? [];
          }
          if (!attachments.length) {
            const stored = await getReportById(id);
            attachments = stored?.attachments ?? [];
          }
        } else {
          attachments = !working?.reportId ? working?.attachments ?? [] : [];
        }

        if (id) {
          await updateReport(id, title, body, nextStatus, attachments);
        } else {
          await saveReport(title, body, nextStatus, attachments);
        }

        await clearWorkingReport();

        setTimeout(() => {
          router.replace({
            pathname: "/report/success",
            params: { status: nextStatus },
          });
        }, 800);
      } catch (err) {
        // Avoid logging raw errors which may include file paths or other sensitive data.
        console.error("Save failed");
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    }

    run();
  }, [id, title, body, status]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: colors.background,
        padding: 24,
      }}
    >
      {error ? (
        <Text
          style={{
            color: colors.error,
            textAlign: "center",
            lineHeight: 22,
            ...poppins("400"),
          }}
        >
          {error}
        </Text>
      ) : (
        <Text style={{ color: colors.textMuted, ...poppins("400") }}>Saving…</Text>
      )}
    </View>
  );
}
