/**
 * Back in the notes app (M2). Never "go back": the screen under /cover in the stack can be a
 * real screen. In a note, close it; on the list, leave the app. Pure.
 */
export function coverBackAction(noteOpen: boolean): "closeNote" | "leaveApp" {
  return noteOpen ? "closeNote" : "leaveApp";
}
