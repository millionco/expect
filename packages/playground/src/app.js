import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
const STATUS_VARIANT = {
  done: "default",
  "in-progress": "secondary",
  todo: "outline",
};
export const App = () => {
  const [tasks, setTasks] = useState(TASKS);
  const [newTask, setNewTask] = useState("");
  const [counter, setCounter] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks((previous) => [
      ...previous,
      { id: Date.now(), title: newTask.trim(), status: "todo" },
    ]);
    setNewTask("");
  };
  const removeTask = (id) => {
    setTasks((previous) => previous.filter((task) => task.id !== id));
  };
  const startEditing = (id, title) => {
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
  const duplicateTask = (id) => {
    setTasks((previous) => {
      const task = previous.find((task) => task.id === id);
      if (!task) return previous;
      return [...previous, { ...task, id: Date.now() }];
    });
  };
  return _jsx("div", {
    className: "min-h-screen bg-background p-8",
    children: _jsxs("div", {
      className: "mx-auto max-w-2xl space-y-8",
      children: [
        _jsxs("div", {
          children: [
            _jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Playground" }),
            _jsx("p", {
              className: "text-muted-foreground mt-1",
              children: "A test surface for browser testing.",
            }),
          ],
        }),
        _jsxs(Card, {
          children: [
            _jsxs(CardHeader, {
              children: [
                _jsx(CardTitle, { children: "Counter" }),
                _jsx(CardDescription, { children: "Test basic interactions." }),
              ],
            }),
            _jsx(CardContent, {
              children: _jsxs("div", {
                className: "flex items-center gap-4",
                children: [
                  _jsx(Button, {
                    variant: "outline",
                    size: "sm",
                    onClick: () => setCounter((previous) => previous - 1),
                    children: "-",
                  }),
                  _jsx("span", {
                    className: "text-2xl font-semibold tabular-nums w-16 text-center",
                    "data-testid": "counter-value",
                    children: counter,
                  }),
                  _jsx(Button, {
                    variant: "outline",
                    size: "sm",
                    onClick: () => setCounter((previous) => previous + 1),
                    children: "+",
                  }),
                ],
              }),
            }),
            _jsx(CardFooter, {
              children: _jsx(Button, {
                variant: "ghost",
                size: "sm",
                onClick: () => setCounter(0),
                children: "Reset",
              }),
            }),
          ],
        }),
        _jsxs(Card, {
          children: [
            _jsxs(CardHeader, {
              children: [
                _jsx(CardTitle, { children: "Tasks" }),
                _jsx(CardDescription, { children: "Test list mutations and form inputs." }),
              ],
            }),
            _jsxs(CardContent, {
              className: "space-y-4",
              children: [
                _jsxs("div", {
                  className: "flex gap-2",
                  children: [
                    _jsx(Input, {
                      placeholder: "Add a task...",
                      value: newTask,
                      onChange: (event) => setNewTask(event.target.value),
                      onKeyDown: (event) => event.key === "Enter" && addTask(),
                    }),
                    _jsx(Button, { onClick: addTask, children: "Add" }),
                  ],
                }),
                _jsxs("ul", {
                  className: "space-y-2",
                  children: [
                    tasks.map((task) =>
                      _jsxs(
                        "li",
                        {
                          className:
                            "flex items-center justify-between rounded-lg border px-4 py-3",
                          children: [
                            _jsxs("div", {
                              className: "flex items-center gap-3",
                              children: [
                                editingId === task.id
                                  ? _jsx(Input, {
                                      className: "h-7 text-sm",
                                      value: editingTitle,
                                      onChange: (event) => setEditingTitle(event.target.value),
                                      onKeyDown: (event) => event.key === "Enter" && saveEdit(),
                                      onBlur: saveEdit,
                                      autoFocus: true,
                                    })
                                  : _jsx("span", { className: "text-sm", children: task.title }),
                                _jsx(Badge, {
                                  variant: STATUS_VARIANT[task.status],
                                  children: task.status,
                                }),
                              ],
                            }),
                            _jsxs("div", {
                              className: "flex gap-1",
                              children: [
                                editingId !== task.id &&
                                  _jsx(Button, {
                                    variant: "ghost",
                                    size: "sm",
                                    onClick: () => startEditing(task.id, task.title),
                                    children: "Rename",
                                  }),
                                _jsx(Button, {
                                  variant: "ghost",
                                  size: "sm",
                                  onClick: () => duplicateTask(task.id),
                                  children: "Duplicate",
                                }),
                                _jsx(Button, {
                                  variant: "ghost",
                                  size: "sm",
                                  onClick: () => removeTask(task.id),
                                  children: "Remove",
                                }),
                              ],
                            }),
                          ],
                        },
                        task.id,
                      ),
                    ),
                    tasks.length === 0 &&
                      _jsx("li", {
                        className: "text-sm text-muted-foreground text-center py-4",
                        children: "No tasks yet.",
                      }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  });
};
