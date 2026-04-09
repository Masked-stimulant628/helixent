import { exists, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import z from "zod";

import { defineTool } from "@/foundation";

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@$/;

type HunkLine = { type: "context" | "delete" | "add"; text: string };

type PatchFile = {
  oldPath: string;
  newPath: string;
  hunks: Array<{
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: HunkLine[];
  }>;
};

function parsePatch(patch: string): PatchFile[] {
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  const files: PatchFile[] = [];
  let current: PatchFile | null = null;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.startsWith("--- ")) {
      const next = lines[index + 1] ?? "";
      if (!next.startsWith("+++ ")) {
        throw new Error("Patch is missing +++ header after --- header.");
      }
      const rawOldPath = line.slice(4).trim();
      const rawNewPath = next.slice(4).trim();
      const oldPath = rawOldPath.replace(/^b\//, "").replace(/^a\//, "");
      const newPath = rawNewPath.replace(/^b\//, "").replace(/^a\//, "");
      current = { oldPath, newPath, hunks: [] };
      files.push(current);
      index += 2;
      continue;
    }

    const header = line.match(HUNK_HEADER);
    if (header) {
      if (!current) {
        throw new Error("Encountered hunk before file header.");
      }
      const hunk = {
        oldStart: Number(header[1]),
        oldCount: Number(header[2] ?? 1),
        newStart: Number(header[3]),
        newCount: Number(header[4] ?? 1),
        lines: [] as HunkLine[],
      };
      index += 1;
      while (index < lines.length) {
        const hunkLine = lines[index] ?? "";
        if (hunkLine.startsWith("@@ ") || hunkLine.startsWith("--- ")) {
          break;
        }
        if (hunkLine === "\\ No newline at end of file") {
          index += 1;
          continue;
        }
        const prefix = hunkLine[0];
        const text = hunkLine.slice(1);
        if (prefix === " ") {
          hunk.lines.push({ type: "context", text });
        } else if (prefix === "-") {
          hunk.lines.push({ type: "delete", text });
        } else if (prefix === "+") {
          hunk.lines.push({ type: "add", text });
        } else {
          throw new Error(`Unsupported hunk line: ${hunkLine}`);
        }
        index += 1;
      }
      current.hunks.push(hunk);
      continue;
    }

    index += 1;
  }

  if (files.length === 0) {
    throw new Error("Patch does not contain any file changes.");
  }
  return files;
}

function applyHunks(original: string, hunks: PatchFile["hunks"]) {
  const sourceLines = original === "" ? [] : original.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let sourceIndex = 0;

  for (const hunk of hunks) {
    const expectedIndex = hunk.oldStart - 1;
    while (sourceIndex < expectedIndex) {
      output.push(sourceLines[sourceIndex] ?? "");
      sourceIndex += 1;
    }

    for (const line of hunk.lines) {
      if (line.type === "context") {
        const actual = sourceLines[sourceIndex] ?? "";
        if (actual !== line.text) {
          throw new Error(`Context mismatch at line ${sourceIndex + 1}: expected ${JSON.stringify(line.text)}, got ${JSON.stringify(actual)}`);
        }
        output.push(actual);
        sourceIndex += 1;
      } else if (line.type === "delete") {
        const actual = sourceLines[sourceIndex] ?? "";
        if (actual !== line.text) {
          throw new Error(`Delete mismatch at line ${sourceIndex + 1}: expected ${JSON.stringify(line.text)}, got ${JSON.stringify(actual)}`);
        }
        sourceIndex += 1;
      } else {
        output.push(line.text);
      }
    }
  }

  while (sourceIndex < sourceLines.length) {
    output.push(sourceLines[sourceIndex] ?? "");
    sourceIndex += 1;
  }

  return output.join("\n");
}

export const applyPatchTool = defineTool({
  name: "apply_patch",
  description: "Apply a unified diff patch to one or more files using absolute paths in the patch headers. Note: File deletion is not supported (will fail if +++ /dev/null is used).",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to apply the patch. Always place `description` as the first parameter."),
    patch: z.string().describe("Unified diff patch content with --- and +++ headers. Must use absolute paths."),
  }),
  invoke: async ({ patch }) => {
    try {
      const files = parsePatch(patch);
      const changed: string[] = [];

      for (const file of files) {
        if (!file.newPath.startsWith("/")) {
          return { ok: false as const, error: `Patch paths must be absolute. Received: ${file.newPath}` };
        }
        if (file.newPath === "/dev/null") {
          return { ok: false as const, error: "File deletion (+++ /dev/null) is currently not supported by apply_patch." };
        }

        const target = Bun.file(file.newPath);
        const original = (await target.exists()) ? await target.text() : "";
        const updated = applyHunks(original, file.hunks);
        const parent = dirname(file.newPath);
        if (!(await exists(parent))) {
          await mkdir(parent, { recursive: true });
        }
        await target.write(updated);
        changed.push(file.newPath);
      }

      return { ok: true as const, changedFiles: changed, fileCount: changed.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false as const, error: message };
    }
  },
});
