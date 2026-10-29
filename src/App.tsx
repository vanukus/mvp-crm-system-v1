import { useEffect, useRef, useState } from 'react';
import {
  initialProjects,
  initialTasks,
  initialClients,
  employees as initialEmployees,
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
import { DataLayer } from './db';
import { Icon, Button, Avatar, Badge, Progress, Section } from './ui';

// Full list of navigation pages with their icons and allowed RBAC roles
const allPages: { name: string; icon: string; roles: SystemRole[] }[] = [
  { name: 'Przegląd', icon: 'grid', roles: ['admin', 'manager', 'salesman'] },
  { name: 'Realizacje OZE', icon: 'folder', roles: ['admin', 'manager', 'salesman'] },
  { name: 'Leady i Sprzedaż', icon: 'check', roles: ['admin', 'manager', 'salesman'] },
  { name: 'Dotacje i OSD', icon: 'alert', roles: ['admin', 'manager'] },
  { name: 'Klienci i Obiekty', icon: 'people', roles: ['admin', 'manager', 'salesman'] },
  { name: 'Ekipy i Handlowcy', icon: 'people', roles: ['admin', 'manager'] },
  { name: 'Grafik Montaży', icon: 'calendar', roles: ['admin', 'manager', 'salesman'] },
  { name: 'Raporty OZE', icon: 'chart', roles: ['admin', 'manager'] },
  { name: 'Ustawienia', icon: 'settings', roles: ['admin'] },
];

// OZE installation pipeline stages (Operations / FSM funnel managed by Manager & Admin)
const projectStatuses = [
  'Audyt i projekt',
  'Kompletacja sprzętu',
  'Montaż w toku',
  'Zgłoszenie OSD / Dotacja',
  'Odebrane',
];

// Sales & technical lead funnel stages (Salesman funnel -> triggers Installation on 'Umowa podpisana (Wygrana)')
const taskStatuses = [
  'Nowy lead',
  'Audyt / W toku',
  'Oferta / Weryfikacja',
  'Umowa podpisana (Wygrana)',
];

// Subsidy & OSD workflow statuses
const subsidyStatuses: Project['subsidyStatus'][] = [
  'W przygotowaniu',
  'Złożony w NFOŚiGW',
  'Weryfikacja OSD',
  'Wypłacono',
];

const priorityLevels = ['Niski', 'Średni', 'Wysoki', 'Pilny'];
const osdOperators: Project['osdOperator'][] = ['PGE', 'Tauron', 'Enea', 'Energa'];
const subsidyPrograms: Project['subsidyProgram'][] = [
  'Mój Prąd 6.0',
  'Czyste Powietrze',
  'Ciepłe Mieszkanie',
  'Brak (B2B)',
];
const roofTypes: Project['roofType'][] = [
  'Dachówka ceramiczna',
  'Blachodachówka',
  'Dach płaski',
  'Grunt',
];
const polishVoivodeships = [
  'Mazowieckie',
  'Małopolskie',
  'Wielkopolskie',
  'Śląskie',
  'Pomorskie',
  'Dolnośląskie',
  'Łódzkie',
  'Podkarpackie',
];

// Polish labels for RBAC roles
const roleLabels: Record<SystemRole, string> = {
  admin: 'Admin (Dyrektor)',
  manager: 'Manager (Koordynator)',
  salesman: 'Salesman (Handlowiec)',
};

type EditableRecord = Project | Task | ClientRecord | Employee | CalendarEvent | null;

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

export default function App() {
  // Active navigation and core SQLite-backed database state
  const [page, setPage] = useState('Przegląd');
  const [users, setUsers] = useState<Employee[]>(initialEmployees);
  const [currentUserId, setCurrentUserId] = useState<number>(1); // Default: Aleksander Morawski (Admin)
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [clients, setClients] = useState<ClientRecord[]>(initialClients);
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [activities, setActivities] = useState<ActivityLog[]>(initialActivities);
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [dbEngine, setDbEngine] = useState('SQLite 3 (database/oze_crm.sqlite)');

  // Search and funnel filter state
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Wszystkie statusy');
  const [priority, setPriority] = useState('Wszystkie priorytety');
  const [manager, setManager] = useState('Wszyscy koordynatorzy');
  const [deadline, setDeadline] = useState('Wszystkie operatorzy OSD');
  const [view, setView] = useState('table');

  // Modal dialog state & OZE bill calculator state
  const [modal, setModal] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditableRecord>(null);
  const [billPln, setBillPln] = useState<number>(450);
  const [calcKwp, setCalcKwp] = useState<number>(9.8);
  const [calcKwh, setCalcKwh] = useState<number>(10);

  // Drill-down detail views state
  const [detail, setDetail] = useState<Project | null>(null);
  const [clientDetail, setClientDetail] = useState<ClientRecord | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [tab, setTab] = useState('Przegląd');

  // Dropdown menus, toast alerts and calendar state initialized to current date
  const now = new Date();
  const [menu, setMenu] = useState('');
  const [toast, setToast] = useState('');
  const [sort, setSort] = useState(false);
  const [month, setMonth] = useState(now.getMonth());
  const [week, setWeek] = useState(false);
  const [reportPeriod, setReportPeriod] = useState('Wszystkie (SQLite)');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Active logged-in user and their RBAC role ('admin' | 'manager' | 'salesman')
  const currentUser = users.find(u => u.id === currentUserId) || users[0];
  const currentRole: SystemRole = currentUser.systemRole;

  // Allowed navigation pages for the current RBAC role
  const allowedPages = allPages.filter(p => p.roles.includes(currentRole));

  // Apply snapshot received from the SQLite DataLayer
  const applySnapshot = (snap: Awaited<ReturnType<typeof DataLayer.bootstrap>>) => {
    setProjects(snap.projects);
    setTasks(snap.tasks);
    setClients(snap.clients);
    setEvents(snap.events);
    setActivities(snap.activities);
    if (snap.users?.length) setUsers(snap.users);
    if (snap.settings) setSettings(snap.settings);
    setDbEngine(`${snap.meta.engine} · ${snap.meta.file}`);
  };

  // Bootstrap all tables from SQLite on initial mount and bind global keyboard shortcuts (⌘K / Ctrl+K & Escape)
  useEffect(() => {
    DataLayer.bootstrap().then(applySnapshot);
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === 'Escape') {
        setModal(null);
        setMenu('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Display temporary toast message
  const notify = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 4000);
  };

  // Switch active user / RBAC role and redirect if current page is restricted
  const switchUser = (user: Employee) => {
    setCurrentUserId(user.id);
    setDetail(null);
    setClientDetail(null);
    setEmployee(null);
    setMenu('');
    const canAccessCurrentPage = allPages
      .find(p => p.name === page)
      ?.roles.includes(user.systemRole);
    if (!canAccessCurrentPage) {
      setPage('Przegląd');
    }
    notify(`Przełączono użytkownika: ${user.name} · Rola: ${roleLabels[user.systemRole]}`);
  };

  // Switch quick role button (Admin / Manager / Salesman)
  const switchQuickRole = (role: SystemRole) => {
    const targetUser = users.find(u => u.systemRole === role);
    if (targetUser) switchUser(targetUser);
  };

  // Switch between main modules and reset active filters
  const navigate = (p: string) => {
    setPage(p);
    setDetail(null);
    setClientDetail(null);
    setEmployee(null);
    setSearch('');
    setFilter('Wszystkie statusy');
    setPriority('Wszystkie priorytety');
    setManager('Wszyscy koordynatorzy');
    setDeadline('Wszystkie operatorzy OSD');
    setView('table');
    setMenu('');
  };

  // Open creation or edit modal and initialize calculator defaults
  const open = (type: string, record?: EditableRecord) => {
    setEditing(record || null);
    if (record && 'powerKwp' in record) {
      setCalcKwp(record.powerKwp);
      setCalcKwh(record.batteryKwh);
    } else if (record && 'estimatedPower' in record && record.estimatedPower) {
      const kwpMatch = record.estimatedPower.match(/([\d.]+)\s*kWp/i);
      const kwhMatch = record.estimatedPower.match(/([\d.]+)\s*kWh/i);
      setCalcKwp(kwpMatch ? Number(kwpMatch[1]) : 9.8);
      setCalcKwh(kwhMatch ? Number(kwhMatch[1]) : 10);
    } else {
      setCalcKwp(9.8);
      setCalcKwh(10);
    }
    setModal(type);
    setMenu('');
  };

  // RBAC Data Isolation:
  // - Admin & Manager see all company installations, leads, and clients.
  // - Salesman sees only their own clients, their own leads, and installations for their clients (RODO & commercial protection).
  const roleScopedClients =
    currentRole === 'salesman'
      ? clients.filter(c => c.ownerName === currentUser.name)
      : clients;

  const roleScopedTasks =
    currentRole === 'salesman'
      ? tasks.filter(t => t.assignee === currentUser.name)
      : tasks;

  const roleScopedProjects =
    currentRole === 'salesman'
      ? projects.filter(
          p =>
            p.manager === currentUser.name ||
            roleScopedClients.some(c => c.name === p.client)
        )
      : projects;

  // Dynamic OZE totals calculated from role-scoped installations in SQLite
  const totalPowerKwp = roleScopedProjects.reduce((sum, p) => sum + p.powerKwp, 0).toFixed(1);
  const totalBatteryKwh = roleScopedProjects.reduce((sum, p) => sum + p.batteryKwh, 0);

  // Dynamic technology breakdown calculated from roleScopedProjects and active reportPeriod filter
  const periodScopedProjects = roleScopedProjects.filter(p => {
    if (reportPeriod === 'Październik 2026') {
      return `${p.start} ${p.deadline}`.toLowerCase().includes('paź');
    }
    if (reportPeriod === 'Q4 2026') {
      const combined = `${p.start} ${p.deadline}`.toLowerCase();
      return (
        combined.includes('paź') || combined.includes('lis') || combined.includes('gru')
      );
    }
    return true;
  });
  const totalScopedCount = Math.max(1, periodScopedProjects.length);
  const pvStorageShare = Math.round(
    (periodScopedProjects.filter(p => p.systemType === 'PV + Magazyn energii').length /
      totalScopedCount) *
      100
  );
  const heatPumpShare = Math.round(
    (periodScopedProjects.filter(
      p => p.systemType.includes('Dom') || p.systemType.includes('Pompa')
    ).length /
      totalScopedCount) *
      100
  );
  const b2bShare = Math.round(
    (periodScopedProjects.filter(p => p.systemType.includes('B2B')).length / totalScopedCount) * 100
  );
  const expansionShare = Math.max(0, 100 - pvStorageShare - heatPumpShare - b2bShare);

  // Filter OZE installations by search, stage, priority, coordinator, and OSD grid operator
  const visibleProjects = roleScopedProjects
    .filter(p => {
      const matchSearch = `${p.name} ${p.client} ${p.manager} ${p.systemType} ${p.voivodeship} ${p.osdOperator} ${p.notes || ''}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchFilter = filter === 'Wszystkie statusy' || p.status === filter;
      const matchPriority = priority === 'Wszystkie priorytety' || p.priority === priority;
      const matchManager = manager === 'Wszyscy koordynatorzy' || p.manager === manager;
      const matchOsd = deadline === 'Wszystkie operatorzy OSD' || p.osdOperator === deadline;
      return matchSearch && matchFilter && matchPriority && matchManager && matchOsd;
    })
    .sort((a, b) => (sort ? a.name.localeCompare(b.name, 'pl') : a.id - b.id));

  // Filter leads and tasks by search, priority, and stage
  const visibleTasks = roleScopedTasks.filter(t => {
    const matchSearch = `${t.name} ${t.project} ${t.assignee} ${t.leadSource || ''} ${t.notes || ''}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchPriority = priority === 'Wszystkie priorytety' || t.priority === priority;
    const matchFilter = filter === 'Wszystkie statusy' || t.status === filter;
    return matchSearch && matchPriority && matchFilter;
  });

  // Update status of an installation in SQLite (restricted for Salesman)
  const changeProjectStatus = async (id: number, status: string) => {
    if (currentRole === 'salesman') {
      notify('Tylko Manager lub Admin może zmieniać etap techniczny realizacji montażowej.');
      return;
    }
    const target = projects.find(p => p.id === id);
    if (!target) return;
    const updated: Project = {
      ...target,
      status,
      progress:
        status === 'Odebrane'
          ? 100
          : status === 'Zgłoszenie OSD / Dotacja'
            ? 90
            : status === 'Montaż w toku'
              ? 70
              : status === 'Kompletacja sprzętu'
                ? 45
                : 20,
    };
    const snap = await DataLayer.saveInstallation(updated, currentUser.name, currentRole);
    applySnapshot(snap);
    if (detail?.id === id) setDetail(updated);
    notify(`Zapisano w SQLite — etap realizacji: ${status}`);
  };

  // Update status of a lead/task in SQLite; triggers automatic installation creation when signed!
  const changeTask = async (id: number, status: string) => {
    const target = tasks.find(x => x.id === id);
    if (!target) return;
    const prevCount = projects.length;
    const updated: Task = { ...target, status };
    const snap = await DataLayer.saveLead(updated, currentUser.name);
    applySnapshot(snap);

    if (status === 'Umowa podpisana (Wygrana)' || status === 'Zrealizowane') {
      if (snap.projects.length > prevCount) {
        notify(
          'Umowa podpisana! Automatycznie utworzono obiekt w Realizacje OZE, wniosek OSD oraz audyt w Grafiku.'
        );
      } else {
        notify(`Zaktualizowano status leada w SQLite: ${status}`);
      }
    }
  };

  // Update subsidy / OSD status for an installation in SQLite
  const changeSubsidyStatus = async (id: number, subsidyStatus: Project['subsidyStatus']) => {
    if (currentRole === 'salesman') {
      notify('Statusy wniosków NFOŚiGW i zgłoszeń OSD zatwierdza Manager lub Dział Dotacji.');
      return;
    }
    const target = projects.find(p => p.id === id);
    if (!target) return;
    const updated: Project = { ...target, subsidyStatus };
    const snap = await DataLayer.saveInstallation(updated, currentUser.name, currentRole);
    applySnapshot(snap);
    if (detail?.id === id) {
      setDetail(updated);
    }
    notify(`Zapisano w SQLite — status dotacji/OSD: ${subsidyStatus}`);
  };

  // Delete currently edited record from SQLite
  const handleDeleteRecord = async () => {
    if (!editing || !modal) return;
    if (modal === 'Realizacja' && 'powerKwp' in editing) {
      const snap = await DataLayer.deleteInstallation(editing.id, currentUser.name, currentRole);
      applySnapshot(snap);
      if (detail?.id === editing.id) setDetail(null);
      notify(`Usunięto realizację z bazy SQLite: ${editing.name}`);
    } else if (modal === 'Zadanie' && 'assignee' in editing) {
      const snap = await DataLayer.deleteLead(editing.id, currentUser.name);
      applySnapshot(snap);
      notify(`Usunięto lead z bazy SQLite: ${editing.name}`);
    } else if (modal === 'Klient' && 'contact' in editing) {
      const snap = await DataLayer.deleteClient(editing.id, currentUser.name);
      applySnapshot(snap);
      if (clientDetail?.id === editing.id) setClientDetail(null);
      notify(`Usunięto klienta z bazy SQLite: ${editing.name}`);
    } else if (modal === 'Pracownik' && 'systemRole' in editing) {
      if (users.length <= 1) {
        notify('Nie można usunąć ostatniego administratora z systemu.');
        return;
      }
      const snap = await DataLayer.deleteUser(editing.id, currentUser.name);
      applySnapshot(snap);
      if (employee?.id === editing.id) setEmployee(null);
      if (currentUserId === editing.id && snap.users?.length) {
        setCurrentUserId(snap.users[0].id);
      }
      notify(`Usunięto pracownika z bazy RBAC (SQLite): ${editing.name}`);
    } else if (modal === 'Wydarzenie' && 'date' in editing && editing.id) {
      const snap = await DataLayer.deleteEvent(editing.id, currentUser.name);
      applySnapshot(snap);
      notify(`Usunięto termin z grafiku (SQLite): ${editing.name}`);
    }
    setModal(null);
    setEditing(null);
  };

  // Calculate recommended PV kWp and Battery kWh from monthly electricity bill in PLN via Python FastAPI
  const recalculateFromBill = async (monthlyPln: number) => {
    setBillPln(monthlyPln);
    const res = await DataLayer.calculateOze(monthlyPln);
    setCalcKwp(res.recommendedPowerKwp);
    setCalcKwh(res.recommendedBatteryKwh);
    notify(
      `FastAPI Kalkulator: ${res.recommendedPowerKwp} kWp + ${res.recommendedBatteryKwh} kWh · Dotacja: -${res.estimatedSubsidyPln.toLocaleString('pl-PL')} PLN · Zwrot: ~${res.paybackYears} lat`
    );
  };

  // Render OZE installations table
  const projectTable = (items: Project[], full = false) => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>
              <button onClick={() => setSort(!sort)}>
                Instalacja / Obiekt OZE <span>↕</span>
              </button>
            </th>
            <th>Inwestor / Klient</th>
            <th>Moc PV / BESS</th>
            <th>Etap realizacji</th>
            {full && <th>Operator OSD / Dotacja</th>}
            <th>Postęp prac</th>
            {full && <th>Koordynator / Ekipa</th>}
            <th>Termin montażu</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map(p => (
            <tr
              key={p.id}
              onClick={() => {
                setDetail(p);
                setPage('Realizacje OZE');
                setTab('Przegląd');
              }}
            >
              <td>
                <div className="project-name">
                  <span className={`project-icon ${p.color}`}>
                    <Icon name="sun" size={16} />
                  </span>
                  <strong>{p.name}</strong>
                </div>
              </td>
              <td>{p.client}</td>
              <td>
                <strong>{p.powerKwp > 0 ? `${p.powerKwp} kWp` : '—'}</strong>
                {p.batteryKwh > 0 ? ` + ${p.batteryKwh} kWh` : ''}
              </td>
              <td>
                <Badge>{p.status}</Badge>
              </td>
              {full && (
                <td>
                  <span className={`priority ${p.priority.toLowerCase()}`}>
                    ⚡ {p.osdOperator} · {p.subsidyProgram}
                  </span>
                </td>
              )}
              <td>
                <Progress value={p.progress} />
              </td>
              {full && (
                <td>
                  <div className="person">
                    <Avatar name={p.manager} small color={users.find(e => e.name === p.manager)?.color} />
                    {p.manager} ({p.installTeam})
                  </div>
                </td>
              )}
              <td className="date-cell">{p.deadline}</td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`Edytuj ${p.name}`}
                  onClick={e => {
                    e.stopPropagation();
                    open('Realizacja', p);
                  }}
                >
                  <Icon name="more" size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && (
        <div className="empty">
          <Icon name="search" size={28} />
          <h3>Brak przypisanych realizacji OZE</h3>
          <p>
            {currentRole === 'salesman'
              ? 'Podpisz umowę na swoim leadzie, aby automatycznie utworzyć realizację montażową.'
              : 'Spróbuj zmienić parametry wyszukiwania lub wyczyść filtry.'}
          </p>
          <Button
            onClick={() => {
              setSearch('');
              setFilter('Wszystkie statusy');
              setPriority('Wszystkie priorytety');
              setManager('Wszyscy koordynatorzy');
              setDeadline('Wszystkie operatorzy OSD');
            }}
          >
            Wyczyść filtry
          </Button>
        </div>
      )}
    </div>
  );

  // Render list of sales leads & technical audit tasks
  const taskList = (list: Task[]) => (
    <div className="task-list">
      {list.map(t => {
        const isSigned =
          t.status === 'Umowa podpisana (Wygrana)' || t.status === 'Zrealizowane';
        return (
          <div className={`task-row ${isSigned ? 'completed' : ''}`} key={t.id}>
            <input
              type="checkbox"
              aria-label={`Podpisz umowę: ${t.name}`}
              checked={isSigned}
              onChange={e =>
                changeTask(
                  t.id,
                  e.target.checked ? 'Umowa podpisana (Wygrana)' : 'Nowy lead'
                )
              }
            />
            <div className="task-copy">
              <button onClick={() => open('Zadanie', t)}>{t.name}</button>
              <span>
                {t.project} {t.estimatedPower ? `· ${t.estimatedPower}` : ''} · Doradca: {t.assignee}
              </span>
            </div>
            <span className={`priority ${t.priority.toLowerCase()}`}>
              <Icon name="flag" size={12} />
              {t.priority}
            </span>
            <span className={`task-date ${t.due === 'Po terminie' ? 'overdue-text' : ''}`}>{t.due}</span>
          </div>
        );
      })}
      {!list.length && (
        <div className="empty">Brak leadów w tym widoku. Dodaj nowy lead, aby rozpocząć proces sprzedaży.</div>
      )}
    </div>
  );

  // Filter and view toggle toolbar
  const toolbar = (kind: string) => (
    <div className="toolbar">
      <div className="search-field">
        <Icon name="search" size={16} />
        <input
          placeholder={
            kind === 'tasks'
              ? 'Szukaj leadów, audytów, ofert...'
              : 'Szukaj instalacji, klienta, województwa, OSD...'
          }
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="filters">
        <Icon name="filter" size={16} />
        <select aria-label="Filtruj wg etapu" value={filter} onChange={e => setFilter(e.target.value)}>
          <option>Wszystkie statusy</option>
          {(kind === 'tasks' ? taskStatuses : projectStatuses).map(x => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select aria-label="Filtruj wg priorytetu" value={priority} onChange={e => setPriority(e.target.value)}>
          <option>Wszystkie priorytety</option>
          {priorityLevels.map(x => (
            <option key={x}>{x}</option>
          ))}
        </select>
        {kind === 'projects' && currentRole !== 'salesman' && (
          <>
            <select aria-label="Filtruj wg koordynatora" value={manager} onChange={e => setManager(e.target.value)}>
              <option>Wszyscy koordynatorzy</option>
              {users.map(e => (
                <option key={e.name}>{e.name}</option>
              ))}
            </select>
            <select aria-label="Filtruj wg operatora OSD" value={deadline} onChange={e => setDeadline(e.target.value)}>
              <option>Wszystkie operatorzy OSD</option>
              {osdOperators.map(osd => (
                <option key={osd}>{osd}</option>
              ))}
            </select>
          </>
        )}
      </div>
      <div className="view-toggle">
        <button
          aria-label="Widok tabeli"
          className={view === 'table' ? 'active' : ''}
          onClick={() => setView('table')}
        >
          <Icon name="list" size={17} />
        </button>
        <button
          aria-label="Widok kanban"
          className={view === 'kanban' ? 'active' : ''}
          onClick={() => setView('kanban')}
        >
          <Icon name="grid" size={17} />
        </button>
      </div>
    </div>
  );

  // Real-time activity stream loaded from SQLite activity_logs table
  const activity = (
    <div className="activity-list">
      {activities.slice(0, 5).map((item, idx) => (
        <div className="activity" key={item.id || `${item.target}-${idx}`}>
          <Avatar name={item.userName} color={item.color} small />
          <div>
            <p>
              <strong>{item.userName}</strong> {item.action}
            </p>
            <button
              onClick={() => {
                const matched = roleScopedProjects.find(
                  p => p.name === item.target || p.client === item.target
                );
                if (matched) {
                  setDetail(matched);
                  setPage('Realizacje OZE');
                } else {
                  navigate('Realizacje OZE');
                }
              }}
            >
              {item.target}
            </button>
            <span>{item.timeLabel}</span>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="app-shell">
      {/* Left sidebar navigation dynamically filtered by RBAC role */}
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate('Przegląd')}>
          <span className="brand-mark">
            s<span>m</span>
          </span>
          <span>
            SM-OZE<span className="workspace">Polska CRM</span>
          </span>
          <Icon name="down" size={15} />
        </button>

        <div className="nav-caption">
          PANEL: {currentRole.toUpperCase()} ({allowedPages.length} MODUŁÓW)
        </div>
        <nav>
          {allowedPages
            .filter(p => p.name !== 'Ustawienia')
            .map(p => (
              <button
                key={p.name}
                className={`nav-item ${page === p.name ? 'selected' : ''}`}
                onClick={() => navigate(p.name)}
              >
                <Icon name={p.icon} />
                <span>{p.name}</span>
                {p.name === 'Leady i Sprzedaż' && (
                  <span className="nav-count">
                    {
                      roleScopedTasks.filter(
                        t =>
                          t.status !== 'Umowa podpisana (Wygrana)' &&
                          t.status !== 'Zrealizowane'
                      ).length
                    }
                  </span>
                )}
                {p.name === 'Dotacje i OSD' && (
                  <span className="nav-count">
                    {roleScopedProjects.filter(pr => pr.subsidyStatus !== 'Wypłacono').length}
                  </span>
                )}
              </button>
            ))}
        </nav>

        <div className="sidebar-bottom">
          <Button
            className="source-download"
            onClick={async () => {
              await DataLayer.downloadBackup();
              notify('Pobrano pełną kopię zapasową bazy danych SQLite (JSON).');
            }}
          >
            <Icon name="folder" size={16} />
            <span>Kopia bazy SQLite (JSON)</span>
          </Button>

          <div className="workspace-note">
            <span className="note-symbol">
              <Icon name="people" size={17} />
            </span>
            <strong>Tryb: {roleLabels[currentRole]}</strong>
            <p>
              {currentRole === 'salesman'
                ? 'Widzisz tylko własne leady i klientów (izolacja RODO).'
                : currentRole === 'manager'
                  ? 'Zarządzasz montażami, ekipami oraz wnioskami OSD.'
                  : 'Pełny dostęp administracyjny do wszystkich oddziałów.'}
            </p>
            <button
              onClick={() => {
                const nextRole: SystemRole =
                  currentRole === 'admin'
                    ? 'manager'
                    : currentRole === 'manager'
                      ? 'salesman'
                      : 'admin';
                switchQuickRole(nextRole);
              }}
            >
              Przełącz rolę testową <Icon name="arrow" size={14} />
            </button>
          </div>

          {currentRole === 'admin' && (
            <button
              className={`nav-item ${page === 'Ustawienia' ? 'selected' : ''}`}
              onClick={() => navigate('Ustawienia')}
            >
              <Icon name="settings" />
              <span>Ustawienia i Baza SQL</span>
            </button>
          )}

          <button
            className="nav-item"
            onClick={() => {
              setEditing(null);
              setModal('BazaWiedzy');
              setMenu('');
            }}
          >
            <Icon name="help" />
            <span>Baza wiedzy OSD i NFOŚiGW</span>
            <span className="external">↗</span>
          </button>

          <button
            className="sidebar-profile"
            onClick={() => setMenu(menu === 'profile' ? '' : 'profile')}
          >
            <Avatar name={currentUser.name} color={currentUser.color} />
            <span>
              <strong>{currentUser.name}</strong>
              <small>{roleLabels[currentRole]}</small>
            </span>
            <Icon name="down" size={16} />
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="main-shell">
        {/* Top bar with quick RBAC role switcher */}
        <header className="topbar">
          <div className="breadcrumb">
            <span>SM-OZE</span>
            <span className="slash">/</span>
            <strong>{page}</strong>
            <Badge>{currentRole.toUpperCase()}</Badge>
            {detail && (
              <>
                <span>/</span>
                <span>{detail.name}</span>
              </>
            )}
          </div>

          <div className="top-actions">
            {/* Quick Role Switcher for testing Admin / Manager / Salesman views */}
            <div className="view-toggle" aria-label="Przełącznik roli użytkownika">
              {(['admin', 'manager', 'salesman'] as SystemRole[]).map(r => (
                <button
                  key={r}
                  className={currentRole === r ? 'active' : ''}
                  onClick={() => switchQuickRole(r)}
                >
                  {r === 'admin' ? 'Admin' : r === 'manager' ? 'Manager' : 'Salesman'}
                </button>
              ))}
            </div>

            <div className="global-search" onClick={() => searchInputRef.current?.focus()}>
              <Icon name="search" size={16} />
              <input
                ref={searchInputRef}
                aria-label="Wyszukiwanie globalne"
                placeholder="Szukaj klienta, instalacji, kWp, OSD..."
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  if (page === 'Przegląd') setPage('Realizacje OZE');
                }}
              />
              <kbd title="Skrót klawiszowy Ctrl+K / ⌘K">⌘ K</kbd>
            </div>

            <div className="menu-anchor">
              <button
                className="icon-button notification-button"
                aria-label="Powiadomienia"
                onClick={() => setMenu(menu === 'notifications' ? '' : 'notifications')}
              >
                <Icon name="bell" />
                <i />
              </button>
              {menu === 'notifications' && (
                <div className="dropdown notifications">
                  <h3>
                    Powiadomienia SQL ({currentRole.toUpperCase()}){' '}
                    <span className="badge in-progress">{activities.slice(0, 3).length} nowe</span>
                  </h3>
                  {activities.slice(0, 3).map((act, i) => (
                    <p key={act.id || i}>
                      <strong>{act.userName}</strong> {act.action}: <em>{act.target}</em> ({act.timeLabel})
                    </p>
                  ))}
                  <Button
                    onClick={() => {
                      navigate('Leady i Sprzedaż');
                    }}
                  >
                    Przejdź do leadów <Icon name="arrow" size={14} />
                  </Button>
                </div>
              )}
            </div>

            <span className="top-divider" />

            <div className="menu-anchor">
              <Button
                variant="primary compact"
                onClick={() => setMenu(menu === 'create' ? '' : 'create')}
              >
                <Icon name="plus" size={16} />
                Dodaj w systemie
              </Button>
              {menu === 'create' && (
                <div className="dropdown">
                  {currentRole !== 'salesman' && (
                    <button onClick={() => open('Realizacja')}>
                      <Icon name="sun" />
                      Nowa realizacja OZE
                    </button>
                  )}
                  <button onClick={() => open('Zadanie')}>
                    <Icon name="check" />
                    Nowy lead / audyt
                  </button>
                  <button onClick={() => open('Klient')}>
                    <Icon name="people" />
                    Nowy inwestor / klient
                  </button>
                  {currentRole === 'admin' && (
                    <button onClick={() => open('Pracownik')}>
                      <Icon name="people" />
                      Nowy pracownik (RBAC)
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              className="avatar-button"
              aria-label="Menu profilu i wybór pracownika"
              onClick={() => setMenu(menu === 'profile' ? '' : 'profile')}
            >
              <Avatar name={currentUser.name} color={currentUser.color} />
            </button>
          </div>

          {menu === 'profile' && (
            <div className="dropdown profile-dropdown">
              <strong>{currentUser.name}</strong>
              <small>
                {currentUser.email} · {roleLabels[currentRole]}
              </small>
              {users.map(u => (
                <button key={u.id} onClick={() => switchUser(u)}>
                  <Icon name="people" />
                  {u.name} ({u.systemRole.toUpperCase()})
                </button>
              ))}
              {currentRole === 'admin' && (
                <button onClick={() => navigate('Ustawienia')}>
                  <Icon name="settings" />
                  Baza SQLite i Ustawienia
                </button>
              )}
            </div>
          )}
        </header>

        {/* Active module view */}
        <main>
          {page === 'Przegląd' ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    PANEL ROLI: {roleLabels[currentRole].toUpperCase()} · REGION: {currentUser.region.toUpperCase()}
                  </div>
                  <h1>
                    Dzień dobry, {currentUser.name.split(' ')[0]}{' '}
                    <span className="greeting-sun">
                      <Icon name="sun" size={24} />
                    </span>
                  </h1>
                  <p>
                    {currentRole === 'salesman'
                      ? 'Twój osobisty lejek sprzedaży OZE, zaplanowane audyty oraz postęp instalacji Twoich klientów.'
                      : currentRole === 'manager'
                        ? 'Nadzór nad realizacjami montażowymi, kompletem sprzętu, ekipami i wnioskami OSD / NFOŚiGW.'
                        : `${settings.companyName} — pełny widok zarządczy: sprzedaż, realizacje OZE, dotacje i baza SQLite.`}
                  </p>
                </div>
                <div className="today">
                  <Icon name="calendar" size={16} />
                  Zalogowany jako: {currentUser.name} ({currentRole.toUpperCase()})
                </div>
              </div>

              <div className="quick-actions">
                {currentRole !== 'salesman' && (
                  <Button onClick={() => open('Realizacja')}>
                    <Icon name="plus" size={15} />
                    Nowa instalacja OZE
                  </Button>
                )}
                <Button onClick={() => open('Zadanie')}>
                  <Icon name="plus" size={15} />
                  Nowy lead + Kalkulator OZE
                </Button>
                <Button onClick={() => open('Klient')}>
                  <Icon name="plus" size={15} />
                  Dodaj inwestora
                </Button>
                <span>
                  <span className="live-dot" />
                  Widok RBAC ({currentRole.toUpperCase()}): {roleScopedProjects.length} instalacji ·{' '}
                  {roleScopedTasks.length} leadów · {roleScopedClients.length} klientów
                </span>
              </div>

              <div className="kpi-grid">
                {[
                  [
                    currentRole === 'salesman' ? 'Twoja sprzedana moc PV' : 'Moc PV w realizacji',
                    `${totalPowerKwp} kWp`,
                    'sun',
                    `${roleScopedProjects.filter(p => p.powerKwp > 0).length} inst.`,
                    'z modułami fotowoltaicznymi',
                    'blue',
                  ],
                  [
                    currentRole === 'salesman' ? 'Twoje magazyny energii' : 'Magazyny energii (BESS)',
                    `${totalBatteryKwh} kWh`,
                    'folder',
                    `${roleScopedProjects.filter(p => p.batteryKwh > 0).length} szt.`,
                    'z magazynem energii LiFePO4',
                    'purple',
                  ],
                  [
                    currentRole === 'salesman' ? 'Aktywne leady handlowe' : 'Wnioski Dotacje / OSD',
                    currentRole === 'salesman'
                      ? `${roleScopedTasks.length} szans`
                      : `${roleScopedProjects.filter(p => p.subsidyStatus !== 'Wypłacono').length} w toku`,
                    'clock',
                    `${roleScopedProjects.filter(p => p.status === 'Odebrane').length}/${Math.max(1, roleScopedProjects.length)}`,
                    'odebranych technicznie obiektów',
                    'orange',
                  ],
                  [
                    currentRole === 'salesman' ? 'Twoi inwestorzy' : 'Baza inwestorów (SQL)',
                    `${roleScopedClients.length} klientów`,
                    'people',
                    `+${roleScopedClients.filter(c => c.status === 'W realizacji').length}`,
                    'w trakcie realizacji',
                    'teal',
                  ],
                ].map(([label, count, icon, delta, desc, color]) => (
                  <div className="kpi-card" key={label}>
                    <div className="kpi-label">
                      {label}
                      <span className={`metric-icon ${color}`}>
                        <Icon name={icon} size={17} />
                      </span>
                    </div>
                    <div className="metric">
                      {count}
                      <span className={`sparkline ${color}`}>
                        <svg viewBox="0 0 100 30">
                          <path d="M0 27 12 21 24 24 37 14 48 18 62 9 74 13 87 4 100 6" />
                        </svg>
                      </span>
                    </div>
                    <div className="comparison">
                      <span>
                        <Icon name="trend" size={12} />
                        {delta}
                      </span>
                      {desc}
                    </div>
                  </div>
                ))}
              </div>

              <div className="overview-middle">
                <Section
                  title="Struktura technologii OZE"
                  subtitle={`Udział linii produktowych wyliczony z bazy SQLite (${reportPeriod})`}
                  action={
                    <select
                      aria-label="Okres raportowania"
                      value={reportPeriod}
                      onChange={e => setReportPeriod(e.target.value)}
                    >
                      <option value="Wszystkie (SQLite)">Wszystkie (SQLite)</option>
                      <option value="Październik 2026">Październik 2026</option>
                      <option value="Q4 2026">Q4 2026</option>
                    </select>
                  }
                >
                  <div className="project-overview">
                    <div
                      className="donut"
                      style={{
                        background: `conic-gradient(#137684 0 ${pvStorageShare}%, #1B5E6D ${pvStorageShare}% ${
                          pvStorageShare + heatPumpShare
                        }%, #FBBF3A ${pvStorageShare + heatPumpShare}% ${
                          pvStorageShare + heatPumpShare + b2bShare
                        }%, #252629 ${pvStorageShare + heatPumpShare + b2bShare}% 100%)`,
                      }}
                    >
                      <div>
                        <strong>{periodScopedProjects.length}</strong>
                        <span>Obiektów OZE</span>
                      </div>
                    </div>
                    <div className="chart-legend">
                      {[
                        ['PV + Magazyn energii', `${pvStorageShare}%`, 'blue'],
                        ['Domy pasywne + Pompy', `${heatPumpShare}%`, 'purple'],
                        ['Instalacje B2B + BESS', `${b2bShare}%`, 'orange'],
                        ['Rozbudowa magazynów', `${expansionShare}%`, 'green'],
                      ].map(([label, percent, color]) => (
                        <div key={label}>
                          <i className={`legend-dot ${color}`} />
                          <span>{label}</span>
                          <strong>{percent}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="panel-foot">
                    <span>
                      <i className="live-dot" />
                      {settings.autoConvertLead
                        ? 'Auto-konwersja leada do Realizacji OZE: AKTYWNA'
                        : 'Auto-konwersja leada do Realizacji OZE: WYŁĄCZONA'}
                    </span>
                    <button onClick={() => navigate('Leady i Sprzedaż')}>
                      Otwórz lejek <Icon name="arrow" size={14} />
                    </button>
                  </div>
                </Section>

                <Section
                  title="Najbliższe montaże i audyty (z tabeli calendar_events)"
                  subtitle="Harmonogram wyjazdów ekip i terminów przyłączeń"
                  action={
                    <button className="text-button" onClick={() => navigate('Grafik Montaży')}>
                      Grafik ({events.length}) <Icon name="arrow" size={14} />
                    </button>
                  }
                >
                  <div className="deadline-list">
                    {events.slice(-3).reverse().map((ev, idx) => {
                      const d = new Date(ev.date + 'T12:00:00');
                      const day = String(d.getDate()).padStart(2, '0');
                      const mon = d
                        .toLocaleString('pl-PL', { month: 'short' })
                        .replace('.', '')
                        .toUpperCase();
                      const color =
                        ev.eventType === 'Odbiór OSD'
                          ? 'orange'
                          : ev.eventType === 'Audyt'
                            ? 'purple'
                            : 'blue';
                      return (
                        <button
                          className="deadline-row"
                          key={ev.id || `${ev.name}-${idx}`}
                          onClick={() => {
                            const matched = projects.find(
                              p => p.id === ev.installationId || p.client === ev.client
                            );
                            if (matched) {
                              setDetail(matched);
                              setPage('Realizacje OZE');
                            } else {
                              navigate('Grafik Montaży');
                            }
                          }}
                        >
                          <div className={`date-block ${color}`}>
                            <small>{mon}</small>
                            <strong>{day}</strong>
                          </div>
                          <div>
                            <strong>{ev.name}</strong>
                            <span>{ev.client || ev.eventType || 'Harmonogram OZE'}</span>
                          </div>
                          <span className="days-left">{ev.eventType || 'Montaż'}</span>
                          <Icon name="down" size={14} />
                        </button>
                      );
                    })}
                  </div>
                </Section>
              </div>

              <Section
                title={
                  currentRole === 'salesman'
                    ? 'Realizacje OZE dla Twoich klientów'
                    : 'Kluczowe realizacje OZE w toku'
                }
                subtitle="Monitorowanie statusu od audytu technicznego po zgłoszenie OSD i dotację"
                action={
                  <button className="text-button" onClick={() => navigate('Realizacje OZE')}>
                    Wszystkie realizacje <Icon name="arrow" size={14} />
                  </button>
                }
                className="recent-projects"
              >
                {projectTable(roleScopedProjects.slice(0, 5), true)}
              </Section>

              <div className="bottom-grid">
                <Section
                  title={
                    currentRole === 'salesman'
                      ? 'Twoje leady sprzedażowe (zaznacz, aby podpisać umowę)'
                      : 'Leady sprzedażowe i zadania audytowe'
                  }
                  action={
                    <button className="text-button" onClick={() => navigate('Leady i Sprzedaż')}>
                      Lejek sprzedaży <Icon name="arrow" size={14} />
                    </button>
                  }
                >
                  {taskList(roleScopedTasks.slice(0, 5))}
                  <button className="add-task-link" onClick={() => open('Zadanie')}>
                    <Icon name="plus" size={15} />
                    Dodaj nowy lead z kalkulatorem mocy OZE
                  </button>
                </Section>

                <Section
                  title="Dziennik transakcji bazy danych (Audit Log)"
                  action={
                    <button
                      className="icon-button"
                      aria-label="Szczegóły aktywności"
                      onClick={() => {
                        if (currentRole === 'admin') navigate('Ustawienia');
                        notify('Każda zmiana statusu zapisywana jest w tabeli activity_logs (SQLite).');
                      }}
                    >
                      <Icon name="more" />
                    </button>
                  }
                >
                  {activity}
                </Section>
              </div>

              <footer>
                <span>
                  {settings.companyName} · Aktywny użytkownik: {currentUser.name} ({roleLabels[currentRole]})
                </span>
                <span>
                  Warstwa danych: {dbEngine} <i /> Zgodność z RODO
                </span>
              </footer>
            </>
          ) : page === 'Realizacje OZE' && detail ? (
            <>
              {/* Detailed view of a single OZE Installation / Object */}
              <button className="back-link" onClick={() => setDetail(null)}>
                ← Powrót do listy realizacji OZE
              </button>
              <div className="page-heading">
                <div>
                  <div className="detail-title">
                    <span className={`project-icon ${detail.color}`}>
                      <Icon name="sun" />
                    </span>
                    <h1>{detail.name}</h1>
                    <Badge>{detail.status}</Badge>
                  </div>
                  <p>
                    Inwestor: <strong>{detail.client}</strong> · Lokalizacja: Woj. {detail.voivodeship} · Typ systemu:{' '}
                    <strong>{detail.systemType}</strong>
                  </p>
                </div>
                {currentRole !== 'salesman' && (
                  <Button onClick={() => open('Realizacja', detail)}>Edytuj parametry obiektu</Button>
                )}
              </div>

              <div className="detail-stats">
                <div>
                  <small>Moc PV / Magazyn BESS</small>
                  <strong>
                    {detail.powerKwp} kWp / {detail.batteryKwh} kWh
                  </strong>
                </div>
                <div>
                  <small>Operator sieci (OSD)</small>
                  <strong>{detail.osdOperator} Dystrybucja</strong>
                </div>
                <div>
                  <small>Program dotacji</small>
                  <Badge>{detail.subsidyProgram}</Badge>
                </div>
                <div>
                  <small>Poszycie / Konstrukcja</small>
                  <strong>{detail.roofType}</strong>
                </div>
                <div>
                  <small>Wartość umowy brutto</small>
                  <strong>{detail.contractValue}</strong>
                </div>
                <div>
                  <small>Postęp wdrożenia</small>
                  <Progress value={detail.progress} />
                </div>
              </div>

              <div className="tabs">
                {['Przegląd', 'Audyt i Zadania', 'Ekipa i Sprzęt', 'Dotacje i OSD', 'Historia'].map(t => (
                  <button className={tab === t ? 'active' : ''} onClick={() => setTab(t)} key={t}>
                    {t}
                  </button>
                ))}
              </div>

              {tab === 'Przegląd' ? (
                <div className="detail-grid">
                  <Section title="Specyfikacja techniczna i kamienie milowe OZE">
                    <div className="prose">
                      <h3>Zakres inwestycji i notatki techniczne (SQLite)</h3>
                      <p>
                        Kompleksowa realizacja systemu <strong>{detail.systemType}</strong> dla inwestora{' '}
                        <strong>{detail.client}</strong> w województwie {detail.voivodeship.toLowerCase()}. Instalacja
                        obejmuje dobór falownika hybrydowego, magazynu energii {detail.batteryKwh} kWh z funkcją
                        zasilania awaryjnego (EPS/Backup) oraz pełną obsługę przyłączeniową w sieci{' '}
                        <strong>{detail.osdOperator}</strong>.
                        {detail.notes ? (
                          <>
                            <br />
                            <strong>Uwagi z audytu:</strong> {detail.notes}
                          </>
                        ) : null}
                      </p>
                      <h3>Etapy procesu wdrożeniowego (kliknij etap na górze lub zmień poniżej)</h3>
                      {[
                        [
                          '1. Audyt techniczny i projekt wykonawczy',
                          'Pomiary dachu, analiza zacienienia, dobór zabezpieczeń AC/DC i akceptacja klienta',
                          'Odebrane',
                        ],
                        [
                          '2. Kompletacja komponentów i logistyka',
                          'Wydanie modułów PV, falownika hybrydowego oraz modułów bateryjnych z magazynu centralnego',
                          detail.progress >= 40 ? 'Odebrane' : 'W trakcie',
                        ],
                        [
                          '3. Montaż elektryczny i uruchomienie przez ekipę',
                          `Realizacja przez zespół: ${detail.installTeam} · próby napięciowe i pomiary rezystancji uziemienia`,
                          detail.progress >= 70 ? 'Montaż w toku' : 'Audyt i projekt',
                        ],
                        [
                          '4. Zgłoszenie mikroinstalacji do OSD i wniosek dotacyjny',
                          `Operator: ${detail.osdOperator} · Program: ${detail.subsidyProgram} (${detail.subsidyStatus})`,
                          detail.progress === 100 ? 'Odebrane' : 'Zgłoszenie OSD / Dotacja',
                        ],
                      ].map(([t, desc, stat], i) => (
                        <div className="milestone" key={t}>
                          <span className={i < 2 || detail.progress === 100 ? 'done-dot' : 'pending-dot'} />
                          <div>
                            <strong>{t}</strong>
                            <p>{desc}</p>
                          </div>
                          <Badge>{stat}</Badge>
                        </div>
                      ))}
                    </div>
                  </Section>
                  <Section title="Ostatnie aktualizacje na obiekcie">{activity}</Section>
                </div>
              ) : tab === 'Audyt i Zadania' ? (
                <Section
                  title="Lista kontrolna audytu i zadań dla obiektu"
                  action={
                    <Button onClick={() => open('Zadanie')}>
                      <Icon name="plus" />
                      Dodaj zadanie techniczne
                    </Button>
                  }
                >
                  {taskList(tasks.filter(t => t.project === detail.name || t.project === detail.client))}
                </Section>
              ) : tab === 'Ekipa i Sprzęt' ? (
                <div className="detail-grid">
                  <Section
                    title="Specyfikacja sprzętowa (BOM / Kompletacja komponentów OZE)"
                    subtitle={`Zestawienie materiałowe wyliczone dla obiektu: ${detail.powerKwp} kWp PV + ${detail.batteryKwh} kWh BESS`}
                    action={
                      currentRole !== 'salesman' ? (
                        <Button
                          onClick={() =>
                            changeProjectStatus(
                              detail.id,
                              detail.progress < 45 ? 'Kompletacja sprzętu' : 'Montaż w toku'
                            )
                          }
                        >
                          {detail.progress < 45
                            ? 'Zatwierdź kompletację sprzętu'
                            : 'Przekaż do montażu'}
                        </Button>
                      ) : undefined
                    }
                  >
                    <div className="prose">
                      {[
                        ...(detail.powerKwp > 0
                          ? [
                              [
                                `Moduły PV N-Type Bifacial 450 Wp (${Math.ceil(
                                  (detail.powerKwp * 1000) / 450
                                )} szt.)`,
                                `Łączna moc generatora: ${detail.powerKwp} kWp · Konstrukcja montażowa: ${detail.roofType}`,
                                detail.progress >= 45 ? 'Wydano z magazynu' : 'Rezerwacja magazynowa',
                              ],
                            ]
                          : []),
                        [
                          `Falownik hybrydowy 3-fazowy ${Math.max(
                            6,
                            Math.ceil(detail.powerKwp || 10)
                          )} kW + moduł EPS (Backup)`,
                          `Pełna współpraca z siecią ${detail.osdOperator} Dystrybucja oraz pracą wyspową`,
                          detail.progress >= 45 ? 'Wydano z magazynu' : 'Rezerwacja magazynowa',
                        ],
                        ...(detail.batteryKwh > 0
                          ? [
                              [
                                `Magazyn energii LiFePO4 ${detail.batteryKwh} kWh (${Math.ceil(
                                  detail.batteryKwh / 5
                                )} × moduł 5 kWh + BMS)`,
                                `Kwalifikacja do programu dotacyjnego: ${detail.subsidyProgram}`,
                                detail.progress >= 45 ? 'Wydano z magazynu' : 'W kompletacji',
                              ],
                            ]
                          : []),
                        ...(detail.systemType.includes('Pompa') || detail.systemType.includes('Dom')
                          ? [
                              [
                                'Pompa ciepła powietrze-woda 9 kW (R290) + bufor CWU 300L',
                                'Zestaw hydrauliczny z grupą pompową i sterownikiem pogodowym',
                                detail.progress >= 45 ? 'Wydano z magazynu' : 'W kompletacji',
                              ],
                            ]
                          : []),
                        [
                          `Rozdzielnica zabezpieczeń AC/DC (T1+T2) + okablowanie solarne 6 mm²`,
                          `Zabezpieczenia po stronie AC/DC zgodne z wymogami operatora ${detail.osdOperator}`,
                          detail.progress >= 70 ? 'Zamontowano' : 'Gotowe do wysyłki',
                        ],
                      ].map(([itemTitle, itemDesc, itemBadge]) => (
                        <div className="milestone" key={itemTitle}>
                          <span className={detail.progress >= 45 ? 'done-dot' : 'pending-dot'} />
                          <div>
                            <strong>{itemTitle}</strong>
                            <p>{itemDesc}</p>
                          </div>
                          <Badge>{itemBadge}</Badge>
                        </div>
                      ))}
                    </div>
                  </Section>

                  <Section
                    title="Przypisana ekipa wykonawcza i odpowiedzialni (RBAC)"
                    subtitle={`Brygada monterska: ${detail.installTeam} · Województwo: ${detail.voivodeship}`}
                    action={
                      <Button
                        onClick={() =>
                          open('Wydarzenie', {
                            name: `Montaż: ${detail.name}`,
                            date: new Date().toISOString().slice(0, 10),
                            eventType: 'Montaż',
                            client: detail.client,
                            installationId: detail.id,
                          })
                        }
                      >
                        <Icon name="calendar" size={14} />
                        Zaplanuj wyjazd ekipy
                      </Button>
                    }
                  >
                    <div className="prose">
                      {[
                        users.find(u => u.name === detail.manager) || currentUser,
                        users.find(u => u.department === 'Ekipy Monterskie') || users[2] || currentUser,
                        users.find(u => u.department === 'Dotacje i OSD') || users[5] || currentUser,
                      ]
                        .filter((u, idx, arr) => u && arr.findIndex(x => x.id === u.id) === idx)
                        .map(member => (
                          <div className="milestone" key={member.id}>
                            <Avatar name={member.name} color={member.color} />
                            <div>
                              <strong>
                                {member.name}{' '}
                                {member.name === detail.manager ? '(Koordynator prowadzący)' : ''}
                              </strong>
                              <p>
                                {member.role} · Brygada: <strong>{detail.installTeam}</strong> ·{' '}
                                {member.email}
                              </p>
                            </div>
                            <Badge>{member.systemRole.toUpperCase()}</Badge>
                          </div>
                        ))}
                    </div>
                  </Section>
                </div>
              ) : tab === 'Dotacje i OSD' ? (
                <Section
                  title="Obsługa wniosku dotacyjnego i operatora sieci (OSD)"
                  subtitle={`Operator: ${detail.osdOperator} · Program: ${detail.subsidyProgram}`}
                >
                  <div className="prose">
                    <h3>Status formalno-prawny</h3>
                    <p>
                      Aktualny etap dokumentacji: <Badge>{detail.subsidyStatus}</Badge>
                    </p>
                    <p>Zmień status wniosku dotacyjnego / zgłoszenia OSD (zapis w SQLite):</p>
                    <div className="quick-actions">
                      {subsidyStatuses.map(st => (
                        <Button
                          key={st}
                          variant={detail.subsidyStatus === st ? 'primary' : ''}
                          onClick={() => changeSubsidyStatus(detail.id, st)}
                        >
                          {st}
                        </Button>
                      ))}
                    </div>
                  </div>
                </Section>
              ) : (
                <Section title="Dziennik zdarzeń inwestycji">{activity}</Section>
              )}
            </>
          ) : page === 'Realizacje OZE' ? (
            <>
              {/* OZE Installations pipeline (Table & Kanban) */}
              <PageHeading
                title="Realizacje OZE (Obiekty i Montaże)"
                subtitle={
                  currentRole === 'salesman'
                    ? 'Podgląd postępu montażu i przyłączenia dla Twoich podpisanych umów.'
                    : 'Zarządzaj procesem od audytu technicznego po montaż i przyłączenie do sieci OSD.'
                }
                button={currentRole !== 'salesman' ? 'Nowa realizacja OZE' : undefined}
                onClick={() => open('Realizacja')}
              />
              <div className="summary-strip">
                <span>
                  <strong>{roleScopedProjects.length}</strong> Widoczne instalacje ({totalPowerKwp} kWp /{' '}
                  {totalBatteryKwh} kWh)
                </span>
                <span>
                  <i className="legend-dot blue" />
                  {roleScopedProjects.filter(p => p.status === 'Montaż w toku').length} Montaż w toku
                </span>
                <span>
                  <i className="legend-dot orange" />
                  {roleScopedProjects.filter(p => p.status === 'Zgłoszenie OSD / Dotacja').length} Weryfikacja OSD /
                  Dotacja
                </span>
                <span>
                  <i className="legend-dot green" />
                  {roleScopedProjects.filter(p => p.status === 'Odebrane').length} Odebrane i rozliczone
                </span>
              </div>
              {toolbar('projects')}
              {view === 'table' ? (
                <div className="panel">{projectTable(visibleProjects, true)}</div>
              ) : (
                <div className="kanban">
                  {projectStatuses.map(s => (
                    <div
                      className="kanban-column"
                      key={s}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        const id = Number(e.dataTransfer.getData('text'));
                        changeProjectStatus(id, s);
                      }}
                    >
                      <h3>
                        <i
                          className={`legend-dot ${
                            s === 'Odebrane'
                              ? 'green'
                              : s === 'Kompletacja sprzętu'
                                ? 'orange'
                                : s === 'Audyt i projekt'
                                  ? 'purple'
                                  : 'blue'
                          }`}
                        />
                        {s}
                        <span>{visibleProjects.filter(p => p.status === s).length}</span>
                      </h3>
                      {visibleProjects
                        .filter(p => p.status === s)
                        .map(p => (
                          <div
                            className="kanban-card"
                            draggable={currentRole !== 'salesman'}
                            onDragStart={e => e.dataTransfer.setData('text', String(p.id))}
                            key={p.id}
                            onClick={() => {
                              setDetail(p);
                              setTab('Przegląd');
                            }}
                          >
                            <Badge>{p.systemType}</Badge>
                            <h3>{p.name}</h3>
                            <p>
                              {p.client} · <strong>{p.osdOperator}</strong>
                            </p>
                            <Progress value={p.progress} />
                            <div className="kanban-footer">
                              <Avatar name={p.manager} small />
                              <select
                                aria-label={`Etap dla ${p.name}`}
                                value={p.status}
                                disabled={currentRole === 'salesman'}
                                onClick={e => e.stopPropagation()}
                                onChange={e => changeProjectStatus(p.id, e.target.value)}
                              >
                                {projectStatuses.map(x => (
                                  <option key={x}>{x}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : page === 'Leady i Sprzedaż' ? (
            <>
              {/* Sales & Lead qualification pipeline with automated conversion to Realizacje OZE */}
              <PageHeading
                title="Leady, Audyty i Lejek Sprzedaży"
                subtitle="Zmień etap na 'Umowa podpisana (Wygrana)', aby automatycznie przekazać obiekt do Realizacji OZE i działu Dotacji."
                button="Dodaj lead + Kalkulator"
                onClick={() => open('Zadanie')}
              />
              <div className="summary-strip">
                <span>
                  <strong>{roleScopedTasks.length}</strong> Leady w lejku ({roleLabels[currentRole]})
                </span>
                <span>
                  <i className="legend-dot purple" />
                  {roleScopedTasks.filter(t => t.status === 'Nowy lead').length} Nowy lead
                </span>
                <span>
                  <i className="legend-dot blue" />
                  {roleScopedTasks.filter(t => t.status === 'Audyt / W toku').length} Audyt w toku
                </span>
                <span>
                  <i className="legend-dot green" />
                  {
                    roleScopedTasks.filter(
                      t =>
                        t.status === 'Umowa podpisana (Wygrana)' || t.status === 'Zrealizowane'
                    ).length
                  }{' '}
                  Podpisane umowy (przekazane do montażu)
                </span>
              </div>
              {toolbar('tasks')}
              {view === 'table' ? (
                <Section title="Szanse sprzedażowe i kalkulacje techniczne">
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Temat / Lead sprzedażowy</th>
                          <th>Klient / Inwestor</th>
                          <th>Źródło i dobór mocy</th>
                          <th>Handlowiec (Owner)</th>
                          <th>Priorytet</th>
                          <th>Termin</th>
                          <th>Etap lejka (Auto-konwersja)</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTasks.map(t => (
                          <tr key={t.id}>
                            <td>
                              <button className="table-name" onClick={() => open('Zadanie', t)}>
                                {t.name}
                              </button>
                            </td>
                            <td>{t.project}</td>
                            <td>
                              {t.leadSource || 'Kalkulator WWW'}{' '}
                              {t.estimatedPower ? `(${t.estimatedPower})` : ''}
                            </td>
                            <td>
                              <div className="person">
                                <Avatar name={t.assignee} small />
                                {t.assignee}
                              </div>
                            </td>
                            <td>
                              <Badge>{t.priority}</Badge>
                            </td>
                            <td className={t.due === 'Po terminie' ? 'overdue-text' : ''}>{t.due}</td>
                            <td>
                              <select
                                value={t.status}
                                aria-label={`Status dla ${t.name}`}
                                onChange={e => changeTask(t.id, e.target.value)}
                              >
                                {taskStatuses.map(s => (
                                  <option key={s}>{s}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label="Edytuj lead"
                                onClick={() => open('Zadanie', t)}
                              >
                                <Icon name="more" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!visibleTasks.length && (
                      <div className="empty">Brak leadów spełniających wybrane kryteria filtrowania.</div>
                    )}
                  </div>
                </Section>
              ) : (
                <div className="kanban task-kanban">
                  {taskStatuses.map(s => (
                    <div
                      className="kanban-column"
                      key={s}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => changeTask(Number(e.dataTransfer.getData('text')), s)}
                    >
                      <h3>
                        {s}
                        <span>{visibleTasks.filter(t => t.status === s).length}</span>
                      </h3>
                      {visibleTasks
                        .filter(t => t.status === s)
                        .map(t => (
                          <div
                            className="kanban-card"
                            draggable
                            onDragStart={e => e.dataTransfer.setData('text', String(t.id))}
                            key={t.id}
                          >
                            <Badge>{t.priority}</Badge>
                            <button className="table-name" onClick={() => open('Zadanie', t)}>
                              <h3>{t.name}</h3>
                            </button>
                            <p>
                              {t.project} {t.estimatedPower ? `· ${t.estimatedPower}` : ''}
                            </p>
                            <div className="kanban-footer">
                              <Avatar name={t.assignee} small />
                              <span>{t.due}</span>
                            </div>
                            <select
                              aria-label={`Status dla ${t.name}`}
                              value={t.status}
                              onChange={e => changeTask(t.id, e.target.value)}
                            >
                              {taskStatuses.map(x => (
                                <option key={x}>{x}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : page === 'Dotacje i OSD' ? (
            <>
              {/* Dedicated Polish OZE Subsidy & OSD Grid Connection Hub (Manager & Admin) */}
              <PageHeading
                title="Centrum Dotacji (Mój Prąd / Czyste Powietrze) i Zgłoszeń OSD"
                subtitle="Kontrola wniosków do NFOŚiGW/WFOŚiGW oraz zgłoszeń przyłączeniowych do PGE, Tauron, Enea i Energa."
                button="Nowa realizacja OZE"
                onClick={() => open('Realizacja')}
              />
              <div className="summary-strip">
                <span>
                  <i className="legend-dot purple" />
                  <strong>{projects.filter(p => p.subsidyProgram === 'Mój Prąd 6.0').length}</strong> Mój Prąd 6.0
                </span>
                <span>
                  <i className="legend-dot blue" />
                  <strong>{projects.filter(p => p.subsidyProgram === 'Czyste Powietrze').length}</strong> Czyste Powietrze
                </span>
                <span>
                  <i className="legend-dot orange" />
                  <strong>{projects.filter(p => p.subsidyStatus === 'Weryfikacja OSD').length}</strong> Oczekuje na licznik OSD
                </span>
                <span>
                  <i className="legend-dot green" />
                  <strong>{projects.filter(p => p.subsidyStatus === 'Wypłacono').length}</strong> Wypłacone dotacje
                </span>
              </div>
              <div className="panel table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Instalacja / Obiekt</th>
                      <th>Klient / Województwo</th>
                      <th>Operator OSD</th>
                      <th>Program dotacyjny</th>
                      <th>Parametry (PV + BESS)</th>
                      <th>Wartość umowy</th>
                      <th>Status wniosku / OSD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map(p => (
                      <tr key={p.id}>
                        <td
                          onClick={() => {
                            setDetail(p);
                            setPage('Realizacje OZE');
                            setTab('Dotacje i OSD');
                          }}
                        >
                          <div className="project-name">
                            <span className={`project-icon ${p.color}`}>
                              <Icon name="folder" size={16} />
                            </span>
                            <strong>{p.name}</strong>
                          </div>
                        </td>
                        <td>
                          {p.client} · <small>{p.voivodeship}</small>
                        </td>
                        <td>
                          <strong>{p.osdOperator}</strong>
                        </td>
                        <td>
                          <Badge>{p.subsidyProgram}</Badge>
                        </td>
                        <td>
                          {p.powerKwp} kWp + {p.batteryKwh} kWh
                        </td>
                        <td>{p.contractValue}</td>
                        <td>
                          <select
                            aria-label={`Status dotacji dla ${p.name}`}
                            value={p.subsidyStatus}
                            onChange={e =>
                              changeSubsidyStatus(p.id, e.target.value as Project['subsidyStatus'])
                            }
                          >
                            {subsidyStatuses.map(st => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : page === 'Klienci i Obiekty' ? (
            <>
              {/* Clients & installation addresses (filtered by owner for Salesman) */}
              <PageHeading
                title={clientDetail?.name || 'Klienci i Inwestorzy OZE'}
                subtitle={
                  clientDetail
                    ? `Adres inwestycji: ${clientDetail.address} (${clientDetail.voivodeship}) · Opiekun: ${clientDetail.ownerName}`
                    : currentRole === 'salesman'
                      ? `Twoja baza inwestorów (${roleScopedClients.length} przypisanych klientów — ochrona RODO).`
                      : 'Pełna baza gospodarstw domowych, rolników i klientów biznesowych (B2B).'
                }
                button={clientDetail ? 'Wszyscy klienci' : 'Dodaj inwestora'}
                onClick={() => (clientDetail ? setClientDetail(null) : open('Klient'))}
              />
              {clientDetail ? (
                <>
                  <div className="quick-actions">
                    <Button onClick={() => open('Klient', clientDetail)}>
                      Edytuj dane inwestora (SQL)
                    </Button>
                    <Button onClick={() => open('Zadanie')}>
                      <Icon name="plus" size={14} />
                      Dodaj lead dla klienta
                    </Button>
                    {currentRole !== 'salesman' && (
                      <Button onClick={() => open('Realizacja')}>
                        <Icon name="plus" size={14} />
                        Nowa instalacja OZE
                      </Button>
                    )}
                  </div>
                  <div className="detail-stats">
                    <div>
                      <small>Osoba kontaktowa</small>
                      <strong>{clientDetail.contact}</strong>
                    </div>
                    <div>
                      <small>Telefon / E-mail</small>
                      <strong>
                        {clientDetail.phone} · {clientDetail.email}
                      </strong>
                    </div>
                    <div>
                      <small>Operator sieci OSD</small>
                      <strong>{clientDetail.osd} Dystrybucja</strong>
                    </div>
                    <div>
                      <small>Model finansowania</small>
                      <strong>{clientDetail.financing}</strong>
                    </div>
                    <div>
                      <small>Handlowiec (Opiekun)</small>
                      <strong>{clientDetail.ownerName || 'Aleksander Morawski'}</strong>
                    </div>
                    <div>
                      <small>Status klienta ({clientDetail.projects} obiektów)</small>
                      <Badge>{clientDetail.status}</Badge>
                    </div>
                  </div>
                  <Section title="Instalacje OZE przypisane do klienta">
                    {projectTable(projects.filter(p => p.client === clientDetail.name), true)}
                  </Section>
                  <Section title="Leady i zadania przypisane do klienta">
                    {taskList(tasks.filter(t => t.project === clientDetail.name))}
                  </Section>
                </>
              ) : (
                <>
                  <div className="toolbar">
                    <div className="search-field">
                      <Icon name="search" />
                      <input
                        placeholder="Szukaj klienta, adresu, województwa, OSD..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                      />
                    </div>
                    <Button onClick={() => setSort(!sort)}>
                      Sortuj alfabetycznie <Icon name="down" size={14} />
                    </Button>
                  </div>
                  <div className="panel table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Inwestor / Klient</th>
                          <th>Adres inwestycji</th>
                          <th>Województwo / OSD</th>
                          <th>Telefon</th>
                          <th>Handlowiec</th>
                          <th>Finansowanie</th>
                          <th>Obiekty OZE</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {roleScopedClients
                          .filter(c =>
                            `${c.name} ${c.contact} ${c.address} ${c.voivodeship} ${c.osd}`
                              .toLowerCase()
                              .includes(search.toLowerCase())
                          )
                          .sort((a, b) => (sort ? a.name.localeCompare(b.name, 'pl') : a.id - b.id))
                          .map(c => (
                            <tr key={c.id} onClick={() => setClientDetail(c)}>
                              <td>
                                <div className="person">
                                  <Avatar name={c.name} color={c.color} />
                                  <strong>{c.name}</strong>
                                </div>
                              </td>
                              <td>{c.address}</td>
                              <td>
                                {c.voivodeship} · <strong>{c.osd}</strong>
                              </td>
                              <td>{c.phone}</td>
                              <td>{c.ownerName}</td>
                              <td>{c.financing}</td>
                              <td>
                                <strong>{c.projects}</strong> szt.
                              </td>
                              <td>
                                <Badge>{c.status}</Badge>
                              </td>
                              <td>
                                <button
                                  className="icon-button"
                                  aria-label={`Edytuj ${c.name}`}
                                  onClick={e => {
                                    e.stopPropagation();
                                    open('Klient', c);
                                  }}
                                >
                                  <Icon name="more" size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {!roleScopedClients.some(c =>
                      `${c.name} ${c.contact} ${c.address} ${c.voivodeship}`
                        .toLowerCase()
                        .includes(search.toLowerCase())
                    ) && (
                      <div className="empty">Nie znaleziono inwestorów spełniających kryteria wyszukiwania.</div>
                    )}
                  </div>
                </>
              )}
            </>
          ) : page === 'Ekipy i Handlowcy' ? (
            <>
              {/* Field teams, auditors, and sales reps with RBAC management */}
              <PageHeading
                title={employee?.name || 'Ekipy Monterskie, Managerowie i Handlowcy (RBAC)'}
                subtitle={
                  employee
                    ? `${employee.role} · Dział: ${employee.department} · Rola systemowa: ${employee.systemRole.toUpperCase()}`
                    : 'Zarządzanie uprawnieniami (Admin, Manager, Salesman) i obciążeniem zespołów w bazie SQLite.'
                }
                button={
                  employee
                    ? 'Wszyscy pracownicy'
                    : currentRole === 'admin'
                      ? 'Dodaj pracownika (SQL)'
                      : 'Raport obłożenia ekip'
                }
                onClick={() =>
                  employee
                    ? setEmployee(null)
                    : currentRole === 'admin'
                      ? open('Pracownik')
                      : navigate('Raporty OZE')
                }
              />
              {employee ? (
                <>
                  <div className="quick-actions">
                    {currentRole === 'admin' && (
                      <Button onClick={() => open('Pracownik', employee)}>
                        Edytuj profil pracownika (SQL)
                      </Button>
                    )}
                    <Button onClick={() => open('Zadanie')}>
                      <Icon name="plus" size={14} />
                      Przypisz nowe zadanie / audyt
                    </Button>
                    <Button onClick={() => switchUser(employee)}>
                      Zaloguj jako {employee.name.split(' ')[0]}
                    </Button>
                  </div>
                  <div className="detail-stats">
                    <div>
                      <small>Imię i nazwisko</small>
                      <strong>{employee.name}</strong>
                    </div>
                    <div>
                      <small>Rola w systemie (RBAC)</small>
                      {currentRole === 'admin' ? (
                        <select
                          aria-label="Zmień rolę RBAC"
                          value={employee.systemRole}
                          onChange={async e => {
                            const newRole = e.target.value as SystemRole;
                            const snap = await DataLayer.updateUserRole(
                              employee.id,
                              newRole,
                              currentUser.name,
                              employee.workload
                            );
                            applySnapshot(snap);
                            setEmployee({ ...employee, systemRole: newRole });
                            notify(
                              `Zaktualizowano w SQLite rolę dla ${employee.name}: ${newRole.toUpperCase()}`
                            );
                          }}
                        >
                          <option value="admin">ADMIN (Pełny dostęp)</option>
                          <option value="manager">MANAGER (Realizacje i OSD)</option>
                          <option value="salesman">SALESMAN (Własne leady i klienci)</option>
                        </select>
                      ) : (
                        <Badge>{employee.systemRole.toUpperCase()}</Badge>
                      )}
                    </div>
                    <div>
                      <small>Alokacja / Obciążenie (%)</small>
                      {currentRole === 'admin' ? (
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={employee.workload}
                          onChange={async e => {
                            const w = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                            setEmployee({ ...employee, workload: w });
                            const snap = await DataLayer.updateUserRole(
                              employee.id,
                              employee.systemRole,
                              currentUser.name,
                              w
                            );
                            applySnapshot(snap);
                          }}
                        />
                      ) : (
                        <strong>{employee.workload}%</strong>
                      )}
                    </div>
                    <div>
                      <small>Region operacyjny</small>
                      <strong>{employee.region}</strong>
                    </div>
                    <div>
                      <small>Przełącz widok na tego pracownika</small>
                      <Button onClick={() => switchUser(employee)}>
                        Zaloguj jako {employee.name.split(' ')[0]}
                      </Button>
                    </div>
                  </div>
                  <Section title="Prowadzone realizacje OZE">
                    {projectTable(projects.filter(p => p.manager === employee.name), true)}
                  </Section>
                  <Section title="Przypisane audyty i zadania sprzedażowe">
                    {taskList(tasks.filter(t => t.assignee === employee.name))}
                  </Section>
                </>
              ) : (
                <>
                  <div className="toolbar">
                    <div className="search-field">
                      <Icon name="search" />
                      <input
                        placeholder="Szukaj pracownika, regionu lub roli (admin / manager / salesman)..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                      />
                    </div>
                    <span>Użytkownicy w tabeli SQL `users` ({users.length})</span>
                  </div>
                  <div className="employee-grid">
                    {users
                      .filter(e =>
                        `${e.name} ${e.role} ${e.department} ${e.region} ${e.systemRole}`
                          .toLowerCase()
                          .includes(search.toLowerCase())
                      )
                      .map(e => (
                        <button
                          className="panel employee-card"
                          key={e.name}
                          onClick={() => setEmployee(e)}
                        >
                          <div className="employee-card-top">
                            <span className="department">{e.department}</span>
                            <Badge>{e.systemRole.toUpperCase()}</Badge>
                          </div>
                          <Avatar name={e.name} color={e.color} />
                          <h3>{e.name}</h3>
                          <p>
                            {e.role} · <strong>{e.region}</strong>
                          </p>
                          <div className="employee-workload">
                            <span>
                              Alokacja czasu <strong>{e.workload}%</strong>
                            </span>
                            <Progress value={e.workload} />
                          </div>
                          <span className="employee-link">
                            Uprawnienia RBAC i realizacje <Icon name="arrow" size={14} />
                          </span>
                        </button>
                      ))}
                  </div>
                </>
              )}
            </>
          ) : page === 'Grafik Montaży' ? (
            <>
              {/* Installation & Technical Audit Calendar backed by SQLite calendar_events */}
              <PageHeading
                title="Grafik Montaży, Audytów i Odbiorów"
                subtitle="Wszystkie terminy są przechowywane w tabeli SQLite `calendar_events`."
                button="Zaplanuj wyjazd / montaż"
                onClick={() => open('Wydarzenie')}
              />
              <div className="toolbar">
                <div className="calendar-controls">
                  <Button onClick={() => setMonth(month - 1)}>‹</Button>
                  <h2>
                    {new Date(now.getFullYear(), month)
                      .toLocaleString('pl-PL', { month: 'long', year: 'numeric' })
                      .replace(/^./, str => str.toUpperCase())}
                  </h2>
                  <Button onClick={() => setMonth(month + 1)}>›</Button>
                  <Button onClick={() => setMonth(now.getMonth())}>Dzisiaj</Button>
                </div>
                <div className="view-toggle">
                  <button className={!week ? 'active' : ''} onClick={() => setWeek(false)}>
                    Miesiąc
                  </button>
                  <button className={week ? 'active' : ''} onClick={() => setWeek(true)}>
                    Tydzień
                  </button>
                </div>
              </div>
              <div className="panel calendar">
                <div className="calendar-days">
                  {['PON', 'WT', 'ŚR', 'CZW', 'PT', 'SOB', 'NIE'].map(d => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div className="calendar-grid">
                  {(() => {
                    const viewDate = new Date(now.getFullYear(), month, 1);
                    const viewYear = viewDate.getFullYear();
                    const viewMonth = viewDate.getMonth();
                    const firstDayWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
                    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
                    const totalCells = week
                      ? 7
                      : Math.ceil((firstDayWeekday + daysInMonth) / 7) * 7;
                    const refDay = Math.min(now.getDate(), daysInMonth);
                    const refWeekday = (new Date(viewYear, viewMonth, refDay).getDay() + 6) % 7;
                    const weekMondayDay = refDay - refWeekday;

                    return Array.from({ length: totalCells }, (_, i) => {
                      const cellDate = week
                        ? new Date(viewYear, viewMonth, weekMondayDay + i)
                        : new Date(viewYear, viewMonth, 1 - firstDayWeekday + i);
                      const cellDay = cellDate.getDate();
                      const cellMonth = cellDate.getMonth();
                      const cellYear = cellDate.getFullYear();
                      const isCurrentMonth = cellMonth === viewMonth;
                      const isToday =
                        cellDay === now.getDate() &&
                        cellMonth === now.getMonth() &&
                        cellYear === now.getFullYear();
                      const cellIso = `${cellYear}-${String(cellMonth + 1).padStart(
                        2,
                        '0'
                      )}-${String(cellDay).padStart(2, '0')}`;
                      const dayEvents = events.filter(ev => ev.date === cellIso);

                      return (
                        <div
                          className={`calendar-cell ${isToday ? 'today-cell' : ''}`}
                          key={cellIso}
                          onDoubleClick={() =>
                            open('Wydarzenie', {
                              name: '',
                              date: cellIso,
                              eventType: 'Montaż',
                              client: roleScopedClients[0]?.name || clients[0]?.name || '',
                            })
                          }
                        >
                          <span
                            className={!isCurrentMonth ? 'muted' : ''}
                            title={`Kliknij, aby dodać wyjazd na ${cellIso}`}
                            style={{ cursor: 'pointer' }}
                            onClick={() =>
                              open('Wydarzenie', {
                                name: '',
                                date: cellIso,
                                eventType: 'Montaż',
                                client: roleScopedClients[0]?.name || clients[0]?.name || '',
                              })
                            }
                          >
                            {cellDay}
                          </span>
                          {dayEvents.map((ev, j) => {
                            const eventColor =
                              ev.eventType === 'Odbiór OSD'
                                ? 'purple'
                                : ev.eventType === 'Audyt'
                                  ? 'orange'
                                  : 'blue';
                            return (
                              <button
                                key={ev.id || j}
                                className={`calendar-event ${eventColor}`}
                                title="Kliknij, aby edytować lub usunąć termin"
                                onClick={() => open('Wydarzenie', ev)}
                              >
                                {ev.name}
                              </button>
                            );
                          })}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
              <div className="calendar-key">
                <span>
                  <i className="legend-dot blue" />
                  Montaże PV i magazynów energii
                </span>
                <span>
                  <i className="legend-dot purple" />
                  Odbiory OSD i uruchomienia pomp ciepła
                </span>
                <span>
                  <i className="legend-dot orange" />
                  Audyty techniczne u klienta
                </span>
              </div>
            </>
          ) : page === 'Raporty OZE' ? (
            <>
              {/* OZE Performance Analytics & Export */}
              <PageHeading
                title="Raporty i Analityka OZE"
                subtitle="Analiza mocy zainstalowanej (kWp), sprzedaży magazynów energii (kWh) i efektywności ekip."
                button="Eksportuj bazę OZE (CSV)"
                onClick={() => {
                  const csv =
                    'Instalacja,Klient,Typ_Systemu,Moc_kWp,Magazyn_kWh,Operator_OSD,Dotacja,Status_Dotacji,Etap,Postep,Wartosc_Umowy\n' +
                    projects
                      .map(
                        p =>
                          `"${p.name}","${p.client}","${p.systemType}","${p.powerKwp}","${p.batteryKwh}","${p.osdOperator}","${p.subsidyProgram}","${p.subsidyStatus}","${p.status}","${p.progress}%","${p.contractValue}"`
                      )
                      .join('\n');
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
                  a.download = 'raport-instalacji-oze.csv';
                  a.click();
                  URL.revokeObjectURL(a.href);
                  notify('Pełny raport realizacji OZE został pobrany w formacie CSV.');
                }}
              />
              <div className="kpi-grid">
                {[
                  [
                    'Łączna moc portfela OZE',
                    `${projects.reduce((s, p) => s + p.powerKwp, 0).toFixed(1)} kWp`,
                    `${projects.length} aktywnych obiektów w SQLite`,
                  ],
                  [
                    'Udział PV z magazynem BESS',
                    `${Math.round(
                      (projects.filter(p => p.batteryKwh > 0).length / Math.max(1, projects.length)) * 100
                    )}%`,
                    `Łącznie ${projects.reduce((s, p) => s + p.batteryKwh, 0)} kWh pojemności`,
                  ],
                  [
                    'Wnioski wypłacone / odebrane',
                    `${projects.filter(p => p.subsidyStatus === 'Wypłacono' || p.status === 'Odebrane').length} szt.`,
                    'Zsynchronizowane z NFOŚiGW / OSD',
                  ],
                  [
                    'Średnie obłożenie zespołów',
                    `${Math.round(
                      users.reduce((s, u) => s + u.workload, 0) / Math.max(1, users.length)
                    )}%`,
                    `${users.length} pracowników w bazie RBAC`,
                  ],
                ].map(([t, v, s]) => (
                  <div className="kpi-card" key={t}>
                    <p>{t}</p>
                    <div className="metric">{v}</div>
                    <span className="positive">{s}</span>
                  </div>
                ))}
              </div>
              <div className="detail-grid">
                <Section
                  title="Moc PV (kWp) i Magazyny BESS (kWh) wg operatorów OSD i obiektów SQLite"
                  subtitle="Dynamiczny wykres wyliczany na żywo z tabeli `installations` w bazie SQLite"
                >
                  <div className="bar-chart">
                    {osdOperators.map(osd => {
                      const osdProjects = projects.filter(p => p.osdOperator === osd);
                      const osdKwp = osdProjects.reduce((s, p) => s + p.powerKwp, 0);
                      const osdKwh = osdProjects.reduce((s, p) => s + p.batteryKwh, 0);
                      const maxMetric = Math.max(
                        50,
                        ...osdOperators.map(op =>
                          projects
                            .filter(pr => pr.osdOperator === op)
                            .reduce((s, pr) => Math.max(s + pr.powerKwp, s + pr.batteryKwh), 0)
                        )
                      );
                      const kwpHeight = Math.min(96, Math.max(12, Math.round((osdKwp / maxMetric) * 92)));
                      const kwhHeight = Math.min(96, Math.max(12, Math.round((osdKwh / maxMetric) * 92)));
                      return (
                        <div
                          className="bar-group"
                          key={osd}
                          title={`${osd}: ${osdKwp.toFixed(1)} kWp PV / ${osdKwh} kWh BESS (${osdProjects.length} obiektów)`}
                        >
                          <div className="bars">
                            <i style={{ height: `${kwpHeight}%` }} />
                            <i style={{ height: `${kwhHeight}%` }} />
                          </div>
                          <span>
                            {osd} ({osdKwp.toFixed(1)} kWp)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="calendar-key">
                    <span>
                      <i className="legend-dot blue" />
                      Moc instalacji PV (kWp w SQLite)
                    </span>
                    <span>
                      <i className="legend-dot orange" />
                      Pojemność magazynów energii BESS (kWh w SQLite)
                    </span>
                  </div>
                </Section>
                <Section
                  title="Obciążenie kluczowych działów i brygad"
                  subtitle="Alokacja zasobów ludzkich pomiędzy sprzedażą, audytem a montażem"
                >
                  <div className="workload-list">
                    {users.map(e => (
                      <div key={e.name}>
                        <div className="person">
                          <Avatar name={e.name} color={e.color} small />
                          {e.name} ({e.systemRole})
                        </div>
                        <Progress value={e.workload} />
                      </div>
                    ))}
                  </div>
                </Section>
              </div>
              <Section title="Rozkład portfela inwestycji według etapu realizacji">
                <div className="distribution">
                  {projectStatuses.map(s => (
                    <div key={s}>
                      <Badge>{s}</Badge>
                      <strong>{projects.filter(p => p.status === s).length}</strong>
                      <Progress
                        value={Math.round(
                          (projects.filter(p => p.status === s).length / Math.max(1, projects.length)) * 100
                        )}
                      />
                    </div>
                  ))}
                </div>
              </Section>
            </>
          ) : (
            <>
              {/* OZE System Settings & SQLite Data Layer Inspector (Admin only) */}
              <PageHeading
                title="Ustawienia Systemu, RBAC i Warstwa Bazy Danych SQLite"
                subtitle="Zarządzanie silnikiem SQLite (database/oze_crm.sqlite), uprawnieniami ról oraz konfiguracją OZE."
                button="Pobierz kopię SQL (JSON)"
                onClick={async () => {
                  await DataLayer.downloadBackup();
                  notify('Pobrano pełny zrzut bazy danych SQLite.');
                }}
              />

              <Section
                title="Status relacyjnej bazy danych SQLite (Data Layer)"
                subtitle={`Aktywne połączenie: ${dbEngine} · Plik schematu: database/schema.sql`}
                action={
                  <Button
                    onClick={async () => {
                      const snap = await DataLayer.resetDatabase();
                      applySnapshot(snap);
                      notify('Baza danych SQLite została przywrócona do stanu początkowego.');
                    }}
                  >
                    Przywróć dane startowe (Reset SQL)
                  </Button>
                }
              >
                <div className="detail-stats">
                  <div>
                    <small>Tabela: users (RBAC)</small>
                    <strong>{users.length} rekordów</strong>
                  </div>
                  <div>
                    <small>Tabela: clients</small>
                    <strong>{clients.length} inwestorów</strong>
                  </div>
                  <div>
                    <small>Tabela: installations</small>
                    <strong>{projects.length} obiektów OZE</strong>
                  </div>
                  <div>
                    <small>Tabela: leads</small>
                    <strong>{tasks.length} szans / zadań</strong>
                  </div>
                  <div>
                    <small>Tabela: calendar_events</small>
                    <strong>{events.length} terminów</strong>
                  </div>
                  <div>
                    <small>Tabela: activity_logs</small>
                    <strong>{activities.length} wpisów audytu</strong>
                  </div>
                </div>
              </Section>

              <Section
                title="Konfiguracja organizacji i automatyzacji lejka (Tabela SQL `settings`)"
                subtitle="Zmiany zapisywane są bezpośrednio w bazie SQLite i sterują automatycznym tworzeniem realizacji OZE"
              >
                <form
                  className="settings-form"
                  onSubmit={async e => {
                    e.preventDefault();
                    const snap = await DataLayer.saveSettings(settings, currentUser.name);
                    applySnapshot(snap);
                    notify('Konfiguracja została trwale zapisana w tabeli SQLite `settings`.');
                  }}
                >
                  <label>
                    Nazwa spółki / organizacji OZE
                    <input
                      value={settings.companyName}
                      onChange={e => setSettings({ ...settings, companyName: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    Główny administrator / Dyrektor Operacyjny
                    <input
                      value={settings.adminName}
                      onChange={e => setSettings({ ...settings, adminName: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    E-mail biura obsługi dotacji i OSD
                    <input
                      value={settings.officeEmail}
                      onChange={e => setSettings({ ...settings, officeEmail: e.target.value })}
                      type="email"
                      required
                    />
                  </label>
                  <label>
                    Domyślny program dotacji dla nowych instalacji B2C
                    <select
                      value={settings.defaultSubsidy}
                      onChange={e =>
                        setSettings({
                          ...settings,
                          defaultSubsidy: e.target.value as Project['subsidyProgram'],
                        })
                      }
                    >
                      <option>Mój Prąd 6.0</option>
                      <option>Czyste Powietrze</option>
                      <option>Ciepłe Mieszkanie</option>
                    </select>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.autoConvertLead}
                      onChange={e => setSettings({ ...settings, autoConvertLead: e.target.checked })}
                    />
                    Automatycznie twórz realizację montażową, wniosek OSD i termin audytu po podpisaniu umowy przez Handlowca
                  </label>
                  <Button variant="primary" type="submit">
                    Zapisz konfigurację w SQLite
                  </Button>
                </form>
              </Section>
            </>
          )}
        </main>
      </div>

      {/* Modal dialog for creating and editing OZE installations, leads, clients, employees, and schedule items */}
      {modal && (
        <div
          className="modal-overlay"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-header">
              <div>
                <h2 id="modal-title">
                  {modal === 'BazaWiedzy'
                    ? 'Baza Wiedzy OZE: Dotacje NFOŚiGW i Operatorzy OSD'
                    : `${editing && editing.name ? 'Edytuj w bazie SQLite:' : 'Dodaj do bazy SQLite:'} ${modal}`}
                </h2>
                <p>
                  {modal === 'BazaWiedzy'
                    ? 'Aktualne progi dofinansowań (Mój Prąd 6.0, Czyste Powietrze) oraz procedury przyłączeniowe OSD.'
                    : modal === 'Zadanie'
                      ? 'Wprowadź dane leada i skorzystaj z kalkulatora doboru mocy OZE.'
                      : 'Wszystkie pola zostaną trwale zapisane w bazie database/oze_crm.sqlite.'}
                </p>
              </div>
              <button className="icon-button" aria-label="Zamknij okno" onClick={() => setModal(null)}>
                <Icon name="close" />
              </button>
            </div>
            {modal === 'BazaWiedzy' ? (
              <div>
                <div className="prose">
                  <h3>1. Programy dotacyjne NFOŚiGW / WFOŚiGW (2026)</h3>
                  {[
                    [
                      'Mój Prąd 6.0 (Mikroinstalacje PV 2–20 kWp + obligatoryjny magazyn BESS)',
                      'Do 7 000 PLN na instalację PV + do 16 000 PLN na magazyn energii elektrycznej (min. 2 kWh) + do 5 000 PLN na magazyn ciepła. Rozliczenie w systemie net-billing.',
                      'Do 28 000 PLN',
                    ],
                    [
                      'Czyste Powietrze (Kompleksowa termomodernizacja + Pompa ciepła + PV)',
                      'Trzy progi dochodowe (podstawowy, podwyższony, najwyższy z prefinansowaniem WFOŚiGW). Wymagany audyt energetyczny budynku i świadectwo charakterystyki energetycznej.',
                      'Do 136 200 PLN',
                    ],
                    [
                      'Ciepłe Mieszkanie (Budynki wielorodzinne i wspólnoty)',
                      'Wsparcie wymiany nieefektywnych źródeł ciepła (kopciuchów) na pompy ciepła powietrze-powietrze / powietrze-woda oraz stolarkę okienną.',
                      'Do 41 000 PLN',
                    ],
                  ].map(([progTitle, progDesc, progMax]) => (
                    <div className="milestone" key={progTitle}>
                      <span className="done-dot" />
                      <div>
                        <strong>{progTitle}</strong>
                        <p>{progDesc}</p>
                      </div>
                      <Badge>{progMax}</Badge>
                    </div>
                  ))}

                  <h3>2. Wymogi operatorów sieci dystrybucyjnych (OSD)</h3>
                  {[
                    [
                      'PGE Dystrybucja / Tauron Dystrybucja / Enea Operator / Energa-Operator',
                      'Zgłoszenie mikroinstalacji (PZO) na min. 30 dni przed planowanym uruchomieniem. Wymagany certyfikat NC RfG falownika, schemat jednokreskowy oraz protokół pomiarów elektrycznych.',
                      'Termin OSD: do 30 dni',
                    ],
                    [
                      'Instalacje B2B powyżej 50 kWp oraz magazyny BESS',
                      'Obowiązek uzgodnienia projektu pod kątem ochrony przeciwpożarowej z rzeczoznawcą ds. zabezpieczeń ppoż. dla instalacji powyżej 6,5 kWp oraz montaż wyłącznika ppoż.',
                      'Wymóg ppoż. > 6.5 kWp',
                    ],
                  ].map(([osdTitle, osdDesc, osdBadge]) => (
                    <div className="milestone" key={osdTitle}>
                      <span className="pending-dot" />
                      <div>
                        <strong>{osdTitle}</strong>
                        <p>{osdDesc}</p>
                      </div>
                      <Badge>{osdBadge}</Badge>
                    </div>
                  ))}
                </div>
                <div className="modal-footer">
                  <Button
                    type="button"
                    onClick={() => {
                      setModal(null);
                      if (currentRole !== 'salesman') navigate('Dotacje i OSD');
                    }}
                  >
                    Otwórz moduł Dotacje i OSD
                  </Button>
                  <Button type="button" variant="primary" onClick={() => setModal(null)}>
                    Zamknij bazę wiedzy
                  </Button>
                </div>
              </div>
            ) : (
            <form
              onSubmit={async e => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const name = String(form.get('name')).trim();
                if (!name) return;

                if (modal === 'Realizacja') {
                  const existingProj = editing && 'powerKwp' in editing ? editing : null;
                  const rawDeadline = String(form.get('deadline') || '');
                  const defaultDeadlineDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                  const formattedDeadline = rawDeadline.includes('-')
                    ? formatPlShortDate(new Date(rawDeadline + 'T12:00:00'))
                    : existingProj?.deadline || formatPlShortDate(defaultDeadlineDate);
                  const statusVal = String(form.get('status') || 'Audyt i projekt');
                  const p: Project = {
                    id: editing?.id || Date.now(),
                    name,
                    client: String(form.get('client')),
                    manager: String(form.get('manager')),
                    status: statusVal,
                    priority: String(form.get('priority')),
                    start: existingProj ? existingProj.start : formatPlShortDate(new Date()),
                    deadline: formattedDeadline,
                    progress:
                      statusVal === 'Odebrane'
                        ? 100
                        : statusVal === 'Zgłoszenie OSD / Dotacja'
                          ? 90
                          : statusVal === 'Montaż w toku'
                            ? 70
                            : statusVal === 'Kompletacja sprzętu'
                              ? 45
                              : existingProj
                                ? existingProj.progress
                                : 15,
                    color: existingProj ? existingProj.color : 'blue',
                    initials: name.slice(0, 2).toUpperCase(),
                    systemType: String(form.get('systemType') || 'PV + Magazyn energii'),
                    powerKwp: Number(form.get('powerKwp') || calcKwp),
                    batteryKwh: Number(form.get('batteryKwh') || calcKwh),
                    osdOperator: (form.get('osdOperator') as Project['osdOperator']) || 'PGE',
                    subsidyProgram:
                      (form.get('subsidyProgram') as Project['subsidyProgram']) || settings.defaultSubsidy,
                    subsidyStatus:
                      (form.get('subsidyStatus') as Project['subsidyStatus']) ||
                      (existingProj ? existingProj.subsidyStatus : 'W przygotowaniu'),
                    roofType:
                      (form.get('roofType') as Project['roofType']) ||
                      (existingProj ? existingProj.roofType : 'Dachówka ceramiczna'),
                    contractValue: String(
                      form.get('contractValue') ||
                        `${(Math.round((calcKwp * 3800 + calcKwh * 2100) / 100) * 100).toLocaleString('pl-PL')} PLN`
                    ),
                    installTeam: String(
                      form.get('installTeam') || (existingProj ? existingProj.installTeam : 'Ekipa Mazowsze-1')
                    ),
                    voivodeship: String(
                      form.get('voivodeship') || (existingProj ? existingProj.voivodeship : 'Mazowieckie')
                    ),
                    notes: String(form.get('description') || ''),
                  };
                  const snap = await DataLayer.saveInstallation(p, currentUser.name, currentRole);
                  applySnapshot(snap);
                  if (detail?.id === p.id) setDetail(p);
                } else if (modal === 'Zadanie') {
                  const statusVal = String(form.get('status'));
                  const t: Task = {
                    id: editing?.id || Date.now(),
                    name,
                    project: String(form.get('project')),
                    assignee: String(form.get('manager')),
                    priority: String(form.get('priority')),
                    status: statusVal,
                    due: String(form.get('deadline')),
                    leadSource: String(form.get('leadSource') || 'Kalkulator WWW'),
                    estimatedPower: `${calcKwp} kWp + ${calcKwh} kWh`,
                    notes: String(form.get('description') || ''),
                  };
                  const snap = await DataLayer.saveLead(t, currentUser.name);
                  applySnapshot(snap);
                  if (statusVal === 'Umowa podpisana (Wygrana)') {
                    setModal(null);
                    notify(
                      'Umowa podpisana! Automatycznie utworzono obiekt w Realizacje OZE oraz wniosek w Dotacje i OSD.'
                    );
                    return;
                  }
                } else if (modal === 'Klient') {
                  const existingClient = editing && 'contact' in editing ? editing : null;
                  const newClient: ClientRecord = {
                    id: existingClient ? existingClient.id : Date.now(),
                    name,
                    contact: String(form.get('contact')),
                    email: String(form.get('email')),
                    phone: String(form.get('phone')),
                    projects: existingClient ? existingClient.projects : 0,
                    status: String(form.get('status') || 'Aktywny'),
                    color: existingClient ? existingClient.color : 'blue',
                    address: String(form.get('address') || 'ul. Słoneczna 1, Warszawa'),
                    voivodeship: String(form.get('voivodeship') || 'Mazowieckie'),
                    osd: (form.get('osd') as ClientRecord['osd']) || 'PGE',
                    financing: String(form.get('financing') || 'Dotacja + Gotówka'),
                    ownerName: String(form.get('ownerName') || currentUser.name),
                  };
                  const snap = await DataLayer.saveClient(newClient, currentUser.name);
                  applySnapshot(snap);
                  if (clientDetail?.id === newClient.id) setClientDetail(newClient);
                } else if (modal === 'Pracownik') {
                  const existingEmp = editing && 'systemRole' in editing ? editing : null;
                  const newEmp: Employee = {
                    id: existingEmp ? existingEmp.id : Date.now(),
                    name,
                    email: String(form.get('email') || 'pracownik@sm-oze.pl'),
                    systemRole: (form.get('systemRole') as SystemRole) || 'salesman',
                    role: String(form.get('role') || 'Handlowiec OZE (Doradca D2D)'),
                    department: String(form.get('department') || 'Sprzedaż D2D'),
                    region: String(form.get('region') || 'Mazowieckie'),
                    workload: Number(form.get('workload') || 65),
                    color: existingEmp ? existingEmp.color : 'teal',
                  };
                  const snap = await DataLayer.saveUser(newEmp, currentUser.name);
                  applySnapshot(snap);
                  if (employee?.id === newEmp.id) setEmployee(newEmp);
                } else {
                  const existingEv = editing && 'date' in editing ? editing : null;
                  const clientName = String(form.get('client') || '');
                  const matchedProj = projects.find(p => p.client === clientName);
                  const snap = await DataLayer.saveEvent(
                    {
                      id: existingEv?.id,
                      name,
                      date: String(form.get('deadline')),
                      eventType: (form.get('eventType') as CalendarEvent['eventType']) || 'Montaż',
                      client: clientName,
                      installationId: existingEv?.installationId ?? matchedProj?.id,
                    },
                    currentUser.name
                  );
                  applySnapshot(snap);
                }
                setModal(null);
                setEditing(null);
                notify(`Zapisano w bazie SQLite: ${name}`);
              }}
            >
              <div className="form-fields">
                <label>
                  {modal === 'Klient'
                    ? 'Inwestor (Imię i nazwisko lub nazwa firmy)'
                    : modal === 'Pracownik'
                      ? 'Imię i nazwisko pracownika / lidera ekipy'
                      : modal === 'Realizacja'
                        ? 'Nazwa inwestycji OZE (np. PV 10 kWp + Magazyn — Miasto)'
                        : modal === 'Wydarzenie'
                          ? 'Nazwa wyjazdu / montażu / audytu'
                          : 'Temat leada sprzedażowego / audytu'}{' '}
                  <span>*</span>
                  <input
                    autoFocus
                    name="name"
                    required
                    defaultValue={editing?.name}
                    placeholder="Wprowadź nazwę..."
                  />
                </label>

                {modal === 'Klient' ? (
                  <>
                    <div className="form-grid">
                      <label>
                        Osoba decyzyjna / kontaktowa <span>*</span>
                        <input
                          name="contact"
                          required
                          defaultValue={editing && 'contact' in editing ? editing.contact : ''}
                          placeholder="Imię i nazwisko"
                        />
                      </label>
                      <label>
                        Handlowiec prowadzący (Opiekun)
                        <select
                          name="ownerName"
                          defaultValue={
                            editing && 'ownerName' in editing ? editing.ownerName : currentUser.name
                          }
                        >
                          {users.map(u => (
                            <option key={u.id}>{u.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Adres montażu inwestycji <span>*</span>
                      <input
                        name="address"
                        required
                        defaultValue={editing && 'address' in editing ? editing.address : ''}
                        placeholder="ul. Przykładowa 10, 00-000 Miasto"
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        Adres e-mail <span>*</span>
                        <input
                          name="email"
                          required
                          type="email"
                          defaultValue={editing && 'email' in editing ? editing.email : ''}
                          placeholder="klient@domena.pl"
                        />
                      </label>
                      <label>
                        Telefon kontaktowy <span>*</span>
                        <input
                          name="phone"
                          required
                          defaultValue={editing && 'phone' in editing ? editing.phone : ''}
                          placeholder="+48 500 000 000"
                        />
                      </label>
                      <label>
                        Województwo
                        <select
                          name="voivodeship"
                          defaultValue={
                            editing && 'voivodeship' in editing ? editing.voivodeship : 'Mazowieckie'
                          }
                        >
                          {polishVoivodeships.map(v => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Operator sieci OSD
                        <select
                          name="osd"
                          defaultValue={editing && 'osd' in editing ? editing.osd : 'PGE'}
                        >
                          {osdOperators.map(o => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Model finansowania
                        <select
                          name="financing"
                          defaultValue={
                            editing && 'financing' in editing ? editing.financing : 'Dotacja + Gotówka'
                          }
                        >
                          <option>Dotacja + Gotówka</option>
                          <option>Mój Prąd 6.0 + Gotówka</option>
                          <option>Czyste Powietrze (Prefinansowanie)</option>
                          <option>Kredyt OZE (Alior)</option>
                          <option>Leasing (Santander)</option>
                          <option>Gotówka</option>
                        </select>
                      </label>
                      <label>
                        Status klienta
                        <select
                          name="status"
                          defaultValue={editing && 'status' in editing ? editing.status : 'Aktywny'}
                        >
                          <option>Aktywny</option>
                          <option>W realizacji</option>
                          <option>Zakończony</option>
                        </select>
                      </label>
                    </div>
                  </>
                ) : modal === 'Pracownik' ? (
                  <div className="form-grid">
                    <label>
                      Służbowy adres e-mail <span>*</span>
                      <input
                        name="email"
                        type="email"
                        required
                        defaultValue={editing && 'email' in editing ? editing.email : ''}
                        placeholder="imie.nazwisko@sm-oze.pl"
                      />
                    </label>
                    <label>
                      Rola systemowa (RBAC)
                      <select
                        name="systemRole"
                        defaultValue={
                          editing && 'systemRole' in editing ? editing.systemRole : 'salesman'
                        }
                      >
                        <option value="salesman">SALESMAN (Handlowiec)</option>
                        <option value="manager">MANAGER (Koordynator)</option>
                        <option value="admin">ADMIN (Dyrektor)</option>
                      </select>
                    </label>
                    <label>
                      Stanowisko
                      <input
                        name="role"
                        required
                        defaultValue={
                          editing && 'role' in editing ? editing.role : 'Handlowiec OZE (Doradca D2D)'
                        }
                      />
                    </label>
                    <label>
                      Dział
                      <select
                        name="department"
                        defaultValue={
                          editing && 'department' in editing ? editing.department : 'Sprzedaż D2D'
                        }
                      >
                        <option>Sprzedaż D2D</option>
                        <option>Audyt i Projekty</option>
                        <option>Ekipy Monterskie</option>
                        <option>Dotacje i OSD</option>
                        <option>Zarząd i Operacje</option>
                      </select>
                    </label>
                    <label>
                      Region operacyjny
                      <input
                        name="region"
                        required
                        defaultValue={editing && 'region' in editing ? editing.region : 'Mazowieckie'}
                      />
                    </label>
                    <label>
                      Obciążenie pracą (%)
                      <input
                        name="workload"
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={editing && 'workload' in editing ? editing.workload : 70}
                      />
                    </label>
                  </div>
                ) : modal === 'Wydarzenie' ? (
                  <>
                    <div className="form-grid">
                      <label>
                        Typ wyjazdu w grafiku
                        <select
                          name="eventType"
                          defaultValue={
                            editing && 'eventType' in editing && editing.eventType
                              ? editing.eventType
                              : 'Montaż'
                          }
                        >
                          <option value="Montaż">Montaż PV / Magazynu</option>
                          <option value="Audyt">Audyt techniczny u klienta</option>
                          <option value="Odbiór OSD">Odbiór OSD / Licznik</option>
                        </select>
                      </label>
                      <label>
                        Powiązany inwestor
                        <select
                          name="client"
                          defaultValue={
                            editing && 'client' in editing && editing.client
                              ? editing.client
                              : clients[0]?.name
                          }
                        >
                          {clients.map(c => (
                            <option key={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Data wyjazdu <span>*</span>
                        <input
                          required
                          name="deadline"
                          type="date"
                          defaultValue={
                            editing && 'date' in editing && editing.date
                              ? editing.date
                              : new Date().toISOString().slice(0, 10)
                          }
                        />
                      </label>
                    </div>
                    {editing &&
                      'date' in editing &&
                      projects.some(
                        p => p.id === editing.installationId || p.client === editing.client
                      ) && (
                        <div>
                          <Button
                            type="button"
                            onClick={() => {
                              const matched = projects.find(
                                p => p.id === editing.installationId || p.client === editing.client
                              );
                              if (matched) {
                                setModal(null);
                                setDetail(matched);
                                setPage('Realizacje OZE');
                              }
                            }}
                          >
                            Otwórz powiązaną realizację OZE <Icon name="arrow" size={14} />
                          </Button>
                        </div>
                      )}
                  </>
                ) : (
                  <>
                    {/* Built-in OZE Power & Battery Calculator for Salesmen and Managers */}
                    {(modal === 'Zadanie' || modal === 'Realizacja') && (
                      <div className="form-grid">
                        <label>
                          Kalkulator: Rachunek za prąd (PLN/mies.)
                          <input
                            type="number"
                            value={billPln}
                            onChange={e => recalculateFromBill(Number(e.target.value) || 0)}
                          />
                        </label>
                        <label>
                          Dobrana moc PV (kWp) + Magazyn (kWh)
                          <input
                            readOnly
                            value={`${calcKwp} kWp + ${calcKwh} kWh (~${(
                              Math.round((calcKwp * 3800 + calcKwh * 2100) / 100) * 100
                            ).toLocaleString('pl-PL')} PLN)`}
                          />
                        </label>
                      </div>
                    )}

                    {modal === 'Realizacja' ? (
                      <div className="form-grid">
                        <label>
                          Inwestor / Klient <span>*</span>
                          <select
                            name="client"
                            defaultValue={
                              editing && 'client' in editing
                                ? editing.client
                                : clientDetail?.name || roleScopedClients[0]?.name
                            }
                          >
                            {clients.map(c => (
                              <option key={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Typ systemu OZE
                          <select
                            name="systemType"
                            defaultValue={
                              editing && 'systemType' in editing ? editing.systemType : 'PV + Magazyn energii'
                            }
                          >
                            <option>PV + Magazyn energii</option>
                            <option>Dom pasywny + Pompa + PV</option>
                            <option>Dom energooszczędny + PV</option>
                            <option>Fotowoltaika B2B + BESS</option>
                            <option>Magazyn energii (Rozbudowa)</option>
                          </select>
                        </label>
                        <label>
                          Moc instalacji PV (kWp)
                          <input
                            name="powerKwp"
                            type="number"
                            step="0.1"
                            value={calcKwp}
                            onChange={e => setCalcKwp(Number(e.target.value))}
                          />
                        </label>
                        <label>
                          Pojemność magazynu (kWh)
                          <input
                            name="batteryKwh"
                            type="number"
                            step="1"
                            value={calcKwh}
                            onChange={e => setCalcKwh(Number(e.target.value))}
                          />
                        </label>
                        <label>
                          Operator sieci (OSD)
                          <select
                            name="osdOperator"
                            defaultValue={editing && 'osdOperator' in editing ? editing.osdOperator : 'PGE'}
                          >
                            {osdOperators.map(osd => (
                              <option key={osd}>{osd}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Program dotacji
                          <select
                            name="subsidyProgram"
                            defaultValue={
                              editing && 'subsidyProgram' in editing
                                ? editing.subsidyProgram
                                : settings.defaultSubsidy
                            }
                          >
                            {subsidyPrograms.map(prog => (
                              <option key={prog}>{prog}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Poszycie dachu / Konstrukcja
                          <select
                            name="roofType"
                            defaultValue={
                              editing && 'roofType' in editing ? editing.roofType : 'Dachówka ceramiczna'
                            }
                          >
                            {roofTypes.map(r => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Brygada monterska
                          <select
                            name="installTeam"
                            defaultValue={
                              editing && 'installTeam' in editing ? editing.installTeam : 'Ekipa Mazowsze-1'
                            }
                          >
                            <option>Ekipa Mazowsze-1</option>
                            <option>Ekipa Małopolska-2</option>
                            <option>Ekipa Wielkopolska-1</option>
                            <option>Ekipa Śląsk-3</option>
                            <option>Ekipa Pomorze-1</option>
                          </select>
                        </label>
                        <label>
                          Województwo
                          <select
                            name="voivodeship"
                            defaultValue={
                              editing && 'voivodeship' in editing ? editing.voivodeship : 'Mazowieckie'
                            }
                          >
                            {polishVoivodeships.map(v => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Wartość umowy brutto (PLN)
                          <input
                            name="contractValue"
                            defaultValue={
                              editing && 'contractValue' in editing
                                ? editing.contractValue
                                : `${(
                                    Math.round((calcKwp * 3800 + calcKwh * 2100) / 100) * 100
                                  ).toLocaleString('pl-PL')} PLN`
                            }
                          />
                        </label>
                      </div>
                    ) : (
                      modal === 'Zadanie' && (
                        <div className="form-grid">
                          <label>
                            Inwestor / Klient docelowy <span>*</span>
                            <select
                              name="project"
                              defaultValue={
                                editing && 'project' in editing
                                  ? editing.project
                                  : clientDetail?.name || roleScopedClients[0]?.name || clients[0]?.name
                              }
                            >
                              {clients.map(c => (
                                <option key={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Źródło pozyskania leada
                            <select
                              name="leadSource"
                              defaultValue={
                                editing && 'leadSource' in editing ? editing.leadSource : 'Kalkulator WWW'
                              }
                            >
                              <option>Kalkulator WWW</option>
                              <option>Doradca D2D</option>
                              <option>Call Center</option>
                              <option>Polecenie klienta</option>
                              <option>Lead Facebook OZE</option>
                            </select>
                          </label>
                        </div>
                      )
                    )}

                    <div className="form-grid">
                      <label>
                        {modal === 'Realizacja' ? 'Koordynator / Doradca' : 'Handlowiec prowadzący'}
                        <select
                          name="manager"
                          defaultValue={
                            editing
                              ? 'manager' in editing
                                ? editing.manager
                                : 'assignee' in editing
                                  ? editing.assignee
                                  : currentUser.name
                              : currentUser.name
                          }
                        >
                          {users.map(x => (
                            <option key={x.name}>{x.name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Priorytet
                        <select
                          name="priority"
                          defaultValue={editing && 'priority' in editing ? editing.priority : 'Wysoki'}
                        >
                          {priorityLevels.map(s => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Etap w lejku
                        <select
                          name="status"
                          defaultValue={editing && 'status' in editing ? editing.status : undefined}
                        >
                          {(modal === 'Realizacja' ? projectStatuses : taskStatuses).map(s => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Planowany termin <span>*</span>
                        <input
                          required
                          name="deadline"
                          type={modal === 'Zadanie' && editing ? 'text' : 'date'}
                          defaultValue={
                            editing && 'due' in editing
                              ? editing.due
                              : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
                                  .toISOString()
                                  .slice(0, 10)
                          }
                        />
                      </label>
                    </div>

                    <label>
                      Uwagi techniczne (typ dachu, falownik, licznik OSD — zapis w SQLite)
                      <textarea
                        name="description"
                        rows={2}
                        defaultValue={editing && 'notes' in editing ? editing.notes : ''}
                        placeholder="Np. Dachówka ceramiczna, kąt 35°, falownik hybrydowy 10kW + moduł EPS..."
                      />
                    </label>
                  </>
                )}
              </div>

              <div className="modal-footer">
                {editing &&
                  editing.id !== undefined &&
                  (modal === 'Realizacja' ||
                    modal === 'Zadanie' ||
                    modal === 'Klient' ||
                    modal === 'Pracownik' ||
                    modal === 'Wydarzenie') && (
                    <Button type="button" onClick={handleDeleteRecord}>
                      Usuń z SQL
                    </Button>
                  )}
                <Button type="button" onClick={() => setModal(null)}>
                  Anuluj
                </Button>
                <Button type="submit" variant="primary">
                  {editing && editing.id !== undefined ? 'Zapisz zmiany w SQL' : 'Zapisz w bazie SQL'}
                </Button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}

      {/* Toast feedback bar */}
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {toast}
          <button onClick={() => setToast('')} aria-label="Zamknij powiadomienie">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// Reusable page heading component
function PageHeading({
  title,
  subtitle,
  button,
  onClick,
}: {
  title: string;
  subtitle: string;
  button?: string;
  onClick?: () => void;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {button && (
        <Button variant="primary" onClick={onClick}>
          <Icon name={button.startsWith('Wszyscy') || button.startsWith('Raport') ? 'arrow' : 'plus'} size={16} />
          {button}
        </Button>
      )}
    </div>
  );
}
