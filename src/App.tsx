import { useEffect, useState } from 'react';
import {
  initialProjects,
  initialTasks,
  initialClients,
  employees as initialEmployees,
  initialActivities,
  type Project,
  type Task,
  type ClientRecord,
  type Employee,
  type ActivityLog,
  type SystemRole,
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

// Polish labels for RBAC roles
const roleLabels: Record<SystemRole, string> = {
  admin: 'Admin (Dyrektor)',
  manager: 'Manager (Koordynator)',
  salesman: 'Salesman (Handlowiec)',
};

export default function App() {
  // Active navigation and core SQLite-backed database state
  const [page, setPage] = useState('Przegląd');
  const [users, setUsers] = useState<Employee[]>(initialEmployees);
  const [currentUserId, setCurrentUserId] = useState<number>(1); // Default: Aleksander Morawski (Admin)
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [clients, setClients] = useState<ClientRecord[]>(initialClients);
  const [activities, setActivities] = useState<ActivityLog[]>(initialActivities);
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
  const [editing, setEditing] = useState<Project | Task | null>(null);
  const [billPln, setBillPln] = useState<number>(450);
  const [calcKwp, setCalcKwp] = useState<number>(9.8);
  const [calcKwh, setCalcKwh] = useState<number>(10);

  // Drill-down detail views state
  const [detail, setDetail] = useState<Project | null>(null);
  const [clientDetail, setClientDetail] = useState<ClientRecord | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [tab, setTab] = useState('Przegląd');

  // Dropdown menus, toast alerts and calendar state
  const [menu, setMenu] = useState('');
  const [toast, setToast] = useState('');
  const [sort, setSort] = useState(false);
  const [month, setMonth] = useState(9); // October (0-indexed)
  const [week, setWeek] = useState(false);
  const [events, setEvents] = useState<{ name: string; date: string }[]>([]);

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
    setDbEngine(`${snap.meta.engine} · ${snap.meta.file}`);
  };

  // Bootstrap all tables from SQLite on initial mount
  useEffect(() => {
    DataLayer.bootstrap().then(applySnapshot);
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
  const open = (type: string, record?: Project | Task) => {
    setEditing(record || null);
    if (record && 'powerKwp' in record) {
      setCalcKwp(record.powerKwp);
      setCalcKwh(record.batteryKwh);
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

  // Dynamic OZE totals calculated from role-scoped installations
  const totalPowerKwp = roleScopedProjects.reduce((sum, p) => sum + p.powerKwp, 0).toFixed(1);
  const totalBatteryKwh = roleScopedProjects.reduce((sum, p) => sum + p.batteryKwh, 0);

  // Filter OZE installations by search, stage, priority, coordinator, and OSD grid operator
  const visibleProjects = roleScopedProjects
    .filter(p => {
      const matchSearch = `${p.name} ${p.client} ${p.manager} ${p.systemType} ${p.voivodeship} ${p.osdOperator}`
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
    const matchSearch = `${t.name} ${t.project} ${t.assignee} ${t.leadSource || ''}`
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
    const snap = await DataLayer.saveInstallation(updated, currentUser.name);
    applySnapshot(snap);
    if (detail?.id === id) setDetail(updated);
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
          'Umowa podpisana! Automatycznie utworzono obiekt w Realizacje OZE oraz wniosek w Dotacje i OSD.'
        );
      } else {
        notify(`Zaktualizowano status leada: ${status}`);
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
    const snap = await DataLayer.saveInstallation(updated, currentUser.name);
    applySnapshot(snap);
    if (detail?.id === id) {
      setDetail(updated);
    }
    notify(`Zapisano w SQLite — status dotacji/OSD: ${subsidyStatus}`);
  };

  // Calculate recommended PV kWp and Battery kWh from monthly electricity bill in PLN
  const recalculateFromBill = (monthlyPln: number) => {
    setBillPln(monthlyPln);
    const annualKwh = (monthlyPln * 12) / 1.15;
    const recommendedKwp = Math.max(3.5, Math.round((annualKwh / 1000) * 1.15 * 10) / 10);
    const recommendedBattery = recommendedKwp <= 6 ? 10 : recommendedKwp <= 12 ? 15 : 20;
    setCalcKwp(recommendedKwp);
    setCalcKwh(recommendedBattery);
    notify(
      `Kalkulator OZE: Dla rachunku ${monthlyPln} PLN/mies. dobrano ${recommendedKwp} kWp PV + ${recommendedBattery} kWh magazynu.`
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
            onClick={() => {
              const link = document.createElement('a');
              link.href = '/sm-project-source.zip';
              link.download = 'sm-project-source.zip';
              document.body.appendChild(link);
              link.click();
              link.remove();
            }}
          >
            <Icon name="folder" size={16} />
            <span>Pobierz pliki źródłowe</span>
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
            onClick={() => notify('Wsparcie techniczne OZE CRM: serwis@sm-oze.pl · tel. +48 22 100 20 30')}
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

            <div className="global-search">
              <Icon name="search" size={16} />
              <input
                aria-label="Wyszukiwanie globalne"
                placeholder="Szukaj klienta, instalacji, kWp, OSD..."
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  if (page === 'Przegląd') setPage('Realizacje OZE');
                }}
              />
              <kbd>⌘ K</kbd>
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
                    Powiadomienia ({currentRole.toUpperCase()}){' '}
                    <span className="badge in-progress">3 nowe</span>
                  </h3>
                  <p>PGE Dystrybucja potwierdziła wymianę licznika dwukierunkowego (Pruszków).</p>
                  <p>Wniosek Mój Prąd 6.0 dla klienta T. Mazur przeszedł weryfikację.</p>
                  <p>Nowy lead z kalkulatora WWW czeka na telefon doradcy.</p>
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
                        : 'Pełny widok zarządczy firmy (300 pracowników): sprzedaż, realizacje OZE, dotacje i baza SQLite.'}
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
                    '+18.4 kWp',
                    'w tym miesiącu',
                    'blue',
                  ],
                  [
                    currentRole === 'salesman' ? 'Twoje magazyny energii' : 'Magazyny energii (BESS)',
                    `${totalBatteryKwh} kWh`,
                    'folder',
                    '+35 kWh',
                    'w tym miesiącu',
                    'purple',
                  ],
                  [
                    currentRole === 'salesman' ? 'Aktywne leady handlowe' : 'Wnioski Dotacje / OSD',
                    currentRole === 'salesman'
                      ? `${roleScopedTasks.length} szans`
                      : `${roleScopedProjects.filter(p => p.subsidyStatus !== 'Wypłacono').length} w toku`,
                    'clock',
                    '94%',
                    'skuteczności konwersji',
                    'orange',
                  ],
                  [
                    currentRole === 'salesman' ? 'Twoi inwestorzy' : 'Baza inwestorów (SQL)',
                    `${roleScopedClients.length} klientów`,
                    'people',
                    '+4',
                    'nowe umowy w tym tyg.',
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
                  subtitle="Udział linii produktowych w widocznym portfelu zamówień"
                  action={
                    <select aria-label="Okres raportowania">
                      <option>Październik 2024</option>
                      <option>Q4 2024</option>
                    </select>
                  }
                >
                  <div className="project-overview">
                    <div className="donut">
                      <div>
                        <strong>{roleScopedProjects.length}</strong>
                        <span>Obiektów OZE</span>
                      </div>
                    </div>
                    <div className="chart-legend">
                      {[
                        ['PV + Magazyn energii', '44%', 'blue'],
                        ['Domy pasywne + Pompy', '22%', 'purple'],
                        ['Instalacje B2B + BESS', '18%', 'orange'],
                        ['Rozbudowa magazynów', '16%', 'green'],
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
                      Podpisanie umowy na leadzie automatycznie tworzy realizację OZE
                    </span>
                    <button onClick={() => navigate('Leady i Sprzedaż')}>
                      Otwórz lejek <Icon name="arrow" size={14} />
                    </button>
                  </div>
                </Section>

                <Section
                  title="Najbliższe montaże i audyty"
                  subtitle="Harmonogram wyjazdów ekip i terminów przyłączeń"
                  action={
                    <button className="text-button" onClick={() => navigate('Grafik Montaży')}>
                      Grafik <Icon name="arrow" size={14} />
                    </button>
                  }
                >
                  <div className="deadline-list">
                    {[
                      ['28', 'PAŹ', 'Odbiór B2B 49.5 kWp + zgłoszenie Enea', 'Agro-Pol Sp. z o.o.', 'za 4 dni', 'orange'],
                      ['30', 'PAŹ', 'Montaż falownika + magazyn 10 kWh', 'Marek Kowalski (Dom 160m²)', 'za 6 dni', 'blue'],
                      ['05', 'LIS', 'Dostawa pompy ciepła i modułów PV', 'Krystyna Wójcik — Katowice', 'za 12 dni', 'purple'],
                    ].map(([day, mon, title, client, left, color]) => (
                      <button
                        className="deadline-row"
                        key={title}
                        onClick={() => {
                          const matched = projects.find(p => p.client === client);
                          if (matched) {
                            setDetail(matched);
                            setPage('Realizacje OZE');
                          }
                        }}
                      >
                        <div className={`date-block ${color}`}>
                          <small>{mon}</small>
                          <strong>{day}</strong>
                        </div>
                        <div>
                          <strong>{title}</strong>
                          <span>{client}</span>
                        </div>
                        <span className="days-left">{left}</span>
                        <Icon name="down" size={14} />
                      </button>
                    ))}
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
                  SM-OZE Polska · Aktywny użytkownik: {currentUser.name} ({roleLabels[currentRole]})
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
                      <h3>Zakres inwestycji</h3>
                      <p>
                        Kompleksowa realizacja systemu <strong>{detail.systemType}</strong> dla inwestora{' '}
                        <strong>{detail.client}</strong> w województwie {detail.voivodeship.toLowerCase()}. Instalacja
                        obejmuje dobór falownika hybrydowego, magazynu energii {detail.batteryKwh} kWh z funkcją
                        zasilania awaryjnego (EPS/Backup) oraz pełną obsługę przyłączeniową w sieci{' '}
                        <strong>{detail.osdOperator}</strong>.
                      </p>
                      <h3>Etapy procesu wdrożeniowego</h3>
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
                <div className="employee-grid">
                  {users.slice(0, 3).map(e => (
                    <div className="panel employee-card" key={e.name}>
                      <Avatar name={e.name} color={e.color} />
                      <h3>{e.name}</h3>
                      <p>{e.role}</p>
                      <Badge>{e.systemRole.toUpperCase()}</Badge>
                    </div>
                  ))}
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
                  <div className="detail-stats">
                    <div>
                      <small>Osoba kontaktowa</small>
                      <strong>{clientDetail.contact}</strong>
                    </div>
                    <div>
                      <small>Telefon / E-mail</small>
                      <strong>{clientDetail.phone}</strong>
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
                      <small>Status klienta</small>
                      <Badge>{clientDetail.status}</Badge>
                    </div>
                  </div>
                  <Section title="Instalacje OZE przypisane do klienta">
                    {projectTable(projects.filter(p => p.client === clientDetail.name), true)}
                  </Section>
                  <Section title="Historia kontaktów, umów i dokumentów">
                    <div className="prose">
                      <p>
                        <strong>24 października</strong> — Przekazano komplet dokumentów przyłączeniowych do operatora{' '}
                        {clientDetail.osd} dla {clientDetail.contact}.
                      </p>
                      <p>
                        <strong>18 października</strong> — Zatwierdzono dobór magazynu energii oraz harmonogram dostawy
                        komponentów na obiekt ({clientDetail.address}).
                      </p>
                      <p>
                        <strong>01 października</strong> — Przeprowadzono wizję lokalną (audyt dachu i rozdzielnicy) oraz
                        podpisano umowę przez Autenti.
                      </p>
                    </div>
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
                          <th>Status</th>
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
                                <Badge>{c.status}</Badge>
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
                button={employee ? 'Wszyscy pracownicy' : 'Raport obłożenia ekip'}
                onClick={() => (employee ? setEmployee(null) : navigate('Raporty OZE'))}
              />
              {employee ? (
                <>
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
                              currentUser.name
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
              {/* Installation & Technical Audit Calendar */}
              <PageHeading
                title="Grafik Montaży, Audytów i Odbiorów"
                subtitle="Planowanie wyjazdów ekip instalacyjnych, dostaw sprzętu i wizji lokalnych."
                button="Zaplanuj wyjazd / montaż"
                onClick={() => open('Wydarzenie')}
              />
              <div className="toolbar">
                <div className="calendar-controls">
                  <Button onClick={() => setMonth(month - 1)}>‹</Button>
                  <h2>
                    {new Date(2024, month)
                      .toLocaleString('pl-PL', { month: 'long', year: 'numeric' })
                      .replace(/^./, str => str.toUpperCase())}
                  </h2>
                  <Button onClick={() => setMonth(month + 1)}>›</Button>
                  <Button onClick={() => setMonth(9)}>Dzisiaj</Button>
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
                  {Array.from({ length: week ? 7 : 35 }, (_, i) => {
                    const day = week ? i + 21 : i;
                    return (
                      <div className={`calendar-cell ${day === 24 && month === 9 ? 'today-cell' : ''}`} key={i}>
                        <span className={day < 1 || day > 31 ? 'muted' : ''}>
                          {day < 1 ? 30 : day > 31 ? day - 31 : day}
                        </span>
                        {[3, 8, 15, 21, 24, 28, 30].includes(day) && (
                          <button
                            className={`calendar-event ${day % 2 ? 'blue' : 'purple'}`}
                            onClick={() => {
                              if (day === 28) {
                                setPage('Realizacje OZE');
                                setDetail(projects[2]);
                              } else {
                                notify('Wyjazd ekipy Mazowsze-1 · Montaż PV 9.8 kWp + Magazyn 10 kWh');
                              }
                            }}
                          >
                            {day === 28
                              ? 'Odbiór B2B 49.5 kWp (Enea)'
                              : day === 30
                                ? 'Montaż BESS 10 kWh Pruszków'
                                : '08:00 Audyt i montaż PV'}
                          </button>
                        )}
                        {events
                          .filter(ev => {
                            const d = new Date(ev.date + 'T12:00:00');
                            return d.getDate() === day && d.getMonth() === (((month % 12) + 12) % 12);
                          })
                          .map((ev, j) => (
                            <button
                              key={j}
                              className="calendar-event teal"
                              onClick={() => notify(`${ev.name} · ${ev.date}`)}
                            >
                              {ev.name}
                            </button>
                          ))}
                      </div>
                    );
                  })}
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
                    'Instalacja,Klient,Typ_Systemu,Moc_kWp,Magazyn_kWh,Operator_OSD,Dotacja,Status_Dotacji,Etap,Postep\n' +
                    projects
                      .map(
                        p =>
                          `"${p.name}","${p.client}","${p.systemType}","${p.powerKwp}","${p.batteryKwh}","${p.osdOperator}","${p.subsidyProgram}","${p.subsidyStatus}","${p.status}","${p.progress}%"`
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
                  ['Konwersja Audyt ➔ Umowa', '64%', '+8% w tym miesiącu'],
                  ['Udział PV z magazynem BESS', '83%', 'Dzięki dotacji Mój Prąd 6.0'],
                  ['Średni czas przyłączenia OSD', '19 dni', 'O 4 dni szybciej niż w Q3'],
                  ['Wykorzystanie ekip monterskich', '81%', '18 brygad aktywnych w terenie'],
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
                  title="Zainstalowana moc PV + Magazyny energii (ostatnie 6 mies.)"
                  subtitle="Dynamika wdrożeń fotowoltaiki (niebieski) do reklamacji/korekt OSD (pomarańczowy)"
                >
                  <div className="bar-chart">
                    {[52, 68, 64, 84, 79, 94].map((n, i) => (
                      <div className="bar-group" key={i}>
                        <div className="bars">
                          <i style={{ height: `${n}%` }} />
                          <i style={{ height: `${22 - i * 3}%` }} />
                        </div>
                        <span>{['Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź'][i]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="calendar-key">
                    <span>
                      <i className="legend-dot blue" />
                      Odebrane instalacje OZE
                    </span>
                    <span>
                      <i className="legend-dot orange" />
                      Oczekujące na uzupełnienie OSD
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
                        value={Math.round((projects.filter(p => p.status === s).length / projects.length) * 100)}
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
                    <strong>{events.length + 7} terminów</strong>
                  </div>
                  <div>
                    <small>Tabela: activity_logs</small>
                    <strong>{activities.length} wpisów audytu</strong>
                  </div>
                </div>
              </Section>

              <Section
                title="Konfiguracja organizacji (Polska)"
                subtitle="Dane rejestrowe do automatycznego generowania umów i pełnomocnictw OSD"
              >
                <form
                  className="settings-form"
                  onSubmit={e => {
                    e.preventDefault();
                    notify('Ustawienia systemu SM-OZE Polska zostały zapisane.');
                  }}
                >
                  <label>
                    Nazwa spółki / organizacji OZE
                    <input defaultValue="SM-OZE Polska Sp. z o.o. (300 użytkowników)" required />
                  </label>
                  <label>
                    Główny administrator / Dyrektor Operacyjny
                    <input defaultValue="Aleksander Morawski" required />
                  </label>
                  <label>
                    E-mail biura obsługi dotacji i OSD
                    <input defaultValue="dotacje@sm-oze.pl" type="email" required />
                  </label>
                  <label>
                    Domyślny program dotacji dla instalacji hybrydowych B2C
                    <select defaultValue="Mój Prąd 6.0">
                      <option>Mój Prąd 6.0</option>
                      <option>Czyste Powietrze</option>
                      <option>Ciepłe Mieszkanie</option>
                    </select>
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" defaultChecked />
                    Automatycznie twórz realizację montażową i wniosek OSD po podpisaniu umowy przez Handlowca
                  </label>
                  <Button variant="primary" type="submit">
                    Zapisz konfigurację
                  </Button>
                </form>
              </Section>
            </>
          )}
        </main>
      </div>

      {/* Modal dialog for creating and editing OZE installations, leads (with OZE calculator), clients, and schedule items */}
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
                  {editing ? 'Edytuj w bazie SQLite:' : 'Dodaj do bazy SQLite:'} {modal}
                </h2>
                <p>
                  {modal === 'Zadanie'
                    ? 'Wprowadź dane leada i skorzystaj z szybkiego kalkulatora doboru mocy OZE.'
                    : 'Nowy rekord zostanie natychmiast zapisany w bazie database/oze_crm.sqlite.'}
                </p>
              </div>
              <button className="icon-button" aria-label="Zamknij okno" onClick={() => setModal(null)}>
                <Icon name="close" />
              </button>
            </div>
            <form
              onSubmit={async e => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const name = String(form.get('name')).trim();
                if (!name) return;

                if (modal === 'Realizacja') {
                  const existingProj = editing && 'powerKwp' in editing ? editing : null;
                  const p: Project = {
                    id: editing?.id || Date.now(),
                    name,
                    client: String(form.get('client')),
                    manager: String(form.get('manager')),
                    status: String(form.get('status')),
                    priority: String(form.get('priority')),
                    start: existingProj ? existingProj.start : '24 paź 2024',
                    deadline: new Date(String(form.get('deadline')) + 'T12:00:00').toLocaleDateString('pl-PL', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    }),
                    progress: existingProj ? existingProj.progress : 15,
                    color: existingProj ? existingProj.color : 'blue',
                    initials: name.slice(0, 2).toUpperCase(),
                    systemType: String(form.get('systemType') || 'PV + Magazyn energii'),
                    powerKwp: Number(form.get('powerKwp') || calcKwp),
                    batteryKwh: Number(form.get('batteryKwh') || calcKwh),
                    osdOperator: (form.get('osdOperator') as Project['osdOperator']) || 'PGE',
                    subsidyProgram: (form.get('subsidyProgram') as Project['subsidyProgram']) || 'Mój Prąd 6.0',
                    subsidyStatus: existingProj ? existingProj.subsidyStatus : 'W przygotowaniu',
                    roofType: existingProj ? existingProj.roofType : 'Dachówka ceramiczna',
                    contractValue: String(
                      form.get('contractValue') ||
                        `${Math.round((calcKwp * 3800 + calcKwh * 2100) / 100) * 100} PLN`
                    ),
                    installTeam: existingProj ? existingProj.installTeam : 'Ekipa Mazowsze-1',
                    voivodeship: existingProj ? existingProj.voivodeship : 'Mazowieckie',
                  };
                  const snap = await DataLayer.saveInstallation(p, currentUser.name);
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
                    leadSource: 'Kalkulator OZE / CRM',
                    estimatedPower: `${calcKwp} kWp + ${calcKwh} kWh`,
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
                  const newClient: ClientRecord = {
                    id: Date.now(),
                    name,
                    contact: String(form.get('contact')),
                    email: String(form.get('email')),
                    phone: String(form.get('phone')),
                    projects: 0,
                    status: 'Aktywny',
                    color: 'blue',
                    address: String(form.get('address') || 'ul. Słoneczna 1, Warszawa'),
                    voivodeship: 'Mazowieckie',
                    osd: 'PGE',
                    financing: 'Dotacja + Gotówka',
                    ownerName: currentUser.name,
                  };
                  const snap = await DataLayer.saveClient(newClient, currentUser.name);
                  applySnapshot(snap);
                } else {
                  const snap = await DataLayer.saveEvent({ name, date: String(form.get('deadline')) });
                  applySnapshot(snap);
                }
                setModal(null);
                notify(`Zapisano w bazie SQLite: ${name}`);
              }}
            >
              <div className="form-fields">
                <label>
                  {modal === 'Klient'
                    ? 'Inwestor (Imię i nazwisko lub nazwa firmy)'
                    : modal === 'Realizacja'
                      ? 'Nazwa inwestycji OZE (np. PV 10 kWp + Magazyn — Miasto)'
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
                    <label>
                      Osoba decyzyjna / kontaktowa <span>*</span>
                      <input name="contact" required placeholder="Imię i nazwisko" />
                    </label>
                    <label>
                      Adres montażu inwestycji <span>*</span>
                      <input name="address" required placeholder="ul. Przykładowa 10, 00-000 Miasto" />
                    </label>
                    <div className="form-grid">
                      <label>
                        Adres e-mail <span>*</span>
                        <input name="email" required type="email" placeholder="klient@domena.pl" />
                      </label>
                      <label>
                        Telefon kontaktowy <span>*</span>
                        <input name="phone" required placeholder="+48 500 000 000" />
                      </label>
                    </div>
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
                      <>
                        <div className="form-grid">
                          <label>
                            Inwestor / Klient <span>*</span>
                            <select
                              name="client"
                              defaultValue={
                                editing && 'client' in editing ? editing.client : roleScopedClients[0]?.name
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
                                editing && 'subsidyProgram' in editing ? editing.subsidyProgram : 'Mój Prąd 6.0'
                              }
                            >
                              {subsidyPrograms.map(prog => (
                                <option key={prog}>{prog}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </>
                    ) : (
                      modal === 'Zadanie' && (
                        <label>
                          Inwestor / Klient docelowy <span>*</span>
                          <select
                            name="project"
                            defaultValue={
                              editing && 'project' in editing
                                ? editing.project
                                : roleScopedClients[0]?.name || clients[0]?.name
                            }
                          >
                            {clients.map(c => (
                              <option key={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </label>
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
                                : editing.assignee
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
                        <select name="priority" defaultValue={editing?.priority || 'Wysoki'}>
                          {priorityLevels.map(s => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Etap w lejku
                        <select name="status" defaultValue={editing?.status}>
                          {(modal === 'Realizacja' ? projectStatuses : taskStatuses).map(s => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Planowany termin <span>*</span>
                        <input required name="deadline" type="date" defaultValue="2024-11-15" />
                      </label>
                    </div>

                    <label>
                      Uwagi techniczne (typ dachu, falownik, licznik OSD)
                      <textarea
                        name="description"
                        rows={2}
                        placeholder="Np. Dachówka ceramiczna, kąt 35°, falownik hybrydowy 10kW + moduł EPS..."
                      />
                    </label>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <Button type="button" onClick={() => setModal(null)}>
                  Anuluj
                </Button>
                <Button type="submit" variant="primary">
                  {editing ? 'Zapisz zmiany w SQL' : 'Zapisz w bazie SQL'}
                </Button>
              </div>
            </form>
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
