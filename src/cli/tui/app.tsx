import { Box } from "ink";

import { Header } from "./components/header";
import { InputBox } from "./components/input-box";
import { MessageHistory } from "./components/message-history";
import { StreamingIndicator } from "./components/streaming-indicator";
import { TodoPanel } from "./components/todo-panel";
import { useAgentLoop } from "./hooks/use-agent-loop";
import { getLatestTodos, getNextTodo } from "./todo-view";

function allDone(todos?: { status: string }[]) {
  return !!todos?.length && todos.every((t) => t.status === "completed" || t.status === "cancelled");
}

export function App() {
  const { streaming, messages, onSubmit, abort } = useAgentLoop();
  const latestTodos = getLatestTodos(messages);
  const nextTodo = getNextTodo(latestTodos)?.content;
  const hideTodos = !streaming && allDone(latestTodos);

  return (
    <Box flexDirection="column" rowGap={1} width="100%">
      <Header />
      <MessageHistory messages={messages} streaming={streaming} />
      <StreamingIndicator streaming={streaming} nextTodo={nextTodo} />
      {!hideTodos && <TodoPanel todos={latestTodos} />}
      <InputBox
        onSubmit={onSubmit}
        onAbort={abort}
      />
    </Box>
  );
}
