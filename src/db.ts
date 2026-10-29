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

const STORAGE_KEY = 'sm_oze_sqlite_cache_v1';

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

  // Insert or update a sales lead / audit task in SQLite
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
    const activities: ActivityLog[] = [
      {
        id: Date.now(),
        userName: actor || task.assignee,
        action: `zmienił etap zadania/leada na: ${task.status}`,
        target: task.name,
        timeLabel: 'Przed chwilą',
        color: 'purple',
      },
      ...current.activities.slice(0, 11),
    ];
    const updated = { ...current, tasks, activities };
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
