import {
  initialProjects,
  initialTasks,
  initialClients,
  employees,
  initialEvents,
  initialActivities,
  defaultSettings,
  type Project,
  type Task,
  type ClientRecord,
  type Employee,
  type CalendarEvent,
  type ActivityLog,
  type SystemRole,
  type SystemSettings,
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
      events?: number;
    };
  };
  projects: Project[];
  tasks: Task[];
  clients: ClientRecord[];
  events: CalendarEvent[];
  activities: ActivityLog[];
  users: Employee[];
  settings: SystemSettings;
};

const STORAGE_KEY = 'sm_oze_sqlite_cache_v4';

// Format a JS Date as Polish short date, e.g. "29 paź 2026"
function formatPlShortDate(d: Date): string {
  return d
    .toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .replace('.', '');
}

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
      const parsed = JSON.parse(raw) as DatabaseSnapshot;
      return {
        ...parsed,
        events: parsed.events?.length ? parsed.events : initialEvents,
        settings: parsed.settings || defaultSettings,
      };
    }
  } catch {
    // Ignore storage read errors
  }

  return {
    meta: {
      engine: 'SQLite Local Cache',
      file: 'database/oze_crm.sqlite',
      tables: [
        'users',
        'clients',
        'installations',
        'leads',
        'calendar_events',
        'activity_logs',
        'settings',
      ],
      counts: {
        users: employees.length,
        clients: initialClients.length,
        installations: initialProjects.length,
        leads: initialTasks.length,
        events: initialEvents.length,
      },
    },
    projects: initialProjects,
    tasks: initialTasks,
    clients: initialClients,
    events: initialEvents,
    activities: initialActivities,
    users: employees,
    settings: defaultSettings,
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
  async saveInstallation(
    project: Project,
    actor?: string,
    actorRole?: SystemRole
  ): Promise<DatabaseSnapshot> {
    try {
      const res = await fetch('/api/db/installations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...project, actor, actorRole }),
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
    const clients = current.clients.map(c =>
      c.name === project.client
        ? {
            ...c,
            projects: projects.filter(p => p.client === c.name).length,
            status: project.status === 'Odebrane' ? 'Zakończony' : 'W realizacji',
          }
        : c
    );
    const activities: ActivityLog[] = [
      {
        id: Date.now(),
        userName: actor || project.manager,
        action: `zaktualizował realizację (${project.status} · ${project.subsidyStatus})`,
        target: project.name,
        timeLabel: 'Przed chwilą',
        color: project.color || 'blue',
      },
      ...current.activities.slice(0, 14),
    ];
    const updated = { ...current, projects, clients, activities };
    saveLocalCache(updated);
    return updated;
  },

  // Delete an OZE installation record from SQLite
  async deleteInstallation(
    id: number,
    actor?: string,
    actorRole?: SystemRole
  ): Promise<DatabaseSnapshot> {
    try {
      const q = new URLSearchParams({
        id: String(id),
        actor: actor || '',
        actorRole: actorRole || 'admin',
      });
      const res = await fetch(`/api/db/installations?${q.toString()}`, { method: 'DELETE' });
      if (res.ok) {
        const snapshot = (await res.json()) as DatabaseSnapshot;
        saveLocalCache(snapshot);
        return snapshot;
      }
    } catch {
      // Fallback
    }

    const current = getLocalFallbackSnapshot();
    const projects = current.projects.filter(p => p.id !== id);
    const updated = { ...current, projects };
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
    let events = current.events;
    let actionMessage = `zaktualizował lead (${task.status})`;

    if (
      current.settings.autoConvertLead &&
      (task.status === 'Umowa podpisana (Wygrana)' || task.status === 'Zrealizowane')
    ) {
      const convertedName = task.name.replace(/^Lead(\s*B2B|\s*D2D)?:\s*/i, '');
      const alreadyExists = projects.some(p => p.name === convertedName);
      if (!alreadyExists) {
        const { powerKwp, batteryKwh } = parsePowerAndBattery(task.estimatedPower);
        const clientMatch = current.clients.find(c => c.name === task.project);
        const estPrice = Math.round((powerKwp * 3800 + batteryKwh * 2100) / 100) * 100;
        const newInstId = Date.now();
        const today = new Date();
        const deadlineDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        const auditDate = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
        const newInstallation: Project = {
          id: newInstId,
          name: convertedName,
          client: task.project,
          manager: task.assignee,
          status: 'Audyt i projekt',
          priority: task.priority,
          start: formatPlShortDate(today),
          deadline: formatPlShortDate(deadlineDate),
          progress: 15,
          color: 'blue',
          initials: convertedName.slice(0, 2).toUpperCase(),
          systemType: powerKwp > 20 ? 'Fotowoltaika B2B + BESS' : 'PV + Magazyn energii',
          powerKwp,
          batteryKwh,
          osdOperator: clientMatch?.osd || 'PGE',
          subsidyProgram: powerKwp > 20 ? 'Brak (B2B)' : current.settings.defaultSubsidy,
          subsidyStatus: 'W przygotowaniu',
          roofType: 'Dachówka ceramiczna',
          contractValue: `${estPrice.toLocaleString('pl-PL')} PLN`,
          installTeam: 'Ekipa Mazowsze-1',
          voivodeship: clientMatch?.voivodeship || 'Mazowieckie',
          notes: task.notes || 'Automatycznie utworzono po podpisaniu umowy handlowej.',
        };
        projects = [newInstallation, ...projects];
        events = [
          {
            id: Date.now() + 1,
            name: `Audyt przedmontażowy: ${task.project}`,
            date: auditDate.toISOString().slice(0, 10),
            eventType: 'Audyt',
            client: task.project,
            installationId: newInstId,
          },
          ...events,
        ];
        actionMessage = 'podpisał umowę — automatycznie utworzono realizację OZE i wniosek dotacyjny';
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
      ...current.activities.slice(0, 14),
    ];
    const updated = { ...current, tasks, projects, events, activities };
    saveLocalCache(updated);
    return updated;
  },

  // Delete a lead from SQLite
  async deleteLead(id: number, actor?: string): Promise<DatabaseSnapshot> {
    try {
      const q = new URLSearchParams({ id: String(id), actor: actor || '' });
      const res = await fetch(`/api/db/leads?${q.toString()}`, { method: 'DELETE' });
      if (res.ok) {
        const snapshot = (await res.json()) as DatabaseSnapshot;
        saveLocalCache(snapshot);
        return snapshot;
      }
    } catch {
      // Fallback
    }

    const current = getLocalFallbackSnapshot();
    const tasks = current.tasks.filter(t => t.id !== id);
    const updated = { ...current, tasks };
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

  // Delete a client record from SQLite
  async deleteClient(id: number, actor?: string): Promise<DatabaseSnapshot> {
    try {
      const q = new URLSearchParams({ id: String(id), actor: actor || '' });
      const res = await fetch(`/api/db/clients?${q.toString()}`, { method: 'DELETE' });
      if (res.ok) {
        const snapshot = (await res.json()) as DatabaseSnapshot;
        saveLocalCache(snapshot);
        return snapshot;
      }
    } catch {
      // Fallback
    }

    const current = getLocalFallbackSnapshot();
    const clients = current.clients.filter(c => c.id !== id);
    const updated = { ...current, clients };
    saveLocalCache(updated);
    return updated;
  },

  // Create or update a full employee / user record in SQLite
  async saveUser(user: Employee, actor?: string): Promise<DatabaseSnapshot> {
    try {
      const res = await fetch('/api/db/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...user, actor }),
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
    const exists = current.users.some(u => u.id === user.id);
    const users = exists
      ? current.users.map(u => (u.id === user.id ? user : u))
      : [...current.users, user];
    const updated = { ...current, users };
    saveLocalCache(updated);
    return updated;
  },

  // Update a user's RBAC role ('admin' | 'manager' | 'salesman') or workload in SQLite
  async updateUserRole(
    id: number,
    systemRole: SystemRole,
    actor?: string,
    workload?: number
  ): Promise<DatabaseSnapshot> {
    try {
      const res = await fetch('/api/db/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, systemRole, actor, workload }),
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
    const users = current.users.map(u =>
      u.id === id ? { ...u, systemRole, ...(workload !== undefined ? { workload } : {}) } : u
    );
    const updated = { ...current, users };
    saveLocalCache(updated);
    return updated;
  },

  // Delete a user / employee from SQLite
  async deleteUser(id: number, actor?: string): Promise<DatabaseSnapshot> {
    try {
      const q = new URLSearchParams({ id: String(id), actor: actor || '' });
      const res = await fetch(`/api/db/users?${q.toString()}`, { method: 'DELETE' });
      if (res.ok) {
        const snapshot = (await res.json()) as DatabaseSnapshot;
        saveLocalCache(snapshot);
        return snapshot;
      }
    } catch {
      // Fallback
    }

    const current = getLocalFallbackSnapshot();
    const users = current.users.filter(u => u.id !== id);
    const updated = { ...current, users };
    saveLocalCache(updated);
    return updated;
  },

  // Insert or update a calendar schedule event in SQLite
  async saveEvent(event: CalendarEvent, actor?: string): Promise<DatabaseSnapshot> {
    try {
      const res = await fetch('/api/db/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...event, actor }),
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
    const exists = event.id !== undefined && current.events.some(ev => ev.id === event.id);
    const events = exists
      ? current.events.map(ev => (ev.id === event.id ? event : ev))
      : [{ ...event, id: event.id || Date.now() }, ...current.events];
    const updated = {
      ...current,
      events,
    };
    saveLocalCache(updated);
    return updated;
  },

  // Delete a calendar schedule event from SQLite
  async deleteEvent(id: number, actor?: string): Promise<DatabaseSnapshot> {
    try {
      const q = new URLSearchParams({ id: String(id), actor: actor || '' });
      const res = await fetch(`/api/db/events?${q.toString()}`, { method: 'DELETE' });
      if (res.ok) {
        const snapshot = (await res.json()) as DatabaseSnapshot;
        saveLocalCache(snapshot);
        return snapshot;
      }
    } catch {
      // Fallback
    }

    const current = getLocalFallbackSnapshot();
    const updated = {
      ...current,
      events: current.events.filter(ev => ev.id !== id),
    };
    saveLocalCache(updated);
    return updated;
  },

  // Save system settings in SQLite `settings` table
  async saveSettings(settings: SystemSettings, actor?: string): Promise<DatabaseSnapshot> {
    try {
      const res = await fetch('/api/db/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, actor }),
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
    const updated = { ...current, settings };
    saveLocalCache(updated);
    return updated;
  },

  // Download full SQLite database JSON backup from `/api/db/backup`
  async downloadBackup(): Promise<void> {
    try {
      const res = await fetch('/api/db/backup');
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sm-oze-sqlite-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }
    } catch {
      // Fallback to exporting local snapshot
    }
    const fallback = getLocalFallbackSnapshot();
    const blob = new Blob([JSON.stringify(fallback, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sm-oze-sqlite-backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // Calculate PV power (kWp), battery storage (kWh), subsidy and payback via Python FastAPI backend
  async calculateOze(monthlyBillPln: number): Promise<{
    recommendedPowerKwp: number;
    recommendedBatteryKwh: number;
    estimatedPriceGrossPln: number;
    estimatedSubsidyPln: number;
    estimatedNetAfterSubsidyPln: number;
    paybackYears: number;
  }> {
    try {
      const res = await fetch('/api/db/calculate-oze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyBillPln: Math.max(50, monthlyBillPln) }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback calculation
    }
    const annualKwh = (monthlyBillPln * 12) / 1.15;
    const recommendedPowerKwp = Math.max(3.5, Math.round((annualKwh / 1000) * 1.15 * 10) / 10);
    const recommendedBatteryKwh =
      recommendedPowerKwp <= 6 ? 10 : recommendedPowerKwp <= 12 ? 15 : 20;
    const estimatedPriceGrossPln =
      Math.round((recommendedPowerKwp * 3800 + recommendedBatteryKwh * 2100) / 100) * 100;
    const estimatedSubsidyPln = recommendedPowerKwp <= 20 ? 23000 : 0;
    const estimatedNetAfterSubsidyPln = Math.max(0, estimatedPriceGrossPln - estimatedSubsidyPln);
    const paybackYears =
      Math.round((estimatedNetAfterSubsidyPln / Math.max(1200, monthlyBillPln * 12 * 0.88)) * 10) /
      10;
    return {
      recommendedPowerKwp,
      recommendedBatteryKwh,
      estimatedPriceGrossPln,
      estimatedSubsidyPln,
      estimatedNetAfterSubsidyPln,
      paybackYears,
    };
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
