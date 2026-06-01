# KDL Import Consignment Tracker — Operating Manual & Guide

> **Start here:** For the complete operator guide (daily workflows, Excel legacy, mobile usage, and app vs spreadsheet comparison), read **[README.md](README.md)** first. This document adds deeper technical detail for interns who want to understand how the system is built.

**Welcome to Kingdao Logistics!** 

If you are a new intern who has just joined the team, this document is your golden key. Whether you know nothing about shipping cargo across the ocean (Logistics) or how web applications are built (Code), this guide will explain both in simple, friendly, and complete terms. 

By the end of this guide, you will understand exactly what this app does, how to use it, why each feature exists, and how the underlying technology works. Let's get started!

---

## 1. What is Kingdao Logistics & What is This App?

**Kingdao Logistics (KDL)** is a customs clearing and forwarding company based in Dar es Salaam, Tanzania. 

### What do we do?
Imagine a business in Tanzania orders 10,000 motorcycles or 50 tons of steel coils from China. These goods are packed into metal shipping containers, loaded onto massive cargo ships, and sailed across the ocean to the Port of Dar es Salaam. 

However, a shipping container cannot just roll off the ship and drive away! The government of Tanzania needs to inspect it, verify that it isn't dangerous, calculate the taxes (customs duty), collect standard fees, and officially authorize its entry. This process is called **customs clearance**. 

Because this involves multiple government departments, ports, banks, and storage depots, it is incredibly complex. If a container gets stuck at any point, KDL has to pay heavy penalty fees called **demurrage** or storage fees.

### What does this app do?
Historically, KDL managed over 400 shipments a year using a single, massive, shared Microsoft Excel spreadsheet (`TRACKER_--_KDL.xlsx`). 
This Excel sheet was a headache:
* Only one person could edit it at a time without breaking things.
* It was easy to accidentally delete rows or type wrong numbers.
* Finding out *which* shipment was stuck and *where* it was stuck required scrolling through hundreds of rows manually.
* Anyone could edit financial data, which is a big security risk.

**KDL Tracker** is a modern, real-time web application that replaces that old Excel sheet. It serves as a **"Control Tower"** for KDL's entire operation, allowing everyone (operators, managers, and clients) to see exactly where every single shipment is in real-time, who is working on it, and what needs to happen next to get it cleared.

---

## 2. Logistics 101: Jargon Buster

Before looking at the code or the UI, you need to understand the basic terms used in the shipping world:

| Term | What it stands for | Simple Analogy / Explanation |
| :--- | :--- | :--- |
| **Consignment** | Shipment / Job | A single order of goods that we are hired to clear. This is the core record in our system. It could be one container, a batch of containers, or a single imported vehicle. |
| **B/L or Bill of Lading** | B/L Number | The "tracking number" or "receipt" issued by the shipping line (the company that owns the cargo ship). It is the unique identifier for a specific set of cargo. |
| **Vessel** | Cargo Ship | The massive ship carrying the containers across the ocean. |
| **TANSAD No.** | Tanzania Single Administrative Document | The official customs declaration form submitted to the Tanzania Revenue Authority (TRA). Think of it as the shipment's "tax return" form. |
| **ICD** | Inland Container Depot | A secure inland storage yard where containers are moved from the crowded port while they wait to clear customs. Examples: *African ICD*, *Galco Udart*, *Hesu*. |
| **IN REF** | Invoice Reference | A billing code (like `TZ3` or `HB1`) that groups multiple shipments together because they belong to the same client and are invoiced as a single combined batch. |
| **EFD Code** | Electronic Fiscal Device Receipt | A legal fiscal receipt code issued under the Tanzania Revenue Authority (TRA) system for billing. Think of it as the official tax receipt for KDL's service fees. |

---

## 3. The 11-Stage Clearance Pipeline

