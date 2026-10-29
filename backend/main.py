"""
SM-OZE Polska CRM & FSM — FastAPI + SQLite Backend
Provides REST API endpoints (/api/db/*) and Swagger documentation (/docs)
for managing Polish OZE installations (PV, BESS, Heat Pumps), sales leads,
OSD grid connections, NFOŚiGW subsidies, and RBAC users.
"""

from __future__ import annotations

import json
import math
import os
import re
import site
import sqlite3
import sys
from pathlib import Path
from typing import Any, Literal, Optional

# Ensure user site-packages are on sys.path even when APPDATA is sandboxed
for candidate in [
    site.getusersitepackages(),
    str(Path.home() / "AppData/Roaming/Python/Python315/site-packages"),
]:
    if candidate and os.path.isdir(candidate) and candidate not in sys.path:
        sys.path.append(candidate)

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Resolve paths to the shared SQLite database and SQL schema
BASE_DIR = Path(__file__).resolve().parent.parent
DB_DIR = BASE_DIR / "database"
DB_FILE = DB_DIR / "oze_crm.sqlite"
SCHEMA_FILE = DB_DIR / "schema.sql"

SystemRole = Literal["admin", "manager", "salesman"]
OsdOperator = Literal["PGE", "Tauron", "Enea", "Energa"]
SubsidyProgram = Literal["Mój Prąd 6.0", "Czyste Powietrze", "Ciepłe Mieszkanie", "Brak (B2B)"]
SubsidyStatus = Literal["W przygotowaniu", "Złożony w NFOŚiGW", "Weryfikacja OSD", "Wypłacono"]

app = FastAPI(
    title="SM-OZE Polska CRM & FSM API (FastAPI + SQLite)",
    description=(
        "Backend API for Polish Renewable Energy (OZE) CRM & Field Service Management. "
        "Handles PV + Energy Storage installations, sales funnel automation, RBAC roles, "
        "and OSD / NFOŚiGW subsidy workflows."
    ),
    version="1.0.0",
)

# Enable CORS for local Vite development and preview servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Pydantic Schemas
# ============================================================================


class InstallationPayload(BaseModel):
    id: int
    name: str
    client: str
    manager: str
    status: str
    priority: str
    start: str = "24 paź 2026"
    deadline: str
    progress: int = 15
    color: str = "blue"
    initials: str = "PV"
    systemType: str = "PV + Magazyn energii"
    powerKwp: float = 9.8
    batteryKwh: float = 10.0
    osdOperator: OsdOperator = "PGE"
    subsidyProgram: SubsidyProgram = "Mój Prąd 6.0"
    subsidyStatus: SubsidyStatus = "W przygotowaniu"
    roofType: str = "Dachówka ceramiczna"
    contractValue: str = "58 400 PLN"
    installTeam: str = "Ekipa Mazowsze-1"
    voivodeship: str = "Mazowieckie"
    notes: Optional[str] = ""
    actor: Optional[str] = None
    actorRole: Optional[SystemRole] = "admin"


class LeadPayload(BaseModel):
    id: int
    name: str
    project: str
    priority: str
    due: str
    status: str
    assignee: str
    leadSource: Optional[str] = "Kalkulator WWW"
    estimatedPower: Optional[str] = "9.8 kWp + 10 kWh"
    notes: Optional[str] = ""
    actor: Optional[str] = None


class ClientPayload(BaseModel):
    id: int
    name: str
    contact: str
    email: str
    phone: str
    projects: int = 0
    status: str = "Aktywny"
    color: str = "blue"
    address: str
    voivodeship: str = "Mazowieckie"
    osd: OsdOperator = "PGE"
    financing: str = "Dotacja + Gotówka"
    ownerName: Optional[str] = "Aleksander Morawski"
    actor: Optional[str] = None


class UserPayload(BaseModel):
    id: int
    systemRole: SystemRole
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    region: Optional[str] = None
    workload: Optional[int] = None
    color: Optional[str] = "blue"
    actor: Optional[str] = None


class EventPayload(BaseModel):
    name: str
    date: str
    eventType: Optional[str] = "Montaż"
    client: Optional[str] = ""
    installationId: Optional[int] = None
    actor: Optional[str] = None


class SettingsPayload(BaseModel):
    companyName: str
    adminName: str
    officeEmail: str
    defaultSubsidy: SubsidyProgram
    autoConvertLead: bool = True
    actor: Optional[str] = None


class OzeCalculatorRequest(BaseModel):
    monthlyBillPln: float = Field(..., gt=0, description="Monthly electricity bill in PLN")
    hasHeatPump: bool = False


class OzeCalculatorResponse(BaseModel):
    monthlyBillPln: float
    annualDemandKwh: int
    recommendedPowerKwp: float
    recommendedBatteryKwh: int
    estimatedPriceGrossPln: int
    estimatedSubsidyPln: int
    estimatedNetAfterSubsidyPln: int
    paybackYears: float


# ============================================================================
# Database Connection, Migrations & Seed Data
# ============================================================================

