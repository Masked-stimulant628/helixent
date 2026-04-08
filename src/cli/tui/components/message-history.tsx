import { Box, Text } from "ink";

import type { AssistantMessage, NonSystemMessage, ToolMessage, ToolUseContent, UserMessage } from "@/foundation";

import { currentTheme } from "../themes";
import {
  buildTodoSnapshots,
  buildToolUses,
  getCurrentTodo,
  getNextTodo,
  snapshotKey,
  type TodoItemView,
} from "../todo-view";

import { Markdown } from "./markdown";

export function MessageHistory({ messages }: { messages: NonSystemMessage[]; streaming: boolean }) {
  const todoSnapshots = buildTodoSnapshots(messages);
  const toolUses = buildToolUses(messages);

  return (
    <Box flexDirection="column" rowGap={1} overflowY="visible" width="100%">
      {messages.map((message, index) => {
        switch (message.role) {
          case "user":
            return <UserMessageItem key={index} message={message} />;
          case "assistant":
            return (
              <AssistantMessageItem
                key={index}
                message={message}
                todoSnapshots={todoSnapshots}
                messageIndex={index}
              />
            );
          case "tool":
            return <ToolMessageItem key={index} message={message} toolUses={toolUses} />;
          default:
            return null;
        }
      })}
    </Box>
  );
}

export function UserMessageItem({ message }: { message: UserMessage }) {
  return (
    <Box columnGap={1} width="100%" backgroundColor={currentTheme.colors.secondaryBackground}>
      <Text color="white" bold>
        ❯
      </Text>
      <Text color="white">
        {message.content.map((content) => (content.type === "text" ? content.text : "[image]")).join("\n")}
      </Text>
    </Box>
  );
}

export function AssistantMessageItem({
  message,
  todoSnapshots,
  messageIndex,
}: {
  message: AssistantMessage;
  todoSnapshots: Map<string, TodoItemView[]>;
  messageIndex: number;
}) {
  return (
    <Box flexDirection="column" width="100%">
      {message.content.map((content, i) => {
        switch (content.type) {
          case "text":
            if (content.text) {
              return (
                <Box key={i} columnGap={1}>
                  <Text color={currentTheme.colors.highlightedText}>⏺</Text>
                  <Box flexDirection="column">
                    <Markdown>{content.text}</Markdown>
                  </Box>
                </Box>
              );
            }
            return null;
          case "tool_use":
            return (
              <Box key={i} columnGap={1}>
                <Text color={currentTheme.colors.secondaryText}>⏺</Text>
                <Box flexDirection="column">
                  <ToolUseContentItem
                    content={content}
                    todos={todoSnapshots.get(snapshotKey(messageIndex, i))}
                  />
                </Box>
              </Box>
            );
          default:
            return null;
        }
      })}
    </Box>
  );
}

export function ToolUseContentItem({
  content,
  todos,
}: {
  content: ToolUseContent;
  todos?: TodoItemView[];
}) {
  switch (content.name) {
    case "bash":
      return (
        <Box flexDirection="column">
          <Text>{content.input.description as string}</Text>
          <Text color={currentTheme.colors.secondaryText}>└─ {content.input.command as string}</Text>
        </Box>
      );
    case "str_replace":
    case "read_file":
    case "write_file":
      return (
        <Box flexDirection="column">
          <Text>{content.input.description as string}</Text>
          <Text color={currentTheme.colors.secondaryText}>└─ {content.input.path as string}</Text>
        </Box>
      );
    case "todo_write": {
      const visibleTodos = todos;
      const currentTodo = getCurrentTodo(visibleTodos);
      const nextTodo = getNextTodo(visibleTodos);
      const summaryTodo = currentTodo ?? nextTodo;
      const completedCount = visibleTodos?.filter((todo) => todo.status === "completed").length ?? 0;
      const pendingCount = visibleTodos?.filter((todo) => todo.status === "pending").length ?? 0;

      return (
        <Box flexDirection="column">
          <Text>{summaryTodo ? `Working on: ${summaryTodo.content}` : "Todo list complete"}</Text>
          {(completedCount > 0 || pendingCount > 0) && (
            <Text color={currentTheme.colors.secondaryText}>
              └─ {completedCount} completed{pendingCount > 0 ? `, ${pendingCount} pending` : ""}
            </Text>
          )}
        </Box>
      );
    }
    default:
      return (
        <Box flexDirection="column">
          <Text>Tool call</Text>
          <Text color={currentTheme.colors.secondaryText}>└─ {content.name}</Text>
        </Box>
      );
  }
}

export function ToolMessageItem({
  message,
  toolUses,
}: {
  message: ToolMessage;
  toolUses: Map<string, ToolUseContent>;
}) {
  const visibleContent = message.content.flatMap((content) => {
    const toolUse = toolUses.get(content.tool_use_id);
    const rendered = summarizeToolResult(content.content, toolUse);
    return rendered ? [{ ...content, content: rendered }] : [];
  });
  if (visibleContent.length === 0) return null;

  return (
    <Box flexDirection="column" width="100%">
      {visibleContent.map((content, i) => (
        <Box key={i} columnGap={1}>
          <Text color={currentTheme.colors.secondaryText}>✓</Text>
          <Box flexDirection="column">
            <Text color={currentTheme.colors.secondaryText}>{content.content}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function summarizeToolResult(content: string, toolUse?: ToolUseContent) {
  if (!toolUse) return content;
  if (content.startsWith("Error:")) return content;

  switch (toolUse.name) {
    case "todo_write":
      return null;
    case "read_file":
      return null;
    case "bash":
      return null;
    case "write_file":
      return null;
    case "str_replace":
      return null;
    default:
      return content;
  }
}
