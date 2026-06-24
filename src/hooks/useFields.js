import { useMemo } from "react";
import { useWorkspace } from "./useWorkspace.js";

/* ═══ User-built semantic fields (الحقول الدلالية) ═══
 *
 * A reader assembles a thematic set of ROOTS by hand (light/darkness, covenant, water…)
 * and the app aggregates the corpus over the whole set.
 *
 * Fields now live INSIDE the workspace (qg.workspace) alongside saved items, notes, tags
 * and claims — so they're a first-class research artifact that can be grouped and travels
 * in the one workspace export. This hook is a thin adapter that preserves the original API
 * for the existing consumers (Corpus Explorer, Pairing matrix, Root lab). The legacy
 * standalone `qg.fields` store is migrated into the workspace once on load (see useWorkspace).
 */
export function useFields() {
  const ws = useWorkspace();
  return useMemo(() => ({
    fields: ws.fields,
    create: ws.addField,
    remove: ws.removeField,
    rename: ws.renameField,
    addRoot: ws.addFieldRoot,
    removeRoot: ws.removeFieldRoot,
    exportData: () => ({ note: "User-built semantic fields (root sets).", fields: ws.fields }),
    importData: () => {}, // fields import via the workspace JSON now
  }), [ws]);
}
