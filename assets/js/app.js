// ===== SUPABASE CONFIG =====
// Configure via Settings page. When set, data is synced to Supabase Postgres
// so it persists across devices/sessions instead of being per-browser only.
const DEFAULT_SUPABASE_URL = 'https://tzlotwovutgfjvrsrwhw.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_BsugVO3X3NxZHxzcMb-yFg_Kjrw8oHz';
const SUPABASE_URL = localStorage.getItem('smm_supabase_url') || DEFAULT_SUPABASE_URL;
const SUPABASE_KEY = localStorage.getItem('smm_supabase_key') || DEFAULT_SUPABASE_KEY;

async function supaFetch(path, options = {}) {
  const res = await fetch(SUPABASE_URL + '/rest/v1' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'return=representation',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e || res.statusText); }
  return res.status === 204 ? null : res.json();
}

// ===== GLOBAL APP STATE =====
// Reads from localStorage (cache). Supabase sync populates the cache on page load.
const APP = {
  get currentUser() { return JSON.parse(localStorage.getItem('smm_user')) || null; },
  get clients()     { return JSON.parse(localStorage.getItem('smm_clients')) || []; },
  set clients(v)    { localStorage.setItem('smm_clients', JSON.stringify(v)); },
  get tasks()       { return JSON.parse(localStorage.getItem('smm_tasks')) || []; },
  set tasks(v)      { localStorage.setItem('smm_tasks', JSON.stringify(v)); },
  get team()        { return JSON.parse(localStorage.getItem('smm_team')) || []; },
  set team(v)       { localStorage.setItem('smm_team', JSON.stringify(v)); },
  get useAPI()      { return !!(SUPABASE_URL && SUPABASE_KEY); },
  _pendingWrites: 0,
  _lastWriteAt: 0
};

// Sync all data from Supabase into localStorage cache
async function syncFromAPI() {
  if (!APP.useAPI) return;
  // Skip overwriting local cache while a save is still in flight — otherwise a
  // background poll can fetch stale server data and clobber a just-made local edit
  // before the write has finished committing (a race made worse by frequent polling).
  if (APP._pendingWrites > 0) return;
  try {
    const [clients, tasks, team] = await Promise.all([
      supaFetch('/smm_clients?select=payload'),
      supaFetch('/smm_tasks?select=payload'),
      supaFetch('/smm_team?select=payload')
    ]);
    if (clients) APP.clients = clients.map(r => normalizeClient(r.payload));
    if (tasks)   APP.tasks   = tasks.map(r => normalizeTask(r.payload));
    if (team) {
      // Extract the special __permissions__ record if present, then filter it out of team list
      const permRecord = team.find(r => r.payload && r.payload.__type === 'permissions');
      if (permRecord) saveRolePermissions(permRecord.payload.perms);
      APP.team = team
        .filter(r => r.payload && r.payload.__type !== 'permissions')
        .map(r => normalizeMember(r.payload));
    }
  } catch (err) {
    console.warn('Supabase sync failed, using cache:', err.message);
  }
}

// Field name normalization: API uses snake_case, frontend uses camelCase
function normalizeClient(c) {
  return {
    id: c.id, name: c.name, platform: c.platform, status: c.status,
    package: c.package, budget: c.budget,
    startDate: c.start_date || c.startDate,
    endDate:   c.end_date   || c.endDate,
    tenure: c.tenure, brief: c.brief,
    executive: c.executive, designer: c.designer, pm: c.pm,
    createdBy: c.created_by || c.createdBy || '',
    createdDate: c.created_date || c.createdDate || '',
    ...c
  };
}
function normalizeTask(t) {
  return {
    id: t.id, clientId: t.client_id || t.clientId, clientName: t.client_name || t.clientName,
    title: t.title || t.topic || '', platform: t.platform, contentType: t.content_type || t.contentType,
    status: t.status, priority: t.priority, assignedTo: t.assigned_to || t.assignedTo,
    designer: t.designer, createdBy: t.created_by || t.createdBy,
    dueDate: t.due_date || t.dueDate, postedDate: t.posted_date || t.postedDate,
    scheduledTill: t.scheduled_till || t.scheduledTill,
    brief: t.brief, changes_requested: t.changes_requested, change_note: t.change_note,
    timeline: t.timeline || [], comments: t.change_requests || t.comments || [],
    createdDate: t.created_at || t.createdDate,
    ...t
  };
}
function normalizeMember(m) {
  return {
    id: String(m.id), name: m.name, email: m.email, role: m.role,
    avatar: m.avatar, color: ROLE_AVATAR_BG?.[m.role] || 'bg-gray-700', ...m
  };
}

// getCurrency — reads the workspace default currency set in Settings
function getCurrency() {
  try {
    const ws = JSON.parse(localStorage.getItem('smm_workspace') || '{}');
    return ws.currency || 'PKR';
  } catch { return 'PKR'; }
}

// saveData — writes to localStorage and fires background API sync
function saveData() {
  localStorage.setItem('smm_clients', JSON.stringify(APP.clients));
  localStorage.setItem('smm_tasks',   JSON.stringify(APP.tasks));
  localStorage.setItem('smm_team',    JSON.stringify(APP.team));
}

// API write helpers — called alongside localStorage saves
// After every write, re-sync from API and fire smm:synced so all pages re-render instantly
async function _afterWrite() {
  if (!APP.useAPI) return;
  await syncFromAPI();
  document.dispatchEvent(new CustomEvent('smm:synced'));
}

