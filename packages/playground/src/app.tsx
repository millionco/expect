import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const TASKS = [
  { id: 1, title: "Set up CI pipeline", status: "done" },
  { id: 2, title: "Write integration tests", status: "in-progress" },
  { id: 3, title: "Fix login redirect bug", status: "todo" },
  { id: 4, title: "Update dependencies", status: "todo" },
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  done: "default",
  "in-progress": "secondary",
  todo: "outline",
};

export const App = () => {
  const [tasks, setTasks] = useState(TASKS);
  const [newTask, setNewTask] = useState("");
  const [counter, setCounter] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks((previous) => [
      ...previous,
      { id: Date.now(), title: newTask.trim(), status: "todo" },
    ]);
    setNewTask("");
  };

  const removeTask = (id: number) => {
    setTasks((previous) => previous.filter((task) => task.id !== id));
  };

  const startEditing = (id: number, title: string) => {
    setEditingId(id);
    setEditingTitle(title);
  };

  const saveEdit = () => {
    if (editingId === null) return;
    setTasks((previous) =>
      previous.map((task) =>
        task.id === editingId ? { ...task, title: editingTitle.trim() || task.title } : task,
      ),
    );
    setEditingId(null);
    setEditingTitle("");
  };

  const duplicateTask = (id: number) => {
    setTasks((previous) => {
      const task = previous.find((task) => task.id === id);
      if (!task) return previous;
      return [...previous, { ...task, id: Date.now() }];
    });
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Playground</h1>
          <p className="text-muted-foreground mt-1">A test surface for browser testing.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Counter</CardTitle>
            <CardDescription>Test basic interactions.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCounter((previous) => previous - 1)}
              >
                -
              </Button>
              <span
                className="text-2xl font-semibold tabular-nums w-16 text-center"
                data-testid="counter-value"
              >
                {counter}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCounter((previous) => previous + 1)}
              >
                +
              </Button>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" size="sm" onClick={() => setCounter(0)}>
              Reset
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
            <CardDescription>Test list mutations and form inputs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Add a task..."
                value={newTask}
                onChange={(event) => setNewTask(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && addTask()}
              />
              <Button onClick={addTask}>Add</Button>
            </div>
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    {editingId === task.id ? (
                      <Input
                        className="h-7 text-sm"
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onKeyDown={(event) => event.key === "Enter" && saveEdit()}
                        onBlur={saveEdit}
                        autoFocus
                      />
                    ) : (
                      <span className="text-sm">{task.title}</span>
                    )}
                    <Badge variant={STATUS_VARIANT[task.status]}>{task.status}</Badge>
                  </div>
                  <div className="flex gap-1">
                    {editingId !== task.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditing(task.id, task.title)}
                      >
                        Rename
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => duplicateTask(task.id)}>
                      Duplicate
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeTask(task.id)}>
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
              {tasks.length === 0 && (
                <li className="text-sm text-muted-foreground text-center py-4">No tasks yet.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
