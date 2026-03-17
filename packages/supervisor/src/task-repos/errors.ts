import { Schema } from "effect";

import { TaskId } from "../tasks/ids";

export class TaskRepoNotFoundError extends Schema.ErrorClass<TaskRepoNotFoundError>(
  "TaskRepoNotFoundError",
)({
  _tag: Schema.tag("TaskRepoNotFoundError"),
  taskId: TaskId,
}) {
  message = `Task repo not found for task "${this.taskId}"`;
}

export class TaskRepoAlreadyExistsError extends Schema.ErrorClass<TaskRepoAlreadyExistsError>(
  "TaskRepoAlreadyExistsError",
)({
  _tag: Schema.tag("TaskRepoAlreadyExistsError"),
  taskId: TaskId,
}) {
  message = `Task repo already exists for task "${this.taskId}"`;
}

export class TaskRepoCreateError extends Schema.ErrorClass<TaskRepoCreateError>(
  "TaskRepoCreateError",
)({
  _tag: Schema.tag("TaskRepoCreateError"),
  taskId: TaskId,
  cause: Schema.Defect,
}) {
  message = `Failed to create task repo for task "${this.taskId}"`;
}

export class TaskRepoSyncError extends Schema.ErrorClass<TaskRepoSyncError>("TaskRepoSyncError")({
  _tag: Schema.tag("TaskRepoSyncError"),
  taskId: TaskId,
  cause: Schema.Defect,
}) {
  message = `Failed to sync task repo for task "${this.taskId}"`;
}
