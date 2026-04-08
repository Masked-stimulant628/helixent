import { join } from "path";

import { Agent } from "@/agent";
import { createSkillsMiddleware } from "@/agent/skills/skills-middleware";
import { createTodoSystem } from "@/agent/todos/todos";
import type { Model, NonSystemMessage } from "@/foundation";

import { bashTool } from "../tools/bash";
import { readFileTool } from "../tools/read-file";
import { strReplaceTool } from "../tools/str-replace";
import { writeFileTool } from "../tools/write-file";

export async function createCodingAgent({
  model,
  cwd = process.cwd(),
  skillsDirs = [join(process.cwd(), "skills")],
}: {
  model: Model;
  cwd?: string;
  skillsDirs?: string[];
}) {
  const agentsFile = Bun.file(`${cwd}/AGENTS.md`);
  const messages: NonSystemMessage[] = [];
  if (await agentsFile.exists()) {
    const agentsFileContent = await agentsFile.text();
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: "> The `AGENTS.md` file has been automatically loaded. Here is the content:\n\n" + agentsFileContent,
        },
      ],
    });
  }
  const { tool: todoTool, middleware: todoMiddleware } = createTodoSystem();

  return new Agent({
    model,
    prompt: `<agent name="Helixent" role="leading_agent" description="A coding agent">
Use the given tools and skills to perform parallel/sequential operations and solve the user's problem in the given working directory.
</agent>

<working_directory dir="${cwd}/" />

<notes>
- Never try to start a local static server. Let the user do it.
- If the user's input is a simple task or a greeting, you should just respond with a simple answer and then stop.
</notes>
`,
    messages,
    tools: [bashTool, readFileTool, writeFileTool, strReplaceTool, todoTool],
    middlewares: [createSkillsMiddleware(skillsDirs), todoMiddleware],
  });
}
