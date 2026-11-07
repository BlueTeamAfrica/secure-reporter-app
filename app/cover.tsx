import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, BackHandler, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { t, when } from "../src/i18n";
import { getVault } from "../src/lib/vault/expoStorage";
import {
  deleteCoverNote,
  newNoteId,
  openCoverNotes,
  saveCoverNote,
  type CoverNote,
} from "../src/state/coverNotes";
import { notifyUserInteraction } from "../src/state/session";
import { colors } from "../src/theme/colors";
import { font, lh } from "../src/theme/fonts";

const card = {
  backgroundColor: colors.surface,
  padding: 16,
  borderRadius: 14,
  marginBottom: 12,
  borderWidth: 1,
  borderColor: colors.border,
};

const field = {
  backgroundColor: colors.surface,
  color: colors.text,
  padding: 16,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: colors.border,
  ...font("400"),
};

type Draft = { id: string; title: string; body: string; isNew: boolean };

const SAVE_DELAY_MS = 600;

/**
 * Cover session: a plain notes app on the cover vault. Reached by the second code or by panic.
 * No settings, no language switch, no way back: leaving the cover means leaving the app (the
 * lock then asks for a code). One route; the editor is a state of this screen, because the
 * root layout keeps cover sessions on /cover.
 */
export default function CoverScreen() {
  const c = t().cover;
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState<CoverNote[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The screen renders first; the first-open samples are added right after (panic is not slowed).
  useEffect(() => {
    let cancelled = false;
    openCoverNotes(getVault(), c.samples)
      .then((list) => {
        if (!cancelled) setNotes(list);
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [c.samples]);

  const persist = useCallback(async (d: Draft | null) => {
    if (!d) return;
    if (d.isNew && !d.title.trim() && !d.body.trim()) return; // an empty new note is not kept
    try {
      const list = await saveCoverNote(getVault(), {
        id: d.id,
        title: d.title,
        body: d.body,
        updatedAt: new Date().toISOString(),
      });
      setNotes(list);
      if (draftRef.current?.id === d.id) draftRef.current = { ...draftRef.current, isNew: false };
      setDraft((prev) => (prev && prev.id === d.id ? { ...prev, isNew: false } : prev));
    } catch {
      // Locked meanwhile (background or inactivity): nothing to do.
    }
  }, []);

  const closeEditor = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const d = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    void persist(d);
  }, [persist]);

  useEffect(() => {
    if (!draft) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeEditor();
      return true;
    });
    return () => sub.remove();
  }, [draft, closeEditor]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      void persist(draftRef.current);
    },
    [persist],
  );

  function edit(change: Pick<Draft, "title"> | Pick<Draft, "body">) {
    if (!draftRef.current) return;
    const next = { ...draftRef.current, ...change };
    draftRef.current = next;
    setDraft(next);
    notifyUserInteraction();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(draftRef.current), SAVE_DELAY_MS);
  }

  function open(note: CoverNote | null) {
    const d: Draft = note
      ? { id: note.id, title: note.title, body: note.body, isNew: false }
      : { id: newNoteId(), title: "", body: "", isNew: true };
    draftRef.current = d;
    setDraft(d);
  }

  function confirmDelete() {
    const d = draftRef.current;
    if (!d) return;
    Alert.alert(c.deleteTitle, undefined, [
      { text: t().common.cancel, style: "cancel" },
      {
        text: c.delete,
        style: "destructive",
        onPress: async () => {
          if (timer.current) clearTimeout(timer.current);
          draftRef.current = null;
          setDraft(null);
          try {
            setNotes(await deleteCoverNote(getVault(), d.id));
          } catch {
            // ignore
          }
        },
      },
    ]);
  }

  const pad = { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24, paddingTop: insets.top + 16 };

  if (draft) {
    return (
      <ScrollView style={pad} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Pressable onPress={closeEditor} style={{ paddingVertical: 8, paddingEnd: 12 }}>
            <Text style={{ color: colors.accent, fontSize: 16, ...font("600") }}>{c.back}</Text>
          </Pressable>
          {!draft.isNew ? (
            <Pressable onPress={confirmDelete} style={{ paddingVertical: 8, paddingStart: 12 }}>
              <Text style={{ color: colors.error, fontSize: 15, ...font("600") }}>{c.delete}</Text>
            </Pressable>
          ) : null}
        </View>
        <TextInput
          value={draft.title}
          onChangeText={(title) => edit({ title })}
          placeholder={c.titlePlaceholder}
          placeholderTextColor={colors.textMuted}
          style={{ ...field, fontSize: 18, marginBottom: 12, ...font("600") }}
        />
        <TextInput
          value={draft.body}
          onChangeText={(body) => edit({ body })}
          placeholder={c.bodyPlaceholder}
          placeholderTextColor={colors.textMuted}
          multiline
          style={{ ...field, minHeight: 280, textAlignVertical: "top", lineHeight: lh(22) }}
        />
      </ScrollView>
    );
  }

  return (
    <View style={pad}>
      <Text style={{ color: colors.text, fontSize: 28, marginBottom: 20, ...font("700") }}>{c.title}</Text>

      <Pressable
        onPress={() => open(null)}
        style={{ backgroundColor: colors.accent, paddingVertical: 14, borderRadius: 12, marginBottom: 20 }}
      >
        <Text style={{ color: colors.onAccent, textAlign: "center", fontSize: 16, ...font("600") }}>{c.newNote}</Text>
      </Pressable>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {notes && notes.length === 0 ? (
          <Text style={{ color: colors.textMuted, ...font("400") }}>{c.empty}</Text>
        ) : null}
        {(notes ?? []).map((note) => (
          <Pressable key={note.id} style={card} onPress={() => open(note)}>
            <Text style={{ color: colors.text, fontSize: 16, marginBottom: 6, ...font("600") }} numberOfLines={1}>
              {note.title.trim() || c.untitled}
            </Text>
            {note.body.trim() ? (
              <Text
                style={{ color: colors.textMuted, marginBottom: 8, lineHeight: lh(22), ...font("400") }}
                numberOfLines={2}
              >
                {note.body}
              </Text>
            ) : null}
            <Text style={{ color: colors.textMuted, fontSize: 12, ...font("400") }}>{when(note.updatedAt)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
