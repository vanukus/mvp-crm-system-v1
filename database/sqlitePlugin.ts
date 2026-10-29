import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
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
} from '../src/data.ts';

// Paths to the SQLite database file and schema definition
const DB_DIR = path.resolve(process.cwd(), 'database');
const DB_FILE = path.join(DB_DIR, 'oze_crm.sqlite');
const SCHEMA_FILE = path.join(DB_DIR, 'schema.sql');

// Ensure existing SQLite database files have all new columns without data loss
function ensureSchemaMigrations(db: DatabaseSync) {
  const safeAlter = (sql: string) => {
    try {
      db.exec(sql);
    } catch {
      // Column already exists
    }
  };

  safeAlter("ALTER TABLE installations ADD COLUMN notes TEXT NOT NULL DEFAULT '';");
  safeAlter("ALTER TABLE leads ADD COLUMN notes TEXT NOT NULL DEFAULT '';");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'Montaż';");
  safeAlter("ALTER TABLE calendar_events ADD COLUMN client TEXT NOT NULL DEFAULT '';");
  safeAlter('ALTER TABLE calendar_events ADD COLUMN installation_id INTEGER;');
}

// Synchronize each client's `projects` count with actual installations in SQLite
function syncClientProjectCounts(db: DatabaseSync) {
  db.exec(`
    UPDATE clients
    SET projects = (
      SELECT COUNT(*) FROM installations WHERE installations.client = clients.name
    );
  `);
}

// Initialize or open the SQLite database, run migrations, and seed initial OZE records if empty
export function openOzeSqliteDatabase(): DatabaseSync {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new DatabaseSync(DB_FILE);
  const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  db.exec(schemaSql);
  ensureSchemaMigrations(db);
  seedIfEmpty(db);
  syncClientProjectCounts(db);
  return db;
}

