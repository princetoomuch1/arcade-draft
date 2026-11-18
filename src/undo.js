/* A global undo stack. Twenty actions, in memory only.
 *
 * Deliberately not persisted: an undo you can still use tomorrow is a promise this app cannot keep,
 * because the thing it would undo may have been swept, archived or edited in between. It lasts as
 * long as the session, and the toast says six seconds because that is when the offer is loudest,
 * not when it stops working.
 */

const MAX = 20;
/** @type {{label: string, undo: () => Promise<void>|void, at: number}[]} */
const stack = [];

/** Record something undoable. `undo` must put the world back exactly as it was. */
export function record(label, undo) {
  stack.push({ label, undo, at: Date.now() });
  while (stack.length > MAX) stack.shift();
  return label;
}

export const canUndo = () => stack.length > 0;
export const peek = () => (stack.length ? stack[stack.length - 1].label : null);
export const depth = () => stack.length;
export const clear = () => { stack.length = 0; };

/** Undo the most recent action. Returns its label, or null when there is nothing to undo. */
export async function undoLast() {
  const top = stack.pop();
  if (!top) return null;
  await top.undo();
  return top.label;
}