DEFAULT_SETTINGS = {
    "companyName": "SM-OZE Polska Sp. z o.o. (300 użytkowników)",
    "adminName": "Aleksander Morawski",
    "officeEmail": "dotacje@sm-oze.pl",
    "defaultSubsidy": "Mój Prąd 6.0",
    "autoConvertLead": True,
}


def get_connection() -> sqlite3.Connection:
    """Open a connection to the SQLite database with Row factory enabled."""
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_FILE))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def ensure_schema_migrations(conn: sqlite3.Connection) -> None:
    """Apply schema.sql and ensure all new columns exist without data loss."""
    if SCHEMA_FILE.exists():
        conn.executescript(SCHEMA_FILE.read_text(encoding="utf-8"))

    alter_statements = [
        "ALTER TABLE installations ADD COLUMN notes TEXT NOT NULL DEFAULT '';",
        "ALTER TABLE leads ADD COLUMN notes TEXT NOT NULL DEFAULT '';",
        "ALTER TABLE calendar_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'Montaż';",
        "ALTER TABLE calendar_events ADD COLUMN client TEXT NOT NULL DEFAULT '';",
        "ALTER TABLE calendar_events ADD COLUMN installation_id INTEGER;",
    ]
    for sql in alter_statements:
        try:
            conn.execute(sql)
        except sqlite3.OperationalError:
            pass
    conn.commit()


def sync_client_project_counts(conn: sqlite3.Connection) -> None:
    """Synchronize each client's `projects` count with actual installations in SQLite."""
    conn.execute(
        """
        UPDATE clients
        SET projects = (
            SELECT COUNT(*) FROM installations WHERE installations.client = clients.name
        );
        """
    )
    conn.commit()


