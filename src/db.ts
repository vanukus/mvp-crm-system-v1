import {
  initialProjects,
  initialTasks,
  initialClients,
  employees,
  initialActivities,
  type Project,
  type Task,
  type ClientRecord,
  type Employee,
  type ActivityLog,
  type SystemRole,
} from './data';

// Snapshot structure returned by the SQLite Data Layer
export type DatabaseSnapshot = {
  meta: {
    engine: string;
    file: string;
    tables: string[];
    counts: {
      users: number;
      clients: number;
      installations: number;
      leads: number;
    };
  };
  projects: Project[];
  tasks: Task[];
  clients: ClientRecord[];
  events: { name: string; date: string }[];
  activities: ActivityLog[];
  users: Employee[];
};

const STORAGE_KEY = 'sm_oze_sqlite_cache_v2';

// Parse kWp and kWh numbers from an estimated power string like "10.0 kWp + 15 kWh"
function parsePowerAndBattery(estimatedPower?: string): { powerKwp: number; batteryKwh: number } {
  if (!estimatedPower) return { powerKwp: 9.8, batteryKwh: 10 };
  const kwpMatch = estimatedPower.match(/([\d.]+)\s*kWp/i);
  const kwhMatch = estimatedPower.match(/([\d.]+)\s*kWh/i);
  return {
    powerKwp: kwpMatch ? Number(kwpMatch[1]) : 9.8,
    batteryKwh: kwhMatch ? Number(kwhMatch[1]) : 10,
  };
}

// Build fallback snapshot from local cache or initial seed data
function getLocalFallbackSnapshot(): DatabaseSnapshot {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as DatabaseSnapshot;
    }
  } catch {
    // Ignore storage read errors
  }

  return {
    meta: {
      engine: 'SQLite Local Cache',
      file: 'database/oze_crm.sqlite',
      tables: ['users', 'clients', 'installations', 'leads', 'calendar_events', 'activity_logs'],
      counts: {
        users: employees.length,
        clients: initialClients.length,
        installations: initialProjects.length,
        leads: initialTasks.length,
      },
    },
    projects: initialProjects,
    tasks: initialTasks,
    clients: initialClients,
    events: [],
    activities: initialActivities,
    users: employees,
  };
}

// Persist snapshot to local cache for offline resilience
function saveLocalCache(snapshot: DatabaseSnapshot) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage write errors
  }
}

