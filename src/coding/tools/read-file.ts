import z from "zod";

import { defineTool } from "@/foundation";

import { ensureAbsolutePath, truncateText } from "./tool-utils";

const DEFAULT_MAX_CHARS = 12000;

export const readFileTool = defineTool({
  name: "read_file",
  description: "Read a file from an absolute path. Supports optional line-range reads for large files.",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to read the file. Always place `description` as the first parameter."),
    path: z.string().describe("The absolute path to the file to read."),
    startLine: z.number().int().positive().describe("1-based starting line to read.").optional(),
    endLine: z.number().int().positive().describe("1-based ending line to read, inclusive.").optional(),
    maxChars: z.number().int().positive().describe("Maximum characters to return from the selected range.").optional(),
  }),
  invoke: async ({ path, startLine, endLine, maxChars }) => {
    const absolute = ensureAbsolutePath(path);
    if (!absolute.ok) {
      return `Error: ${absolute.error}`;
    }

    if (startLine !== undefined && endLine !== undefined && startLine > endLine) {
      return "Error: startLine must be less than or equal to endLine.";
    }

    const file = Bun.file(path);
    if (!(await file.exists())) {
      return `Error: File ${path} does not exist.`;
    }

    const text = await file.text();
    const lines = text.split("\n");
    const start = startLine ? startLine - 1 : 0;
    const end = endLine ? Math.min(endLine, lines.length) : lines.length;

    if (start < 0 || start >= lines.length) {
      return `Error: startLine ${startLine} is out of range for file ${path}.`;
    }

    const selected = lines.slice(start, end);
    const numbered = selected.map((line, index) => `${start + index + 1}: ${line}`).join("\n");
    const limited = truncateText(numbered, maxChars ?? DEFAULT_MAX_CHARS);

    // If reading the whole file without truncation, return raw text (no line numbers)
    // This allows easier parsing or regex matching for the agent.
    if (!startLine && !endLine && !limited.truncated) {
      return text;
    }

    const rangeLabel = `${start + 1}-${start + selected.length}`;
    const suffix = limited.truncated ? "\n\n[read_file output truncated]" : "";
    return `File: ${path}\nLines: ${rangeLabel} of ${lines.length}\n\n${limited.text}${suffix}`;
  },
});