Every single shipment that KDL handles goes through a strict **11-stage clearance pipeline**. Think of this like a board game where a token must land on every square in order from start to finish. A stage starts as `Waiting` (grey), moves to `Action` (amber - someone is actively working on it), and finally reaches its completed state (green).

Here is the exact journey of a shipment:

```
1. Manifest Uploaded
       ↓
2. Shipping Batch Processed (Carry-In to ICD)
       ↓
3. TANESWS Loading Done
       ↓
4. Assessment Closed (Taxes Calculated by TRA)
       ↓
5. TBS Loading Done
       ↓
6. TBS Debit Paid (Standards Fee Paid)
       ↓
7. Manifest Complete
       ↓
8. Duty Paid (Customs Import Taxes Paid)
       ↓
9. Inspection File Done (Goods Physically Inspected)
       ↓
10. Released (Goods leave the Depot!)
       ↓
11. EFD Issued (Fiscal Receipt Issued to Client)
```

### The 11 Stages Explained in Plain English:
1. **Manifest Uploaded (`manifest_status`)**: The cargo ship sends a list of everything on board (the manifest) to Tanzania Customs. We cannot start until this list is officially uploaded.
2. **Shipping Batch (`shipping_batch_status`)**: The containers are offloaded from the ship and moved to their designated storage yard (the ICD). When they have arrived and settled at the yard, it is marked as `CARRY IN END` (Done).
3. **TANESWS Loading (`tanesws_status`)**: We log into the Tanzania Electronic Single Window System (TANESWS) and upload all the cargo documents to begin the clearance process.
4. **Assessment Closed (`assessment_status`)**: The Tanzania Revenue Authority (TRA) reviews our documents and calculates exactly how much customs tax (duty) KDL's client needs to pay. Once this tax amount is locked in, the assessment is "Closed".
5. **TBS Loading (`tbs_loading_status`)**: We load the shipment information into the Tanzania Bureau of Standards (TBS) system to ensure the imports comply with safety standards.
6. **TBS Debit Paid (`tbs_debit_status`)**: We pay the standard TBS verification fees.
7. **Manifest Complete (`manifest_comp_status`)**: We finalize the customs documentation, matching the physical containers to the manifest entries.
8. **Duty Paid (`duty_status`)**: The client pays the main import tax (customs duty) assessed in Step 4. (Usually, when TBS Debit is Paid, this stage is paid simultaneously).
9. **Inspection File (`inspection_file_status`)**: Customs officers open an inspection file and physically inspect the cargo inside the containers to confirm they match the paperwork.
10. **Released (`release_status`)**: The ultimate goal! The government issues a "Release Order". The security gates open, the containers are loaded onto trucks, and they leave the ICD.
11. **EFD Issued (`efd_code` / `efd_time`)**: We issue the official legal tax receipt to the client for our clearing fees, and the job is marked 100% complete and closed.

> [!IMPORTANT]
> **Strict Progression Rules:**
> You cannot cheat the pipeline! The database enforces real-world logic. For example:
> * You cannot start **TANESWS Loading** (Step 3) until the **Manifest** (Step 1) is uploaded.
> * You cannot pay **TBS Debit** (Step 6) until the tax **Assessment** (Step 4) is closed.
> * You cannot **Release** the goods (Step 10) until the **Inspection File** (Step 9) is done.

---

## 4. Special Rules & Case Studies

Not all shipments are identical. Our business has a few unique exceptions that the app handles automatically:

### 1. PRIVATE Cargo (Imported Cars)
* **What is it?** A private individual imports a personal car (e.g., a "2015 Toyota Harrier") instead of a business container.
* **App Rules:** Cars do not go through the TBS system. The app automatically skips the TBS stages, sets `efd_code` to `PRIVATE`, and blocks these rows from being added to a shared business invoice batch (`in_ref` = NULL).