// Seed initial demo data into SQLite tables when running for the first time or on reset
export function seedIfEmpty(db: DatabaseSync, forceReset = false) {
  if (forceReset) {
    db.exec(`
      DELETE FROM activity_logs;
      DELETE FROM calendar_events;
      DELETE FROM leads;
      DELETE FROM installations;
      DELETE FROM clients;
      DELETE FROM users;
      DELETE FROM settings;
    `);
  }

  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
  if (userCount.cnt === 0) {
    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, role, title, department, region, workload, color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const emp of employees) {
      insertUser.run(
        emp.id,
        emp.name,
        emp.email,
        emp.systemRole,
        emp.role,
        emp.department,
        emp.region,
        emp.workload,
        emp.color
      );
    }
  }

  const clientCount = db.prepare('SELECT COUNT(*) as cnt FROM clients').get() as { cnt: number };
  if (clientCount.cnt === 0) {
    const insertClient = db.prepare(`
      INSERT INTO clients (id, name, contact, email, phone, projects, status, color, address, voivodeship, osd, financing, owner_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of initialClients) {
      insertClient.run(
        c.id,
        c.name,
        c.contact,
        c.email,
        c.phone,
        c.projects,
        c.status,
        c.color,
        c.address,
        c.voivodeship,
        c.osd,
        c.financing,
        c.ownerName || 'Aleksander Morawski'
      );
    }
  }

  const instCount = db.prepare('SELECT COUNT(*) as cnt FROM installations').get() as { cnt: number };
  if (instCount.cnt === 0) {
    const insertInst = db.prepare(`
      INSERT INTO installations (
        id, name, client, manager, status, priority, start_date, deadline, progress,
        color, initials, system_type, power_kwp, battery_kwh, osd_operator,
        subsidy_program, subsidy_status, roof_type, contract_value, install_team, voivodeship, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of initialProjects) {
      insertInst.run(
        p.id,
        p.name,
        p.client,
        p.manager,
        p.status,
        p.priority,
        p.start,
        p.deadline,
        p.progress,
        p.color,
        p.initials,
        p.systemType,
        p.powerKwp,
        p.batteryKwh,
        p.osdOperator,
        p.subsidyProgram,
        p.subsidyStatus,
        p.roofType,
        p.contractValue,
        p.installTeam,
        p.voivodeship,
        p.notes || ''
      );
    }
  }

  const leadCount = db.prepare('SELECT COUNT(*) as cnt FROM leads').get() as { cnt: number };
  if (leadCount.cnt === 0) {
    const insertLead = db.prepare(`
      INSERT INTO leads (id, name, project, priority, due, status, assignee, lead_source, estimated_power, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const t of initialTasks) {
      insertLead.run(
        t.id,
        t.name,
        t.project,
        t.priority,
        t.due,
        t.status,
        t.assignee,
        t.leadSource || 'Kalkulator WWW',
        t.estimatedPower || '9.8 kWp + 10 kWh',
        t.notes || ''
      );
    }
  }

  const eventCount = db.prepare('SELECT COUNT(*) as cnt FROM calendar_events').get() as { cnt: number };
  if (eventCount.cnt === 0) {
    const insertEvent = db.prepare(`
      INSERT INTO calendar_events (id, name, date, event_type, client, installation_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const ev of initialEvents) {
      insertEvent.run(
        ev.id || null,
        ev.name,
        ev.date,
        ev.eventType || 'Montaż',
        ev.client || '',
        ev.installationId || null
      );
    }
  }

  const actCount = db.prepare('SELECT COUNT(*) as cnt FROM activity_logs').get() as { cnt: number };
  if (actCount.cnt === 0) {
    const insertAct = db.prepare(`
      INSERT INTO activity_logs (user_name, action, target, time_label, color)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const a of initialActivities) {
      insertAct.run(a.userName, a.action, a.target, a.timeLabel, a.color);
    }
  }

  const settingsCount = db.prepare('SELECT COUNT(*) as cnt FROM settings').get() as { cnt: number };
  if (settingsCount.cnt === 0) {
    const insertSetting = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
    `);
    for (const [k, v] of Object.entries(defaultSettings)) {
      insertSetting.run(k, String(v));
    }
  }

  syncClientProjectCounts(db);
}

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

// Read settings key-value pairs from SQLite
function readSettingsFromDb(db: DatabaseSync): SystemSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return {
    companyName: map.companyName || defaultSettings.companyName,
    adminName: map.adminName || defaultSettings.adminName,
    officeEmail: map.officeEmail || defaultSettings.officeEmail,
    defaultSubsidy: (map.defaultSubsidy as Project['subsidyProgram']) || defaultSettings.defaultSubsidy,
    autoConvertLead:
      map.autoConvertLead !== undefined
        ? map.autoConvertLead === 'true'
        : defaultSettings.autoConvertLead,
  };
}

