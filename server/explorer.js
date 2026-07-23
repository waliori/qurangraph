/* ═══ Serving the explorer ═══
 *
 * The page lives as three real files in server/explorer/ (HTML, CSS, JS) rather than as
 * a template literal, so it stays editable — syntax highlighting, no escaping puzzles.
 * They are stitched into one self-contained document here: a single request, no extra
 * routes, no external hosts. The strict-CSP-friendly result is a page that works offline
 * and on an air-gapped deployment.
 *
 * Read once at boot in production; re-read per request when API_LOG is on, so editing the
 * CSS during development only needs a refresh.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "explorer");

let cached = null;

export function explorerHtml() {
  if (cached && !config.logRequests) return cached;
  const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(DIR, "explorer.css"), "utf8");
  const js = fs.readFileSync(path.join(DIR, "explorer.js"), "utf8");
  // The scripts are inlined, so a literal </script> anywhere in them would end the block
  // early. Neither file contains one today; splitting the sequence keeps that true even
  // if one is added later.
  const safe = (s) => s.replace(/<\/script>/gi, "<\\/script>");
  cached = html.replace("/*__CSS__*/", () => css).replace("/*__JS__*/", () => safe(js));
  return cached;
}