### 2. TRANSIT Cargo
* **What is it?** Cargo that lands at Dar es Salaam Port but is just passing through Tanzania on its way to another landlocked country like Zambia, Malawi, or Rwanda.
* **App Rules:** Because the goods are not staying in Tanzania, the client does not pay local customs taxes. The app flags these as `TRANSIT`, bypasses the local Duty status checks, and marks the final EFD as `TRANSIT`.

### 3. Steel Coils (COIL)
* **What is it?** Heavy steel coils imported in bulk by industrial clients like *Seiko* or *Joyce*. 
* **App Rules:** Unlike other containers, steel coils are not counted by physical boxes, but by the number of raw coils (e.g. "319 coils"). These always go to the *DP World* terminal. The app warns operators if a `COIL` shipment is assigned to any other yard.

### 4. GUTA Parts & Frames (The Split Motorcycle Mystery)
* **What is it?** KDL's biggest client imports motorcycle parts. For shipping safety and logistics reasons, the shipping line splits a single batch of motorcycles into two different bills of lading:
  1. **GUTA PARTS**: 5 or 6 containers carrying the actual engines, wheels, and gears.
  2. **FRAMES**: 1 container carrying just the structural metal frames/chassis.
* **The Rule:** The parts and the frames are useless without each other. They must arrive on the same ship, go to the same yard, and be cleared **together**. If an operator clears and releases the parts but leaves the frames stuck at the port, the client will be extremely unhappy because they can't assemble the motorcycles!
* **How the App Helps:** The app has a smart trigger that monitors the description of incoming goods. When it detects `073C - GUTA PARTS` and `073C - FRAMES`, it automatically links them behind the scenes. If one is marked "Released" but the other is still stuck in customs, the app flashes a bright **red warning banner** on both detail screens to alert the operator.

### 5. Invoice Batches (IN REF)
* **What is it?** Often, we clear a batch of 2 to 6 containers for a client simultaneously. Instead of writing separate invoices and receipts for each container, we issue **one combined bill** and **one EFD tax receipt** for the entire batch.
* **How the App Helps:** Shipments with the same invoice reference (like `TZ3`) are visually linked. When you enter the EFD receipt code and time on *one* shipment in that batch, the app automatically copies and links that receipt code to *all* other shipments in that invoice batch, saving operators hours of manual data entry!

---

## 5. How to Navigate and Use the App

Let’s walk through the user interface (UI) so you know exactly where to click. The app is divided into several main sections accessible via the sidebar.

```
Sidebar Navigation:
 ├── Dashboard          (The high-level status board)
 ├── Pipeline           (The drag-and-drop Kanban board)
 ├── Consignments       (The search & filter spreadsheet view)
 ├── Inbox              (Your personal to-do list)
 ├── EFD Records        (The tax receipt manager)
 ├── Reports            (Financial and operations stats)
 └── Settings           (Admin-only user & role setup)
```

### 5.1 The Dashboard (Your Control Center)
When you log in, this is your home screen. It gives a summary of how the company is performing:
* **KPI Tiles**: Quick counts of:
  * *Released Today*: How many jobs successfully left the port today.
  * *Pending Release*: All active, unfinished jobs currently in the pipeline.
  * *Stuck > 48 Hours*: Shipments that have been stuck in an "Action Needed" stage for more than 2 days.
  * *Revenue (Current Month)*: A live count of the service fees KDL has earned from completed jobs this month.
* **Pipeline Funnel**: A visual bar chart showing how many shipments are currently sitting at each of the pipeline stages. If you see a massive spike in the "Assessment" bar, you immediately know there is a bottleneck at the tax department!
* **Arrivals This Week**: A neat chronological list of cargo ships scheduled to dock in Dar es Salaam from Monday to Sunday.
* **Overdue Jobs**: A top-10 list of shipments that have been stuck the longest, showing exactly which stage is blocking them and for how many hours.

---