// Read all tables from SQLite and map column names to frontend TypeScript interfaces
export function getBootstrapSnapshot(db: DatabaseSync) {
  syncClientProjectCounts(db);

  const userRows = db.prepare('SELECT * FROM users ORDER BY id ASC').all() as Record<string, unknown>[];
  const users: Employee[] = userRows.length
    ? userRows.map(r => ({
        id: Number(r.id),
        name: String(r.name),
        email: String(r.email),
        systemRole: String(r.role) as SystemRole,
        role: String(r.title),
        department: String(r.department),
        region: String(r.region),
        workload: Number(r.workload),
        color: String(r.color),
      }))
    : employees;

  const instRows = db.prepare('SELECT * FROM installations ORDER BY id DESC').all() as Record<string, unknown>[];
  const projects: Project[] = instRows.map(r => ({
    id: Number(r.id),
    name: String(r.name),
    client: String(r.client),
    manager: String(r.manager),
    status: String(r.status),
    priority: String(r.priority),
    start: String(r.start_date),
    deadline: String(r.deadline),
    progress: Number(r.progress),
    color: String(r.color),
    initials: String(r.initials),
    systemType: String(r.system_type),
    powerKwp: Number(r.power_kwp),
    batteryKwh: Number(r.battery_kwh),
    osdOperator: String(r.osd_operator) as Project['osdOperator'],
    subsidyProgram: String(r.subsidy_program) as Project['subsidyProgram'],
    subsidyStatus: String(r.subsidy_status) as Project['subsidyStatus'],
    roofType: String(r.roof_type) as Project['roofType'],
    contractValue: String(r.contract_value),
    installTeam: String(r.install_team),
    voivodeship: String(r.voivodeship),
    notes: r.notes ? String(r.notes) : '',
  }));

  const leadRows = db.prepare('SELECT * FROM leads ORDER BY id DESC').all() as Record<string, unknown>[];
  const tasks: Task[] = leadRows.map(r => ({
    id: Number(r.id),
    name: String(r.name),
    project: String(r.project),
    priority: String(r.priority),
    due: String(r.due),
    status: String(r.status),
    assignee: String(r.assignee),
    leadSource: r.lead_source ? String(r.lead_source) : undefined,
    estimatedPower: r.estimated_power ? String(r.estimated_power) : undefined,
    notes: r.notes ? String(r.notes) : '',
  }));

  const clientRows = db.prepare('SELECT * FROM clients ORDER BY id DESC').all() as Record<string, unknown>[];
  const clients: ClientRecord[] = clientRows.map(r => ({
    id: Number(r.id),
    name: String(r.name),
    contact: String(r.contact),
    email: String(r.email),
    phone: String(r.phone),
    projects: Number(r.projects),
    status: String(r.status),
    color: String(r.color),
    address: String(r.address),
    voivodeship: String(r.voivodeship),
    osd: String(r.osd) as ClientRecord['osd'],
    financing: String(r.financing),
    ownerName: r.owner_name ? String(r.owner_name) : undefined,
  }));

  const eventRows = db.prepare('SELECT * FROM calendar_events ORDER BY date ASC, id ASC').all() as Record<
    string,
    unknown
  >[];
  const events: CalendarEvent[] = eventRows.map(r => ({
    id: Number(r.id),
    name: String(r.name),
    date: String(r.date),
    eventType: (r.event_type ? String(r.event_type) : 'Montaż') as CalendarEvent['eventType'],
    client: r.client ? String(r.client) : '',
    installationId: r.installation_id ? Number(r.installation_id) : undefined,
  }));

  const actRows = db
    .prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 15')
    .all() as Record<string, unknown>[];
  const activities: ActivityLog[] = actRows.map(r => ({
    id: Number(r.id),
    userName: String(r.user_name),
    action: String(r.action),
    target: String(r.target),
    timeLabel: String(r.time_label),
    color: String(r.color),
  }));

  const settings = readSettingsFromDb(db);

  return {
    meta: {
      engine: 'Python FastAPI + SQLite 3',
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
        users: users.length,
        clients: clients.length,
        installations: projects.length,
        leads: tasks.length,
        events: events.length,
      },
    },
    projects,
    tasks,
    clients,
    events,
    activities,
    users,
    settings,
  };
}

// Helper to parse JSON body from IncomingMessage
function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';
let fastApiProcess: ChildProcess | null = null;

// Spawn the Python FastAPI backend (backend/main.py) in the background if not already running
function ensureFastApiRunning() {
  if (fastApiProcess) return;
  try {
    fastApiProcess = spawn('python', ['-m', 'backend.main'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      windowsHide: true,
    });
    fastApiProcess.on('error', () => {
      fastApiProcess = null;
    });
    fastApiProcess.on('exit', () => {
      fastApiProcess = null;
    });
  } catch {
    fastApiProcess = null;
  }
}

