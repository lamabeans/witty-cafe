"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

export default function TasksList() {
  const tasks = useQuery(api.tasks.get) as Doc<"tasks">[] | undefined;

  if (!tasks) {
    return (
      <div className="mt-8 text-sm text-zinc-500">Loading tasks...</div>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">
        Tasks
      </h2>
      <ul className="mt-4 space-y-3">
        {tasks.map((task) => (
          <li
            key={task._id}
            className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700"
          >
            <span>{task.text}</span>
            <span className="text-xs text-zinc-400">
              {task.isCompleted ? "Done" : "Todo"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