### 5.2 The Pipeline View (The Kanban Board)
This is a visual representation of all active shipments, modeled after a Kanban board (similar to Trello):
* **Columns**: Each column represents one of the pipeline stages (Manifest -> Shipping Batch -> ... -> Released).
* **Cards**: Each shipment is a rectangular card showing the REF Number, Client Name, B/L Number, and Container count.
* **Drag-and-Drop**: As an operator completes a task in the real world, they simply drag the card from one column to the next. This automatically updates the database and logs the timestamp.
* **Going Backwards is Guarded**: In the shipping world, once a step is completed, it should almost never go backward unless a serious error occurred. 
  * If an operator drags a card backwards, the app will block the action and show a prompt.
  * Only **Admins** have the authority to move a card backward, and they are required to type a formal reason (e.g., "TRA rejected the document, re-submitting"). This reason is saved in the audit log forever.

---

### 5.3 The Action Inbox (Your Personalized Todo List)
If you are an operator, you don’t want to be distracted by 100 shipments that are waiting for other people. The **Inbox** is a filtered view built just for you:
* It scans all active shipments and displays **only** the cards where:
  1. A stage is currently in the `Action` state, **and**
  2. You have official write permission to edit that specific stage.
* This turns the app into a focused task manager: you log in, open your Inbox, complete the tasks listed there, drag them to Done, and your Inbox clears out!

---

### 5.4 The Consignments View (The Spreadsheet View)
Sometimes you need to find a needle in a haystack. The **Consignments** screen is a powerful, highly searchable table:
* **Search Box**: Instantly search across all shipments by REF No, TANSAD No, B/L No, Client Name, Vessel Name, EFD Code, or Invoice Batch (`IN REF`).
* **Filters**: Drill down by Financial Year (e.g. 2025 vs 2026), Client, Inland Depot (ICD), Container Type, or specific flags like "Stuck shipments only" or "Unreleased shipments only".
* **Batch Drawer**: If a shipment belongs to an invoice batch (like `TZ3`), a small badge appears. Clicking it slides out a **right-side drawer panel** showing a summary of the entire batch:
  * Every sibling shipment in that invoice.
  * The total number of containers in the batch.
  * The total service fee amount summed up.
  * Combined release status of all shipments.
  * A quick button to generate a shared EFD tax receipt for the entire batch.

---

### 5.5 Consignment Detail View (The Complete Folder)
Clicking on any shipment opens its complete virtual folder. It is split into three clean tabs:
1. **Overview Tab**: 
   * **Core Details**: REF No, Client, B/L No, Vessel Name, Arrival Date, ICD, and Invoice Reference.
   * **Visual Pipeline**: A linear tracker showing all 11 stages. You can click a stage badge to instantly advance it without opening a complex form!
   * **GUTA Pair Indicator**: If this shipment is a motorcycle parts shipment, it displays a card showing the linked Frames shipment (or vice versa), including its current status and a red warning if they aren't in sync.
   * **Linked EFD Records**: Shows any tax receipts associated with this shipment.
2. **Audit Log Tab**: Shows a complete, un-editable history of every single change made to this shipment. It lists *who* changed *what field*, the *exact date/time*, the *old value*, and the *new value*.
3. **Remarks Tab**: Contains freeform operational notes (like "PAID, REFUND NEEDED" or "FAILED").

---

### 5.6 EFD Records Manager
This is where the finance team tracks tax invoice receipts:
* Search and list all active EFD receipt numbers.
* Create a new EFD record and link it to one or many shipments (or an entire invoice batch).
* Flags warning alerts if a shipment was released more than 7 days ago but no EFD receipt has been recorded yet.

---

### 5.7 Settings (Users & Roles — Admin Only)
As a security-first application, KDL Tracker lets admins control exactly who can do what:
* **User Management**: Admins can invite new employees, assign them a job role, or temporarily deactivate them if they leave the company.
* **Role-Based Column Access Matrix**: This is a superpower of our app. Instead of just "can edit" or "cannot edit" the whole shipment, admins can set permissions **field-by-field**.
  * For example, a role called `Junior Operator` can be given permission to update `manifest_status` and `shipping_batch_status`, but is blocked from viewing or editing the `amount` (service fee) field or the `efd_code` field!

