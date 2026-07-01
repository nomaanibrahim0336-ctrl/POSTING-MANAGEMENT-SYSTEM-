# SMM-Manager Theme & Integration Guide

This is everything you need to redesign the UI on another platform (Figma, a
page builder, v0, etc.) and push it back so it **plugs straight into the
existing Supabase backend** without touching any logic.

---

## 1. Design Tokens (colors, used everywhere)

```css
/* Background */
--bg-page:        #030712   /* page background */
--bg-card:        #0e1525   /* cards, kanban columns */
--bg-surface:     #161e2e   /* inputs, table rows, kanban cards, sidebar links */
--bg-sidebar:     #0b1220   /* sidebar panel */

/* Borders */
--border-default: #1F2937
--border-strong:  #374151
--border-hover:   #4B5563

/* Brand / Accent */
--accent:         #6366F1   /* indigo-500 */
--accent-strong:  #4F46E5   /* indigo-600 */
--accent-dark:    #4338CA   /* indigo-700 */

/* Text */
--text-primary:   #F9FAFB
--text-secondary: #D1D5DB
--text-muted:     #9CA3AF
--text-faint:     #6B7280

/* Status colors */
--success: #10B981 (emerald)   /* active, posted, connected */
--warning: #F59E0B (amber)     /* pending, ending soon */
--danger:  #EF4444 (red)       /* overdue, delete */
--info:    #3B82F6 (blue)      /* creator role */
```

Background uses subtle radial gradients (see `assets/css/style.css` lines 4-9)
— indigo glow top-left, purple glow top-right, on `#030712`.

## 2. Core Reusable Classes

All defined in `assets/css/style.css`. Reuse these exact class names in any
new markup so styling stays consistent:

| Class | Use |
|---|---|
| `.nav-link` / `.nav-link.active` | Sidebar navigation items |
| `.stat-card` | Top dashboard stat tiles |
| `.pipeline-stage`, `.kanban-col`, `.kanban-card` | Pipeline board |
| `.task-row` | Task list rows |
| `.status-badge` | Colored pill badges (status, SMC counter) |
| `.priority-dot` | Small colored dot |
| `.data-table` | All tables (clients, team, etc.) |
| `.modal-overlay`, `.modal-box` | All modals/dialogs |
| `.form-input`, `.form-label` | All form fields |
| `.btn-primary`, `.btn-secondary` | Buttons |
| `.search-input` | Search boxes |
| `.tenure-pill` | Filter pill buttons |
| `.avatar` | Round initials avatar |
| `.tab-btn`, `.tab-btn.active` | Tab navigation |
| `.sidebar-panel`, `.hamburger-btn` | Mobile sidebar |

Stack: **Tailwind CSS (CDN)** for layout/spacing + this custom CSS file for
the dark theme/components. Font Awesome 6 for icons.

## 3. Page Inventory

| Page | Purpose |
|---|---|
| `login.html` | Auth |
| `index.html` | Dashboard (stats, recent activity) |
| `clients.html` | Client list, intake queue, search |
| `pipeline.html` | Kanban board for tasks |
| `tasks.html` | Task list/board view |
| `team.html` | Team members |
| `analytics.html` | Charts/reports |
| `admin.html` | User management, backend connection |
| `settings.html` | Workspace + Supabase connection |

## 4. The Backend Contract (DO NOT CHANGE)

Every page loads `assets/js/app.js` first. This file is the **entire bridge
to Supabase** — as long as your new HTML/CSS keeps these hooks, the backend
connection works automatically with zero extra wiring:

### a) Required `<script>` include
```html
<script src="assets/js/app.js"></script>
```

### b) Page boilerplate (put in `DOMContentLoaded`)
```js
document.addEventListener('DOMContentLoaded', () => {
  const user = pageInit();      // handles auth check, sidebar, Supabase sync
  if (!user) return;
  renderXyz();                  // your page's render function
  document.addEventListener('smm:synced', renderXyz); // live refresh
});
```

### c) Data access — always via the `APP` object (never localStorage directly)
```js
APP.clients   // array of client objects
APP.tasks     // array of task objects
APP.team      // array of team member objects
APP.currentUser
```

### d) Writing data — always call these, never write to Supabase directly
```js
apiSaveClient(client)     apiDeleteClient(id)
apiSaveTask(task)          apiUpdateTask(id, {fields})    apiDeleteTask(id)
apiSaveMember(member)      apiDeleteMember(id)
saveData()                 // always call after mutating APP.clients/tasks/team
```

### e) Required DOM element IDs (if redesigning a page, keep these IDs so
existing JS in that page's `<script>` block still finds them)

- `clients.html`: `#clientSearch`, `#statusFilter`, `#clientStats`,
  `#memberTabs`, `#memberTabContent`, `#intakeStagingWrap`, `#intakeList`,
  `#intakeCount`, `#clientModal` (+ all `#client*` form fields)
- `tasks.html` / `pipeline.html`: kanban column containers, `#taskDetailModal`
- `settings.html` / `admin.html`: `#apiStatusBadge`, `#supabaseUrlInput`,
  `#supabaseKeyInput`, `#apiTestResult`

## 5. Supabase Backend (already live — no setup needed)

- Project: **OFFICE CRM** — `https://blhjaitkrasnljwsaqda.supabase.co`
- Tables: `smm_clients`, `smm_tasks`, `smm_team` — each `{ id, payload jsonb, updated_at }`
- Auth: RLS enabled, fully open to `anon` role (internal tool, no Supabase Auth yet)
- Defaults are hardcoded in `assets/js/app.js` (`DEFAULT_SUPABASE_URL` /
  `DEFAULT_SUPABASE_KEY`) — works out of the box on any deploy.

## 6. Workflow for Redesigning

1. Export/redesign the **visual layer only** — HTML structure + CSS/Tailwind
   classes — on whichever platform you like.
2. Keep the element IDs listed in §4e and the `<script src="assets/js/app.js">`
   include.
3. Keep (or copy in) the `<script>` block at the bottom of each page that
   calls `pageInit()`, the render functions, and the `api*`/`APP.*` calls —
   that's the logic layer, separate from styling.
4. Drop the new HTML/CSS files back into this repo (replacing the old ones),
   commit, push to `main` → Vercel auto-redeploys → Supabase connection works
   immediately, same as today.

If your new design tool generates a **fully different structure** (e.g. a
React app), tell me and I'll port the `app.js` logic layer into that
framework's data layer instead — the Supabase schema and `api*` functions
translate directly to React hooks/services.
