# Isra POS - Local Hardware Print Agent

This print agent enables **100% Zero-Flash, Zero-Preview, Instant (<5ms) Thermal Receipt Printing** for Windows Cashier PCs.

---

## 🚀 Quick Setup on Cashier PC (1-Minute Setup)

1. **Copy this entire `print-agent` folder** to the Cashier PC (for example, `C:\IsraPOS-PrintAgent`).
2. **Double-click `Install_Startup.bat` once**:
   - This adds the agent to Windows Startup.
   - The agent starts running silently in the background immediately.
3. Open your POS Kiosk as usual using `Launch_POS_Kiosk.bat`.

---

## 📋 File Reference

| File | Description |
| :--- | :--- |
| **`Install_Startup.bat`** | **(Run Once)** Automatically registers the agent in Windows Startup and starts it in the background. |
| **`Start_Print_Agent.vbs`** | Starts the agent silently in the background with zero visible console window. |
| **`Start_Print_Agent.bat`** | Starts the agent in an open command window (useful for debugging/viewing live logs). |
| **`Stop_Print_Agent.bat`** | Stops any currently running print agent process. |
| **`Uninstall_Startup.bat`** | Removes the agent from Windows Startup and terminates the process. |
| **`agent.js`** | Core lightweight HTTP server (Node.js) listening on `http://127.0.0.1:18181`. |

---

## 🛠️ Requirements

- Windows 10 or Windows 11
- Node.js installed (LTS recommended)
- Thermal receipt printer connected via USB and set as **Default Printer** in Windows.
