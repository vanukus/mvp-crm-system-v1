// Database entity definitions for the OZE (Renewable Energy) CRM & FSM MVP
export type SystemRole = 'admin' | 'manager' | 'salesman';

export type Employee = {
  id: number;
  name: string;
  email: string;
  systemRole: SystemRole;
  role: string;
  department: string;
  workload: number;
  color: string;
  region: string;
};

export type Project = {
  id: number;
  name: string;
  client: string;
  manager: string;
  status: string;
  priority: string;
  start: string;
  deadline: string;
  progress: number;
  color: string;
  initials: string;
  // OZE domain-specific technical and financial fields
  systemType: string;
  powerKwp: number;
  batteryKwh: number;
  osdOperator: 'PGE' | 'Tauron' | 'Enea' | 'Energa';
  subsidyProgram: 'Mój Prąd 6.0' | 'Czyste Powietrze' | 'Ciepłe Mieszkanie' | 'Brak (B2B)';
  subsidyStatus: 'W przygotowaniu' | 'Złożony w NFOŚiGW' | 'Weryfikacja OSD' | 'Wypłacono';
  roofType: 'Blachodachówka' | 'Dachówka ceramiczna' | 'Grunt' | 'Dach płaski';
  contractValue: string;
  installTeam: string;
  voivodeship: string;
  notes?: string;
};

export type Task = {
  id: number;
  name: string;
  project: string;
  priority: string;
  due: string;
  status: string;
  assignee: string;
  leadSource?: string;
  estimatedPower?: string;
  notes?: string;
};

export type ClientRecord = {
  id: number;
  name: string;
  contact: string;
  email: string;
  phone: string;
  projects: number;
  status: string;
  color: string;
  address: string;
  voivodeship: string;
  osd: 'PGE' | 'Tauron' | 'Enea' | 'Energa';
  financing: string;
  ownerName?: string;
};

export type CalendarEvent = {
  id?: number;
  name: string;
  date: string;
  eventType?: 'Montaż' | 'Odbiór OSD' | 'Audyt';
  client?: string;
  installationId?: number;
};

export type ActivityLog = {
  id?: number;
  userName: string;
  action: string;
  target: string;
  timeLabel: string;
  color: string;
};

export type SystemSettings = {
  companyName: string;
  adminName: string;
  officeEmail: string;
  defaultSubsidy: Project['subsidyProgram'];
  autoConvertLead: boolean;
};

export const defaultSettings: SystemSettings = {
  companyName: 'SM-OZE Polska Sp. z o.o. (300 użytkowników)',
  adminName: 'Aleksander Morawski',
  officeEmail: 'dotacje@sm-oze.pl',
  defaultSubsidy: 'Mój Prąd 6.0',
  autoConvertLead: true,
};

