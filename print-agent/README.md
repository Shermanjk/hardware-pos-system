# Isra POS - Native Windows Hardware Print Agent (v2.0)

This print agent enables **100% Zero-Flash, Zero-Preview, Instant (<5ms) Thermal Receipt Printing** on Windows Cashier PCs.

---

## ⚡ Key Highlights

- **100% Native Windows**: Built using Windows PowerShell and `.NET HttpListener`.
- **Zero Software Required**: **NO Node.js**, NO external tools, NO npm packages required on the Cashier PC.
- **Works Out of the Box**: Runs on any clean Windows 10 or Windows 11 computer.

---

## 🚀 Quick Setup on Cashier PC (1-Minute Setup)

1. **Copy this entire `print-agent` folder** to the Cashier PC (for example, `C:\IsraPOS-PrintAgent`).
2. **Double-click `Install_Startup.bat` once**:
   - This registers the agent in Windows Startup.
   - The agent starts running silently in the background immediately.
3. Open your POS Kiosk as usual using `Launch_POS_Kiosk.bat`.

---

## 📋 File Reference

| File | Description |
| :--- | :--- |
| **`Install_Startup.bat`** | **(Run Once)** Automatically registers the agent in Windows Startup and starts it silently in the background. |
| **`Start_Print_Agent.vbs`** | Starts the agent silently in the background with zero visible console window. |
| **`Start_Print_Agent.bat`** | Starts the agent in an open console window (useful for viewing live print logs). |
| **`Stop_Print_Agent.bat`** | Stops any currently running print agent process. |
| **`Uninstall_Startup.bat`** | Removes the agent from Windows Startup and terminates the process. |
| **`agent.ps1`** | Native Windows PowerShell print server listening on `http://127.0.0.1:18181`. |