def seed_if_empty(conn: sqlite3.Connection, force_reset: bool = False) -> None:
    """Seed initial Polish OZE records if tables are empty or when resetting."""
    if force_reset:
        conn.executescript(
            """
            DELETE FROM activity_logs;
            DELETE FROM calendar_events;
            DELETE FROM leads;
            DELETE FROM installations;
            DELETE FROM clients;
            DELETE FROM users;
            DELETE FROM settings;
            """
        )

    user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if user_count == 0:
        initial_users = [
            (1, "Aleksander Morawski", "a.morawski@sm-oze.pl", "admin", "Administrator / Dyrektor Operacyjny OZE", "Zarząd i Operacje", "Cała Polska (Centrala)", 78, "blue"),
            (2, "Sara Wiśniewska", "s.wisniewska@sm-oze.pl", "manager", "Manager Realizacji i Audytu OZE", "Audyt i Projekty", "Małopolskie / Śląskie", 86, "pink"),
            (3, "Jakub Młynarski", "j.mlynarski@sm-oze.pl", "manager", "Manager Ekip Monterskich (B2B / Domy)", "Ekipy Monterskie", "Wielkopolskie / Pomorskie", 64, "orange"),
            (4, "Emilia Dąbrowska", "e.dabrowska@sm-oze.pl", "salesman", "Handlowiec OZE (Doradca D2D)", "Sprzedaż D2D", "Śląskie / Mazowieckie", 90, "green"),
            (5, "Dawid Kowal", "d.kowal@sm-oze.pl", "salesman", "Handlowiec OZE (PV + Magazyny)", "Sprzedaż D2D", "Mazowieckie / Wielkopolskie", 82, "purple"),
            (6, "Rachela Adamczyk", "r.adamczyk@sm-oze.pl", "manager", "Koordynator Dotacji i OSD", "Dotacje i OSD", "Pomorskie", 68, "teal"),
        ]
        conn.executemany(
            """
            INSERT INTO users (id, name, email, role, title, department, region, workload, color)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            initial_users,
        )

    client_count = conn.execute("SELECT COUNT(*) FROM clients").fetchone()[0]
    if client_count == 0:
        initial_clients = [
            (1, "Marek Kowalski (Dom 160m²)", "Marek Kowalski", "m.kowalski@poczta.pl", "+48 501 234 567", 1, "W realizacji", "purple", "ul. Słoneczna 14, 05-800 Pruszków", "Mazowieckie", "PGE", "Kredyt OZE (Alior)", "Dawid Kowal"),
            (2, "Rodzina Nowak — Wieliczka", "Anna i Piotr Nowak", "nowak.dom@gmail.com", "+48 602 345 678", 1, "W realizacji", "blue", "ul. Zielona 8, 32-020 Wieliczka", "Małopolskie", "Tauron", "Dotacja + Gotówka", "Sara Wiśniewska"),
            (3, "Agro-Pol Sp. z o.o.", "Zofia Kowalczyk (Prezes)", "biuro@agro-pol.pl", "+48 61 555 01 92", 1, "Aktywny", "orange", "ul. Przemysłowa 42, 62-020 Swarzędz", "Wielkopolskie", "Enea", "Leasing (Santander)", "Dawid Kowal"),
            (4, "Piotr Zieliński — Gdańsk", "Piotr Zieliński", "p.zielinski@orbit.pl", "+48 58 555 01 46", 1, "Aktywny", "teal", "ul. Nadmorska 21, 80-500 Gdańsk", "Pomorskie", "Energa", "Gotówka", "Aleksander Morawski"),
            (5, "Krystyna Wójcik — Katowice", "Krystyna Wójcik", "k.wojcik@interia.pl", "+48 32 555 01 77", 1, "W realizacji", "pink", "ul. Brzozowa 5, 40-100 Katowice", "Śląskie", "Tauron", "Czyste Powietrze (Prefinansowanie)", "Emilia Dąbrowska"),
            (6, "Tomasz Mazur — Legionowo", "Tomasz Mazur", "tomasz.mazur@wp.pl", "+48 512 888 990", 1, "Zakończony", "green", "ul. Leśna 3, 05-120 Legionowo", "Mazowieckie", "PGE", "Mój Prąd 6.0 + Gotówka", "Emilia Dąbrowska"),
        ]
        conn.executemany(
            """
            INSERT INTO clients (id, name, contact, email, phone, projects, status, color, address, voivodeship, osd, financing, owner_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            initial_clients,
        )

    inst_count = conn.execute("SELECT COUNT(*) FROM installations").fetchone()[0]
    if inst_count == 0:
        initial_installations = [
            (1, "PV 9.8 kWp + Magazyn 10 kWh — Pruszków", "Marek Kowalski (Dom 160m²)", "Dawid Kowal", "Montaż w toku", "Wysoki", "01 paź 2026", "15 lis 2026", 72, "purple", "PV", "PV + Magazyn energii", 9.8, 10.0, "PGE", "Mój Prąd 6.0", "W przygotowaniu", "Dachówka ceramiczna", "58 400 PLN", "Ekipa Mazowsze-1", "Mazowieckie", "Falownik hybrydowy 10kW z modułem EPS (zasilanie awaryjne), dachówka ceramiczna kąt 35°."),
            (2, "Dom Energooszczędny + Pompa + PV 12.4 kWp", "Rodzina Nowak — Wieliczka", "Sara Wiśniewska", "Kompletacja sprzętu", "Wysoki", "18 wrz 2026", "28 lis 2026", 45, "blue", "DE", "Dom pasywny + Pompa + PV", 12.4, 15.0, "Tauron", "Czyste Powietrze", "Złożony w NFOŚiGW", "Blachodachówka", "112 000 PLN", "Ekipa Małopolska-2", "Małopolskie", "Pompa ciepła powietrze-woda 9kW + bufor CWU 300L + instalacja PV na blachodachówce."),
            (3, "Instalacja B2B 49.5 kWp + BESS 30 kWh", "Agro-Pol Sp. z o.o.", "Jakub Młynarski", "Zgłoszenie OSD / Dotacja", "Średni", "05 paź 2026", "30 paź 2026", 90, "orange", "B2", "Fotowoltaika B2B + BESS", 49.5, 30.0, "Enea", "Brak (B2B)", "Weryfikacja OSD", "Grunt", "214 500 PLN", "Ekipa Wielkopolska-1", "Wielkopolskie", "Konstrukcja gruntowa dwupodporowa, uzgodnienie ppoż. rzeczoznawcy zakończone."),
            (4, "Magazyn energii 20 kWh + Falownik hybrydowy", "Piotr Zieliński — Gdańsk", "Aleksander Morawski", "Audyt i projekt", "Średni", "21 paź 2026", "10 gru 2026", 20, "teal", "ME", "Magazyn energii (Rozbudowa)", 0.0, 20.0, "Energa", "Mój Prąd 6.0", "W przygotowaniu", "Dach płaski", "42 000 PLN", "Ekipa Pomorze-1", "Pomorskie", "Rozbudowa istniejącej mikroinstalacji PV o magazyn LUNA2000 20 kWh."),
            (5, "Termomodernizacja + PV 8.2 kWp + Magazyn", "Krystyna Wójcik — Katowice", "Emilia Dąbrowska", "Kompletacja sprzętu", "Niski", "02 paź 2026", "05 lis 2026", 38, "pink", "TM", "Dom energooszczędny + PV", 8.2, 10.0, "Tauron", "Czyste Powietrze", "Złożony w NFOŚiGW", "Blachodachówka", "86 900 PLN", "Ekipa Śląsk-3", "Śląskie", "Wniosek z prefinansowaniem WFOŚiGW Katowice — II próg dochodowy."),
            (6, "PV 6.6 kWp + Magazyn energii 10 kWh", "Tomasz Mazur — Legionowo", "Emilia Dąbrowska", "Odebrane", "Wysoki", "10 sie 2026", "22 paź 2026", 100, "green", "TM", "PV + Magazyn energii", 6.6, 10.0, "PGE", "Mój Prąd 6.0", "Wypłacono", "Dachówka ceramiczna", "46 500 PLN", "Ekipa Mazowsze-1", "Mazowieckie", "Licznik dwukierunkowy PGE zamontowany, protokół PZO podpisany bez uwag."),
        ]
        conn.executemany(
            """
            INSERT INTO installations (
                id, name, client, manager, status, priority, start_date, deadline, progress,
                color, initials, system_type, power_kwp, battery_kwh, osd_operator,
                subsidy_program, subsidy_status, roof_type, contract_value, install_team, voivodeship, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            initial_installations,
        )

    lead_count = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
    if lead_count == 0:
        initial_leads = [
            (1, "Lead: Dom 180m² Piaseczno — dobór PV 10 kWp + Magazyn 15 kWh", "Marek Kowalski (Dom 160m²)", "Wysoki", "Dzisiaj", "Oferta / Weryfikacja", "Emilia Dąbrowska", "Kalkulator WWW", "10.0 kWp + 15 kWh", "Klient zainteresowany zasilaniem awaryjnym całego domu oraz dotacją Mój Prąd 6.0."),
            (2, "Audyt techniczny dachu + wniosek Czyste Powietrze (Wieliczka)", "Rodzina Nowak — Wieliczka", "Średni", "Dzisiaj", "Audyt / W toku", "Sara Wiśniewska", "Call Center", "12.4 kWp + 15 kWh", "Wymagana weryfikacja mocy przyłączeniowej (obecnie 14 kW w Tauron)."),
            (3, "Lead B2B: Hala produkcyjna Poznań — PV 49.5 kWp + BESS 30 kWh", "Agro-Pol Sp. z o.o.", "Wysoki", "Jutro", "Oferta / Weryfikacja", "Dawid Kowal", "Doradca D2D", "49.5 kWp + 30 kWh", "Oferta leasingowa Santander wysłana do zarządu."),
            (4, "Kalkulacja rozbudowy o magazyn LUNA2000 20 kWh + e-podpis Autenti", "Piotr Zieliński — Gdańsk", "Niski", "28 paź", "Nowy lead", "Aleksander Morawski", "Polecenie klienta", "0 kWp + 20 kWh", "Klient posiada instalację z 2022 roku na net-billingu."),
            (5, "Lead D2D: Termomodernizacja + Pompa ciepła + PV 8.2 kWp (Katowice)", "Krystyna Wójcik — Katowice", "Pilny", "Po terminie", "Nowy lead", "Emilia Dąbrowska", "Lead Facebook OZE", "8.2 kWp + 10 kWh", "Pilny kontakt telefoniczny przed końcem naboru."),
            (6, "Lead: Instalacja hybrydowa PV 9.8 kWp + BESS 10 kWh (Otwock)", "Tomasz Mazur — Legionowo", "Wysoki", "Dzisiaj", "Audyt / W toku", "Dawid Kowal", "Kalkulator WWW", "9.8 kWp + 10 kWh", "Drugi budynek inwestora (dom dla dzieci w Otwocku)."),
        ]
        conn.executemany(
            """
            INSERT INTO leads (id, name, project, priority, due, status, assignee, lead_source, estimated_power, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            initial_leads,
        )

    event_count = conn.execute("SELECT COUNT(*) FROM calendar_events").fetchone()[0]
    if event_count == 0:
        initial_events = [
            (1, "08:00 Audyt dachu + pomiary PV", "2026-10-03", "Audyt", "Marek Kowalski (Dom 160m²)", 1),
            (2, "Odbiór OSD + montaż licznika PGE", "2026-10-08", "Odbiór OSD", "Tomasz Mazur — Legionowo", 6),
            (3, "Montaż konstrukcji PV + Pompa ciepła", "2026-10-15", "Montaż", "Rodzina Nowak — Wieliczka", 2),
            (4, "Audyt rozbudowy magazynu 20 kWh", "2026-10-21", "Audyt", "Piotr Zieliński — Gdańsk", 4),
            (5, "Kompletacja i wyjazd ekipy Śląsk-3", "2026-10-24", "Montaż", "Krystyna Wójcik — Katowice", 5),
            (6, "Odbiór B2B 49.5 kWp + zgłoszenie Enea", "2026-10-28", "Odbiór OSD", "Agro-Pol Sp. z o.o.", 3),
            (7, "Montaż falownika + magazyn 10 kWh Pruszków", "2026-10-30", "Montaż", "Marek Kowalski (Dom 160m²)", 1),
        ]
        conn.executemany(
            """
            INSERT INTO calendar_events (id, name, date, event_type, client, installation_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            initial_events,
        )

    act_count = conn.execute("SELECT COUNT(*) FROM activity_logs").fetchone()[0]
    if act_count == 0:
        initial_acts = [
            ("Sara Wiśniewska", "zatwierdziła audyt dachu i schemat PV", "PV 9.8 kWp + Magazyn 10 kWh — Pruszków", "12 min temu", "pink"),
            ("Emilia Dąbrowska", "złożyła wniosek Mój Prąd 6.0 + zgłoszenie PGE", "Tomasz Mazur — Legionowo", "48 min temu", "green"),
            ("Jakub Młynarski", "rozpoczął montaż konstrukcji gruntowej B2B", "Instalacja B2B 49.5 kWp + BESS 30 kWh", "1 godz. temu", "orange"),
            ("Aleksander Morawski", "podpisał umowę z klientem (Autenti)", "Magazyn energii 20 kWh + Falownik hybrydowy", "2 godz. temu", "blue"),
        ]
        conn.executemany(
            """
            INSERT INTO activity_logs (user_name, action, target, time_label, color)
            VALUES (?, ?, ?, ?, ?)
            """,
            initial_acts,
        )

    settings_count = conn.execute("SELECT COUNT(*) FROM settings").fetchone()[0]
    if settings_count == 0:
        for k, v in DEFAULT_SETTINGS.items():
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?)",
                (k, "true" if v is True else "false" if v is False else str(v)),
            )

    sync_client_project_counts(conn)
    conn.commit()


def parse_power_and_battery(estimated_power: Optional[str]) -> tuple[float, float]:
    """Extract kWp and kWh floats from a string like '10.0 kWp + 15 kWh'."""
    if not estimated_power:
        return 9.8, 10.0
    kwp_match = re.search(r"([\d.]+)\s*kWp", estimated_power, re.IGNORECASE)
    kwh_match = re.search(r"([\d.]+)\s*kWh", estimated_power, re.IGNORECASE)
    power_kwp = float(kwp_match.group(1)) if kwp_match else 9.8
    battery_kwh = float(kwh_match.group(1)) if kwh_match else 10.0
    return power_kwp, battery_kwh


def read_settings(conn: sqlite3.Connection) -> dict[str, Any]:
    """Read key-value configuration from the SQLite `settings` table."""
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    data = {row["key"]: row["value"] for row in rows}
    return {
        "companyName": data.get("companyName", DEFAULT_SETTINGS["companyName"]),
        "adminName": data.get("adminName", DEFAULT_SETTINGS["adminName"]),
        "officeEmail": data.get("officeEmail", DEFAULT_SETTINGS["officeEmail"]),
        "defaultSubsidy": data.get("defaultSubsidy", DEFAULT_SETTINGS["defaultSubsidy"]),
        "autoConvertLead": data.get("autoConvertLead", "true").lower() == "true",
    }


def build_bootstrap_snapshot(conn: sqlite3.Connection) -> dict[str, Any]:
    """Read all relational tables from SQLite and return the unified JSON snapshot."""
    sync_client_project_counts(conn)

    users = [
        {
            "id": int(r["id"]),
            "name": r["name"],
            "email": r["email"],
            "systemRole": r["role"],
            "role": r["title"],
            "department": r["department"],
            "region": r["region"],
            "workload": int(r["workload"]),
            "color": r["color"],
        }
        for r in conn.execute("SELECT * FROM users ORDER BY id ASC").fetchall()
    ]

    projects = [
        {
            "id": int(r["id"]),
            "name": r["name"],
            "client": r["client"],
            "manager": r["manager"],
            "status": r["status"],
            "priority": r["priority"],
            "start": r["start_date"],
            "deadline": r["deadline"],
            "progress": int(r["progress"]),
            "color": r["color"],
            "initials": r["initials"],
            "systemType": r["system_type"],
            "powerKwp": float(r["power_kwp"]),
            "batteryKwh": float(r["battery_kwh"]),
            "osdOperator": r["osd_operator"],
            "subsidyProgram": r["subsidy_program"],
            "subsidyStatus": r["subsidy_status"],
            "roofType": r["roof_type"],
            "contractValue": r["contract_value"],
            "installTeam": r["install_team"],
            "voivodeship": r["voivodeship"],
            "notes": r["notes"] or "",
        }
        for r in conn.execute("SELECT * FROM installations ORDER BY id DESC").fetchall()
    ]

    tasks = [
        {
            "id": int(r["id"]),
            "name": r["name"],
            "project": r["project"],
            "priority": r["priority"],
            "due": r["due"],
            "status": r["status"],
            "assignee": r["assignee"],
            "leadSource": r["lead_source"],
            "estimatedPower": r["estimated_power"],
            "notes": r["notes"] or "",
        }
        for r in conn.execute("SELECT * FROM leads ORDER BY id DESC").fetchall()
    ]

    clients = [
        {
            "id": int(r["id"]),
            "name": r["name"],
            "contact": r["contact"],
            "email": r["email"],
            "phone": r["phone"],
            "projects": int(r["projects"]),
            "status": r["status"],
            "color": r["color"],
            "address": r["address"],
            "voivodeship": r["voivodeship"],
            "osd": r["osd"],
            "financing": r["financing"],
            "ownerName": r["owner_name"],
        }
        for r in conn.execute("SELECT * FROM clients ORDER BY id DESC").fetchall()
    ]

    events = [
        {
            "id": int(r["id"]),
            "name": r["name"],
            "date": r["date"],
            "eventType": r["event_type"] or "Montaż",
            "client": r["client"] or "",
            "installationId": int(r["installation_id"]) if r["installation_id"] is not None else None,
        }
        for r in conn.execute("SELECT * FROM calendar_events ORDER BY date ASC, id ASC").fetchall()
    ]

    activities = [
        {
            "id": int(r["id"]),
            "userName": r["user_name"],
            "action": r["action"],
            "target": r["target"],
            "timeLabel": r["time_label"],
            "color": r["color"],
        }
        for r in conn.execute("SELECT * FROM activity_logs ORDER BY id DESC LIMIT 15").fetchall()
    ]

    settings = read_settings(conn)

    return {
        "meta": {
            "engine": "Python FastAPI + SQLite 3",
            "file": "database/oze_crm.sqlite",
            "tables": [
                "users",
                "clients",
                "installations",
                "leads",
                "calendar_events",
                "activity_logs",
                "settings",
            ],
            "counts": {
                "users": len(users),
                "clients": len(clients),
                "installations": len(projects),
                "leads": len(tasks),
                "events": len(events),
            },
        },
        "projects": projects,
        "tasks": tasks,
        "clients": clients,
        "events": events,
        "activities": activities,
        "users": users,
        "settings": settings,
    }


@app.on_event("startup")
def on_startup() -> None:
    """Initialize SQLite schema and seed data when FastAPI starts."""
    with get_connection() as conn:
        ensure_schema_migrations(conn)
        seed_if_empty(conn)


# ============================================================================
# FastAPI REST Endpoints (/api/db/*)
# ============================================================================


@app.get("/api/db/bootstrap")
def api_bootstrap() -> dict[str, Any]:
    """Return full database state across all 7 SQLite tables."""
    with get_connection() as conn:
        ensure_schema_migrations(conn)
        seed_if_empty(conn)
        return build_bootstrap_snapshot(conn)


@app.get("/api/db/backup")
def api_backup() -> Response:
    """Export the entire SQLite database state as a downloadable JSON file."""
    with get_connection() as conn:
        snapshot = build_bootstrap_snapshot(conn)
    payload = json.dumps(snapshot, ensure_ascii=False, indent=2)
    return Response(
        content=payload,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="sm-oze-sqlite-backup.json"'},
    )


@app.post("/api/db/calculate-oze", response_model=OzeCalculatorResponse)
def api_calculate_oze(req: OzeCalculatorRequest) -> OzeCalculatorResponse:
    """
    Python OZE engineering calculator:
    Computes PV power (kWp), battery storage (kWh), gross contract price (PLN),
    and Mój Prąd 6.0 subsidy estimate from the client's monthly PLN electricity bill.
    """
    annual_kwh = int(round((req.monthlyBillPln * 12.0) / 1.15))
    if req.hasHeatPump:
        annual_kwh += 3500

    recommended_kwp = max(3.5, round((annual_kwh / 1000.0) * 1.15, 1))
    if recommended_kwp <= 6.0:
        recommended_battery = 10
    elif recommended_kwp <= 12.0:
        recommended_battery = 15
    else:
        recommended_battery = 20

    est_price = int(round((recommended_kwp * 3800 + recommended_battery * 2100) / 100.0) * 100)
    # Mój Prąd 6.0 subsidy: up to 7 000 PLN for PV + up to 16 000 PLN for energy storage (BESS)
    est_subsidy = 23000 if recommended_kwp <= 20.0 else 0
    net_cost = max(0, est_price - est_subsidy)
    annual_savings = max(1200.0, req.monthlyBillPln * 12.0 * 0.88)
    payback_years = round(net_cost / annual_savings, 1)

    return OzeCalculatorResponse(
        monthlyBillPln=req.monthlyBillPln,
        annualDemandKwh=annual_kwh,
        recommendedPowerKwp=recommended_kwp,
        recommendedBatteryKwh=recommended_battery,
        estimatedPriceGrossPln=est_price,
        estimatedSubsidyPln=est_subsidy,
        estimatedNetAfterSubsidyPln=net_cost,
        paybackYears=payback_years,
    )


@app.post("/api/db/installations")
def api_save_installation(p: InstallationPayload) -> dict[str, Any]:
    """Create or update an OZE installation in SQLite (restricted for salesman role)."""
    if p.actorRole == "salesman":
        raise HTTPException(
            status_code=403,
            detail="Tylko Manager lub Admin może edytować realizacje montażowe.",
        )

    with get_connection() as conn:
        conn.execute(
            """
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
            """,
            (
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
                p.notes or "",
            ),
        )

        client_status = "Zakończony" if p.status == "Odebrane" else "W realizacji"
        conn.execute("UPDATE clients SET status = ? WHERE name = ?", (client_status, p.client))

        conn.execute(
            "INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)",
            (
                p.actor or p.manager or "Aleksander Morawski",
                f"zaktualizował realizację ({p.status} · {p.subsidyStatus})",
                p.name,
                "Przed chwilą",
                p.color or "blue",
            ),
        )
        conn.commit()
        return build_bootstrap_snapshot(conn)


@app.delete("/api/db/installations")
def api_delete_installation(
    id: int = Query(...),
    actor: str = Query("Aleksander Morawski"),
    actorRole: str = Query("admin"),
) -> dict[str, Any]:
    """Delete an installation and its linked calendar events from SQLite."""
    if actorRole == "salesman":
        raise HTTPException(status_code=403, detail="Brak uprawnień RBAC do usunięcia realizacji.")

    with get_connection() as conn:
        row = conn.execute("SELECT name FROM installations WHERE id = ?", (id,)).fetchone()
        conn.execute("DELETE FROM installations WHERE id = ?", (id,))
        conn.execute("DELETE FROM calendar_events WHERE installation_id = ?", (id,))
        if row:
            conn.execute(
                "INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)",
                (actor, "usunął realizację OZE z bazy SQL", row["name"], "Przed chwilą", "orange"),
            )
        conn.commit()
        return build_bootstrap_snapshot(conn)


@app.post("/api/db/leads")
def api_save_lead(t: LeadPayload) -> dict[str, Any]:
    """
    Create or update a sales lead in SQLite.
    Automatically converts signed leads ('Umowa podpisana (Wygrana)') into an OZE Installation,
    OSD/Subsidy record, and pre-installation audit event when `autoConvertLead` is enabled.
    """
    with get_connection() as conn:
        conn.execute(
            """
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
            """,
            (
                t.id,
                t.name,
                t.project,
                t.priority,
                t.due,
                t.status,
                t.assignee,
                t.leadSource or "Kalkulator WWW",
                t.estimatedPower or "9.8 kWp + 10 kWh",
                t.notes or "",
            ),
        )

        settings = read_settings(conn)

        if settings["autoConvertLead"] and t.status in ("Umowa podpisana (Wygrana)", "Zrealizowane"):
            converted_name = re.sub(r"^Lead(\s*B2B|\s*D2D)?:\s*", "", t.name, flags=re.IGNORECASE)
            existing = conn.execute(
                "SELECT id FROM installations WHERE name = ?", (converted_name,)
            ).fetchone()

            if not existing:
                power_kwp, battery_kwh = parse_power_and_battery(t.estimatedPower)
                client_row = conn.execute(
                    "SELECT * FROM clients WHERE name = ? LIMIT 1", (t.project,)
                ).fetchone()
                osd_op = client_row["osd"] if client_row and client_row["osd"] else "PGE"
                voiv = (
                    client_row["voivodeship"]
                    if client_row and client_row["voivodeship"]
                    else "Mazowieckie"
                )
                est_price = int(round((power_kwp * 3800 + battery_kwh * 2100) / 100.0) * 100)
                formatted_price = f"{est_price:,}".replace(",", " ") + " PLN"
                new_inst_id = int(t.id) + 1000

                conn.execute(
                    """
                    INSERT INTO installations (
                        id, name, client, manager, status, priority, start_date, deadline, progress,
                        color, initials, system_type, power_kwp, battery_kwh, osd_operator,
                        subsidy_program, subsidy_status, roof_type, contract_value, install_team, voivodeship, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        new_inst_id,
                        converted_name,
                        t.project,
                        t.assignee,
                        "Audyt i projekt",
                        t.priority,
                        "24 paź 2026",
                        "25 lis 2026",
                        15,
                        "blue",
                        converted_name[:2].upper(),
                        "Fotowoltaika B2B + BESS" if power_kwp > 20 else "PV + Magazyn energii",
                        power_kwp,
                        battery_kwh,
                        osd_op,
                        "Brak (B2B)" if power_kwp > 20 else settings["defaultSubsidy"],
                        "W przygotowaniu",
                        "Dachówka ceramiczna",
                        formatted_price,
                        "Ekipa Mazowsze-1",
                        voiv,
                        t.notes or "Automatycznie utworzono w Python FastAPI po podpisaniu umowy.",
                    ),
                )

                conn.execute(
                    "UPDATE clients SET status = ? WHERE name = ?", ("W realizacji", t.project)
                )

                conn.execute(
                    """
                    INSERT INTO calendar_events (name, date, event_type, client, installation_id)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        f"Audyt przedmontażowy: {t.project}",
                        "2026-10-26",
                        "Audyt",
                        t.project,
                        new_inst_id,
                    ),
                )

                conn.execute(
                    """
                    INSERT INTO activity_logs (user_name, action, target, time_label, color)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        t.actor or t.assignee,
                        "podpisał umowę — FastAPI utworzyło realizację OZE i wniosek dotacyjny",
                        converted_name,
                        "Przed chwilą",
                        "green",
                    ),
                )
        else:
            conn.execute(
                """
                INSERT INTO activity_logs (user_name, action, target, time_label, color)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    t.actor or t.assignee or "Aleksander Morawski",
                    f"zaktualizował lead ({t.status})",
                    t.name,
                    "Przed chwilą",
                    "purple",
                ),
            )

        conn.commit()
        return build_bootstrap_snapshot(conn)


@app.delete("/api/db/leads")
def api_delete_lead(
    id: int = Query(...),
    actor: str = Query("Aleksander Morawski"),
) -> dict[str, Any]:
    """Delete a sales lead from SQLite."""
    with get_connection() as conn:
        row = conn.execute("SELECT name FROM leads WHERE id = ?", (id,)).fetchone()
        conn.execute("DELETE FROM leads WHERE id = ?", (id,))
        if row:
            conn.execute(
                "INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)",
                (actor, "usunął lead z lejka sprzedaży", row["name"], "Przed chwilą", "orange"),
            )
        conn.commit()
        return build_bootstrap_snapshot(conn)


@app.post("/api/db/clients")
def api_save_client(c: ClientPayload) -> dict[str, Any]:
    """Create or update an investor/client record in SQLite."""
    with get_connection() as conn:
        exists = conn.execute("SELECT id FROM clients WHERE id = ?", (c.id,)).fetchone() is not None
        conn.execute(
            """
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
            """,
            (
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
                c.ownerName or "Aleksander Morawski",
            ),
        )
        conn.execute(
            "INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)",
            (
                c.actor or c.ownerName or "Aleksander Morawski",
                "zaktualizował dane inwestora w SQL" if exists else "dodał nowego inwestora do bazy SQL",
                c.name,
                "Przed chwilą",
                "teal",
            ),
        )
        conn.commit()
        return build_bootstrap_snapshot(conn)


@app.delete("/api/db/clients")
def api_delete_client(
    id: int = Query(...),
    actor: str = Query("Aleksander Morawski"),
) -> dict[str, Any]:
    """Delete a client record from SQLite."""
    with get_connection() as conn:
        row = conn.execute("SELECT name FROM clients WHERE id = ?", (id,)).fetchone()
        conn.execute("DELETE FROM clients WHERE id = ?", (id,))
        if row:
            conn.execute(
                "INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)",
                (actor, "usunął kartę klienta z bazy SQL", row["name"], "Przed chwilą", "orange"),
            )
        conn.commit()
        return build_bootstrap_snapshot(conn)


@app.post("/api/db/users")
def api_save_user(u: UserPayload) -> dict[str, Any]:
    """Create/edit an employee or update RBAC role & workload in SQLite."""
    with get_connection() as conn:
        if u.name and u.email:
            conn.execute(
                """
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
                """,
                (
                    u.id,
                    u.name,
                    u.email,
                    u.systemRole,
                    u.role or "Doradca OZE",
                    u.department or "Sprzedaż D2D",
                    u.region or "Mazowieckie",
                    u.workload if u.workload is not None else 65,
                    u.color or "blue",
                ),
            )
            conn.execute(
                "INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)",
                (
                    u.actor or "Aleksander Morawski",
                    f"zapisano profil pracownika ({u.systemRole.upper()})",
                    u.name,
                    "Przed chwilą",
                    "blue",
                ),
            )
        else:
            if u.workload is not None:
                conn.execute(
                    "UPDATE users SET role = ?, workload = ? WHERE id = ?",
                    (u.systemRole, u.workload, u.id),
                )
            else:
                conn.execute("UPDATE users SET role = ? WHERE id = ?", (u.systemRole, u.id))
            row = conn.execute("SELECT name FROM users WHERE id = ?", (u.id,)).fetchone()
            if row:
                conn.execute(
                    "INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)",
                    (
                        u.actor or "Aleksander Morawski",
                        f"zmienił uprawnienia RBAC na {u.systemRole.upper()}",
                        row["name"],
                        "Przed chwilą",
                        "blue",
                    ),
                )
        conn.commit()
        return build_bootstrap_snapshot(conn)


@app.delete("/api/db/users")
def api_delete_user(id: int = Query(...)) -> dict[str, Any]:
    """Delete a user record from SQLite."""
    with get_connection() as conn:
        conn.execute("DELETE FROM users WHERE id = ?", (id,))
        conn.commit()
        return build_bootstrap_snapshot(conn)


@app.post("/api/db/events")
def api_save_event(ev: EventPayload) -> dict[str, Any]:
    """Create a calendar schedule event in SQLite."""
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO calendar_events (name, date, event_type, client, installation_id)
            VALUES (?, ?, ?, ?, ?)
            """,
            (ev.name, ev.date, ev.eventType or "Montaż", ev.client or "", ev.installationId),
        )
        conn.execute(
            "INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)",
            (
                ev.actor or "Aleksander Morawski",
                f"zaplanował w grafiku ({ev.date})",
                ev.name,
                "Przed chwilą",
                "teal",
            ),
        )
        conn.commit()
        return build_bootstrap_snapshot(conn)


@app.delete("/api/db/events")
def api_delete_event(id: int = Query(...)) -> dict[str, Any]:
    """Delete a calendar schedule event from SQLite."""
    with get_connection() as conn:
        conn.execute("DELETE FROM calendar_events WHERE id = ?", (id,))
        conn.commit()
        return build_bootstrap_snapshot(conn)


@app.post("/api/db/settings")
def api_save_settings(body: SettingsPayload) -> dict[str, Any]:
    """Persist organization and workflow automation settings in SQLite."""
    with get_connection() as conn:
        pairs = {
            "companyName": body.companyName,
            "adminName": body.adminName,
            "officeEmail": body.officeEmail,
            "defaultSubsidy": body.defaultSubsidy,
            "autoConvertLead": "true" if body.autoConvertLead else "false",
        }
        for k, v in pairs.items():
            conn.execute(
                """
                INSERT INTO settings (key, value, updated_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = datetime('now')
                """,
                (k, v),
            )
        conn.execute(
            "INSERT INTO activity_logs (user_name, action, target, time_label, color) VALUES (?, ?, ?, ?, ?)",
            (
                body.actor or body.adminName,
                "zaktualizował konfigurację systemu w tabeli SQL settings",
                body.companyName,
                "Przed chwilą",
                "blue",
            ),
        )
        conn.commit()
        return build_bootstrap_snapshot(conn)


@app.post("/api/db/reset")
def api_reset_database() -> dict[str, Any]:
    """Restore SQLite database to initial seed state."""
    with get_connection() as conn:
        seed_if_empty(conn, force_reset=True)
        return build_bootstrap_snapshot(conn)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
