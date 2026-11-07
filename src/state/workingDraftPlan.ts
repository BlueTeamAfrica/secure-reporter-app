/** Pure rule shared by autosave and save-on-exit: an empty editor never creates a saved item. */
export function isEmptyWorkingDraft(d: { title: string; body: string; attachments: readonly unknown[] }): boolean {
  return !d.title.trim() && !d.body.trim() && d.attachments.length === 0;
}
