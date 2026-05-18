# PRD: KDL Import Consignment Tracker System
**Product Requirements Document**
**Version:** 1.0
**Prepared for:** Kingdao Logistics
**Date:** 2026-05-18
**Status:** Ready for Development

---

## Table of Contents

1. [Overview](#1-overview)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [Users & Roles](#4-users--roles)
5. [Data Model](#5-data-model)
6. [Core Features](#6-core-features)
7. [Pipeline Logic & Business Rules](#7-pipeline-logic--business-rules)
8. [Column Relationships & Data Dependencies](#8-column-relationships--data-dependencies)
9. [Screens & Views](#9-screens--views)
10. [Technical Requirements](#10-technical-requirements)
11. [Non-Functional Requirements](#11-non-functional-requirements)
12. [Out of Scope](#12-out-of-scope)
13. [Appendix: Reference Data](#13-appendix-reference-data)

---

## 1. Overview

The KDL Import Consignment Tracker is a web-based operations management system for **Kingdao Logistics**, a customs clearing and forwarding company based in Tanzania. It replaces the current Excel-based tracker (`TRACKER_--_KDL.xlsx`) with a structured, multi-user, real-time application that manages the full lifecycle of import consignments — from vessel arrival through customs clearance to final release.

The system tracks shipments across all clients, container types, ICDs (Inland Container Depots), and Tanzania customs system interactions (TANCIS, TANESWS, TBS), producing a live pipeline view of every active job.

---

## 2. Problem Statement

Currently, the company manages 400+ consignments per year using a single shared Excel file. This causes:

- **No real-time visibility** — status updates require someone to manually edit the file
- **No access control** — anyone with the file can edit any record
- **No audit trail** — changes are not logged; errors are hard to trace
- **Bottleneck identification is manual** — finding stuck jobs requires scanning hundreds of rows
- **Duplicate EFD/REF tracking is error-prone** — shared invoices (same EFD Code across multiple B/Ls) are tracked by convention only
- **No alerts** — no automatic notifications when a job is stuck or overdue
- **Reporting requires manual effort** — revenue summaries, client volumes, and turnaround times require manual pivot tables

---

## 3. Goals & Success Metrics

### Goals

| # | Goal |
|---|------|
| G1 | Replace Excel with a structured database-backed web app |
| G2 | Provide a real-time pipeline view of all active consignments |
| G3 | Enable role-based access (admin, operator, viewer) |
| G4 | Automatically flag stalled jobs based on pipeline stage duration |
| G5 | Generate client invoices and EFD records from the system |
| G6 | Produce management reports (revenue, turnaround, client volume) |
| G7 | Support both 2025 and 2026 data, with yearly separation |

### Success Metrics

| Metric | Target |
|--------|--------|
| Time to update a consignment status | < 30 seconds |
| Zero data loss from concurrent edits | 100% |
| Stuck job detection | ≤ 24 hours from stall point |
| Report generation time | < 5 seconds |
| Data migration from existing Excel | 100% of historical records imported |

---

## 4. Users & Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| **Admin** | Company owner / manager | Full CRUD, user management, reports, settings |
| **Operator** | Clearing staff | Create & update consignments, update pipeline status |
| **Viewer** | Client-facing or read-only staff | View consignment status only; no edits |

---

## 5. Data Model

### 5.1 Consignment (Core Record)

| Field | Type | Description | Source Column |
|-------|------|-------------|---------------|
| `id` | UUID | System primary key | — |
| `ref_no` | String | Internal job reference (e.g., `9900001`) | REF No |
| `tansad_no` | String | Tanzania customs declaration number | TANSAD No. |
| `year` | Integer | Financial/operational year (2025, 2026) | Year separator row |
| `serial_no` | Integer | Row number within the year | S/N |
| `client_id` | FK → Client | Consignee | CLIENT |
| `bl_number` | String | Bill of Lading number | B/L No. |
| `container_count` | Decimal | Number of containers (can be 0.5 for partial) | No. of Cont(s) |
| `container_type` | Enum | `40FT`, `20FT`, `CAR`, `COIL` | (unlabeled column) |
| `goods_description` | String | Description of goods | ITEMS/GOODS |
| `vessel_name` | String | Name of vessel | VESSEL |
| `arrival_date` | Date | Date vessel arrived at port | ARR. DATE |
| `icd_id` | FK → ICD | Where containers are stored | ICD |
| `in_ref` | String | Batch invoice reference (e.g., `TZ3`, `HB1`) | IN REF |
| `amount` | Integer | Service fee in TZS | AMOUNT |
| `remarks` | Text | Freeform notes | Remarks |
| `created_at` | Timestamp | Record creation time | — |
| `updated_at` | Timestamp | Last modification time | — |
| `updated_by` | FK → User | Who last modified the record | — |

### 5.2 Pipeline Status (Embedded in Consignment)

Each field below represents one stage in the clearance pipeline.

| Field | Type | Allowed Values | Source Column |
|-------|------|----------------|---------------|
| `manifest_status` | Enum | `Waiting`, `Action`, `Uploaded` | Manifest |
| `shipping_batch_status` | Enum | `Waiting`, `Action`, `Done`, `PREPARED`, `CARRY IN END`, `W/CARRY IN` | Shipping Batch |
| `current_status` | String | Freeform | CURRENT STATUS |
| `tanesws_status` | Enum | `Waiting`, `Action`, `Done` | TANESWS Loading |
| `assessment_status` | Enum | `Waiting`, `Action`, `Closed` | ASSMENT |
| `tbs_loading_status` | Enum | `Waiting`, `Action`, `Done` | TBS Loading |
| `tbs_debit_status` | Enum | `Waiting`, `Action`, `Paid`, `SHARED` | TBS Debit |
| `manifest_comp_status` | Enum | `Waiting`, `Action`, `Done` | Manifest Comp |
| `duty_status` | Enum | `Waiting`, `Action`, `Paid` | Duty Status |
| `inspection_file_status` | Enum | `Waiting`, `Action`, `Done`, `SHARED` | Inspection File |
| `release_status` | Enum | `Waiting`, `Released` | Release Status |
| `release_date` | Date (nullable) | Date of release | Release Date |

### 5.3 EFD Record

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `consignment_id` | FK → Consignment | — |
| `efd_code` | String | EFD receipt number (e.g., `03429118`) or `PRIVATE` / `TRANSIT` |
| `efd_time` | Time (nullable) | Time of EFD issuance |
| `is_private` | Boolean | True for car imports billed privately |
| `is_transit` | Boolean | True for transit cargo |
| `is_shared` | Boolean | True when one EFD code covers multiple consignments |

> **Note:** Multiple consignments may share the same `efd_code` — this is valid when goods in a batch are invoiced together. The system must support this 1:many relationship.

### 5.4 Client

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `name` | String | Client name (e.g., `TZ CHINA`, `BREE AUTO`) |
| `sub_label` | String (nullable) | Sub-client label (e.g., `SAAJT`, `MOTA`, `YAKET` for `PAPA - *`) |
| `contact_email` | String (nullable) | — |
| `notes` | Text | — |

### 5.5 ICD (Inland Container Depot)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `name` | String | e.g., `AFRICAN ICD`, `GALCO UDART`, `DP WORLD`, `HESU` |
| `location` | String | Port/area |
| `is_active` | Boolean | — |

---

## 6. Core Features

### 6.1 Consignment Management

- **Create** a new consignment with all fields
- **Edit** any field with full audit log (who changed what, when)
- **Delete** (soft delete only — records are archived, not removed)
- **Duplicate** a consignment (useful for GUTA PARTS / FRAMES pairs that always arrive together)
- **Bulk import** from Excel (`.xlsx`) using the existing file format as a template
- **Year separation** — consignments are grouped and displayed by operational year

### 6.2 Pipeline Status Tracker

- Each consignment has a **visual pipeline** showing all 11 stages
- Each stage shows: `Waiting` (grey) → `Action` (amber) → `Done/Paid/Released` (green)
- **One-click status updates** per stage — no need to open full edit form
- **Stage timestamps** are recorded automatically when a stage is marked complete
- **Blocked indicator**: if a stage has been in `Action` for more than 48 hours, it turns red

### 6.3 Dashboard

The main dashboard shows:

- **Active jobs count** by status (Released today, Stuck, Pending release)
- **Pipeline funnel** — how many consignments are at each stage right now
- **Arrivals this week** — upcoming vessel arrivals
- **Revenue this month** — sum of `amount` for released consignments
- **Top clients by volume** — container count per client (current year)
- **Overdue jobs** — jobs where any stage has been stuck > 48 hours

### 6.4 Client Batch Grouping (IN REF)

- Consignments sharing the same `in_ref` are visually grouped
- The system shows a **batch summary card** when an `in_ref` is clicked: all B/Ls, total containers, total amount, combined release status
- EFD codes are shared across the batch — entered once and linked automatically

### 6.5 GUTA Batch Pairing

GUTA PARTS shipments always arrive with a matching FRAMES shipment on the same vessel. The system:

- Detects pairs by matching vessel + client + batch code (e.g., `073C GUTA PARTS` ↔ `073C FRAMES`)
- Displays them as linked pairs in the UI
- Warns if one is released but the other is not

### 6.6 EFD Management

- EFD records are created separately and linked to one or more consignments
- Supports `PRIVATE`, `TRANSIT`, `SHARED`, and standard EFD codes
- EFD time is stored and displayed
- A list of all EFD codes issued today/this week is available for operators

### 6.7 Search & Filter

- Search by: REF No, TANSAD No, B/L No, Client name, Vessel, EFD Code, IN REF
- Filter by: Year, Client, ICD, Container type, Pipeline stage, Remarks flag
- Filter: "Show only stuck jobs" (any stage in `Action` > 48h)
- Filter: "Show only unreleased jobs"
- Filter: "Show only this week's arrivals"

### 6.8 Alerts & Notifications

| Trigger | Alert |
|---------|-------|
| Any pipeline stage stuck in `Action` for 48+ hours | Flag job red in dashboard; notify admin |
| Consignment arrival date is today | Show in "Arriving Today" section |
| Job released | Log completion, update revenue counter |
| EFD not issued within 7 days of release | Warning flag |

### 6.9 Reports

| Report | Description |
|--------|-------------|
| **Revenue Summary** | Total `amount` by month/year, by client |
| **Client Volume** | Container count and job count per client |
| **Turnaround Time** | Average days from ARR DATE to Release Date, per client and ICD |
| **Pipeline Bottleneck** | Which stage causes the most delays on average |
| **Active Consignments** | All jobs not yet released |
| **ICD Utilization** | Job count per ICD |
| **Pending Refunds** | Jobs flagged as `PAID, REFUND NEEDED` (seen in source data) |

All reports are exportable to Excel (`.xlsx`) and PDF.

### 6.10 Data Import (Migration)

- Upload the existing `TRACKER_--_KDL.xlsx` file
- System parses both the 2025 and 2026 sections automatically
- Preview imported records before confirming
- Validation errors (missing REF No, invalid dates) are shown row-by-row
- Import log is saved for audit purposes

---

## 7. Pipeline Logic & Business Rules

### 7.1 Standard Clearance Pipeline

The stages must be completed in order. A stage cannot be marked `Done` if its predecessor is not yet `Done`.

```
1. Manifest Uploaded
      ↓
2. Shipping Batch Processed (CARRY IN END)
      ↓
3. TANESWS Loading Done
      ↓
4. Assessment Closed
      ↓
5. TBS Loading Done
      ↓
6. TBS Debit Paid
      ↓
7. Manifest Complete
      ↓
8. Duty Status Paid
      ↓
9. Inspection File Done
      ↓
10. Released (Release Date set)
      ↓
11. EFD Issued
```

### 7.2 Special Cases

| Case | Rule |
|------|------|
| **PRIVATE** cargo (cars) | Skip TBS Debit tracking; mark EFD as `PRIVATE` |
| **TRANSIT** cargo | Duty status is exempt; EFD marked `TRANSIT` |
| **SHARED** consignments | TBS Debit and Inspection File marked `SHARED`; linked to primary consignment |
| **Partial containers** (`0.5`) | Allowed in `container_count`; represents a shared container |
| **COIL** type | Container count represents number of coil units, not containers |
| **W/CARRY IN** | Shipping batch is still being moved into position; a sub-state before `CARRY IN END` |

### 7.3 Amount Thresholds (Reference Only)

| Container Type | Typical Amount Range (TZS) |
|----------------|---------------------------|
| CAR (private) | 50,000 – 75,000 |
| 20FT container | 100,000 – 250,000 |
| 40FT single | 150,000 – 200,000 |
| 40FT multi (5–9 containers) | 300,000 – 500,000 |
| COIL batch | 189,000 – 1,500,000 |

These are not enforced by the system but can trigger a soft warning if an entered amount is far outside the expected range for the container type.

---

## 8. Column Relationships & Data Dependencies

This section documents every causal relationship between fields — how entering or changing one value triggers constraints, auto-fills, or validation requirements in other fields. This is the ground truth for building the database schema, API validation layer, and UI behavior.

---

### 8.1 ARR DATE → Everything Downstream (The Master Clock)

`arrival_date` is the single most important field in the entire system. It is the **origin timestamp** from which all time-based logic flows.

```
arrival_date
  ├── starts the free-storage clock at the ICD
  ├── determines when demurrage begins (not tracked in v1 but critical context)
  ├── sets the reference point for turnaround_time calculation:
  │     turnaround_time = release_date - arrival_date (in days)
  ├── feeds the "Arrivals This Week" dashboard widget
  ├── if arrival_date is today → trigger "Arriving Today" alert
  └── arrival_date being NULL means the vessel has not yet docked
        → all pipeline stages must remain `Waiting` if arrival_date is NULL
```

**DB Rule:** No pipeline stage may be set to `Done`, `Uploaded`, `Closed`, or `Paid` if `arrival_date` is NULL. The API must enforce this.

**UI Rule:** If `arrival_date` is set or changed, recalculate and display `turnaround_time` in real time on the detail view.

---

### 8.2 B/L Number → Manifest, ICD, and Batch Grouping

The `bl_number` (Bill of Lading) is the **shipping line's identifier** for the cargo. It directly determines which manifest it appears on and which ICD receives it.

```
bl_number
  ├── links to manifest_status
  │     A manifest groups all B/Ls on the same vessel voyage.
  │     If two consignments share the same vessel_name + arrival_date,
  │     they are on the same manifest. The manifest_status for all of them
  │     must be updated together — if one is Uploaded, all on that voyage
  │     should be Uploaded.
  │
  ├── links to icd_id
  │     The ICD is determined by which terminal the shipping line
  │     directed the B/L to. Different B/Ls on the same vessel can go
  │     to different ICDs (e.g., TZ CHINA always goes to AFRICAN ICD,
  │     HEBERY often goes to HESU). This is client/shipping line specific.
  │
  └── links to tansad_no
        One TANSAD is filed per B/L. A single B/L cannot have two TANSADs.
        Validation: bl_number must be unique within a given year.
        If a B/L appears twice, it is an error (or a re-import after rejection).
```

**DB Rule:** `bl_number` must be unique per `year`. Duplicate B/L in the same year = validation error on import and on manual create.

**DB Rule:** When `vessel_name` + `arrival_date` match across multiple consignments, those records are implicitly grouped as a "voyage." The system should expose this grouping in the UI.

---

### 8.3 VESSEL + ARR DATE → Voyage Group (Manifest Synchronization)

```
vessel_name + arrival_date (composite)
  ├── defines a "voyage" — all consignments sharing both values
  │     are on the same ship, the same manifest, and arrive together
  │
  ├── manifest_status should be synchronized across the voyage:
  │     when one consignment's manifest is marked Uploaded,
  │     the system should prompt: "Mark all consignments on this
  │     voyage as Uploaded?" (batch action)
  │
  ├── shipping_batch_status is also voyage-level:
  │     all containers from the same voyage go through port
  │     carry-in together. CARRY IN END for one implies
  │     CARRY IN END for all on that voyage (unless different ICDs
  │     cause split processing)
  │
  └── feeds the "vessel tracking" view — group by vessel for port ops
```

**UI Rule:** On the consignment list, allow grouping by vessel. On the detail view, show a "voyage siblings" list — all other consignments on the same vessel.

---

### 8.4 IN REF → EFD Code, AMOUNT, and Invoice Batch

`in_ref` is the **billing batch identifier**. It groups multiple B/Ls (often 2–6 consignments) that are invoiced to the client as one combined job. This is the most complex relationship in the data model.

```
in_ref (e.g., "TZ3", "HB1", "TZ7")
  ├── groups multiple consignment records under one invoice
  │
  ├── links to efd_code:
  │     All consignments sharing an in_ref share the SAME efd_code
  │     and efd_time. The EFD receipt is issued once for the batch.
  │     Example: TZ3 has 3 consignments, all with efd_code = "03429118"
  │              and efd_time = "12:44:37"
  │
  ├── links to amount:
  │     Each consignment in the batch has its OWN amount (not split).
  │     The total invoice = SUM of amount for all consignments in the in_ref.
  │     Example: TZ3 batch = 300,000 + 150,000 + 250,000 = 700,000 TZS total
  │
  ├── in_ref is client-scoped:
  │     TZ1, TZ2, TZ3... belong to TZ CHINA
  │     HB1, HB2... belong to HEBERY
  │     DR001 belongs to DRACAENA
  │     The prefix encodes the client. The system should auto-suggest
  │     the next in_ref for a client when creating a new batch.
  │
  ├── in_ref is NULL for:
  │     - PRIVATE cargo (cars) — billed privately, no shared invoice
  │     - TRANSIT cargo — no local duty/invoice
  │     - Some standalone consignments not part of a batch
  │
  └── efd_code is set at the BATCH level, not the consignment level:
        When operator issues the EFD, they enter the code once and
        the system links it to all consignments with the same in_ref.
```

**DB Rule:** When `in_ref` is not NULL, all consignments sharing that `in_ref` + `client_id` + `year` must share the same `efd_code` and `efd_time`. Setting `efd_code` on one should propagate to all siblings.

**DB Rule:** `in_ref` is scoped per client per year. `TZ3` in 2025 is a different batch from `TZ3` in 2026.

**UI Rule:** When creating a consignment with an existing `in_ref`, the system should auto-fill `efd_code` and `efd_time` from the sibling records. If the batch EFD has not yet been issued, those fields remain blank across all siblings.

---

### 8.5 CONTAINER TYPE → Pipeline Stage Skips and AMOUNT Range

`container_type` is not just a label — it determines which pipeline stages apply and what fee range is expected.

```
container_type
  ├── "CAR"
  │     → efd_code = "PRIVATE" always
  │     → in_ref = NULL always
  │     → tbs_debit_status: not tracked via TBS (privately paid)
  │     → amount range: 50,000 – 75,000 TZS
  │     → vessel_name often blank (RoRo vessels not tracked by name)
  │     → icd_id = vehicle-specific yards (FARION, BLOOMER, ROUTE MASTER,
  │               SSA LOGISTICS, SWIFT CARGO, TRANS AFRICAN, DAR STAR,
  │               DEUMEUM, CHICASA, GALCO KIGA)
  │     → goods_description always includes year + make + model
  │         (e.g., "2015 TOYOTA HARRIER")
  │
  ├── "COIL"
  │     → container_count = number of coil units, NOT physical containers
  │       (e.g., 319 coils, 491 coils, 93 coils)
  │     → icd_id = "DP WORLD" always (steel coils go to DP World)
  │     → client = SEIKO or JOYCE sub-clients always
  │     → amount is calculated per-coil × rate (e.g., 957,000 for 319 coils)
  │     → amount formula observed: ~3,000 TZS per coil unit
  │
  ├── "20FT"
  │     → typically WHITE OIL, SILICON METAL, ADMIXTURES, or TILES
  │     → amount range: 150,000 – 250,000 TZS per 20FT
  │     → client TZ CHINA uses 20FT for WHITE OIL batches of 3 containers
  │
  └── "40FT"
        → standard container, all rules apply normally
        → amount range:
            1 container:   150,000 – 200,000 TZS
            2 containers:  200,000 TZS
            3 containers:  250,000 TZS
            5 containers:  300,000 TZS
            6 containers:  300,000 TZS
            7-9 containers: 300,000 – 500,000 TZS
```

**DB Rule:** If `container_type = "CAR"`, the system must set `efd_type = PRIVATE` automatically and prevent `in_ref` from being set.

**DB Rule:** If `container_type = "COIL"`, the system must display a warning if `icd_id ≠ DP WORLD`.

**Soft Validation:** If `amount` is entered and falls outside the expected range for `container_type + container_count`, show a yellow warning (not a hard block).

---

### 8.6 MANIFEST STATUS → TANESWS STATUS (Hard Prerequisite)

```
manifest_status = "Uploaded"
  └── is required BEFORE tanesws_status can be set to "Done"

manifest_status = "Waiting" or "Action"
  └── tanesws_status must remain "Waiting"
      (cannot lodge customs entry before manifest is uploaded)
```

**API Rule:** `PATCH /consignments/:id/stage` with `tanesws_status: "Done"` must be rejected with HTTP 422 if `manifest_status ≠ "Uploaded"`.

---

### 8.7 SHIPPING BATCH STATUS → TANESWS STATUS (Soft Prerequisite)

```
shipping_batch_status = "CARRY IN END"
  └── signals containers are physically in position at ICD
      TANESWS loading (customs entry) can now proceed
      This is a soft dependency — TANESWS can technically begin
      before CARRY IN END but operators always wait for it

shipping_batch_status = "W/CARRY IN"
  └── containers are being moved but not yet settled
      TANESWS should stay at Waiting or Action
      UI should show a caution indicator if TANESWS is Done
      while batch is still W/CARRY IN
```

---

### 8.8 ASSESSMENT STATUS → TBS LOADING (Hard Prerequisite)

```
assessment_status = "Closed"
  └── means TRA has finalized the duty amount
      Only after this can TBS Loading begin

assessment_status = "Waiting" or "Action"
  └── tbs_loading_status must remain "Waiting"
      No payment can be loaded into TBS before duty is assessed
```

**API Rule:** `tbs_loading_status = "Done"` requires `assessment_status = "Closed"`.

---

### 8.9 TBS LOADING → TBS DEBIT (Hard Prerequisite)

```
tbs_loading_status = "Done"
  └── means the payment record is in TBS, ready to debit

tbs_debit_status = "Paid"
  └── requires tbs_loading_status = "Done"
      Cannot pay what hasn't been loaded

tbs_debit_status = "SHARED"
  └── means duty was paid by another consignment (the primary payer)
      This consignment is a secondary in a shared duty arrangement
      The primary payer's ref_no should be stored in remarks or
      a dedicated shared_with field
      SHARED implies tbs_loading_status = "Done" on the primary record
```

**DB Rule:** If `tbs_debit_status = "SHARED"`, the system should require a `shared_primary_ref` field pointing to the primary consignment's `ref_no`.

---

### 8.10 TBS DEBIT → DUTY STATUS (Direct Mirror)

```
tbs_debit_status = "Paid"
  └── duty_status should automatically be set to "Paid"
      These two fields always match in the source data —
      they are effectively the same state captured twice
      (one at the TBS system level, one at the TRA clearance level)

tbs_debit_status = "SHARED"
  └── duty_status = "Paid" (the duty is still paid, just by another party)

tbs_debit_status = "Waiting" or "Action"
  └── duty_status = "Waiting" or "Action"
```

**DB Rule:** When `tbs_debit_status` is set to `"Paid"`, auto-set `duty_status = "Paid"` unless operator explicitly overrides. This is the most common auto-propagation in the system.

---

### 8.11 DUTY STATUS → INSPECTION FILE (Hard Prerequisite)

```
duty_status = "Paid"
  └── TRA inspection file can now be opened
      inspection_file_status can be set to "Done"

duty_status = "Waiting" or "Action"
  └── inspection_file_status must remain "Waiting"
      TRA will not open an inspection file for unpaid duties
```

**API Rule:** `inspection_file_status = "Done"` or `"SHARED"` requires `duty_status = "Paid"`.

---

### 8.12 INSPECTION FILE → RELEASE STATUS (Hard Prerequisite)

```
inspection_file_status = "Done"
  └── physical release can be authorized
      release_status can be set to "Released"
      release_date is recorded (system timestamp or operator-entered date)

inspection_file_status = "SHARED"
  └── release_status can still be "Released" — SHARED means
      the inspection was done under a combined file but release is individual

inspection_file_status = "Waiting" or "Action"
  └── release_status must remain "Waiting"
      Goods cannot leave the ICD without inspection clearance
```

**API Rule:** `release_status = "Released"` requires `inspection_file_status = "Done"` or `"SHARED"`.

**DB Rule:** When `release_status` is set to `"Released"`, `release_date` must be set. If the operator does not provide it, default to today's date.

---

### 8.13 RELEASE DATE → TURNAROUND TIME (Computed Field)

```
release_date - arrival_date = turnaround_time_days

This is a computed field, never stored directly.
It must be calculated on-the-fly in:
  - The consignment detail view
  - The turnaround time report
  - The client performance report
  - The ICD performance report (avg turnaround per ICD)

If release_date is NULL (job not yet released):
  turnaround_time = today - arrival_date = "days elapsed so far"
  Display as: "In progress: X days"

If release_date is set:
  Display as: "Cleared in X days"

Performance benchmarks (derived from source data):
  Fast clearance:    3–7 days
  Normal clearance:  7–15 days
  Slow clearance:    15–30 days
  Problematic:       30+ days (flag red)
```

---

### 8.14 EFD CODE + EFD TIME → Invoice Batch Verification

```
efd_code (e.g., "03429118")
  ├── is a Tanzania Revenue Authority fiscal receipt number
  ├── is issued AFTER release_status = "Released"
  ├── one EFD code covers one invoice — which may be for
  │     a single consignment or an entire in_ref batch
  │
  ├── if efd_code is the same across multiple consignments:
  │     → those consignments share the same in_ref
  │     → their amounts are summed on one invoice
  │     → efd_time will also be identical across all of them
  │
  ├── efd_time (decimal fraction of day, e.g., 0.5321...)
  │     → convert to time: 0.5321 × 24 = 12.77 hours = 12:46:26
  │     → formula: FLOOR(decimal×24) : FLOOR((decimal×24 % 1)×60) : ROUND(((decimal×24 % 1)×60 % 1)×60)
  │     → some cells contain literal time strings ("14:38:26") — handle both formats
  │     → multiple times in one cell (e.g., "14:38:26, ..43:30") means
  │         multiple EFD receipts were issued — parse into separate EFD records
  │
  ├── efd_code = "PRIVATE"
  │     → container_type = "CAR" always
  │     → no TBS system involvement
  │     → amount is still recorded
  │
  ├── efd_code = "TRANSIT"
  │     → cargo is passing through Tanzania, not imported
  │     → duty_status is not applicable
  │     → release_status logic still applies (cargo must be released to continue journey)
  │
  └── efd_code = NULL (blank)
        → EFD not yet issued
        → release may have happened but invoice not yet generated
        → flag in dashboard as "Released but no EFD"
```

**DB Rule:** When `efd_code` is entered for a consignment that has an `in_ref`, propagate the same `efd_code` and `efd_time` to all other consignments sharing that `in_ref + client_id + year`.

**DB Rule:** `efd_code` should only be settable after `release_status = "Released"`. Attempting to set it before release raises a validation warning (soft, not hard block — operator may pre-fill).

---

### 8.15 GOODS DESCRIPTION → GUTA PAIR DETECTION

`goods_description` encodes a naming convention for motorcycle CKD (Completely Knocked Down) shipments that always arrive in pairs.

```
goods_description pattern: "{batch_code} - GUTA PARTS" and "{batch_code} - FRAMES"

Examples:
  "072C - GUTA PARTS"  ↔  "072C - FRAMES"
  "073A - GUTA PARTS"  ↔  "073A - FRAMES"
  "080E - GUTA PARTS"  ↔  "080E - FRAMES"
  "W9 - GUTA PARTS"    ↔  "W9 - FRAMES"
  "W9 & W6 - GUTA PARTS" ↔ "W9 & W6 - FRAMES"

Pairing rules:
  1. Same batch_code prefix (e.g., "072C", "W9")
  2. Same vessel_name
  3. Same client_id (always TZ CHINA for numbered batches)
  4. Same in_ref
  5. Same efd_code

Container count relationship:
  GUTA PARTS: always 5 or 6 containers (the bulk parts)
  FRAMES:     always 1 container (the frames/chassis)
  Total per batch: 6–7 containers

Amount relationship:
  GUTA PARTS amount is always 2× the FRAMES amount
  FRAMES:      150,000 or 250,000 TZS
  GUTA PARTS:  300,000 or 500,000 TZS (exactly 2×)

Batch code sequencing:
  Codes follow a pattern: 072A, 072B, 072C → 073A, 073B...
  Then W9 series (W9 = motorcycle model Wave 9)
  Then 074A, 074B... → 075A... → 076A... → 077A... → 080E...
  The system should auto-detect the next batch code for TZ CHINA
  when a new GUTA pair is being created.

Detection algorithm:
  When a new consignment is created with goods_description
  containing "GUTA PARTS" or "FRAMES":
    1. Extract batch_code from description
    2. Search for sibling with same batch_code + vessel_name + client_id
    3. If found → link as paired records (guta_pair_id foreign key)
    4. If not found → flag as "UNPAIRED — awaiting sibling"
```

**DB Schema Addition:** Add `guta_pair_id` UUID nullable field on the Consignment table. Two records in a pair point to each other via this field (or use a separate `GutaPair` join table).

**UI Rule:** On the consignment detail view, if `guta_pair_id` is set, show a "Paired with:" card showing the sibling's REF No, B/L, and release status. If one is released and the other is not, show a red warning: "Paired consignment not yet released."

---

### 8.16 CLIENT → ICD (Soft Association)

Certain clients consistently use specific ICDs. This is not a hard rule but a strong pattern used for auto-suggestion and anomaly detection.

```
Client → Expected ICD(s)
  TZ CHINA      → AFRICAN ICD (primary), HESU (secondary)
  HEBERY        → HESU (primary), GALCO UDART, LUNA TRADING
  KEVLA         → ZAMBIA CARGO, ETC CARGO, AFRICAN ICD, LUNA TRADING, DICD
  SEIKO/JOYCE   → DP WORLD (coils always)
  BREE AUTO     → FARION, BLOOMER, ROUTE MASTER, SSA LOGISTICS, SWIFT CARGO
  PEAKPARK      → DP WORLD, GALCO UDART, GALCO - 025
  PDW           → PMM, GALCO UDART, DICD, SALILA
  XIN WANG      → AZAM, GALCO - 025, SILVER, JEFAG, HESU
  KUNLUN        → ZAMBIA CARGO, SALILA, HECO
  SINORA ZM     → GALCO UDART, PMM, AMI (transit, no duty)
  PAPA variants → JEFAG (primary), SILVER, TRH, GALCO UDART
```

**UI Rule:** When `client_id` is selected on a new consignment form, auto-suggest the most commonly used ICD for that client. Operator can override.

**Anomaly Detection:** If a consignment is saved with a client+ICD combination that has never appeared before, log a soft warning for admin review.

---

### 8.17 REMARKS → System Flags

The `remarks` field is freeform but contains operational flags that the system must parse and act on.

```
remarks value          → system behavior
─────────────────────────────────────────────────────
"PREPARED"             → consignment is pre-lodged and ready;
                         show in "Ready to Process" queue

"FAILED"               → something failed in the process;
                         flag red in dashboard;
                         require operator to add resolution note

"WAITING REG"          → goods released but awaiting registration
                         (e.g., vehicle registration plate);
                         show in "Post-Release Pending" queue

"SHARED"               → this consignment's costs are shared with
                         another party; link to primary consignment

"PAID, REFUND NEEDED"  → duty was overpaid; flag for finance review;
                         show in "Pending Refunds" report

"possed2be [name]"     → informal note meaning "this should belong
                         to [client name]"; flag for admin to
                         verify client assignment

"TRANSIT"              → (also appears in remarks occasionally)
                         same as efd_code = TRANSIT rules

NULL / blank           → no special handling
```

**DB Rule:** The system should parse `remarks` on save and set internal boolean flags: `is_failed`, `is_waiting_registration`, `is_refund_pending`, `is_shared`. These flags drive dashboard widgets and reports, not the raw remarks text.

---

### 8.18 CONTAINER COUNT → AMOUNT (Soft Validation Formula)

The fee charged (`amount`) is directly correlated with `container_count` and `container_type`. The system uses this to validate entries and flag errors.

```
For container_type = "40FT":
  container_count = 0.5  → amount ≈ 50,000    (half container, shared)
  container_count = 1    → amount ≈ 150,000
  container_count = 2    → amount ≈ 200,000
  container_count = 3    → amount ≈ 250,000
  container_count = 4    → amount ≈ 250,000–300,000
  container_count = 5    → amount ≈ 300,000
  container_count = 6    → amount ≈ 300,000
  container_count = 7    → amount ≈ 300,000
  container_count = 8    → amount ≈ 300,000
  container_count = 9    → amount ≈ 300,000
  container_count > 9    → amount = 300,000+ (negotiated)

For container_type = "CAR":
  amount = 50,000 (standard)
  amount = 75,000 (luxury/special)

For container_type = "20FT":
  amount ≈ 150,000 – 250,000 per unit

For container_type = "COIL":
  amount ≈ container_count × 3,000 TZS
  (317 coils → 957,000; 491 coils → 1,473,000)

GUTA PARTS / FRAMES ratio rule:
  Within a GUTA pair:
    GUTA PARTS amount = exactly 2 × FRAMES amount
    If this ratio is violated → validation warning
```

**UI Rule:** When `container_count` and `container_type` are entered, show a suggested `amount` range in a helper text below the amount field. The operator can accept or override.

---

### 8.19 TANSAD NO → YEAR and SEQUENCE (Structural Insight)

```
tansad_no structure:
  2025 entries: 7-digit numbers starting from ~1,253,895
                incrementing through ~1,801,727
                These are TRA-issued sequential numbers within the fiscal year

  2026 entries: 7-digit numbers starting from ~1,001,455
                (fiscal year resets at TRA)
                incrementing through ~1,291,581

  This means:
    tansad_no alone can imply the year
    If tansad_no < 1,100,000 → likely 2026
    If tansad_no > 1,200,000 → likely 2025
    (Use year field as authoritative; tansad_no as cross-check)

  tansad_no is assigned by TRA AFTER the customs entry is lodged via TANESWS.
  Therefore:
    tansad_no being NULL → tanesws_status must be "Waiting" or "Action"
    tansad_no being set → tanesws_status should be "Done"
    If tanesws_status = "Done" but tansad_no is NULL → data error, flag it
```

**DB Rule:** If `tanesws_status` is set to `"Done"` and `tansad_no` is NULL, the system must show a validation warning: "TANSAD number missing — please enter the TRA-assigned number."

---

### 8.20 REF NO → Job Identity and Cross-Year Uniqueness

```
ref_no (e.g., "9900001")
  ├── is the company's own internal job number
  ├── format: always 7 digits starting with "99"
  ├── is NOT reset per year — it is a global sequence
  │     (9900001 in 2025 is a different job from 9900001 in 2026 only by year)
  │     Note: the source data reuses ref_no across years (both years start at 9900001)
  │     This means ref_no + year is the true unique key, not ref_no alone
  │
  ├── some 2026 entries show ref_no as "900282" (missing leading "9") —
  │     this is a data entry error in the source; the system should
  │     auto-correct to "9900282" during import and flag for review
  │
  └── ref_no is used as the primary human-readable identifier in:
        - verbal communication with clients
        - TRA correspondence
        - Internal filing
        The system must display ref_no prominently on all views
```

**DB Rule:** Unique constraint on `(ref_no, year)` — not just `ref_no`.

**Import Rule:** If `ref_no` starts with fewer than 7 digits during import, pad with leading "9" and flag for manual review.

---

### 8.21 Full Dependency Chain Summary

The complete trigger chain, from first data entry to final closure:

```
1. vessel_name + arrival_date entered
       ↓ starts the clock; groups voyage siblings
2. bl_number entered
       ↓ must be unique; links to ICD and manifest group
3. manifest_status → "Uploaded"
       ↓ prerequisite for step 4
4. shipping_batch_status → "CARRY IN END"
       ↓ containers physically positioned; soft prerequisite for step 5
5. tanesws_status → "Done"
       ↓ customs entry lodged; tansad_no must be entered
6. assessment_status → "Closed"
       ↓ TRA duty amount finalized; prerequisite for step 7
7. tbs_loading_status → "Done"
       ↓ payment record loaded in banking system; prerequisite for step 8
8. tbs_debit_status → "Paid"  (or "SHARED")
       ↓ auto-triggers step 9
9. duty_status → "Paid"  [auto-propagated from step 8]
       ↓ prerequisite for step 10
10. manifest_comp_status → "Done"
       ↓ all manifest formalities complete
11. inspection_file_status → "Done"  (or "SHARED")
       ↓ TRA physical inspection cleared; prerequisite for step 12
12. release_status → "Released"
       ↓ auto-sets release_date = today
       ↓ turnaround_time = release_date - arrival_date is now final
13. efd_code + efd_time entered
       ↓ invoice issued; propagated to all in_ref siblings
       ↓ if in_ref is set: all siblings get same efd_code + efd_time
14. JOB COMPLETE ✓
```

**Special exits from the standard chain:**

```
container_type = "CAR"
  → steps 7–9 (TBS) are handled privately; skip TBS tracking
  → efd_code = "PRIVATE" always
  → jump from step 6 (assessment) → step 11 (inspection) directly

container_type with efd_code = "TRANSIT"
  → steps 6–9 (duty) are not applicable
  → jump from step 5 (TANESWS) → step 11 (inspection/transit release)

tbs_debit_status = "SHARED"
  → this consignment piggybacks on another's payment
  → shared_primary_ref must be set pointing to the paying consignment
  → steps 7–9 are "Done" by proxy; proceed to step 10
```

---

## 9. Screens & Views

### 8.1 Main Dashboard
- Pipeline funnel (count per stage)
- Arrivals this week
- Revenue this month
- Stuck jobs list
- Quick-add consignment button

### 8.2 Consignment List View
- Table with columns: REF No, Client, B/L, Vessel, ARR Date, ICD, Current Stage, Amount
- Color-coded rows: green = released, amber = in progress, red = stuck
- Sortable by any column
- Inline stage update buttons

### 8.3 Consignment Detail View
- All fields displayed
- Visual pipeline with stage indicators
- Edit history / audit log tab
- Linked GUTA pair (if applicable)
- Linked batch (IN REF group)
- EFD record(s)

### 8.4 Client View
- All consignments for a client
- Total containers, total revenue, average clearance time
- Active jobs vs completed

### 8.5 Reports View
- Report selector dropdown
- Date range picker
- Output table + export buttons

### 8.6 Import View
- File upload
- Preview table
- Validation errors shown inline
- Confirm / cancel import

### 8.7 Settings
- Manage clients (add/edit/deactivate)
- Manage ICDs
- Manage users and roles
- Alert threshold configuration (default: 48 hours)

---

## 10. Technical Requirements

### 9.1 Stack Recommendation

| Layer | Recommendation | Notes |
|-------|----------------|-------|
| Frontend | React (with TypeScript) | Component-based, fast rendering for large tables |
| Backend | Node.js + Express **or** Supabase (BaaS) | Supabase preferred for speed; aligns with your existing Lenus App stack |
| Database | PostgreSQL | Relational, supports FK constraints for pipeline integrity |
| Auth | Supabase Auth **or** JWT-based | Role support: admin, operator, viewer |
| File parsing | `xlsx` (SheetJS) | For Excel import/export |
| Hosting | Vercel (frontend) + Supabase (backend/DB) | Low cost, fast setup |

### 9.2 API Endpoints (Core)

```
GET    /consignments              → List all (with filters)
POST   /consignments              → Create new
GET    /consignments/:id          → Get single
PUT    /consignments/:id          → Update (full)
PATCH  /consignments/:id/stage    → Update single pipeline stage
DELETE /consignments/:id          → Soft delete

GET    /clients                   → List clients
POST   /clients                   → Create client
PUT    /clients/:id               → Update client

GET    /efd                       → List EFD records
POST   /efd                       → Create EFD record
PATCH  /efd/:id                   → Update EFD

GET    /reports/:type             → Generate report
POST   /import/xlsx               → Import from Excel
GET    /import/:job_id/status     → Check import job status

GET    /dashboard                 → Dashboard summary data
```

### 9.3 Excel Import Parser Rules

The importer must handle the source file's structure:

- **Year separator rows**: Rows containing only a year value (e.g., `2025`, `2026`) split the data into yearly sections
- **Column mapping**: Map the 28 source columns to the data model fields above
- **Date conversion**: Excel serial dates (e.g., `45782`) must be converted to ISO dates
- **Decimal time**: EFD time stored as decimal fraction of day must be converted to `HH:MM:SS`
- **Empty rows**: Skip rows where REF No and TANSAD No are both blank (these are summary/footer rows)
- **Multiple EFD codes in one cell**: Some cells contain comma-separated EFD codes (e.g., `03429127, ..131`) — parse and create multiple EFD records

---

## 11. Non-Functional Requirements

| Requirement | Specification |
|-------------|---------------|
| **Performance** | List view loads 500+ records in < 2 seconds |
| **Concurrency** | Multiple operators can update different consignments simultaneously without conflict |
| **Audit Trail** | Every field change is logged with: old value, new value, user, timestamp |
| **Data Integrity** | Pipeline stage order is enforced at the API level, not just UI |
| **Mobile** | Responsive design; operators should be able to update status from a phone |
| **Backup** | Daily automated database backup |
| **Uptime** | 99.5% (standard Supabase/Vercel SLA) |
| **Security** | All API routes require authentication; role checks on every mutation |

---

## 12. Out of Scope

The following are explicitly **not** included in v1:

- Direct integration with TRA/TANCIS/TANESWS systems (status is entered manually by operators)
- Client-facing portal (clients cannot log in to check their own consignment)
- Invoicing / billing module (amount is recorded, but PDF invoice generation is v2)
- Mobile native app (responsive web is sufficient for v1)
- Multi-company / multi-branch support
- Automated duty calculation

---

## 13. Appendix: Reference Data

### 13.1 Known Clients (from source data)

| Client Name | Sub-Labels | Primary Goods |
|-------------|------------|---------------|
| TZ CHINA | — | Motorcycles, parts, eBikes, tyres, oil |
| BREE AUTO | — | Used vehicles |
| HEBERY | — | Tyres |
| KEVLA | — | Spare parts, GUTAs |
| SEIKO | — | Steel coils, machines |
| XIN WANG | — | Tyres |
| PAPA | SAAJT, YAKET, MOTA, HUAXIA, SAMYI | Mixed |
| PEAKPARK | — | Cranes, machines |
| PDW | — | Aluminium alloys, rim parts |
| MUKI (T) | — | Plates, materials |
| JOYCE | PHOENIX, SEIKO, TITANIUM, ZHONGJI, VMEN, HALO, TIANYU, BEIJING | Varied |
| KUNLUN | — | Tyres |
| ALEX | ADH, BRADESH, MAWAZO, GERALD, ZEAL | Fridges, electronics |
| SINORA ZM | — | Motorcycles (transit) |
| TOPRICH | — | Tyres |
| DRACAENA | — | Mosquito nets |
| ROYAL ROAD | — | Welding machines |
| WANGTEK | — | Hardware, tiles |
| COSMАС | — | Essentials |
| CONFORT | — | Vehicles |
| CALISTA | — | Vehicles |
| JOHNSON | — | Vehicles |
| NAJИBU | — | Tyres |
| DIANA | — | Vehicles |

### 13.2 Known ICDs

`AFRICAN ICD`, `GALCO UDART`, `GALCO`, `GALCO - 025`, `GALCO KIGA`, `GALCO 025`,
`HESU`, `DP WORLD`, `DICD`, `SSA LOGISTICS`, `FARION`, `BLOOMER`, `ZAMBIA CARGO`,
`SWIFT CARGO`, `SILVER`, `AZAM`, `PMM`, `TRH`, `EAST COAST`, `LUNA TRADING`,
`TRANS AFRICAN`, `ROUTE MASTER`, `AMI`, `AL-HUSHOOM`, `JEFAG`, `TEAVTL`, `TEAGTL`,
`DEUMEUM`, `SALISLA`, `ETC CARGO`, `HECO`, `TPA MTWARA`, `TPA TANGA`, `TPA DAR`,
`NAMANGA BDR`, `FAB INTERNATIONAL`, `CHICASA`

### 13.3 Pipeline Status Values

| Stage | Possible Values |
|-------|----------------|
| Manifest | `Waiting`, `Action`, `Uploaded` |
| Shipping Batch | `Waiting`, `Action`, `PREPARED`, `CARRY IN END`, `W/CARRY IN`, `Done` |
| TANESWS Loading | `Waiting`, `Action`, `Done` |
| Assessment | `Waiting`, `Action`, `Closed` |
| TBS Loading | `Waiting`, `Action`, `Done` |
| TBS Debit | `Waiting`, `Action`, `Paid`, `SHARED` |
| Manifest Comp | `Waiting`, `Action`, `Done` |
| Duty Status | `Waiting`, `Action`, `Paid` |
| Inspection File | `Waiting`, `Action`, `Done`, `SHARED` |
| Release Status | `Waiting`, `Released` |

### 13.4 Container Count Summary (from source data)

| Total Containers | 1,742.5 |
|-----------------|---------|
| Year 2025 | ~850 containers (est.) |
| Year 2026 | ~892.5 containers (est.) |

---

*This PRD is based on analysis of `TRACKER_--_KDL.xlsx` as used by Kingdao Logistics (logisticskingdao@gmail.com). All field names, business rules, and pipeline stages are derived directly from the existing operational tracker.*