// Initial OZE installations (Realizacje) across Poland
export const initialProjects: Project[] = [
  {
    id: 1,
    name: 'PV 9.8 kWp + Magazyn 10 kWh — Pruszków',
    client: 'Marek Kowalski (Dom 160m²)',
    manager: 'Dawid Kowal',
    status: 'Montaż w toku',
    priority: 'Wysoki',
    start: '01 paź 2026',
    deadline: '15 lis 2026',
    progress: 72,
    color: 'purple',
    initials: 'PV',
    systemType: 'PV + Magazyn energii',
    powerKwp: 9.8,
    batteryKwh: 10,
    osdOperator: 'PGE',
    subsidyProgram: 'Mój Prąd 6.0',
    subsidyStatus: 'W przygotowaniu',
    roofType: 'Dachówka ceramiczna',
    contractValue: '58 400 PLN',
    installTeam: 'Ekipa Mazowsze-1',
    voivodeship: 'Mazowieckie',
    notes: 'Falownik hybrydowy 10kW z modułem EPS (zasilanie awaryjne), dachówka ceramiczna kąt 35°.',
  },
  {
    id: 2,
    name: 'Dom Energooszczędny + Pompa + PV 12.4 kWp',
    client: 'Rodzina Nowak — Wieliczka',
    manager: 'Sara Wiśniewska',
    status: 'Kompletacja sprzętu',
    priority: 'Wysoki',
    start: '18 wrz 2026',
    deadline: '28 lis 2026',
    progress: 45,
    color: 'blue',
    initials: 'DE',
    systemType: 'Dom pasywny + Pompa + PV',
    powerKwp: 12.4,
    batteryKwh: 15,
    osdOperator: 'Tauron',
    subsidyProgram: 'Czyste Powietrze',
    subsidyStatus: 'Złożony w NFOŚiGW',
    roofType: 'Blachodachówka',
    contractValue: '112 000 PLN',
    installTeam: 'Ekipa Małopolska-2',
    voivodeship: 'Małopolskie',
    notes: 'Pompa ciepła powietrze-woda 9kW + bufor CWU 300L + instalacja PV na blachodachówce.',
  },
  {
    id: 3,
    name: 'Instalacja B2B 49.5 kWp + BESS 30 kWh',
    client: 'Agro-Pol Sp. z o.o.',
    manager: 'Jakub Młynarski',
    status: 'Zgłoszenie OSD / Dotacja',
    priority: 'Średni',
    start: '05 paź 2026',
    deadline: '30 paź 2026',
    progress: 90,
    color: 'orange',
    initials: 'B2',
    systemType: 'Fotowoltaika B2B + BESS',
    powerKwp: 49.5,
    batteryKwh: 30,
    osdOperator: 'Enea',
    subsidyProgram: 'Brak (B2B)',
    subsidyStatus: 'Weryfikacja OSD',
    roofType: 'Grunt',
    contractValue: '214 500 PLN',
    installTeam: 'Ekipa Wielkopolska-1',
    voivodeship: 'Wielkopolskie',
    notes: 'Konstrukcja gruntowa dwupodporowa, uzgodnienie ppoż. rzeczoznawcy zakończone.',
  },
  {
    id: 4,
    name: 'Magazyn energii 20 kWh + Falownik hybrydowy',
    client: 'Piotr Zieliński — Gdańsk',
    manager: 'Aleksander Morawski',
    status: 'Audyt i projekt',
    priority: 'Średni',
    start: '21 paź 2026',
    deadline: '10 gru 2026',
    progress: 20,
    color: 'teal',
    initials: 'ME',
    systemType: 'Magazyn energii (Rozbudowa)',
    powerKwp: 0,
    batteryKwh: 20,
    osdOperator: 'Energa',
    subsidyProgram: 'Mój Prąd 6.0',
    subsidyStatus: 'W przygotowaniu',
    roofType: 'Dach płaski',
    contractValue: '42 000 PLN',
    installTeam: 'Ekipa Pomorze-1',
    voivodeship: 'Pomorskie',
    notes: 'Rozbudowa istniejącej mikroinstalacji PV o magazyn LUNA2000 20 kWh.',
  },
  {
    id: 5,
    name: 'Termomodernizacja + PV 8.2 kWp + Magazyn',
    client: 'Krystyna Wójcik — Katowice',
    manager: 'Emilia Dąbrowska',
    status: 'Kompletacja sprzętu',
    priority: 'Niski',
    start: '02 paź 2026',
    deadline: '05 lis 2026',
    progress: 38,
    color: 'pink',
    initials: 'TM',
    systemType: 'Dom energooszczędny + PV',
    powerKwp: 8.2,
    batteryKwh: 10,
    osdOperator: 'Tauron',
    subsidyProgram: 'Czyste Powietrze',
    subsidyStatus: 'Złożony w NFOŚiGW',
    roofType: 'Blachodachówka',
    contractValue: '86 900 PLN',
    installTeam: 'Ekipa Śląsk-3',
    voivodeship: 'Śląskie',
    notes: 'Wniosek z prefinansowaniem WFOŚiGW Katowice — II próg dochodowy.',
  },
  {
    id: 6,
    name: 'PV 6.6 kWp + Magazyn energii 10 kWh',
    client: 'Tomasz Mazur — Legionowo',
    manager: 'Emilia Dąbrowska',
    status: 'Odebrane',
    priority: 'Wysoki',
    start: '10 sie 2026',
    deadline: '22 paź 2026',
    progress: 100,
    color: 'green',
    initials: 'TM',
    systemType: 'PV + Magazyn energii',
    powerKwp: 6.6,
    batteryKwh: 10,
    osdOperator: 'PGE',
    subsidyProgram: 'Mój Prąd 6.0',
    subsidyStatus: 'Wypłacono',
    roofType: 'Dachówka ceramiczna',
    contractValue: '46 500 PLN',
    installTeam: 'Ekipa Mazowsze-1',
    voivodeship: 'Mazowieckie',
    notes: 'Licznik dwukierunkowy PGE zamontowany, protokół PZO podpisany bez uwag.',
  },
];

