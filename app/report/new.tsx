import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import {
  clearRuntimeWorkingReportSnapshot,
  clearWorkingReport,
  getWorkingReport,
  saveWorkingReport,
  setRuntimeWorkingReportSnapshot,
} from "../../src/state/editorDraft";
import { ReportStatus, getReportById, saveReport, updateReport } from "../../src/state/drafts";
import { pickAttachments } from "../../src/lib/attachments/picker";
import { importPickedFileToSandbox, deleteLocalAttachmentFile } from "../../src/lib/attachments/persistLocal";
import type { DraftAttachment } from "../../src/lib/attachments/types";
import { notifyUserInteraction } from "../../src/state/session";
import { colors } from "../../src/theme/colors";
import { poppins } from "../../src/theme/fonts";

function newAttachmentId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

function isImageMime(mime: string) {
  return mime.startsWith("image/");
}

export default function NewReportScreen() {
  const { id, title: initialTitle, body: initialBody, status, resume } = useLocalSearchParams<{
    id?: string;
    title?: string;
    body?: string;
    status?: string;
    resume?: string;
  }>();

  const [reportId, setReportId] = useState<string | null>(typeof id === "string" ? id : null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [workflowStatus, setWorkflowStatus] = useState<ReportStatus>(() => {
    return status === "ready" || status === "queued" || status === "draft" ? status : "draft";
  });
  const [hydrated, setHydrated] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState<null | "save" | "ready" | "queued">(null);
  const [saveBanner, setSaveBanner] = useState("");
  const initializedRef = useRef(false);
  const lastActivityPingRef = useRef(0);

  useEffect(() => {
    async function hydrate() {
      if (initializedRef.current) return;
      initializedRef.current = true;

      // Only restore the autosave buffer when the user explicitly opted-in (from Home).
      if (resume === "1") {
        const working = await getWorkingReport();
        if (
          working &&
          ((!id && !working.reportId) || (typeof id === "string" && working.reportId === id))
        ) {
          setTitle(working.title);
          setBody(working.body);
          setAttachments(working.attachments ?? []);
          setHydrated(true);
          return;
        }
      }

      if (typeof id === "string") {
        const stored = await getReportById(id);
        if (stored) {
          setTitle(stored.title);
          setBody(stored.body);
          setAttachments(stored.attachments ?? []);
          setWorkflowStatus(stored.status);
          setReportId(stored.id);
          setHydrated(true);
          return;
        }
      }

      if (typeof initialTitle === "string") {
        setTitle(initialTitle);
      }

      if (typeof initialBody === "string") {
        setBody(initialBody);
      }

      setHydrated(true);
    }

    hydrate();
  }, [id, initialTitle, initialBody, resume]);

  useEffect(() => {
    if (!hydrated) return;

    setRuntimeWorkingReportSnapshot({
      reportId: reportId ?? undefined,
      title,
      body,
      attachments,
    });

    const timer = setTimeout(() => {
      if (!title.trim() && !body.trim() && attachments.length === 0) return;
      if (saving) return;

      saveWorkingReport({
        reportId: reportId ?? undefined,
        title,
        body,
        attachments,
      }).catch(() => {});
    }, 1500);

    return () => clearTimeout(timer);
  }, [reportId, title, body, attachments, hydrated, saving]);

  useEffect(() => {
    return () => {
      clearRuntimeWorkingReportSnapshot();
    };
  }, []);

  const fieldStyle = {
    backgroundColor: colors.surface,
    color: colors.text,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...poppins("400"),
  };

  const onAddAttachment = useCallback(async () => {
    if (picking) return;
    setPicking(true);
    try {
      const picked = await pickAttachments();
      if (!picked.length) return;

      const next: DraftAttachment[] = [];
      for (const file of picked) {
        const attachmentId = newAttachmentId();
        try {
          const localUri = await importPickedFileToSandbox({
            sourceUri: file.uri,
            attachmentId,
            displayName: file.name,
          });
          next.push({
            id: attachmentId,
            name: file.name,
            mimeType: file.mimeType,
            size: file.size,
            localUri,
            status: "local",
            createdAt: new Date().toISOString(),
          });
        } catch {
          // Avoid logging file names/paths or platform error objects (may contain URIs).
          console.warn("[ATTACHMENT] import failed");
        }
      }

      if (!next.length) {
        Alert.alert("Attachments", "Could not import the selected file(s).");
        return;
      }

      setAttachments((prev) => [...prev, ...next]);
    } finally {
      setPicking(false);
    }
  }, [picking]);

  const onRemoveAttachment = useCallback(async (attachmentId: string) => {
    const target = attachments.find((a) => a.id === attachmentId);
    if (target) {
      await deleteLocalAttachmentFile(target.localUri);
    }
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  }, [attachments]);

  const persist = useCallback(
    async (nextStatus: ReportStatus) => {
      const hasAny =
        !!title.trim() || !!body.trim() || (attachments?.length ?? 0) > 0;

      // Draft can be saved even if it's "text-only" (no attachments) and title can be empty.
      // But don't create empty records.
      if (!hasAny) return null;

      // Safety: prevent "ready/queued" with empty body (text submission requires body).
      if ((nextStatus === "ready" || nextStatus === "queued") && !body.trim()) {
        return null;
      }

      if (reportId) {
        const updated = await updateReport(reportId, title, body, nextStatus, attachments);
        if (updated?.id) setReportId(updated.id);
        return updated;
      }

      const created = await saveReport(title, body, nextStatus, attachments);
      setReportId(created.id);
      return created;
    },
    [attachments, body, reportId, title]
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ color: colors.text, fontSize: 24, marginBottom: 16, ...poppins("700") }}>
        {id ? "Edit Note" : "New Note"}
      </Text>

      <TextInput
        value={title}
        onChangeText={(t) => {
          const now = Date.now();
          if (now - lastActivityPingRef.current > 500) {
            lastActivityPingRef.current = now;
            notifyUserInteraction();
          }
          setTitle(t);
        }}
        placeholder="Title"
        placeholderTextColor={colors.textMuted}
        style={{
          ...fieldStyle,
          marginBottom: 16,
        }}
      />

      <TextInput
        value={body}
        onChangeText={(t) => {
          const now = Date.now();
          if (now - lastActivityPingRef.current > 500) {
            lastActivityPingRef.current = now;
            notifyUserInteraction();
          }
          setBody(t);
        }}
        placeholder="Write something..."
        placeholderTextColor={colors.textMuted}
        multiline
        style={{
          ...fieldStyle,
          minHeight: 220,
          textAlignVertical: "top",
          marginBottom: 16,
        }}
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <Text style={{ color: colors.textMuted, fontSize: 13, ...poppins("600") }}>
          Attachments
        </Text>
        <Pressable
          onPress={onAddAttachment}
          disabled={picking}
          style={{
            backgroundColor: colors.surface,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: picking ? 0.6 : 1,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 13, ...poppins("600") }}>
            {picking ? "Opening…" : "Add attachment"}
          </Text>
        </Pressable>
      </View>

      {attachments.length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 20, ...poppins("400") }}>
          No files attached.
        </Text>
      ) : (
        <View style={{ marginBottom: 20 }}>
          {attachments.map((item) => (
            <View
              key={item.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.surface,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 10,
                marginBottom: 8,
              }}
            >
              {isImageMime(item.mimeType) ? (
                <Image
                  source={{ uri: item.localUri }}
                  style={{ width: 40, height: 40, borderRadius: 8, marginRight: 10 }}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    marginRight: 10,
                    backgroundColor: colors.background,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 11, ...poppins("600") }}>FILE</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={2}
                  style={{ color: colors.text, fontSize: 14, ...poppins("500") }}
                >
                  {item.name}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2, ...poppins("400") }}>
                  {item.mimeType}
                  {item.size > 0 ? ` · ${Math.max(1, Math.round(item.size / 1024))} KB` : ""}
                </Text>
              </View>
              <Pressable
                onPress={() => onRemoveAttachment(item.id)}
                style={{ padding: 8 }}
              >
                <Text style={{ color: colors.error, fontSize: 13, ...poppins("600") }}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {saveBanner ? (
        <Text style={{ color: colors.textMuted, marginBottom: 10, ...poppins("400") }}>
          {saveBanner}
        </Text>
      ) : (
        <View style={{ height: 10 }} />
      )}

      <Pressable
        onPress={async () => {
          if (saving) return;
          setSaving("save");
          try {
            const result = await persist("draft");
            if (!result) return;
            setWorkflowStatus("draft");
            await clearWorkingReport().catch(() => {});
            clearRuntimeWorkingReportSnapshot();
            router.replace("/home");
          } catch {
            setSaveBanner("Save failed");
            setTimeout(() => setSaveBanner(""), 1400);
          } finally {
            setSaving(null);
          }
        }}
        style={{
          backgroundColor: colors.accent,
          padding: 16,
          borderRadius: 14,
          marginBottom: 10,
          opacity: saving ? 0.7 : 1,
        }}
      >
        <Text style={{ color: colors.onAccent, textAlign: "center", ...poppins("600") }}>
          {saving === "save" ? "Saving…" : "Save"}
        </Text>
      </Pressable>

      <Pressable
        onPress={async () => {
          if (saving) return;
          setSaving("ready");
          try {
            const result = await persist("ready");
            if (!result) return;
            setWorkflowStatus("ready");
            await clearWorkingReport().catch(() => {});
            clearRuntimeWorkingReportSnapshot();
            router.replace("/home");
          } catch {
            setSaveBanner("Could not mark ready");
            setTimeout(() => setSaveBanner(""), 1400);
          } finally {
            setSaving(null);
          }
        }}
        style={{
          backgroundColor: colors.surface,
          padding: 16,
          borderRadius: 14,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: colors.border,
          opacity: saving ? 0.7 : 1,
        }}
      >
        <Text style={{ color: colors.text, textAlign: "center", ...poppins("600") }}>
          {saving === "ready" ? "Updating…" : "Make ready"}
        </Text>
      </Pressable>

      <Pressable
        onPress={async () => {
          if (saving) return;
          setSaving("queued");
          try {
            const result = await persist("queued");
            if (!result) return;
            setWorkflowStatus("queued");
            await clearWorkingReport().catch(() => {});
            clearRuntimeWorkingReportSnapshot();
            router.replace("/home");
          } catch {
            setSaveBanner("Could not add to pending");
            setTimeout(() => setSaveBanner(""), 1400);
          } finally {
            setSaving(null);
          }
        }}
        style={{
          backgroundColor: workflowStatus === "queued" ? colors.accentSoft : colors.warning,
          padding: 16,
          borderRadius: 14,
          opacity: saving ? 0.7 : 1,
        }}
      >
        <Text
          style={{
            color: workflowStatus === "queued" ? colors.textMuted : colors.onAccent,
            textAlign: "center",
            ...poppins("600"),
          }}
        >
          {saving === "queued" ? "Adding…" : "Add to pending"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
