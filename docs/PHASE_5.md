# Phase 5: Task Management

Phase 5 adds project-scoped task management to the existing TaskFlow application. Tasks are stored in MongoDB and task screens use the authenticated API while retaining the existing frontend design. Dashboard summary values and AI screens remain demonstration UI; they are not backed by task analytics or AI services.

## Task fields

- Title, description, project, creator, optional assignee, priority, status, optional due date, and subtasks.
- Priorities: Low, Medium, High.
- Statuses: To Do, In Progress, Completed.
- Subtasks have a title and completion state.

## API

All endpoints require a valid authenticated session cookie.

- `GET /api/tasks`: list visible tasks; supports `q`, `status`, `priority`, `project`, and `assignee` filters. Use `assignee=unassigned` for tasks without an assignee.
- `POST /api/tasks`: create a task in a project.
- `GET /api/tasks/:id`: view a task.
- `PATCH /api/tasks/:id`: update task fields, including moving it between projects when the caller can manage both projects.
- `DELETE /api/tasks/:id`: delete a task.
- `POST /api/tasks/:id/subtasks`: add a subtask.
- `PATCH /api/tasks/:id/subtasks/:subtaskId`: update a subtask.
- `DELETE /api/tasks/:id/subtasks/:subtaskId`: remove a subtask.

Project owners, Admins, and Project Managers who are project members can manage tasks. Project members can view project tasks. Assignees can update task status and mark subtasks complete; they cannot edit task content or manage subtask structure. Assignees must be the project owner or a current project member. Removing a project member clears their assignment from that project's tasks, and deleting a project removes its tasks.

## Included UI

The Tasks page supports search and status, priority, project, and assignee filters. Task Details supports status changes, subtasks, and permitted edit/delete actions. Project Details lists project tasks and provides task creation to users with project management access. Forms use the project API to offer project participants as assignee choices.

## Verification

Run the backend integration suite against a disposable MongoDB database whose name includes `test`:

```powershell
$env:TASKFLOW_TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017/taskflow_phase5_test'
npm test
```