// Initial sales funnel leads and technical tasks
export const initialTasks: Task[] = [
  {
    id: 1,
    name: 'Lead: Dom 180m² Piaseczno — dobór PV 10 kWp + Magazyn 15 kWh',
    project: 'Marek Kowalski (Dom 160m²)',
    priority: 'Wysoki',
    due: 'Dzisiaj',
    status: 'Oferta / Weryfikacja',
    assignee: 'Emilia Dąbrowska',
    leadSource: 'Kalkulator WWW',
    estimatedPower: '10.0 kWp + 15 kWh',
    notes: 'Klient zainteresowany zasilaniem awaryjnym całego domu oraz dotacją Mój Prąd 6.0.',
  },
  {
    id: 2,
    name: 'Audyt techniczny dachu + wniosek Czyste Powietrze (Wieliczka)',
    project: 'Rodzina Nowak — Wieliczka',
    priority: 'Średni',
    due: 'Dzisiaj',
    status: 'Audyt / W toku',
    assignee: 'Sara Wiśniewska',
    leadSource: 'Call Center',
    estimatedPower: '12.4 kWp + 15 kWh',
    notes: 'Wymagana weryfikacja mocy przyłączeniowej (obecnie 14 kW w Tauron).',
  },
  {
    id: 3,
    name: 'Lead B2B: Hala produkcyjna Poznań — PV 49.5 kWp + BESS 30 kWh',
    project: 'Agro-Pol Sp. z o.o.',
    priority: 'Wysoki',
    due: 'Jutro',
    status: 'Oferta / Weryfikacja',
    assignee: 'Dawid Kowal',
    leadSource: 'Doradca D2D',
    estimatedPower: '49.5 kWp + 30 kWh',
    notes: 'Oferta leasingowa Santander wysłana do zarządu.',
  },
  {
    id: 4,
    name: 'Kalkulacja rozbudowy o magazyn LUNA2000 20 kWh + e-podpis Autenti',
    project: 'Piotr Zieliński — Gdańsk',
    priority: 'Niski',
    due: '28 paź',
    status: 'Nowy lead',
    assignee: 'Aleksander Morawski',
    leadSource: 'Polecenie klienta',
    estimatedPower: '0 kWp + 20 kWh',
    notes: 'Klient posiada instalację z 2022 roku na net-billingu.',
  },
  {
    id: 5,
    name: 'Lead D2D: Termomodernizacja + Pompa ciepła + PV 8.2 kWp (Katowice)',
    project: 'Krystyna Wójcik — Katowice',
    priority: 'Pilny',
    due: 'Po terminie',
    status: 'Nowy lead',
    assignee: 'Emilia Dąbrowska',
    leadSource: 'Lead Facebook OZE',
    estimatedPower: '8.2 kWp + 10 kWh',
    notes: 'Pilny kontakt telefoniczny przed końcem naboru.',
  },
  {
    id: 6,
    name: 'Lead: Instalacja hybrydowa PV 9.8 kWp + BESS 10 kWh (Otwock)',
    project: 'Tomasz Mazur — Legionowo',
    priority: 'Wysoki',
    due: 'Dzisiaj',
    status: 'Audyt / W toku',
    assignee: 'Dawid Kowal',
    leadSource: 'Kalkulator WWW',
    estimatedPower: '9.8 kWp + 10 kWh',
    notes: 'Drugi budynek inwestora (dom dla dzieci w Otwocku).',
  },
];