async function apiSaveClient(client) {
  if (!APP.useAPI) return;
  APP._pendingWrites++; APP._lastWriteAt = Date.now();
  try {
    await supaFetch('/smm_clients?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: {
      id: client.id, payload: client, updated_at: new Date().toISOString()
    }});
  } catch(e) { console.warn('apiSaveClient:', e.message); }
  finally { APP._pendingWrites--; }
  await _afterWrite();
}
async function apiDeleteClient(id) {
  if (!APP.useAPI) return;
  APP._pendingWrites++; APP._lastWriteAt = Date.now();
  try { await supaFetch(`/smm_clients?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); } catch(e) { console.warn(e.message); }
  finally { APP._pendingWrites--; }
  await _afterWrite();
}
async function apiSaveTask(task) {
  if (!APP.useAPI) return;
  APP._pendingWrites++; APP._lastWriteAt = Date.now();
  try {
    await supaFetch('/smm_tasks?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: {
      id: task.id, payload: task, updated_at: new Date().toISOString()
    }});
  } catch(e) { console.warn('apiSaveTask:', e.message); }
  finally { APP._pendingWrites--; }
  await _afterWrite();
}
async function apiUpdateTask(id, fields) {
  if (!APP.useAPI) return;
  APP._pendingWrites++; APP._lastWriteAt = Date.now();
  try {
    const existing = APP.tasks.find(t => String(t.id) === String(id)) || {};
    const merged = { ...existing, ...fields };
    await supaFetch('/smm_tasks?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: {
      id, payload: merged, updated_at: new Date().toISOString()
    }});
  } catch(e) { console.warn(e.message); }
  finally { APP._pendingWrites--; }
  await _afterWrite();
}
async function apiDeleteTask(id) {
  if (!APP.useAPI) return;
  APP._pendingWrites++; APP._lastWriteAt = Date.now();
  try { await supaFetch(`/smm_tasks?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); } catch(e) { console.warn(e.message); }
  finally { APP._pendingWrites--; }
  await _afterWrite();
}
async function apiSaveMember(member) {
  if (!APP.useAPI) return;
  APP._pendingWrites++; APP._lastWriteAt = Date.now();
  try {
    await supaFetch('/smm_team?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: {
      id: String(member.id), payload: member, updated_at: new Date().toISOString()
    }});
  } catch(e) { console.warn('apiSaveMember:', e.message); }
  finally { APP._pendingWrites--; }
  await _afterWrite();
}
// Increment a client's running "post calendar number" — call this whenever
// a task for that client is marked as Posted.
function bumpClientPostCount(clientId, manualSmcNumber, smcMonth) {
  if (!clientId) return;
  const all = APP.clients;
  const idx = all.findIndex(c => c.id === clientId);
  if (idx === -1) return;
  // Use manual number if provided, otherwise auto-increment
  all[idx].lastPostedNumber = (manualSmcNumber && manualSmcNumber > 0)
    ? manualSmcNumber
    : (all[idx].lastPostedNumber || 0) + 1;
  all[idx].lastPostedDate  = new Date().toISOString().split('T')[0];
  all[idx].lastPostedMonth = smcMonth || new Date().toLocaleString('default', { month: 'long' });
  APP.clients = all;
  saveData();
  apiSaveClient(all[idx]);
}

