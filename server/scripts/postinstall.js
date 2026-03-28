/**
 * node-pty pe macOS uneori livrează spawn-helper fără bit executabil.
 * Pe Windows/Linux acest path nu se folosește la fel — nu facem nimic.
 */
const fs = require("fs");
const path = require("path");

if (process.platform === "win32") {
  process.exit(0);
}

const helper = path.join(
  __dirname,
  "..",
  "node_modules",
  "node-pty",
  "prebuilds",
  "darwin-arm64",
  "spawn-helper",
);

try {
  if (fs.existsSync(helper)) {
    fs.chmodSync(helper, 0o755);
  }
} catch {
  /* ignore */
}
