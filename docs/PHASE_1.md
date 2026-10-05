# TaskFlow — Phase 1: Planning & Project Setup

## Project definition

TaskFlow is a planned web-based project and task management system. It is intended to help teams organize projects, assign and track tasks, and use AI assistance for task planning. This phase defines the project and establishes its initial repository structure; it does not implement application functionality.

## Objectives

- Give users a clear place to organize projects and their tasks.
- Support task assignment, prioritization, deadlines, and progress tracking.
- Provide a foundation for collaboration between project members.
- Plan AI assistance that helps users create and break down tasks.
- Build the application in small, documented development phases.

## User roles

- **Administrator:** manages the workspace and its users, projects, and settings.
- **Project manager:** creates and manages projects, organizes work, and assigns tasks.
- **Team member:** views assigned work, updates task progress, and collaborates with the project team.

Role permissions will be defined in a later implementation phase.

## Core features

- User accounts and sign-in.
- Project creation and project membership.
- Task creation, assignment, status, priority, and due dates.
- Project and task views for organizing work and tracking progress.
- Collaboration through task comments and activity history.

These are planned features, not implemented functionality.

## AI features

- **AI Task Suggestions:** suggest useful tasks from a project goal or description.
- **AI Task Breakdown:** turn a large task into smaller, actionable subtasks.

AI functionality is planned for a later phase. No AI API or model integration is included in Phase 1.

## Technology stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js with Express.js
- **Database:** MongoDB
- **Authentication:** JWT (JSON Web Tokens)
- **Version control and hosting:** Git and GitHub

This section records the selected stack; no application dependencies or services are set up in this phase.

## Basic workflow

1. A user signs in and opens a workspace.
2. A project manager creates a project and adds members.
3. Project work is represented by tasks with owners, priorities, statuses, and due dates.
4. Team members update tasks and collaborate as work progresses.
5. Project managers review task and project progress.
6. In a later phase, users may request AI task suggestions or a breakdown of a selected task.

## Initial database entities

- **User:** name, email, password hash, role, and timestamps.
- **Project:** name, description, owner, members, status, and timestamps.
- **Task:** project, title, description, assignee, creator, status, priority, due date, and timestamps.
- **Comment:** task, author, body, and creation time.
- **Activity:** project or task reference, actor, action details, and creation time.

These are initial planning entities. Their schemas, relationships, validation, and storage are for a later phase.

## Development phases

1. **Planning & Project Setup:** define scope, select the stack, and establish repository structure and documentation.
2. **Backend Foundation:** plan and implement the server structure and initial data model.
3. **Authentication & Roles:** add account flows, JWT authentication, and role permissions.
4. **Projects & Tasks:** implement project and task management workflows.
5. **Frontend:** build the user interface and connect it to the application backend.
6. **AI Assistance:** add AI Task Suggestions and AI Task Breakdown.
7. **Quality & Release Preparation:** review, validate, document, and prepare the application for deployment.

Only Phase 1 planning and repository setup are in scope now.
