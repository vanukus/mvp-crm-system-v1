import type { ButtonHTMLAttributes, ReactNode } from 'react';

// Reusable SVG icons component
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/>,
    check: <><rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 3 3 5-6"/></>,
    people: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/></>,
    chart: <><path d="M4 3v18h17M9 16v-5m5 5V6m5 10v-8"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    bell: <><path d="M5 16h14l-2-4V8a5 5 0 0 0-10 0v4Zm5 4h4"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    down: <path d="m7 10 5 5 5-5"/>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    alert: <><path d="m12 3 10 18H2Zm0 6v5m0 3v1"/></>,
    trend: <path d="m3 16 6-6 4 4 8-9m-6 0h6v6"/>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    filter: <><path d="M4 7h16M7 12h10m-7 5h4"/><circle cx="9" cy="7" r="2" fill="currentColor"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3v2m-1 3v.5"/></>,
    logout: <path d="M9 4H4v16h5m0-8h12m-4-4 4 4-4 4"/>,
    list: <path d="M8 6h13M8 12h13M8 18h13M3 6h1m-1 6h1m-1 6h1"/>,
    flag: <path d="M5 21V4c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.grid}
    </svg>
  );
}

// Button component with variants
export function Button({ children, variant = '', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) {
  return <button className={`btn ${variant} ${className}`} {...props}>{children}</button>;
}

// User avatar with initials
export function Avatar({ name, color = 'blue', small = false }: { name: string; color?: string; small?: boolean }) {
  const initials = name.split(' ').map(x => x[0]).slice(0, 2).join('');
  return <span className={`avatar ${color} ${small ? 'small' : ''}`}>{initials}</span>;
}

// Normalized status badge with color mapping for OZE funnel stages and priorities
export function Badge({ children }: { children: string }) {
  const normalizedKey = children.toLowerCase().trim();
  const classKey = normalizedKey
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Map Polish OZE funnel stages, subsidy statuses, and priorities to existing CSS classes
  const statusMap: Record<string, string> = {
    // OZE installation stages
    'audyt-i-projekt': 'planning planowanie',
    'kompletacja-sprzetu': 'on-hold wstrzymany',
    'montaz-w-toku': 'in-progress w-trakcie',
    'zgloszenie-osd-dotacja': 'in-review do-weryfikacji',
    'odebrane': 'completed ukonczony',

    // Sales & Lead funnel stages
    'nowy-lead': 'planning planowanie',
    'audyt-w-toku': 'in-progress w-trakcie',
    'oferta-weryfikacja': 'in-review do-weryfikacji',
    'zrealizowane': 'done zrobione',

    // Subsidy & OSD statuses
    'w-przygotowaniu': 'on-hold wstrzymany',
    'zlozony-w-nfosigw': 'in-progress w-trakcie',
    'weryfikacja-osd': 'in-review do-weryfikacji',
    'wyplacono': 'completed ukonczony',

    // Generic & client statuses
    'w-trakcie': 'in-progress w-trakcie',
    'w-realizacji': 'in-progress w-trakcie',
    'do-weryfikacji': 'in-review do-weryfikacji',
    'planowanie': 'planning planowanie',
    'wstrzymany': 'on-hold wstrzymany',
    'sredni': 'medium sredni',
    'ukonczony': 'completed ukonczony',
    'zakonczony': 'completed ukonczony',
    'zrobione': 'done zrobione',
    'aktywny': 'active aktywny',
    'nieaktywny': 'high nieaktywny',
    'niski': 'low niski',
    'wysoki': 'high wysoki',
    'pilny': 'urgent pilny',
  };

  const badgeClass = statusMap[classKey] || classKey;
  return <span className={`badge ${badgeClass}`}><i />{children}</span>;
}

// Progress bar
export function Progress({ value }: { value: number }) {
  return (
    <div className="progress-wrap">
      <div className="progress">
        <span style={{ width: `${value}%` }} />
      </div>
      <span>{value}%</span>
    </div>
  );
}

// Section card layout container
export function Section({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