// Client / Investor database records (B2C homeowners and B2B companies)
export const initialClients: ClientRecord[] = [
  {
    id: 1,
    name: 'Marek Kowalski (Dom 160m²)',
    contact: 'Marek Kowalski',
    email: 'm.kowalski@poczta.pl',
    phone: '+48 501 234 567',
    projects: 1,
    status: 'W realizacji',
    color: 'purple',
    address: 'ul. Słoneczna 14, 05-800 Pruszków',
    voivodeship: 'Mazowieckie',
    osd: 'PGE',
    financing: 'Kredyt OZE (Alior)',
    ownerName: 'Dawid Kowal',
  },
  {
    id: 2,
    name: 'Rodzina Nowak — Wieliczka',
    contact: 'Anna i Piotr Nowak',
    email: 'nowak.dom@gmail.com',
    phone: '+48 602 345 678',
    projects: 1,
    status: 'W realizacji',
    color: 'blue',
    address: 'ul. Zielona 8, 32-020 Wieliczka',
    voivodeship: 'Małopolskie',
    osd: 'Tauron',
    financing: 'Dotacja + Gotówka',
    ownerName: 'Sara Wiśniewska',
  },
  {
    id: 3,
    name: 'Agro-Pol Sp. z o.o.',
    contact: 'Zofia Kowalczyk (Prezes)',
    email: 'biuro@agro-pol.pl',
    phone: '+48 61 555 01 92',
    projects: 1,
    status: 'Aktywny',
    color: 'orange',
    address: 'ul. Przemysłowa 42, 62-020 Swarzędz',
    voivodeship: 'Wielkopolskie',
    osd: 'Enea',
    financing: 'Leasing (Santander)',
    ownerName: 'Dawid Kowal',
  },
  {
    id: 4,
    name: 'Piotr Zieliński — Gdańsk',
    contact: 'Piotr Zieliński',
    email: 'p.zielinski@orbit.pl',
    phone: '+48 58 555 01 46',
    projects: 1,
    status: 'Aktywny',
    color: 'teal',
    address: 'ul. Nadmorska 21, 80-500 Gdańsk',
    voivodeship: 'Pomorskie',
    osd: 'Energa',
    financing: 'Gotówka',
    ownerName: 'Aleksander Morawski',
  },
  {
    id: 5,
    name: 'Krystyna Wójcik — Katowice',
    contact: 'Krystyna Wójcik',
    email: 'k.wojcik@interia.pl',
    phone: '+48 32 555 01 77',
    projects: 1,
    status: 'W realizacji',
    color: 'pink',
    address: 'ul. Brzozowa 5, 40-100 Katowice',
    voivodeship: 'Śląskie',
    osd: 'Tauron',
    financing: 'Czyste Powietrze (Prefinansowanie)',
    ownerName: 'Emilia Dąbrowska',
  },
  {
    id: 6,
    name: 'Tomasz Mazur — Legionowo',
    contact: 'Tomasz Mazur',
    email: 'tomasz.mazur@wp.pl',
    phone: '+48 512 888 990',
    projects: 1,
    status: 'Zakończony',
    color: 'green',
    address: 'ul. Leśna 3, 05-120 Legionowo',
    voivodeship: 'Mazowieckie',
    osd: 'PGE',
    financing: 'Mój Prąd 6.0 + Gotówka',
    ownerName: 'Emilia Dąbrowska',
  },
];

// Company staff with explicit RBAC roles (admin, manager, salesman)
export const employees: Employee[] = [
  {
    id: 1,
    name: 'Aleksander Morawski',
    email: 'a.morawski@sm-oze.pl',
    systemRole: 'admin',
    role: 'Administrator / Dyrektor Operacyjny OZE',
    department: 'Zarząd i Operacje',
    workload: 78,
    color: 'blue',
    region: 'Cała Polska (Centrala)',
  },
  {
    id: 2,
    name: 'Sara Wiśniewska',
    email: 's.wisniewska@sm-oze.pl',
    systemRole: 'manager',
    role: 'Manager Realizacji i Audytu OZE',
    department: 'Audyt i Projekty',
    workload: 86,
    color: 'pink',
    region: 'Małopolskie / Śląskie',
  },
  {
    id: 3,
    name: 'Jakub Młynarski',
    email: 'j.mlynarski@sm-oze.pl',
    systemRole: 'manager',
    role: 'Manager Ekip Monterskich (B2B / Domy)',
    department: 'Ekipy Monterskie',
    workload: 64,
    color: 'orange',
    region: 'Wielkopolskie / Pomorskie',
  },
  {
    id: 4,
    name: 'Emilia Dąbrowska',
    email: 'e.dabrowska@sm-oze.pl',
    systemRole: 'salesman',
    role: 'Handlowiec OZE (Doradca D2D)',
    department: 'Sprzedaż D2D',
    workload: 90,
    color: 'green',
    region: 'Śląskie / Mazowieckie',
  },
  {
    id: 5,
    name: 'Dawid Kowal',
    email: 'd.kowal@sm-oze.pl',
    systemRole: 'salesman',
    role: 'Handlowiec OZE (PV + Magazyny)',
    department: 'Sprzedaż D2D',
    workload: 82,
    color: 'purple',
    region: 'Mazowieckie / Wielkopolskie',
  },
  {
    id: 6,
    name: 'Rachela Adamczyk',
    email: 'r.adamczyk@sm-oze.pl',
    systemRole: 'manager',
    role: 'Koordynator Dotacji i OSD',
    department: 'Dotacje i OSD',
    workload: 68,
    color: 'teal',
    region: 'Pomorskie',
  },
];