// Unified Data Layer client communicating with the SQLite backend (/api/db/*)
export const DataLayer = {
  // Load all tables from SQLite database
  async bootstrap(): Promise<DatabaseSnapshot> {
    try {
      const res = await fetch('/api/db/bootstrap');
      if (res.ok) {
        const snapshot = (await res.json()) as DatabaseSnapshot;
        saveLocalCache(snapshot);
        return snapshot;
      }
    } catch {
      // Fallback to cached snapshot if server endpoint is unreachable
    }
    return getLocalFallbackSnapshot();
  },

  // Insert or update an OZE installation record in SQLite
  async saveInstallation(project: Project, actor?: string): Promise<DatabaseSnapshot> {
    try {
      const res = await fetch('/api/db/installations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...project, actor }),
      });
      if (res.ok) {
        const snapshot = (await res.json()) as DatabaseSnapshot;
        saveLocalCache(snapshot);
        return snapshot;
      }
    } catch {
      // Fallback to local cache update
    }

    const current = getLocalFallbackSnapshot();
    const exists = current.projects.some(x => x.id === project.id);
    const projects = exists
      ? current.projects.map(x => (x.id === project.id ? project : x))
      : [project, ...current.projects];
    const activities: ActivityLog[] = [
      {
        id: Date.now(),
        userName: actor || project.manager,
        action: `zaktualizował realizację (${project.status})`,
        target: project.name,
        timeLabel: 'Przed chwilą',
        color: project.color || 'blue',
      },
      ...current.activities.slice(0, 11),
    ];
    const updated = { ...current, projects, activities };
    saveLocalCache(updated);
    return updated;
  },

  // Insert or update a sales lead / audit task in SQLite (with automatic funnel conversion on contract signing)
  async saveLead(task: Task, actor?: string): Promise<DatabaseSnapshot> {
    try {
      const res = await fetch('/api/db/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...task, actor }),
      });
      if (res.ok) {
        const snapshot = (await res.json()) as DatabaseSnapshot;
        saveLocalCache(snapshot);
        return snapshot;
      }
    } catch {
      // Fallback to local cache update
    }

    const current = getLocalFallbackSnapshot();
    const exists = current.tasks.some(x => x.id === task.id);
    const tasks = exists
      ? current.tasks.map(x => (x.id === task.id ? task : x))
      : [task, ...current.tasks];

    let projects = current.projects;
    let actionMessage = `zmienił etap leada na: ${task.status}`;

    if (task.status === 'Umowa podpisana (Wygrana)' || task.status === 'Zrealizowane') {
      const convertedName = task.name.replace(/^Lead(\s*B2B|\s*D2D)?:\s*/i, '');
      const alreadyExists = projects.some(p => p.name === convertedName);
      if (!alreadyExists) {
        const { powerKwp, batteryKwh } = parsePowerAndBattery(task.estimatedPower);
        const clientMatch = current.clients.find(c => c.name === task.project);
        const estPrice = Math.round((powerKwp * 3800 + batteryKwh * 2100) / 100) * 100;
        const newInstallation: Project = {
          id: Date.now(),
          name: convertedName,
          client: task.project,
          manager: task.assignee,
          status: 'Audyt i projekt',
          priority: task.priority,
          start: '24 paź 2024',
          deadline: '25 lis 2024',
          progress: 15,
          color: 'blue',
          initials: convertedName.slice(0, 2).toUpperCase(),
          systemType: powerKwp > 20 ? 'Fotowoltaika B2B + BESS' : 'PV + Magazyn energii',
          powerKwp,
          batteryKwh,
          osdOperator: clientMatch?.osd || 'PGE',
          subsidyProgram: powerKwp > 20 ? 'Brak (B2B)' : 'Mój Prąd 6.0',
          subsidyStatus: 'W przygotowaniu',
          roofType: 'Dachówka ceramiczna',
          contractValue: `${estPrice.toLocaleString('pl-PL')} PLN`,
          installTeam: 'Ekipa Mazowsze-1',
          voivodeship: clientMatch?.voivodeship || 'Mazowieckie',
        };
        projects = [newInstallation, ...projects];
        actionMessage = 'podpisał umowę — automatycznie utworzono realizację OZE';
      }
    }

    const activities: ActivityLog[] = [
      {
        id: Date.now(),
        userName: actor || task.assignee,
        action: actionMessage,
        target: task.name,
        timeLabel: 'Przed chwilą',
        color: 'green',
      },
      ...current.activities.slice(0, 11),
    ];
    const updated = { ...current, tasks, projects, activities };
    saveLocalCache(updated);
    return updated;
  },

  // Insert or update a client / investor record in SQLite
  async saveClient(client: ClientRecord, actor?: string): Promise<DatabaseSnapshot> {
    try {
      const res = await fetch('/api/db/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...client, actor }),
      });
      if (res.ok) {
        const snapshot = (await res.json()) as DatabaseSnapshot;
        saveLocalCache(snapshot);
        return snapshot;
      }
    } catch {
      // Fallback to local cache update
    }

    const current = getLocalFallbackSnapshot();
    const exists = current.clients.some(x => x.id === client.id);
    const clients = exists
      ? current.clients.map(x => (x.id === client.id ? client : x))
      : [client, ...current.clients];
    const updated = { ...current, clients };
    saveLocalCache(updated);
    return updated;
  },

  // Update a user's RBAC role ('admin' | 'manager' | 'salesman') in SQLite
  async updateUserRole(id: number, systemRole: SystemRole, actor?: string): Promise<DatabaseSnapshot> {
    try {
      const res = await fetch('/api/db/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, systemRole, actor }),
      });
      if (res.ok) {
        const snapshot = (await res.json()) as DatabaseSnapshot;
        saveLocalCache(snapshot);
        return snapshot;
      }
    } catch {
      // Fallback
    }

    const current = getLocalFallbackSnapshot();
    const users = current.users.map(u => (u.id === id ? { ...u, systemRole } : u));
    const updated = { ...current, users };
    saveLocalCache(updated);
    return updated;
  },

  // Insert a calendar schedule event in SQLite
  async saveEvent(event: { name: string; date: string }): Promise<DatabaseSnapshot> {
    try {
      const res = await fetch('/api/db/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
      if (res.ok) {
        const snapshot = (await res.json()) as DatabaseSnapshot;
        saveLocalCache(snapshot);
        return snapshot;
      }
    } catch {
      // Fallback to local cache update
    }

    const current = getLocalFallbackSnapshot();
    const updated = { ...current, events: [event, ...current.events] };
    saveLocalCache(updated);
    return updated;
  },

  // Reset SQLite database to initial seed state
  async resetDatabase(): Promise<DatabaseSnapshot> {
    window.localStorage.removeItem(STORAGE_KEY);
    try {
      const res = await fetch('/api/db/reset', { method: 'POST' });
      if (res.ok) {
        const snapshot = (await res.json()) as DatabaseSnapshot;
        saveLocalCache(snapshot);
        return snapshot;
      }
    } catch {
      // Fallback
    }
    return getLocalFallbackSnapshot();
  },
};
