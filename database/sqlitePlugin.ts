import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  initialProjects,
  initialTasks,
  initialClients,
  employees,
  initialActivities,
  type Project,
  type Task,
  type ClientRecord,
  type ActivityLog,
} from '../src/data.ts';

// Paths to the SQLite database file and schema definition
const DB_DIR = path.resolve(process.cwd(), 'database');
const DB_FILE = path.join(DB_DIR, 'oze_crm.sqlite');
const SCHEMA_FILE = path.join(DB_DIR, 'schema.sql');

// Initialize or open the SQLite database and seed initial OZE records if empty
export function openOzeSqliteDatabase(): DatabaseSync {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new DatabaseSync(DB_FILE);
  const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  db.exec(schemaSql);

  seedIfEmpty(db);
  return db;
}

// Seed initial demo data into SQLite tables when running for the first time
export function seedIfEmpty(db: DatabaseSync, forceReset = false) {
  if (forceReset) {
    db.exec(`
      DELETE FROM activity_logs;
      DELETE FROM calendar_events;
      DELETE FROM leads;
      DELETE FROM installations;
      DELETE FROM clients;
      DELETE FROM users;
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
        subsidy_program, subsidy_status, roof_type, contract_value, install_team, voivodeship
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        p.voivodeship
      );
    }
  }

  const leadCount = db.prepare('SELECT COUNT(*) as cnt FROM leads').get() as { cnt: number };
  if (leadCount.cnt === 0) {
    const insertLead = db.prepare(`
      INSERT INTO leads (id, name, project, priority, due, status, assignee, lead_source, estimated_power)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        t.estimatedPower || '9.8 kWp + 10 kWh'
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
}

// Read all tables from SQLite and map column names to frontend TypeScript interfaces
export function getBootstrapSnapshot(db: DatabaseSync) {
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

  const eventRows = db.prepare('SELECT * FROM calendar_events ORDER BY id DESC').all() as Record<string, unknown>[];
  const events = eventRows.map(r => ({
    name: String(r.name),
    date: String(r.date),
  }));

  const actRows = db
    .prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 12')
    .all() as Record<string, unknown>[];
  const activities: ActivityLog[] = actRows.map(r => ({
    id: Number(r.id),
    userName: String(r.user_name),
    action: String(r.action),
    target: String(r.target),
    timeLabel: String(r.time_label),
    color: String(r.color),
  }));

  return {
    meta: {
      engine: 'SQLite 3 (node:sqlite)',
      file: 'database/oze_crm.sqlite',
      tables: ['users', 'clients', 'installations', 'leads', 'calendar_events', 'activity_logs'],
      counts: {
        users: employees.length,
        clients: clients.length,
        installations: projects.length,
        leads: tasks.length,
      },
    },
    projects,
    tasks,
    clients,
    events,
    activities,
    users: employees,
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

// Vite plugin exposing the SQLite REST API at /api/db/*
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
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = req.url?.split('?')[0] || '';
        if (!url.startsWith('/api/db')) return next();

        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        try {
          const database = getDb();

          if (req.method === 'GET' && url === '/api/db/bootstrap') {
            res.end(JSON.stringify(getBootstrapSnapshot(database)));
            return;
          }

          if (req.method === 'POST' && url === '/api/db/installations') {
            const p = (await readJsonBody(req)) as unknown as Project & { actor?: string };
            const stmt = database.prepare(`
              INSERT INTO installations (
                id, name, client, manager, status, priority, start_date, deadline, progress,
                color, initials, system_type, power_kwp, battery_kwh, osd_operator,
                subsidy_program, subsidy_status, roof_type, contract_value, install_team, voivodeship
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                voivodeship = excluded.voivodeship
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
              p.voivodeship
            );

            database
              .prepare(
                'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
              )
              .run(
                p.actor || p.manager || 'Aleksander Morawski',
                `zaktualizował realizację (${p.status})`,
                p.name,
                'Przed chwilą',
                p.color || 'blue'
              );

            res.end(JSON.stringify(getBootstrapSnapshot(database)));
            return;
          }

          if (req.method === 'POST' && url === '/api/db/leads') {
            const t = (await readJsonBody(req)) as unknown as Task & { actor?: string };
            const stmt = database.prepare(`
              INSERT INTO leads (id, name, project, priority, due, status, assignee, lead_source, estimated_power)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                project = excluded.project,
                priority = excluded.priority,
                due = excluded.due,
                status = excluded.status,
                assignee = excluded.assignee,
                lead_source = excluded.lead_source,
                estimated_power = excluded.estimated_power
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
              t.estimatedPower || '9.8 kWp + 10 kWh'
            );

            database
              .prepare(
                'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
              )
              .run(
                t.actor || t.assignee || 'Aleksander Morawski',
                `zmienił etap zadania/leada na: ${t.status}`,
                t.name,
                'Przed chwilą',
                'purple'
              );

            res.end(JSON.stringify(getBootstrapSnapshot(database)));
            return;
          }

          if (req.method === 'POST' && url === '/api/db/clients') {
            const c = (await readJsonBody(req)) as unknown as ClientRecord & { actor?: string };
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
              c.projects,
              c.status,
              c.color,
              c.address,
              c.voivodeship,
              c.osd,
              c.financing,
              c.ownerName || 'Aleksander Morawski'
            );

            database
              .prepare(
                'INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)'
              )
              .run(
                c.actor || c.ownerName || 'Aleksander Morawski',
                'dodał nowego inwestora do bazy SQL',
                c.name,
                'Przed chwilą',
                'teal'
              );

            res.end(JSON.stringify(getBootstrapSnapshot(database)));
            return;
          }

          if (req.method === 'POST' && url === '/api/db/events') {
            const ev = (await readJsonBody(req)) as { name: string; date: string };
            database
              .prepare('INSERT INTO calendar_events (name, date) VALUES (?, ?)')
              .run(ev.name, ev.date);
            res.end(JSON.stringify(getBootstrapSnapshot(database)));
            return;
          }

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
      });
    },
  };
}