async function apiDeleteMember(id) {
  if (!APP.useAPI) return;
  APP._pendingWrites++; APP._lastWriteAt = Date.now();
  try { await supaFetch(`/smm_team?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); } catch(e) { console.warn(e.message); }
  finally { APP._pendingWrites--; }
  await _afterWrite();
}

// ===== SAMPLE DATA =====
function getSampleClients() {
  const data = [
    { id:'c1', name:'David Thomas',  pm:'Noman', tenure:3,  startDate:'2025-05-01', endDate:'2025-07-31', budget:50000,  currency:'PKR', status:'active', contentTypes:['video','carousel'],         notes:'Prefers morning posts' },
    { id:'c2', name:'Craig Sutton',  pm:'Noman', tenure:6,  startDate:'2025-04-01', endDate:'2025-09-30', budget:100000, currency:'PKR', status:'active', contentTypes:['carousel','stories'],        notes:'' },
    { id:'c3', name:'Karen Reilly',  pm:'Noman', tenure:12, startDate:'2025-01-01', endDate:'2025-12-31', budget:75000,  currency:'PKR', status:'active', contentTypes:['carousel','video','stories'],notes:'Use trending audio' },
    { id:'c4', name:'Julie Suarez',  pm:'Noman', tenure:3,  startDate:'2025-05-05', endDate:'2025-08-05', budget:30000,  currency:'PKR', status:'active', contentTypes:['stories','reels'],           notes:'' },
    { id:'c5', name:'Bob Ramieh',    pm:'Zaid',  tenure:6,  startDate:'2025-02-01', endDate:'2025-07-31', budget:75000,  currency:'PKR', status:'active', contentTypes:['reels','post'],             notes:'Ending soon' },
    { id:'c6', name:'Leo Patterson', pm:'Noman', tenure:3,  startDate:'2025-03-01', endDate:'2025-05-31', budget:40000,  currency:'PKR', status:'active', contentTypes:['video'],                    notes:'' },
    { id:'c7', name:'Hector Colon',  pm:'Zaid',  tenure:12, startDate:'2024-12-01', endDate:'2025-11-30', budget:150000, currency:'PKR', status:'active', contentTypes:['carousel','video','reels'],  notes:'' },
  ];
  localStorage.setItem('smm_clients', JSON.stringify(data));
  return data;
}

function getSampleTasks() {
  const data = [
    { id:'t1', clientId:'c1', clientName:'David Thomas',  contentType:'video',    topic:'Product Launch Video',     platform:'instagram', brief:'Launch video for new collection',      instructions:'Use trending audio',           dueDate:'2025-06-08', priority:'high',   status:'with_designer',     createdBy:'Zaid', assignedTo:'Noman', designer:'Faaiz', createdDate:'2025-06-01', comments:[], timeline:[{action:'Task created',by:'Zaid',date:'2025-06-01'},{action:'Sent to designer',by:'Noman',date:'2025-06-03'}] },
    { id:'t2', clientId:'c3', clientName:'Karen Reilly',  contentType:'carousel', topic:'Summer Collection Launch',  platform:'instagram', brief:'New denim styles in trending colors',  instructions:'Use trending audio, morning post',dueDate:'2025-06-10', priority:'high',   status:'pending_review',    createdBy:'Zaid', assignedTo:'Noman', designer:'Faaiz', createdDate:'2025-06-02', comments:[], timeline:[{action:'Task created',by:'Zaid',date:'2025-06-02'},{action:'Sent to designer',by:'Noman',date:'2025-06-04'},{action:'Design completed',by:'Faaiz',date:'2025-06-06'}] },
    { id:'t3', clientId:'c2', clientName:'Craig Sutton',  contentType:'stories',  topic:'Weekend Sale',              platform:'instagram', brief:'Weekend sale announcement story pack',  instructions:'',                             dueDate:'2025-06-09', priority:'medium', status:'new',               createdBy:'Zaid', assignedTo:'Noman', designer:'Faaiz', createdDate:'2025-06-07', comments:[], timeline:[{action:'Task created',by:'Zaid',date:'2025-06-07'}] },
    { id:'t4', clientId:'c6', clientName:'Leo Patterson', contentType:'video',    topic:'Brand Awareness Video',     platform:'facebook',  brief:'Brand story video',                    instructions:'',                             dueDate:'2025-06-08', priority:'high',   status:'changes_requested', createdBy:'Zaid', assignedTo:'Noman', designer:'Faaiz', createdDate:'2025-06-01', comments:[{by:'Zaid',text:'Change the audio, too loud',date:'2025-06-07'}], timeline:[{action:'Task created',by:'Zaid',date:'2025-06-01'},{action:'Changes requested',by:'Zaid',date:'2025-06-07'}] },
    { id:'t5', clientId:'c4', clientName:'Julie Suarez',  contentType:'reels',    topic:'Product Feature Reels',     platform:'instagram', brief:'3 reels showcasing products',          instructions:'Trending sound',               dueDate:'2025-06-12', priority:'medium', status:'ready_to_post',     createdBy:'Zaid', assignedTo:'Noman', designer:'Faaiz', createdDate:'2025-06-04', comments:[], timeline:[{action:'Task created',by:'Zaid',date:'2025-06-04'},{action:'Approved by PM',by:'Zaid',date:'2025-06-07'}] },
  ];
  localStorage.setItem('smm_tasks', JSON.stringify(data));
  return data;
}

function getSampleTeam() {
  const data = [
    { id:'u1', name:'Admin',   role:'admin',           email:'admin@smm.com',   password:'admin123',   avatar:'A', color:'bg-indigo-700' },
    { id:'u2', name:'Noman',   role:'project_manager', email:'noman@smm.com',   password:'lead123',    avatar:'N', color:'bg-green-700'  },
    { id:'u3', name:'Faaiz',   role:'designer',        email:'faaiz@smm.com',   password:'exec123',    avatar:'F', color:'bg-pink-700'   },
    { id:'u4', name:'Zaid',    role:'creator',         email:'zaid@smm.com',    password:'exec123',    avatar:'Z', color:'bg-blue-700'   },
  ];
  localStorage.setItem('smm_team', JSON.stringify(data));
  return data;
}

// ===== AUTH & ROLES =====

const ROLE_LABELS = {
  admin:           'Admin',
  project_manager: 'Team Lead',
  creator:         'Executive',
  designer:        'Designer',
  client_manager:  'Client Management',
};

const ROLE_AVATAR_BG = {
  admin:           'bg-indigo-700',
  project_manager: 'bg-green-700',
  creator:         'bg-blue-700',
  designer:        'bg-pink-700',
  client_manager:  'bg-yellow-700',
};

// Pages each role can access (filename)
const ROLE_ACCESS = {
  admin:           ['index.html','clients.html','pipeline.html','tasks.html','team.html','analytics.html','admin.html','settings.html'],
  project_manager: ['index.html','clients.html','pipeline.html','tasks.html','team.html','analytics.html'],
  creator:         ['index.html','clients.html','pipeline.html','tasks.html','team.html','analytics.html','settings.html'],
  designer:        ['index.html','pipeline.html','tasks.html','team.html'],
  client_manager:  ['index.html','clients.html','pipeline.html','tasks.html','team.html'],
};

// Nav items each role sees
const ROLE_NAV = {
  admin:           ['dashboard','clients','pipeline','tasks','team','analytics','admin','settings'],
  project_manager: ['dashboard','clients','pipeline','tasks','team','analytics'],
  creator:         ['dashboard','clients','pipeline','tasks','team','analytics','settings'],
  designer:        ['dashboard','pipeline','tasks','team'],
  client_manager:  ['dashboard','clients','pipeline','tasks','team'],
};

// ===== PERMISSION GRANTING (Admin Panel > Role Permissions tab) =====
// Roles whose access can be customized by the admin (admin role always has full access)
const GRANTABLE_ROLES = ['project_manager','creator','designer','client_manager'];

// Every grantable action, grouped for display in the admin UI
const PERMISSION_ACTIONS = [
  { key:'add_client',          label:'Add / Edit Clients',         group:'Clients' },
  { key:'delete_client',        label:'Delete Clients',             group:'Clients' },
  { key:'pull_intake',          label:'Pull Intake from Sheets',    group:'Clients' },
  { key:'export_sheets',        label:'Export Clients to Sheets',   group:'Clients' },
  { key:'activate_all_intake',  label:'Activate All Intake',        group:'Clients' },
  { key:'bulk_assign_pm',        label:'Bulk Assign PM',             group:'Clients' },
  { key:'create_task',          label:'Create Tasks',               group:'Tasks' },
  { key:'approve_task',         label:'Approve / Reject Tasks',      group:'Tasks' },
  { key:'request_changes',      label:'Request Changes',            group:'Tasks' },
  { key:'move_to_designer',     label:'Move Task to Designer',      group:'Tasks' },
  { key:'mark_design_done',     label:'Mark Design Done',           group:'Tasks' },
  { key:'post_content',         label:'Mark as Posted',             group:'Tasks' },
  { key:'view_analytics',       label:'View Analytics',             group:'Other' },
  { key:'manage_team',          label:'Manage Team Members',        group:'Other' },
];

// Default access per action — admin always has every action regardless of this list
const DEFAULT_PERMISSIONS = {
  add_client:         ['project_manager','client_manager','creator'],
  delete_client:      [],
  pull_intake:        ['client_manager'],
  export_sheets:      ['client_manager'],
  activate_all_intake:['client_manager'],
  bulk_assign_pm:     ['project_manager','client_manager'],
  create_task:        ['project_manager','creator'],
  approve_task:       ['project_manager'],
  request_changes:    ['project_manager'],
  move_to_designer:   ['creator'],
  mark_design_done:   ['designer'],
  post_content:       ['creator','project_manager'],
  view_analytics:     ['project_manager','creator'],
  manage_team:        [],
};

// Returns the active permission map (action -> roles), merging any admin-saved
// overrides from localStorage on top of the defaults above.
function getRolePermissions() {
  let overrides = {};
  try { overrides = JSON.parse(localStorage.getItem('smm_role_permissions')) || {}; } catch {}
  return { ...DEFAULT_PERMISSIONS, ...overrides };
}

function saveRolePermissions(perms) {
  localStorage.setItem('smm_role_permissions', JSON.stringify(perms));
}

// Push permissions to Supabase so all users/devices get them on next sync
async function apiSavePermissions(perms) {
  if (!APP.useAPI) return;
  APP._pendingWrites++; APP._lastWriteAt = Date.now();
  try {
    await supaFetch('/smm_team?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { id: '__permissions__', payload: { __type: 'permissions', perms }, updated_at: new Date().toISOString() }
    });
  } catch(e) { console.warn('apiSavePermissions:', e.message); }
  finally { APP._pendingWrites--; }
}

function getCurrentUser() {
  return JSON.parse(localStorage.getItem('smm_user')) || null;
}

function checkAuth() {
  const user = getCurrentUser();
  const page = location.pathname.split('/').pop() || 'index.html';
  if (!user) { window.location.href = 'login.html'; return null; }
  const allowed = ROLE_ACCESS[user.role] || [];
  if (!allowed.includes(page)) {
    window.location.href = 'index.html';
    return null;
  }
  return user;
}

// Tasks visible to current user based on role
function getVisibleTasks(allTasks, user) {
  if (!user) return [];
  if (user.role === 'admin' || user.role === 'project_manager') return allTasks;
  if (user.role === 'creator') return allTasks.filter(t => t.assignedTo === user.name || t.createdBy === user.name);
  if (user.role === 'designer') return allTasks.filter(t => t.designer === user.name);
  return [];
}

// Clients visible to current user.
// Admin sees everything (full roster lives in Admin Panel > All Clients).
// Every other role only sees clients they personally entered, plus any
// already assigned to them as executive/pm/designer.
function getVisibleClients(allClients, user) {
  if (!user) return [];
  if (user.role === 'admin') return allClients;
  // Executives see clients they added OR clients assigned to them by admin/PM
  if (user.role === 'creator') return allClients.filter(c => c.createdBy === user.name || c.executive === user.name);
  return allClients.filter(c =>
    c.createdBy === user.name ||
    c.executive === user.name || c.pm === user.name || c.designer === user.name
  );
}

// What actions a role can perform.
// 'admin' always has full access. Other roles fall back to DEFAULT_PERMISSIONS,
// which can be customized at runtime via the Admin Panel > Role Permissions tab
// (saved to localStorage as smm_role_permissions and read by getRolePermissions()).
function can(action, user) {
  if (!user) return false;
  const r = user.role;
  if (r === 'admin') return true;
  // Aliases for actions referenced by older code/keys
  const aliasMap = { edit_client:'add_client', reject_task:'approve_task', view_admin_panel:'manage_team' };
  const key = aliasMap[action] || action;
  const perms = getRolePermissions();
  return (perms[key] || []).includes(r);
}

// ===== SIDEBAR =====
function renderSidebar(user) {
  if (!user) return;
  const navItems = [
    { key:'dashboard', href:'index.html',    icon:'fa-gauge-high',    label:'Dashboard' },
    { key:'clients',   href:'clients.html',  icon:'fa-users',         label:'Clients' },
    { key:'pipeline',  href:'pipeline.html', icon:'fa-kanban',        label:'Pipeline' },
    { key:'tasks',     href:'tasks.html',    icon:'fa-list-check',    label:'Tasks' },
    { key:'team',      href:'team.html',     icon:'fa-people-group',  label:'Team' },
    { key:'analytics', href:'analytics.html',icon:'fa-chart-line',    label:'Analytics' },
  ];
  const adminItems = [
    { key:'admin',    href:'admin.html',    icon:'fa-shield-halved', label:'Admin Panel' },
    { key:'settings', href:'settings.html', icon:'fa-gear',          label:'Settings' },
  ];

  const allowed = ROLE_NAV[user.role] || [];
  const page = location.pathname.split('/').pop() || 'index.html';

  const navHTML = navItems
    .filter(n => allowed.includes(n.key))
    .map(n => `<a href="${n.href}" class="nav-link ${n.href === page ? 'active' : ''}">
      <i class="fa-solid ${n.icon} w-5"></i><span>${n.label}</span>
    </a>`).join('');

  const adminVisible = adminItems.filter(n => allowed.includes(n.key));
  const adminHTML = adminVisible.length ? `
    <div class="pt-4 pb-1 px-3"><p class="text-xs text-gray-600 uppercase tracking-widest font-semibold">Admin</p></div>
    ${adminVisible.map(n => `<a href="${n.href}" class="nav-link ${n.href === page ? 'active' : ''}">
      <i class="fa-solid ${n.icon} w-5"></i><span>${n.label}</span>
    </a>`).join('')}` : '';

  const avatarBg = ROLE_AVATAR_BG[user.role] || 'bg-gray-700';
  const roleLabel = ROLE_LABELS[user.role] || user.role;

  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  // Reset sidebar container — panel is rendered inside it
  sidebar.style.cssText = 'position:static;width:auto;height:auto;background:none;border:none;';

  // Build notifications from visible tasks
  const allTasks = APP.tasks;
  const visibleTasks = getVisibleTasks(allTasks, user);
  const changeReqs = visibleTasks.filter(t => t.status === 'changes_requested');
  const dueToday   = visibleTasks.filter(t => { const d = daysUntil(t.dueDate); return d === 0 && t.status !== 'posted'; });
  const overdue    = visibleTasks.filter(t => { const d = daysUntil(t.dueDate); return d < 0 && t.status !== 'posted'; });

  // Scheduled Till alerts: posted tasks whose scheduledTill is within 5 days
  const schedAlerts = visibleTasks.filter(t => {
    if (!t.scheduledTill || t.status !== 'posted') return false;
    const d = daysUntil(t.scheduledTill);
    return d >= 0 && d <= 5;
  });

  const notifCount = changeReqs.length + dueToday.length + overdue.length + schedAlerts.length;

  const notifItems = [
    ...changeReqs.map(t => `<div class="flex gap-3 p-3 hover:bg-gray-800 rounded-lg cursor-pointer transition-colors" onclick="window.location='tasks.html'">
      <div class="w-7 h-7 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5"><i class="fa-solid fa-flag text-red-400 text-xs"></i></div>
      <div class="min-w-0"><p class="text-xs font-medium text-white truncate">${t.clientName}</p><p class="text-xs text-red-400 truncate">${(t.comments||[]).slice(-1)[0]?.text || 'Changes requested'}</p></div>
    </div>`),
    ...dueToday.map(t => `<div class="flex gap-3 p-3 hover:bg-gray-800 rounded-lg cursor-pointer transition-colors" onclick="window.location='tasks.html'">
      <div class="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5"><i class="fa-solid fa-clock text-orange-400 text-xs"></i></div>
      <div class="min-w-0"><p class="text-xs font-medium text-white truncate">${t.clientName}</p><p class="text-xs text-orange-400">Due today — ${t.topic}</p></div>
    </div>`),
    ...overdue.map(t => `<div class="flex gap-3 p-3 hover:bg-gray-800 rounded-lg cursor-pointer transition-colors" onclick="window.location='tasks.html'">
      <div class="w-7 h-7 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5"><i class="fa-solid fa-triangle-exclamation text-red-400 text-xs"></i></div>
      <div class="min-w-0"><p class="text-xs font-medium text-white truncate">${t.clientName}</p><p class="text-xs text-red-400">Overdue — ${t.topic}</p></div>
    </div>`),
    ...schedAlerts.map(t => {
      const d = daysUntil(t.scheduledTill);
      const { color, icon } = getSchedAlertStyle(d);
      return `<div class="flex gap-3 p-3 hover:bg-gray-800 rounded-lg cursor-pointer transition-colors" onclick="window.location='tasks.html'">
        <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style="background:${color}22"><i class="fa-solid ${icon} text-xs" style="color:${color}"></i></div>
        <div class="min-w-0"><p class="text-xs font-medium text-white truncate">${t.clientName} — ${t.title||t.topic||''}</p><p class="text-xs truncate" style="color:${color}">Scheduled Till expires in ${d} day${d===1?'':'s'} (${formatDate(t.scheduledTill)})</p></div>
      </div>`;
    }),
  ].join('');

  sidebar.innerHTML = `
    <!-- Mobile overlay -->
    <div id="sidebarOverlay" class="sidebar-overlay" onclick="closeSidebar()"></div>

    <!-- Hamburger (mobile only) -->
    <button id="hamburgerBtn" class="hamburger-btn" onclick="toggleSidebar()">
      <i class="fa-solid fa-bars text-gray-300 text-lg"></i>
    </button>

    <!-- Sidebar panel -->
    <div id="sidebarPanel" class="sidebar-panel">
      <div class="flex items-center gap-3 px-6 py-5 border-b border-gray-800">
        ${(()=>{
          let b={name1:'SOCIAL MEDIA',name2:'MANAGEMENT',logo:''};
          try{const s=localStorage.getItem('smm_branding');if(s)b={...b,...JSON.parse(s)};}catch{}
          const logoHTML = b.logo
            ? `<img src="${b.logo}" class="w-9 h-9 rounded-lg object-contain"/>`
            : `<svg width="36" height="36" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect x="30" y="5" width="28" height="58" rx="4" ry="4" fill="#F97316"/><path d="M58,5 Q85,5 85,30 L85,63 L58,63 Z" fill="#F97316"/><text x="8" y="96" font-family="Arial Black,sans-serif" font-weight="900" font-size="30" fill="#F97316">TECH</text></svg>`;
          return `<div class="flex-shrink-0">${logoHTML}</div>
        <div class="sidebar-text leading-tight">
          <span class="text-white font-bold text-sm tracking-wide block">${b.name1}</span>
          <span class="text-orange-400 font-semibold text-xs tracking-widest block">${b.name2}</span>
        </div>`;
        })()}
        <button class="ml-auto text-gray-500 hover:text-gray-300 lg:hidden" onclick="closeSidebar()">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        ${navHTML}${adminHTML}
      </nav>

      <!-- Notification Bell -->
      <div class="px-3 pb-2 relative">
        <button onclick="toggleNotifPanel()" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800 transition-colors text-left">
          <div class="relative">
            <i class="fa-solid fa-bell text-gray-400 text-sm w-5"></i>
            ${notifCount ? `<span class="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">${notifCount > 9 ? '9+' : notifCount}</span>` : ''}
          </div>
          <span class="text-sm text-gray-400 sidebar-text">Notifications</span>
          ${notifCount ? `<span class="ml-auto text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full sidebar-text">${notifCount}</span>` : ''}
        </button>
        <!-- Notification dropdown -->
        <div id="notifPanel" class="hidden absolute bottom-full left-3 right-3 mb-2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 max-h-80 overflow-y-auto">
          <div class="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <p class="text-xs font-semibold text-white uppercase tracking-wider">Notifications</p>
            <button onclick="toggleNotifPanel()" class="text-gray-500 hover:text-gray-300"><i class="fa-solid fa-xmark text-xs"></i></button>
          </div>
          ${notifItems || '<p class="text-xs text-gray-600 text-center py-6">All clear — nothing pending</p>'}
        </div>
      </div>

      <div class="px-4 py-4 border-t border-gray-800">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full ${avatarBg} flex items-center justify-center text-sm font-bold flex-shrink-0">${user.avatar || user.name[0]}</div>
          <div class="flex-1 min-w-0 sidebar-text">
            <p class="text-sm font-semibold text-white truncate">${user.name}</p>
            <p class="text-xs text-gray-500 truncate">${roleLabel}</p>
          </div>
          <button onclick="logout()" class="text-gray-500 hover:text-red-400 transition-colors" title="Logout">
            <i class="fa-solid fa-right-from-bracket text-sm"></i>
          </button>
        </div>
      </div>
    </div>`;
}

function logout() {
  localStorage.removeItem('smm_user');
  localStorage.removeItem('smm_token');
  window.location.href = 'login.html';
}

function toggleSidebar() {
  const panel = document.getElementById('sidebarPanel');
  const overlay = document.getElementById('sidebarOverlay');
  if (!panel) return;
  panel.classList.toggle('open');
  overlay.classList.toggle('open');
}

function closeSidebar() {
  const panel = document.getElementById('sidebarPanel');
  const overlay = document.getElementById('sidebarOverlay');
  if (panel) panel.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

function toggleNotifPanel() {
  const p = document.getElementById('notifPanel');
  if (p) p.classList.toggle('hidden');
}

// Role badge HTML
function roleBadge(role) {
  const map = {
    admin:           'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    project_manager: 'bg-green-500/15 text-green-400 border-green-500/30',
    creator:         'bg-blue-500/15 text-blue-400 border-blue-500/30',
    designer:        'bg-pink-500/15 text-pink-400 border-pink-500/30',
  };
  return `<span class="status-badge ${map[role] || 'bg-gray-500/15 text-gray-400 border-gray-500/30'}">${ROLE_LABELS[role] || role}</span>`;
}

// ===== DATE HELPERS =====
// Plain "YYYY-MM-DD" strings (from <input type="date">) get parsed by `new Date(str)`
// as UTC midnight, then shifted when displayed/compared in local time — causing dates
// to silently roll back a day in timezones behind UTC. Parsing the components manually
// with the local-time Date constructor avoids that shift entirely.
function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Formats a Date object back to "YYYY-MM-DD" using its LOCAL components — the
// counterpart to parseLocalDate. Never use date.toISOString().split('T')[0] for this:
// toISOString() converts to UTC first, which can roll the date back (or forward) a day.
function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = parseLocalDate(dateStr);
  return d ? d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = parseLocalDate(dateStr);
  return target ? Math.round((target - today) / 86400000) : NaN;
}

function daysAgo(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = parseLocalDate(dateStr);
  return target ? Math.round((today - target) / 86400000) : NaN;
}

// ===== STATUS HELPERS =====
const STATUS_CONFIG = {
  new:               { label:'New',                    color:'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ready_to_designer: { label:'Ready to Designer',      color:'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  with_designer:     { label:'With Designer',          color:'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  pending_review:    { label:'Pending Review',         color:'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  changes_requested: { label:'Changes Requested',      color:'bg-red-500/15 text-red-400 border-red-500/30' },
  additional_content:{ label:'Additional Content',     color:'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  ready_to_post:     { label:'Ready to Post',          color:'bg-green-500/15 text-green-400 border-green-500/30' },
  posted:            { label:'Posted',                 color:'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  on_hold:           { label:'On Hold',                color:'bg-gray-500/15 text-gray-400 border-gray-500/30' },
};

function statusBadge(status) {
  const cfg = STATUS_CONFIG[status] || { label:status, color:'bg-gray-500/15 text-gray-400 border-gray-500/30' };
  return `<span class="status-badge ${cfg.color}">${cfg.label}</span>`;
}

// ===== POSTED DATE MODAL =====
// Call this instead of directly setting status to 'posted'
// onConfirm(postedDate) is called with the date string
// Returns color + icon based on days remaining until scheduledTill
function getSchedAlertStyle(daysLeft) {
  if (daysLeft <= 1) return { color: '#EF4444', icon: 'fa-circle-exclamation', label: daysLeft <= 0 ? 'Expired' : '1 Day Left' };
  if (daysLeft <= 3) return { color: '#F97316', icon: 'fa-triangle-exclamation', label: `${daysLeft} Days Left` };
  return { color: '#EAB308', icon: 'fa-clock', label: `${daysLeft} Days Left` };
}

// Returns HTML badge string for task cards; empty string if no alert needed
function getSchedAlertBadge(scheduledTill) {
  if (!scheduledTill) return '';
  const d = daysUntil(scheduledTill);
  if (d > 5 || d < -1) return '';
  const { color, label } = getSchedAlertStyle(d);
  return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.65rem;font-weight:600;padding:2px 8px;border-radius:20px;border:1px solid ${color}40;background:${color}18;color:${color};white-space:nowrap;letter-spacing:0.02em"><i class="fa-solid fa-calendar-xmark" style="font-size:0.6rem"></i>${label}</span>`;
}

function showPostedDateModal(taskId, onConfirm) {
  const existing = document.getElementById('_postedModal');
  if (existing) existing.remove();

  const today = new Date().toISOString().split('T')[0];
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const currentMonth = new Date().getMonth(); // 0-indexed

  const monthOptions = MONTHS.map((m, i) =>
    `<option value="${m}" ${i === currentMonth ? 'selected' : ''}>${m}</option>`
  ).join('');

  // Pre-fill SMC number hint from client's current count
  let currentSmc = '';
  if (taskId) {
    const task = (APP.tasks || []).find(t => t.id === taskId);
    if (task && task.clientId) {
      const client = (APP.clients || []).find(c => c.id === task.clientId);
      if (client && client.lastPostedNumber) currentSmc = client.lastPostedNumber + 1;
    }
  }

  const overlay = document.createElement('div');
  overlay.id = '_postedModal';
  overlay.className = 'modal-overlay open';
  overlay.style.zIndex = '300';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:440px">
      <div class="flex items-center justify-between px-6 py-5 border-b border-gray-800">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
            <i class="fa-solid fa-circle-check text-green-400 text-sm"></i>
          </div>
          <h2 class="text-base font-semibold text-white">Mark as Posted</h2>
        </div>
        <button onclick="document.getElementById('_postedModal').remove()" class="text-gray-500 hover:text-gray-300">
          <i class="fa-solid fa-xmark text-lg"></i>
        </button>
      </div>
      <div class="p-6 space-y-4">

        <div>
          <label class="form-label">Posted Date</label>
          <input id="_postedDateInput" type="date" class="form-input bg-gray-800/50 cursor-not-allowed" value="${today}" readonly/>
          <p class="text-xs text-gray-500 mt-1">Auto-set to today — the day content is being marked as posted</p>
        </div>

        <div>
          <label class="form-label">Scheduled Till <span class="text-gray-500 font-normal">(optional)</span></label>
          <input id="_scheduledTillInput" type="date" class="form-input" min="${today}"/>
          <p class="text-xs text-gray-500 mt-1">Future date — how long it stays scheduled/active on Facebook</p>
        </div>

        <div style="border-top:1px solid var(--grey-border,#374151);padding-top:16px;margin-top:4px">
          <p class="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-3">
            <i class="fa-solid fa-calendar-days mr-1"></i> SMC Entry
          </p>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label">SMC Month</label>
              <select id="_smcMonthInput" class="form-input">
                ${monthOptions}
              </select>
            </div>
            <div>
              <label class="form-label">SMC # <span class="text-gray-500 font-normal">(manual override)</span></label>
              <input id="_smcNumberInput" type="number" min="1" class="form-input"
                placeholder="${currentSmc ? 'e.g. ' + currentSmc : 'auto +1'}"/>
            </div>
          </div>
          <p class="text-xs text-gray-500 mt-1.5">Leave SMC # blank to auto-increment. Enter a number to set it exactly (for recording existing/ongoing work).</p>
        </div>

        <div>
          <label class="form-label">Post Link / Notes (optional)</label>
          <input id="_postedNoteInput" type="text" class="form-input" placeholder="e.g. Instagram post link or any note"/>
        </div>

      </div>
      <div class="flex justify-end gap-3 px-6 py-4 border-t border-gray-800">
        <button onclick="document.getElementById('_postedModal').remove()" class="btn-secondary">Cancel</button>
        <button id="_postedConfirmBtn" class="btn-primary flex items-center gap-2">
          <i class="fa-solid fa-circle-check text-sm"></i> Mark Posted
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  document.getElementById('_postedConfirmBtn').onclick = () => {
    const date          = today;
    const scheduledTill = document.getElementById('_scheduledTillInput').value || '';
    const note          = document.getElementById('_postedNoteInput').value.trim() || '';
    const smcMonth      = document.getElementById('_smcMonthInput').value || '';
    const smcNumRaw     = document.getElementById('_smcNumberInput').value.trim();
    const smcNumber     = smcNumRaw ? parseInt(smcNumRaw, 10) : null;
    overlay.remove();
    onConfirm(date, scheduledTill, note, smcMonth, smcNumber);
  };

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ===== TOAST =====
function showToast(msg, type = 'success') {
  const existing = document.getElementById('_toast');
  if (existing) existing.remove();
  const colors = { success:'bg-green-600', error:'bg-red-600', info:'bg-indigo-600' };
  const icons  = { success:'fa-circle-check', error:'fa-circle-xmark', info:'fa-circle-info' };
  const t = document.createElement('div');
  t.id = '_toast';
  t.className = `fixed bottom-6 right-6 ${colors[type]||colors.success} text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg z-[200] fade-in`;
  t.innerHTML = `<i class="fa-solid ${icons[type]||icons.success} mr-2"></i>${msg}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ===== CURRENT DATE =====
function setCurrentDate() {
  const el = document.getElementById('currentDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
}

// Keep the in-memory user object (and its localStorage copy) in sync with the
// latest team record after every background sync — so a rename/role change made
// in Admin Panel propagates to already-open sessions within one poll cycle,
// instead of requiring everyone to log out and back in.
function _refreshCurrentUserFromTeam(user) {
  if (!user) return false;
  const fresh = APP.team.find(m => String(m.id) === String(user.id));
  if (!fresh) return false;
  const changed = fresh.name !== user.name || fresh.role !== user.role || fresh.avatar !== user.avatar || fresh.color !== user.color;
  if (changed) {
    user.name = fresh.name; user.role = fresh.role; user.avatar = fresh.avatar; user.color = fresh.color;
    localStorage.setItem('smm_user', JSON.stringify(user));
  }
  return changed;
}

// ===== PAGE INIT =====
// Call this at the top of every page's DOMContentLoaded
function pageInit(options = {}) {
  const user = checkAuth();
  if (!user) return null;
  renderSidebar(user);
  setCurrentDate();
  // show role banner
  const banner = document.getElementById('roleBanner');
  if (banner) {
    const colors = { admin:'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', project_manager:'bg-green-500/10 text-green-400 border-green-500/20', creator:'bg-blue-500/10 text-blue-400 border-blue-500/20', designer:'bg-pink-500/10 text-pink-400 border-pink-500/20' };
    banner.className = `text-xs px-3 py-1.5 rounded-full border ${colors[user.role]||'bg-gray-500/10 text-gray-400 border-gray-500/20'}`;
    banner.textContent = ROLE_LABELS[user.role] || user.role;
  }
  // Sync from API in background if configured — caller gets user immediately,
  // pages listen for 'smm:synced' event to re-render with fresh data
  if (APP.useAPI) {
    syncFromAPI().then(async () => {
      if (!APP.clients.length && !APP.tasks.length && !APP.team.length && !localStorage.getItem('smm_seeded')) {
        localStorage.setItem('smm_seeded', '1');
        const clients = getSampleClients(), tasks = getSampleTasks(), team = getSampleTeam();
        for (const c of clients) await apiSaveClient(c);
        for (const t of tasks) await apiSaveTask(t);
        for (const m of team) await apiSaveMember(m);
        await syncFromAPI();
      }
      if (_refreshCurrentUserFromTeam(user)) renderSidebar(user);
      document.dispatchEvent(new CustomEvent('smm:synced'));
    });
    // Auto-refresh: 10s when idle, speeds up to 5s for 30s after any save action
    // (create/edit/move/delete) so changes propagate quickly right when they matter,
    // without polling fast all the time.
    (function scheduleSync() {
      const delay = (Date.now() - APP._lastWriteAt < 30000) ? 5000 : 10000;
      setTimeout(() => {
        syncFromAPI().then(() => {
          if (_refreshCurrentUserFromTeam(user)) renderSidebar(user);
          document.dispatchEvent(new CustomEvent('smm:synced'));
          scheduleSync();
        });
      }, delay);
    })();
  } else if (!localStorage.getItem('smm_clients')) {
    // first ever load — seed sample data
    getSampleClients(); getSampleTasks(); getSampleTeam();
  }
  return user;
}
