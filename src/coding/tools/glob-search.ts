import z from "zod";

import { defineTool } from "@/foundation";

import { ensureDirectoryPath, truncateText } from "./tool-utils";

const DEFAULT_LIMIT = 200;
const DEFAULT_MAX_CHARS = 12000;

export const globSearchTool = defineTool({
  name: "glob_search",
  description: "Find files matching a glob pattern under an absolute directory.",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to find files. Always place `description` as the first parameter."),
    path: z.string().describe("The absolute directory path to search within."),
    pattern: z.string().describe("Glob pattern, for example **/*.ts or src/**/*.tsx."),
    limit: z.number().int().positive().describe("Maximum number of matches to return.").optional(),
    maxChars: z.number().int().positive().describe("Maximum characters to return.").optional(),
  }),
  invoke: async ({ path, pattern, limit, maxChars }) => {
    const dirCheck = await ensureDirectoryPath(path);
    if (!dirCheck.ok) {
      return `Error: ${dirCheck.error}`;
    }

    const matches: string[] = [];
    try {
      const globber = new Bun.Glob(pattern);
      for await (const entry of globber.scan({ cwd: path, absolute: true })) {
        matches.push(entry);
        if (matches.length >= (limit ?? DEFAULT_LIMIT)) {
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: glob_search failed - ${message}`;
    }

    if (matches.length === 0) {
      return `No files matched pattern ${pattern} under ${path}.`;
    }

    const limited = truncateText(matches.join("\n"), maxChars ?? DEFAULT_MAX_CHARS);
    return `Glob root: ${path}\nPattern: ${pattern}\nMatches: ${matches.length}\n\n${limited.text}`;
  },
});