// Create the HTTP middleware handler that forwards /api/db/* to Python FastAPI with local SQLite fallback
function createSqliteMiddleware(getDb: () => DatabaseSync) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const rawUrl = req.url || '';
    const [url, queryString] = rawUrl.split('?');
    if (!url.startsWith('/api/db')) return next();

    const params = new URLSearchParams(queryString || '');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    try {
      // Read request body once so it can be forwarded to FastAPI or processed by the SQLite fallback
      const bodyObj =
        req.method === 'POST' || req.method === 'PUT' ? await readJsonBody(req) : undefined;

      // Forward request to the running Python FastAPI server (http://127.0.0.1:8000) if reachable
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 600);
        const fastApiRes = await fetch(`${FASTAPI_URL}${rawUrl}`, {
          method: req.method,
          headers: { 'Content-Type': 'application/json' },
          body: bodyObj ? JSON.stringify(bodyObj) : undefined,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (fastApiRes.ok || fastApiRes.status === 403) {
          res.statusCode = fastApiRes.status;
          const disposition = fastApiRes.headers.get('content-disposition');
          if (disposition) {
            res.setHeader('Content-Disposition', disposition);
          }
          const text = await fastApiRes.text();
          res.end(text);
          return;
        }
      } catch {
        // FastAPI server is warming up or offline in sandbox; execute directly against database/oze_crm.sqlite
      }

      const database = getDb();

      // 1. GET /api/db/bootstrap — Load full relational snapshot
      if (req.method === 'GET' && url === '/api/db/bootstrap') {
        res.end(JSON.stringify(getBootstrapSnapshot(database)));
        return;
      }

      // 2. GET /api/db/backup — Export full SQLite database backup as downloadable JSON
      if (req.method === 'GET' && url === '/api/db/backup') {
        const snapshot = getBootstrapSnapshot(database);
        res.setHeader('Content-Disposition', 'attachment; filename="sm-oze-sqlite-backup.json"');
        res.end(JSON.stringify(snapshot, null, 2));
        return;
      }

      // 2b. POST /api/db/calculate-oze — OZE engineering calculator
      if (req.method === 'POST' && url === '/api/db/calculate-oze') {
        const bill = Number(bodyObj?.monthlyBillPln || 450);
        const hasHeatPump = Boolean(bodyObj?.hasHeatPump);
        const annualDemandKwh = Math.round((bill * 12) / 1.15) + (hasHeatPump ? 3500 : 0);
        const recommendedPowerKwp = Math.max(
          3.5,
          Math.round((annualDemandKwh / 1000) * 1.15 * 10) / 10
        );
        const recommendedBatteryKwh =
          recommendedPowerKwp <= 6 ? 10 : recommendedPowerKwp <= 12 ? 15 : 20;
        const estimatedPriceGrossPln =
          Math.round((recommendedPowerKwp * 3800 + recommendedBatteryKwh * 2100) / 100) * 100;
        const estimatedSubsidyPln = recommendedPowerKwp <= 20 ? 23000 : 0;
        const estimatedNetAfterSubsidyPln = Math.max(
          0,
          estimatedPriceGrossPln - estimatedSubsidyPln
        );
        const annualSavings = Math.max(1200, bill * 12 * 0.88);
        const paybackYears = Math.round((estimatedNetAfterSubsidyPln / annualSavings) * 10) / 10;

        res.end(
          JSON.stringify({
            monthlyBillPln: bill,
            annualDemandKwh,
            recommendedPowerKwp,
            recommendedBatteryKwh,
            estimatedPriceGrossPln,
            estimatedSubsidyPln,
            estimatedNetAfterSubsidyPln,
            paybackYears,
          })
        );
        return;
      }

      // 3. POST & DELETE /api/db/installations — Create, update, or delete an OZE installation
      if (url === '/api/db/installations') {
        if (req.method === 'DELETE') {
          const id = Number(params.get('id'));
          const actor = params.get('actor') || 'Aleksander Morawski';
          const actorRole = params.get('actorRole') || 'admin';
          if (actorRole === 'salesman') {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Brak uprawnień RBAC do usunięcia realizacji.' }));
            return;
          }
          const existing = database
            .prepare('SELECT name FROM installations WHERE id = ?')
            .get(id) as { name?: string } | undefined;
          database.prepare('DELETE FROM installations WHERE id = ?').run(id);
          database.prepare('DELETE FROM calendar_events WHERE installation_id = ?').run(id);
          if (existing?.name) {
            database
              .prepare(
                'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
              )
              .run(actor, 'usunął realizację OZE z bazy SQL', existing.name, 'Przed chwilą', 'orange');
          }
          res.end(JSON.stringify(getBootstrapSnapshot(database)));
          return;
        }

        if (req.method === 'POST') {
          const p = (bodyObj || (await readJsonBody(req))) as unknown as Project & {
            actor?: string;
            actorRole?: SystemRole;
          };
          if (p.actorRole === 'salesman') {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Tylko Manager lub Admin może edytować realizacje.' }));
            return;
          }

          const stmt = database.prepare(`
            INSERT INTO installations (
              id, name, client, manager, status, priority, start_date, deadline, progress,
              color, initials, system_type, power_kwp, battery_kwh, osd_operator,
              subsidy_program, subsidy_status, roof_type, contract_value, install_team, voivodeship, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              client = excluded.client,
              manager = excluded.manager,
              status = excluded.status,
              priority = excluded.priority,
              deadline = excluded.deadline,
              progress = excluded.progress,
              system_type = excluded.system_type,
              power_kwp = excluded.power_kwp,
              battery_kwh = excluded.battery_kwh,
              osd_operator = excluded.osd_operator,
              subsidy_program = excluded.subsidy_program,
              subsidy_status = excluded.subsidy_status,
              roof_type = excluded.roof_type,
              contract_value = excluded.contract_value,
              install_team = excluded.install_team,
              voivodeship = excluded.voivodeship,
              notes = excluded.notes
          `);
          stmt.run(
            p.id,
            p.name,
            p.client,
            p.manager,
            p.status,
            p.priority,
            p.start,
            p.deadline,
            p.progress,
            p.color,
            p.initials,
            p.systemType,
            p.powerKwp,
            p.batteryKwh,
            p.osdOperator,
            p.subsidyProgram,
            p.subsidyStatus,
            p.roofType,
            p.contractValue,
            p.installTeam,
            p.voivodeship,
            p.notes || ''
          );

          // Automatically update client status in SQLite based on installation stage
          if (p.status === 'Odebrane') {
            database.prepare('UPDATE clients SET status = ? WHERE name = ?').run('Zakończony', p.client);
          } else {
            database.prepare('UPDATE clients SET status = ? WHERE name = ?').run('W realizacji', p.client);
          }

          database
            .prepare(
              'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
            )
            .run(
              p.actor || p.manager || 'Aleksander Morawski',
              `zaktualizował realizację (${p.status} · ${p.subsidyStatus})`,
              p.name,
              'Przed chwilą',
              p.color || 'blue'
            );

          res.end(JSON.stringify(getBootstrapSnapshot(database)));
          return;
        }
      }

      // 4. POST & DELETE /api/db/leads — Create, update, or delete a lead (with automatic funnel conversion)
      if (url === '/api/db/leads') {
        if (req.method === 'DELETE') {
          const id = Number(params.get('id'));
          const actor = params.get('actor') || 'Aleksander Morawski';
          const existing = database
            .prepare('SELECT name FROM leads WHERE id = ?')
            .get(id) as { name?: string } | undefined;
          database.prepare('DELETE FROM leads WHERE id = ?').run(id);
          if (existing?.name) {
            database
              .prepare(
                'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
              )
              .run(actor, 'usunął lead z lejka sprzedaży', existing.name, 'Przed chwilą', 'orange');
          }
          res.end(JSON.stringify(getBootstrapSnapshot(database)));
          return;
        }

        if (req.method === 'POST') {
          const t = (bodyObj || (await readJsonBody(req))) as unknown as Task & { actor?: string };
          const stmt = database.prepare(`
            INSERT INTO leads (id, name, project, priority, due, status, assignee, lead_source, estimated_power, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              project = excluded.project,
              priority = excluded.priority,
              due = excluded.due,
              status = excluded.status,
              assignee = excluded.assignee,
              lead_source = excluded.lead_source,
              estimated_power = excluded.estimated_power,
              notes = excluded.notes
          `);
          stmt.run(
            t.id,
            t.name,
            t.project,
            t.priority,
            t.due,
            t.status,
            t.assignee,
            t.leadSource || 'Kalkulator WWW',
            t.estimatedPower || '9.8 kWp + 10 kWh',
            t.notes || ''
          );

          const settings = readSettingsFromDb(database);

          // Automated Lead-to-Installation Funnel Trigger (controlled by SQLite settings.autoConvertLead)
          if (
            settings.autoConvertLead &&
            (t.status === 'Umowa podpisana (Wygrana)' || t.status === 'Zrealizowane')
          ) {
            const convertedName = t.name.replace(/^Lead(\s*B2B|\s*D2D)?:\s*/i, '');
            const existing = database
              .prepare('SELECT id FROM installations WHERE name = ?')
              .get(convertedName) as { id?: number } | undefined;

            if (!existing) {
              const { powerKwp, batteryKwh } = parsePowerAndBattery(t.estimatedPower);
              const clientRow = database
                .prepare('SELECT * FROM clients WHERE name = ? LIMIT 1')
                .get(t.project) as Record<string, unknown> | undefined;
              const osdOp = clientRow?.osd ? String(clientRow.osd) : 'PGE';
              const voiv = clientRow?.voivodeship ? String(clientRow.voivodeship) : 'Mazowieckie';
              const estPrice = Math.round((powerKwp * 3800 + batteryKwh * 2100) / 100) * 100;
              const newInstId = Date.now();
              const today = new Date();
              const deadlineDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
              const auditDate = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
              const startStr = formatPlShortDate(today);
              const deadlineStr = formatPlShortDate(deadlineDate);
              const auditIso = auditDate.toISOString().slice(0, 10);

              database
                .prepare(
                  `INSERT INTO installations (
                    id, name, client, manager, status, priority, start_date, deadline, progress,
                    color, initials, system_type, power_kwp, battery_kwh, osd_operator,
                    subsidy_program, subsidy_status, roof_type, contract_value, install_team, voivodeship, notes
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                )
                .run(
                  newInstId,
                  convertedName,
                  t.project,
                  t.assignee,
                  'Audyt i projekt',
                  t.priority,
                  startStr,
                  deadlineStr,
                  15,
                  'blue',
                  convertedName.slice(0, 2).toUpperCase(),
                  powerKwp > 20 ? 'Fotowoltaika B2B + BESS' : 'PV + Magazyn energii',
                  powerKwp,
                  batteryKwh,
                  osdOp,
                  powerKwp > 20 ? 'Brak (B2B)' : settings.defaultSubsidy,
                  'W przygotowaniu',
                  'Dachówka ceramiczna',
                  `${estPrice.toLocaleString('pl-PL')} PLN`,
                  'Ekipa Mazowsze-1',
                  voiv,
                  t.notes || 'Automatycznie utworzono po podpisaniu umowy handlowej.'
                );

              // Update client status to 'W realizacji'
              database
                .prepare('UPDATE clients SET status = ? WHERE name = ?')
                .run('W realizacji', t.project);

              // Create automatic technical audit event in calendar_events
              database
                .prepare(
                  'INSERT INTO calendar_events (name, date, event_type, client, installation_id) VALUES (?, ?, ?, ?, ?)'
                )
                .run(
                  `Audyt przedmontażowy: ${t.project}`,
                  auditIso,
                  'Audyt',
                  t.project,
                  newInstId
                );

              database
                .prepare(
                  'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
                )
                .run(
                  t.actor || t.assignee,
                  'podpisał umowę — automatycznie utworzono realizację OZE i wniosek dotacyjny',
                  convertedName,
                  'Przed chwilą',
                  'green'
                );
            }
          } else {
            database
              .prepare(
                'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
              )
              .run(
                t.actor || t.assignee || 'Aleksander Morawski',
                `zaktualizował lead (${t.status})`,
                t.name,
                'Przed chwilą',
                'purple'
              );
          }

          res.end(JSON.stringify(getBootstrapSnapshot(database)));
          return;
        }
      }

      // 5. POST & DELETE /api/db/clients — Create, update, or delete an investor/client record
      if (url === '/api/db/clients') {
        if (req.method === 'DELETE') {
          const id = Number(params.get('id'));
          const actor = params.get('actor') || 'Aleksander Morawski';
          const existing = database
            .prepare('SELECT name FROM clients WHERE id = ?')
            .get(id) as { name?: string } | undefined;
          database.prepare('DELETE FROM clients WHERE id = ?').run(id);
          if (existing?.name) {
            database
              .prepare(
                'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
              )
              .run(actor, 'usunął kartę klienta z bazy SQL', existing.name, 'Przed chwilą', 'orange');
          }
          res.end(JSON.stringify(getBootstrapSnapshot(database)));
          return;
        }

        if (req.method === 'POST') {
          const c = (bodyObj || (await readJsonBody(req))) as unknown as ClientRecord & { actor?: string };
          const isExisting = Boolean(
            database.prepare('SELECT id FROM clients WHERE id = ?').get(c.id)
          );
          const stmt = database.prepare(`
            INSERT INTO clients (id, name, contact, email, phone, projects, status, color, address, voivodeship, osd, financing, owner_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              contact = excluded.contact,
              email = excluded.email,
              phone = excluded.phone,
              status = excluded.status,
              address = excluded.address,
              voivodeship = excluded.voivodeship,
              osd = excluded.osd,
              financing = excluded.financing,
              owner_name = excluded.owner_name
          `);
          stmt.run(
            c.id,
            c.name,
            c.contact,
            c.email,
            c.phone,
            c.projects || 0,
            c.status || 'Aktywny',
            c.color || 'blue',
            c.address,
            c.voivodeship || 'Mazowieckie',
            c.osd || 'PGE',
            c.financing || 'Gotówka',
            c.ownerName || 'Aleksander Morawski'
          );

          database
            .prepare(
              'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
            )
            .run(
              c.actor || c.ownerName || 'Aleksander Morawski',
              isExisting ? 'zaktualizował dane inwestora w SQL' : 'dodał nowego inwestora do bazy SQL',
              c.name,
              'Przed chwilą',
              'teal'
            );

          res.end(JSON.stringify(getBootstrapSnapshot(database)));
          return;
        }
      }

      // 6. POST & DELETE /api/db/users — Update RBAC role or create/edit/delete employee in SQLite
      if (url === '/api/db/users') {
        if (req.method === 'DELETE') {
          const id = Number(params.get('id'));
          const actor = params.get('actor') || 'Aleksander Morawski';
          const existing = database
            .prepare('SELECT name FROM users WHERE id = ?')
            .get(id) as { name?: string } | undefined;
          database.prepare('DELETE FROM users WHERE id = ?').run(id);
          if (existing?.name) {
            database
              .prepare(
                'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
              )
              .run(actor, 'usunął pracownika z bazy RBAC', existing.name, 'Przed chwilą', 'orange');
          }
          res.end(JSON.stringify(getBootstrapSnapshot(database)));
          return;
        }

        if (req.method === 'POST') {
          const body = (bodyObj || (await readJsonBody(req))) as Partial<Employee> & {
            id: number;
            systemRole: SystemRole;
            actor?: string;
          };

          if (body.name && body.email) {
            // Full employee insert or update
            const stmt = database.prepare(`
              INSERT INTO users (id, name, email, role, title, department, region, workload, color)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                email = excluded.email,
                role = excluded.role,
                title = excluded.title,
                department = excluded.department,
                region = excluded.region,
                workload = excluded.workload,
                color = excluded.color
            `);
            stmt.run(
              body.id,
              body.name,
              body.email,
              body.systemRole,
              body.role || 'Doradca OZE',
              body.department || 'Sprzedaż D2D',
              body.region || 'Mazowieckie',
              body.workload ?? 65,
              body.color || 'blue'
            );
            database
              .prepare(
                'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
              )
              .run(
                body.actor || 'Aleksander Morawski',
                `zapisano profil pracownika (${body.systemRole.toUpperCase()})`,
                body.name,
                'Przed chwilą',
                'blue'
              );
          } else {
            // Role-only or workload update
            if (body.workload !== undefined) {
              database
                .prepare('UPDATE users SET role = ?, workload = ? WHERE id = ?')
                .run(body.systemRole, body.workload, body.id);
            } else {
              database.prepare('UPDATE users SET role = ? WHERE id = ?').run(body.systemRole, body.id);
            }
            const targetUser = database
              .prepare('SELECT name FROM users WHERE id = ?')
              .get(body.id) as { name?: string } | undefined;
            if (targetUser?.name) {
              database
                .prepare(
                  'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
                )
                .run(
                  body.actor || 'Aleksander Morawski',
                  `zmienił uprawnienia RBAC na ${body.systemRole.toUpperCase()}`,
                  targetUser.name,
                  'Przed chwilą',
                  'blue'
                );
            }
          }

          res.end(JSON.stringify(getBootstrapSnapshot(database)));
          return;
        }
      }

      // 7. POST & DELETE /api/db/events — Create, update, or delete calendar schedule items
      if (url === '/api/db/events') {
        if (req.method === 'DELETE') {
          const id = Number(params.get('id'));
          const actor = params.get('actor') || 'Aleksander Morawski';
          const existing = database
            .prepare('SELECT name FROM calendar_events WHERE id = ?')
            .get(id) as { name?: string } | undefined;
          database.prepare('DELETE FROM calendar_events WHERE id = ?').run(id);
          if (existing?.name) {
            database
              .prepare(
                'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
              )
              .run(actor, 'usunął termin z grafiku montaży', existing.name, 'Przed chwilą', 'orange');
          }
          res.end(JSON.stringify(getBootstrapSnapshot(database)));
          return;
        }

        if (req.method === 'POST') {
          const ev = (bodyObj || (await readJsonBody(req))) as CalendarEvent & { actor?: string };
          if (ev.id) {
            const exists = Boolean(
              database.prepare('SELECT id FROM calendar_events WHERE id = ?').get(ev.id)
            );
            database
              .prepare(
                `INSERT INTO calendar_events (id, name, date, event_type, client, installation_id)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                   name = excluded.name,
                   date = excluded.date,
                   event_type = excluded.event_type,
                   client = excluded.client,
                   installation_id = excluded.installation_id`
              )
              .run(
                ev.id,
                ev.name,
                ev.date,
                ev.eventType || 'Montaż',
                ev.client || '',
                ev.installationId || null
              );
            database
              .prepare(
                'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
              )
              .run(
                ev.actor || 'Aleksander Morawski',
                exists
                  ? `zaktualizował termin w grafiku (${ev.date})`
                  : `zaplanował w grafiku (${ev.date})`,
                ev.name,
                'Przed chwilą',
                'teal'
              );
          } else {
            database
              .prepare(
                'INSERT INTO calendar_events (name, date, event_type, client, installation_id) VALUES (?, ?, ?, ?, ?)'
              )
              .run(
                ev.name,
                ev.date,
                ev.eventType || 'Montaż',
                ev.client || '',
                ev.installationId || null
              );

            database
              .prepare(
                'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
              )
              .run(
                ev.actor || 'Aleksander Morawski',
                `zaplanował w grafiku (${ev.date})`,
                ev.name,
                'Przed chwilą',
                'teal'
              );
          }

          res.end(JSON.stringify(getBootstrapSnapshot(database)));
          return;
        }
      }

      // 8. POST /api/db/settings — Persist system & auto-conversion configuration in SQLite
      if (req.method === 'POST' && url === '/api/db/settings') {
        const body = (bodyObj || (await readJsonBody(req))) as SystemSettings & { actor?: string };
        const upsert = database.prepare(`
          INSERT INTO settings (key, value, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = datetime('now')
        `);
        upsert.run('companyName', String(body.companyName || defaultSettings.companyName));
        upsert.run('adminName', String(body.adminName || defaultSettings.adminName));
        upsert.run('officeEmail', String(body.officeEmail || defaultSettings.officeEmail));
        upsert.run('defaultSubsidy', String(body.defaultSubsidy || defaultSettings.defaultSubsidy));
        upsert.run('autoConvertLead', String(Boolean(body.autoConvertLead)));

        database
          .prepare(
            'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
          )
          .run(
            body.actor || body.adminName || 'Aleksander Morawski',
            'zaktualizował konfigurację systemu w tabeli SQL settings',
            body.companyName || 'SM-OZE Polska',
            'Przed chwilą',
            'blue'
          );

        res.end(JSON.stringify(getBootstrapSnapshot(database)));
        return;
      }

      // 9. POST /api/db/reset — Restore initial seed data
      if (req.method === 'POST' && url === '/api/db/reset') {
        seedIfEmpty(database, true);
        res.end(JSON.stringify(getBootstrapSnapshot(database)));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  };
}

// Vite plugin exposing the SQLite REST API at /api/db/* in both dev and preview modes
export function ozeSqliteApiPlugin(): Plugin {
  let db: DatabaseSync | null = null;

  const getDb = () => {
    if (!db) {
      db = openOzeSqliteDatabase();
    }
    return db;
  };

  return {
    name: 'oze-sqlite-api',
    configureServer(server) {
      ensureFastApiRunning();
      server.middlewares.use(createSqliteMiddleware(getDb));
    },
    configurePreviewServer(server) {
      ensureFastApiRunning();
      server.middlewares.use(createSqliteMiddleware(getDb));
    },
  };
}
