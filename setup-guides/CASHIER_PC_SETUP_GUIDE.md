# 🛒 Isra POS — Cashier PC Silent Setup & Deployment Guide

This guide details how to set up a dedicated **Cashier PC** with **100% Silent Background Printing** and **Zero Cashier Maintenance**.

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────┐            ┌────────────────────────────────────────┐
│          MAIN SERVER PC              │            │              CASHIER PC                │
│  - MySQL Database                    │   LAN      │  - Google Chrome (Kiosk Mode)          │
│  - Backend Server & API              │ ─────────> │  - Isra Print Agent (Silent Background)│
│  - Hosts Web POS on Port 3001        │            │  - Thermal USB Printer (Direct ESC/POS)│
│  (Requires Node.js, MySQL, pnpm)     │            │  (NO Node.js / NO MySQL needed!)       │
└──────────────────────────────────────┘            └────────────────────────────────────────┘
```

---

## 📦 What to Copy to the Cashier PC

You only need to transfer **two items** from this project to the Cashier PC:

1. **`print-agent` folder** ➔ Copy to `C:\IsraPOS-PrintAgent` (or `Documents\print-agent`).
2. **`kiosk` folder** ➔ Copy to the Cashier PC (or copy `kiosk\Launch_POS_Kiosk.bat` to Desktop).

> [!NOTE]
> The Cashier PC does **NOT** need Node.js, Git, pnpm, MySQL, or the source code repository.

---

## 🚀 3-Step Setup (Under 2 Minutes)

### Step 1: Connect the Thermal Printer
1. Plug the thermal receipt printer into the Cashier PC via **USB**.
2. Turn on the printer and install its official Windows driver (e.g., Xprinter, POS-58/80, Epson, etc.).
3. Open Windows **Settings ➔ Bluetooth & devices ➔ Printers & scanners**.
4. Set the thermal printer as the **Default Printer** (or verify its printer name).

---

### Step 2: Install the Silent Print Agent (Runs on Boot)
1. Open the copied `print-agent` folder (e.g., `C:\IsraPOS-PrintAgent`).
2. **Right-click `Install_Service.bat`** and select **"Run as administrator"**.
3. Press any key when prompted.

> [!TIP]
> **What this does:** It registers `IsraPrintAgent.exe` as a Windows Scheduled Background Task. The print agent will now start **100% invisibly in the background** every time the computer turns on. No terminal or command prompt window will ever open.

---

### Step 3: Configure the POS Launcher
1. In the `kiosk` folder (or on Desktop), right-click **`Launch_POS_Kiosk.bat`** and choose **Edit** (with Notepad).
2. Change the server URL to your Main Server's local IP address (e.g., `192.168.1.100`):

```bat
@echo off
title Isra POS Kiosk

:: 1. Silently ensure Print Agent is running (0 windows opened)
if exist "%~dp0print-agent\Start_Print_Agent.vbs" (
    wscript.exe "%~dp0print-agent\Start_Print_Agent.vbs"
) else if exist "%~dp0..\print-agent\Start_Print_Agent.vbs" (
    wscript.exe "%~dp0..\print-agent\Start_Print_Agent.vbs"
) else if exist "C:\IsraPOS-PrintAgent\Start_Print_Agent.vbs" (
    wscript.exe "C:\IsraPOS-PrintAgent\Start_Print_Agent.vbs"
)

:: 2. Launch Chrome POS in Fullscreen Kiosk Mode (Replace IP with your Server IP)
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --kiosk ^
  --kiosk-printing ^
  --user-data-dir="C:\ChromePOSProfile" ^
  --unsafely-treat-insecure-origin-as-secure="http://192.168.1.100:3001" ^
  --disable-features=AutofillServerCommunication,PasswordManager,BlockInsecurePrivateNetworkRequests ^
  --no-first-run ^
  --no-default-browser-check ^
  --password-store=basic ^
  --app=http://192.168.1.100:3001
exit
```
3. Save the file (<kbd>Ctrl</kbd> + <kbd>S</kbd>) and close Notepad.

---

### Step 4: Optional - Auto-Launch POS on PC Boot
To make the Kiosk start automatically when the cashier PC turns on:
1. Open the `kiosk` folder and double-click **`enable-kiosk-autostart.bat`**.
2. The POS Kiosk will now launch automatically on startup with zero popup windows.
*(To disable autostart later, double-click `disable-kiosk-autostart.bat` in the `kiosk` folder)*

---

## 🖥️ The Daily Cashier Experience

| Event | Behavior |
| :--- | :--- |
| **PC Powers On in the morning** | Print Agent starts silently & POS Kiosk opens automatically in fullscreen. |
| **Cashier completes a checkout** | Thermal receipt prints instantly (<5ms) with zero popups or preview screens. |
| **End of Day / PC Shutdown** | Cashier closes Chrome or shuts down Windows. Everything cleans up automatically. |

---

## 🛠️ Diagnostics & Maintenance

### 1. How to verify the silent agent is running
Open Google Chrome on the Cashier PC and navigate to:
```
http://127.0.0.1:18181/health
```
You should see:
```json
{"status":"ok","agent":"IsraPOS-StandaloneExe","version":"3.3.0","defaultPrinter":"POS-80"}
```

### 2. How to stop the print agent
Double-click [`Stop_Print_Agent.bat`](file:///c:/Users/USER/Documents/POS%20System/print-agent/Stop_Print_Agent.bat) inside the `print-agent` folder.

### 3. How to view real-time print logs (For troubleshooting only)
If you ever want to see what is printing in real-time with terminal output:
1. Run `Stop_Print_Agent.bat` to stop the silent background process.
2. Double-click [`Start_Print_Agent.bat`](file:///c:/Users/USER/Documents/POS%20System/print-agent/Start_Print_Agent.bat) to launch the agent in a visible debug console.

### 4. How to uninstall the background auto-start
Right-click [`Uninstall_Service.bat`](file:///c:/Users/USER/Documents/POS%20System/print-agent/Uninstall_Service.bat) and select **"Run as administrator"**.
