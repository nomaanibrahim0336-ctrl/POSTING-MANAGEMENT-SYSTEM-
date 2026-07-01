# SMM Management Dashboard — UI/Design Reference Spec

> Purpose: This document describes the **current structure, layout, sections, boxes,
> and components** of every page in the dashboard, exactly as they exist today.
> Use this as the blueprint for a visual redesign — colors, fonts, spacing, icons,
> and styling can be improved, but **do not remove, rename, reorder, or restructure
> any section, box, button, field, or ID** listed here. All functionality is wired
> to these exact element IDs and class hooks via `assets/js/app.js` and the
> per-page `<script>` blocks — changing structure breaks the JS.

---

## 1. Global Layout (applies to every page)

- **Sidebar** (`#sidebar`): fixed, full-height, left side, width `w-64` (256px),
  dark background (`bg-gray-900`), right border. Populated dynamically by
  `assets/js/app.js` (renders nav links based on logged-in user's role).
- **Main content wrapper**: `ml-64` (offset for sidebar), `min-h-screen`,
  `flex flex-col`.
- **Header bar** (`<header>`): sticky top, `bg-gray-950/80` with backdrop blur,
  bottom border, `px-8 py-4`, flex row with page title + subtitle on the left,
  and page-specific action buttons on the right.
- **Main body** (`<main>`): `flex-1 px-8 py-6`, vertical spacing between sections
  (`space-y-6`).
- **Color theme**: dark mode — `bg-gray-950` page background, `bg-gray-900`
  cards/panels, `border-gray-800` borders, white/gray text hierarchy, accent
  colors per status (indigo = primary/admin, green = success/team lead,
  blue = executive, pink = designer, yellow = client management/intake,
  orange/red = warnings/overdue).
- **Common card style**: `bg-gray-900 border border-gray-800 rounded-xl p-5`
  (or `p-6` for larger panels).
- **Common button styles**: `.btn-primary` (filled accent), `.btn-secondary`
  (outlined/gray) — defined in `assets/css/style.css`.
- **Common badge style**: `.status-badge` — small pill with colored
  background/border/text per status or role.
- **Modals**: `.modal-overlay` (full-screen dim backdrop, click-outside-to-close)
  containing `.modal-box` (centered card, header with title + close `x`,
  scrollable body `p-6`, footer with Cancel/Save buttons).
- **Toasts**: bottom-right floating notification (`showToast()`), green for
  success, auto-dismiss after 3s.
- **Sync behavior**: every page calls `syncFromAPI()` on load and listens for
  the `smm:synced` custom event to re-render with fresh data from Railway.

---

## 2. Login Page (`login.html`)

- Centered single card on a full-screen dark background.
- Logo/title at top.
- Email field, Password field (with show/hide eye toggle).
- "Log In" primary button (full width).
- Error message box (hidden by default, shown on failed login).
- No sidebar/header — standalone page.

---

## 3. Dashboard / Home (`index.html`)

**Header**: "Dashboard" title + subtitle.

**Sections (top to bottom)**:
1. **Stat cards row** (grid of 4): Total Clients, Active Tasks, Completed Tasks,
   Pending Changes (or similar KPIs) — each a `bg-gray-900` card with icon,
   big number, and label.
2. **Content Tasks (CT) section** — table/list of recent tasks:
   - Columns: Client, Title (`ctTaskMeta` — shows `t.title || t.topic`), Type,
     Status badge, Due date.
3. **Task rows list** — additional task summary rows (status badges, due dates).
4. **Change Requests panel** — list of tasks with `changesRequested = true`,
   showing client, title, and the change note.

**Behavior**: `renderDashboard(user)` runs on load and again after
`syncFromAPI()` resolves and on every `smm:synced` event.

---

## 4. Clients Page (`clients.html`)

**Header**: "Clients" title + subtitle, with action buttons:
- **"Export to Master"** button — pushes all client rows to the SMM-MASTER
  Google Sheet.
- **"Pull from Intake"** button — JSONP-pulls new client names from the
  SMM-INTAKE Google Sheet into the local Intake Queue.
- **"+ Add New Client"** primary button — opens the Add/Edit Client modal.

**Sections (top to bottom)**:
1. **Intake Queue** (yellow-tinted staging panel, `bg-yellow-500/10
   border-yellow-500/30`) — shown only when there are pulled names waiting:
   - Each row: client name + **Activate** button (opens Add Client modal
     pre-filled with the name) + **Dismiss** button (removes from queue).
2. **Stats row** — summary cards (Total Clients, Active, Budget totals, etc.)
3. **Clients table/grid** — one row/card per client showing: name, PM,
   Executive, Designer, status badge, content types, budget, tenure,
   start/end dates, and **Edit** (pencil) / **Delete** (trash) action icons,
   plus a **View** action that opens the client detail panel.
4. **Client detail view** (`viewClient`) — shows client info + their associated
   tasks with completion stats.

**Add/Edit Client Modal** (`#clientModal`):
- Title: "Add New Client" / "Edit Client"
- Fields (2-column grid):
  - Client Name
  - PM (dropdown, populated from team: admin/project_manager roles)
  - Executive (dropdown, populated from team: creator role)
  - **Assigned Designer** (dropdown, populated from team: designer role,
    defaults to **"Faaiz"** for new clients) + **"+ Custom (type name)"**
    option that reveals a free-text input below the dropdown for any
    designer not on the team list.
- Tenure selector — pill buttons (1, 2, 3, 6, 12 months) + "Custom" pill that
  reveals a numeric input.
- Start Date / End Date (auto-calculated from tenure, editable).
- Budget field.
- Content Types — checkbox group (`.content-type-check`).
- Status dropdown (active/paused/etc.).
- Notes textarea.
- **"Pipeline Setup" section** (indigo-tinted box, `bg-indigo-500/10
  border-indigo-500/30`):
  - **Client Phase** dropdown: 🆕 New Client / ⚙️ Mid-Operation /
    ✅ Ongoing/Existing
  - **Pipeline Entry Point** dropdown: 📥 New (Start Fresh) / 🎨 Ready to
    Designer / 🖌️ With Designer / 👁️ Pending Review / 🔄 Changes Requested /
    📤 Ready to Post / ✅ Already Posted
  - On save (new client only), this automatically creates a pipeline task
    placed at the chosen stage.
- Footer: Cancel / Save (Add Member / Save Changes) buttons.

---

## 5. Pipeline Page (`pipeline.html`)

**Header**: "Pipeline" title + subtitle, plus a **client filter dropdown**
(`populateClientFilter`).

**Main layout**: Kanban-style board (`renderBoard`) — horizontal row of
columns, one per pipeline stage:
1. New
2. Ready to Designer
3. With Designer
4. Pending Review
5. Changes Requested
6. Ready to Post
7. Posted

- Each **column**: header showing stage name + task count badge, vertical
  list of **task cards** below.
- Each **task card**: client name, task **title** (`t.title || t.topic`),
  content type icon/label, assignee/designer avatar, due date, priority
  indicator. Cards are draggable/clickable.
- Clicking a card opens the **Task Detail Modal** (`#taskDetailModal`,
  `.modal-box` `max-width:660px; max-height:90vh`, flex-column, scrollable
  body):
  - Header: task title + close button.
  - Body: full task details (client, assignee, designer, due date, priority,
    description/notes, comments thread, change request notes if any).
  - **Edit fields** for status, priority, assignee, designer, due date —
    "Save Changes" button (`saveTaskEdits()`).
  - Action buttons depending on current stage: **Move to [Next Stage]**,
    **Request Changes**, **Mark as Posted**, etc.

**Mark as Posted Modal** (`showPostedDateModal`):
- **Posted Date** field — auto-filled with today's date, **read-only**.
- **Scheduled Till** field — date picker for a future date (Facebook
  scheduling end date), manually entered.
- Optional note textarea.
- Confirm button.

---

## 6. Tasks Page (`tasks.html`)

**Header**: "Tasks" title + subtitle, filter controls (status/assignee/client
filters), "+ New Task" button.

**Sections**:
1. **Filter bar** — dropdowns/search to filter the task list.
2. **Task list/table** (`renderTasks`) — rows showing: client, title
   (`t.title || t.topic`), content type, status badge, assignee, designer,
   due date, "Scheduled Till: [date]" label (only if `scheduledTill` is set),
   priority, and action icons (Edit, Move Stage, Delete, Comment).
3. Each task row expandable to show **comments thread** and **Add Comment**
   input.
4. **Changes Requested** indicator/badge with "Resolve" action
   (`resolveChanges`).

---

## 7. Team Page (`team.html`)

**Header**: "Team" title + subtitle ("Workload overview across all team
members").

**Sections**:
1. **Summary cards row** (grid of up to 4) — one per team member: avatar
   (colored circle with initial), name, role badge, Active Tasks count,
   Completed count, Email.
2. **Per-member workload panels** — for each member with active tasks: avatar
   + name + role + active task count header, followed by a table of their
   active tasks (Client, Type, Topic, Status badge, Due date with color
   coding: red = overdue, orange = due today, yellow = due soon, gray =
   normal).

---

## 8. Admin Page (`admin.html`)

**Header**: "Admin" / "Team Management" title + subtitle, **"+ Add Team
Member"** button.

**Sections**:
1. **Role summary cards row** (grid) — one card per role (Admin, Team Lead,
   Executive, Designer, Client Management) showing icon + count + label.
2. **Team Members table** (`#teamTableBody`):
   - Columns: Member (avatar + name), Email, **Role(s)** (shows ALL assigned
     role badges, e.g. a member can show both "Team Lead" and "Client
     Management" badges), Active Tasks count, Password ("Change" button),
     Actions (Edit pencil icon, Delete trash icon — hidden for Admin role).

**Add/Edit Team Member Modal** (`#memberModal`):
- Title: "Add Team Member" / "Edit Member"
- Fields:
  - Full Name, Email (2-column row)
  - **Roles** — checkbox group (NOT a single dropdown):
    - Admin
    - Team Lead
    - Executive
    - Designer
    - Client Management
    - Helper text: "First selected role is used as the primary role."
  - Password field (with show/hide toggle), Confirm Password field
    (hidden/optional when editing).
- Footer: Cancel / Add Member or Save Changes.

**Change Password Modal** (`#pwModal`):
- Shows member name being edited.
- New Password + Confirm Password fields (with show/hide toggles).
- Error message if passwords don't match.
- "Update Password" button → success state with checkmark icon and "Done"
  button.

---

## 9. Analytics Page (`analytics.html`)

- Header: "Analytics" title + subtitle.
- Grid of stat/chart cards: tasks by status, tasks by client, team
  performance, completion trends, etc. (chart cards use `bg-gray-900`
  panels with chart canvases or summary numbers).

---

## 10. Settings Page (`settings.html`)

- Header: "Settings" title + subtitle.
- Sections for: API connection status badge (`updateAPIStatusBadge`),
  Google Sheets integration settings (Apps Script URL config), general
  preferences/toggles, account info.

---

## 11. Data Model Reference (for design context — field names used in UI)

**Client**: `id, name, pm, executive, designer, startDate, endDate, budget,
tenure, notes, status, phase, pipelineStage, currency, contentTypes[]`

**Task**: `id, clientId, clientName, title (was topic), status, priority,
assignedTo, designer, dueDate, postedDate, scheduledTill, changesRequested,
changeNote, comments[], createdAt`

**Team Member**: `id, name, email, role (primary), roles[] (multi-role),
avatar, color, password`

**Pipeline stages** (status values): `new, ready_to_designer, with_designer,
pending_review, changes_requested, ready_to_post, posted`

**Roles**: `admin, project_manager (Team Lead), creator (Executive),
designer, client_manager (Client Management)`

---

## 12. Redesign Guidelines

- Keep all sections, cards, tables, modals, fields, and buttons listed above —
  same names, same purpose, same position in the page flow.
- You MAY change: colors, fonts, spacing, shadows, border-radius, icons,
  card layouts (e.g. grid vs list), hover/transition effects, and overall
  visual theme — as long as every element above remains present and
  functionally reachable.
- Do NOT change element `id` attributes referenced by JavaScript (these are
  the hooks the app logic depends on) — only restyle via CSS classes.
- Do NOT remove the Intake Queue, Pipeline Setup section, Scheduled Till
  field, multi-role checkboxes, or custom designer option — these are
  recently added and required.
