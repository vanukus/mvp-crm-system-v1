-- ============================================================================
-- SM-OZE Polska CRM & FSM — Lightweight SQLite Database Schema
-- Target market: Poland (PV, Energy Storage BESS, Heat Pumps & Passive Homes)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. Users & Employees table (RBAC roles: admin, manager, salesman)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'salesman')),
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  region TEXT NOT NULL,
  workload INTEGER NOT NULL DEFAULT 50,
  color TEXT NOT NULL DEFAULT 'blue',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Clients & Investors table (Homeowners B2C & Companies B2B)
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  projects INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Aktywny',
  color TEXT NOT NULL DEFAULT 'blue',
  address TEXT NOT NULL,
  voivodeship TEXT NOT NULL,
  osd TEXT NOT NULL CHECK (osd IN ('PGE', 'Tauron', 'Enea', 'Energa')),
  financing TEXT NOT NULL DEFAULT 'Gotówka',
  owner_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. OZE Installations / Realizations table (Operations & FSM funnel)
CREATE TABLE IF NOT EXISTS installations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  client TEXT NOT NULL,
  manager TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  start_date TEXT NOT NULL,
  deadline TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT 'blue',
  initials TEXT NOT NULL,
  system_type TEXT NOT NULL,
  power_kwp REAL NOT NULL DEFAULT 0,
  battery_kwh REAL NOT NULL DEFAULT 0,
  osd_operator TEXT NOT NULL CHECK (osd_operator IN ('PGE', 'Tauron', 'Enea', 'Energa')),
  subsidy_program TEXT NOT NULL,
  subsidy_status TEXT NOT NULL,
  roof_type TEXT NOT NULL,
  contract_value TEXT NOT NULL,
  install_team TEXT NOT NULL,
  voivodeship TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  checklist_json TEXT NOT NULL DEFAULT '{"inverterReady":false,"panelsReady":false,"batteryReady":false,"osdSubmitted":false}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 4. Sales Leads & Technical Audit Tasks table (Sales funnel)
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  project TEXT NOT NULL,
  priority TEXT NOT NULL,
  due TEXT NOT NULL,
  status TEXT NOT NULL,
  assignee TEXT NOT NULL,
  lead_source TEXT DEFAULT 'Kalkulator WWW',
  estimated_power TEXT DEFAULT '9.8 kWp + 10 kWh',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5. Calendar Events (Installations, Roof Audits, OSD Inspections)
CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'Montaż',
  client TEXT NOT NULL DEFAULT '',
  installation_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. Activity Audit Log table
CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  time_label TEXT NOT NULL DEFAULT 'Przed chwilą',
  color TEXT NOT NULL DEFAULT 'blue',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 7. System & Organization Settings table (Key-Value store)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for fast filtering by role, status, OSD operator, and voivodeship
CREATE INDEX IF NOT EXISTS idx_installations_status ON installations(status);
CREATE INDEX IF NOT EXISTS idx_installations_manager ON installations(manager);
CREATE INDEX IF NOT EXISTS idx_installations_osd ON installations(osd_operator);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assignee ON leads(assignee);
CREATE INDEX IF NOT EXISTS idx_clients_voivodeship ON clients(voivodeship);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date);