---

## 6. How it Works Under the Hood (For Tech-Curious Interns)

If you are interested in how the software works, here is a simple breakdown of our technical architecture.

```
                  ┌──────────────────────────────┐
                  │      Next.js Frontend        │
                  │   (React 19 & Tailwind 4)   │
                  └──────────────┬───────────────┘
                                 │
                 Queries &       │ Realtime
                 Actions (JWT)   │ Subscriptions
                                 ▼
                  ┌──────────────────────────────┐
                  │       Supabase Cloud         │
                  │ (Postgres, Auth, Edge Funcs) │
                  └──────────────────────────────┘
```

### 1. The Core Tech Stack
* **Next.js 16 (App Router)**: A modern web framework that uses **React** to build user interfaces. The code is written in **TypeScript** (which is JavaScript but with strict rules to prevent coding typos).
* **Tailwind CSS 4**: A modern styling engine that makes the app look premium, clean, and beautiful (supporting dark mode automatically).
* **Supabase Cloud**: Our backend-as-a-service. It provides:
  * **Postgres Database**: The structured warehouse where all shipments, users, and logs are stored.
  * **Supabase Auth**: The secure system that handles logins, passwords, and user sessions.
  * **Realtime engine**: A web socket connection. When Operator A drags a card on their computer, Supabase instantly broadcasts this event to Operator B's computer, updating their screen in less than a second without refreshing!

### 2. Row Level Security (RLS) & Column Security
In most simple web apps, if a hacker gets access to the API, they can download the entire database. Our app uses **Row Level Security (RLS)** built directly into the Postgres database.
* The database itself inspects the user's login token (JWT) on **every single query**.
* If a `Viewer` tries to bypass the website and send a direct update command to change a shipment's tax amount, the database itself rejects the command before it even reaches the data!
* Per-column write permissions are validated both in the React frontend (disabling inputs) and in the Postgres database trigger rules (rejecting unauthorized updates).

### 3. The Append-Only Audit Trail
Every single time a record is inserted, updated, or soft-deleted, a database **trigger** (a tiny script that runs automatically inside the database) fires.
* It records the event, the email of the person who did it, the field name, the old value, and the new value.
* This log is **append-only**—meaning no one, not even an Admin, has the ability to delete or modify the audit history. This guarantees 100% accountability!

### 4. Soft Deletes
We never truly destroy data. When an admin deletes a consignment, the app performs a **Soft Delete**.
* It simply sets a timestamp column called `deleted_at` to the current time.
* All standard screens automatically filter out rows where `deleted_at` is set.
* If a shipment was deleted by mistake, an admin can navigate to the secret Archive vault and restore it instantly with one click!

### 5. Automated Stuck-Job Alerts
A custom **Edge Function** (a serverless script running on the cloud) is scheduled to run every 30 minutes.
* It queries the database view `v_stuck_stages` to find any shipment that has been in an `Action` stage for more than 48 hours.
* To prevent flooding admins with hundreds of emails, it keeps a "ledger" of what it has already reported.
* If it finds newly-stuck shipments, it compiles them into a single, beautiful **digest email** and sends it to all registered Admins via the **Resend** email service. Once a job is unstuck, it is cleared from the ledger.

---

## 7. Welcome Aboard!

You are now fully equipped with all the logistics and technical knowledge needed to master the KDL Import Consignment Tracker. 

* If you are an **operator**, open your **Inbox** and start clearing those shipments!
* If you are an **administrator**, keep an eye on the **Dashboard** and coordinate your team!
* If you are a **developer**, look through `src/` knowing that security, data integrity, and real-time speed are the core pillars of this codebase. 

If you have any questions, don't hesitate to ask a senior teammate. Good luck!