// Initial schedule events stored in SQLite calendar_events table
export const initialEvents: CalendarEvent[] = [
  {
    id: 1,
    name: '08:00 Audyt dachu + pomiary PV',
    date: '2026-10-03',
    eventType: 'Audyt',
    client: 'Marek Kowalski (Dom 160m²)',
    installationId: 1,
  },
  {
    id: 2,
    name: 'Odbiór OSD + montaż licznika PGE',
    date: '2026-10-08',
    eventType: 'Odbiór OSD',
    client: 'Tomasz Mazur — Legionowo',
    installationId: 6,
  },
  {
    id: 3,
    name: 'Montaż konstrukcji PV + Pompa ciepła',
    date: '2026-10-15',
    eventType: 'Montaż',
    client: 'Rodzina Nowak — Wieliczka',
    installationId: 2,
  },
  {
    id: 4,
    name: 'Audyt rozbudowy magazynu 20 kWh',
    date: '2026-10-21',
    eventType: 'Audyt',
    client: 'Piotr Zieliński — Gdańsk',
    installationId: 4,
  },
  {
    id: 5,
    name: 'Kompletacja i wyjazd ekipy Śląsk-3',
    date: '2026-10-24',
    eventType: 'Montaż',
    client: 'Krystyna Wójcik — Katowice',
    installationId: 5,
  },
  {
    id: 6,
    name: 'Odbiór B2B 49.5 kWp + zgłoszenie Enea',
    date: '2026-10-28',
    eventType: 'Odbiór OSD',
    client: 'Agro-Pol Sp. z o.o.',
    installationId: 3,
  },
  {
    id: 7,
    name: 'Montaż falownika + magazyn 10 kWh Pruszków',
    date: '2026-10-30',
    eventType: 'Montaż',
    client: 'Marek Kowalski (Dom 160m²)',
    installationId: 1,
  },
];

// Initial activity audit trail
export const initialActivities: ActivityLog[] = [
  {
    id: 1,
    userName: 'Sara Wiśniewska',
    action: 'zatwierdziła audyt dachu i schemat PV',
    target: 'PV 9.8 kWp + Magazyn 10 kWh — Pruszków',
    timeLabel: '12 min temu',
    color: 'pink',
  },
  {
    id: 2,
    userName: 'Emilia Dąbrowska',
    action: 'złożyła wniosek Mój Prąd 6.0 + zgłoszenie PGE',
    target: 'Tomasz Mazur — Legionowo',
    timeLabel: '48 min temu',
    color: 'green',
  },
  {
    id: 3,
    userName: 'Jakub Młynarski',
    action: 'rozpoczął montaż konstrukcji gruntowej B2B',
    target: 'Instalacja B2B 49.5 kWp + BESS 30 kWh',
    timeLabel: '1 godz. temu',
    color: 'orange',
  },
  {
    id: 4,
    userName: 'Aleksander Morawski',
    action: 'podpisał umowę z klientem (Autenti)',
    target: 'Magazyn energii 20 kWh + Falownik hybrydowy',
    timeLabel: '2 godz. temu',
    color: 'blue',
  },
];
