# Isra POS - Standalone Windows Hardware Print Agent (v3.0)

This print agent enables **100% Zero-Flash, Zero-Preview, Instant (<5ms) Thermal Receipt Printing** on Windows Cashier PCs.

---

## ⚡ Key Highlights

- **Compiled Standalone Windows Binary (`IsraPrintAgent.exe`)**: Runs natively on all Windows 10/11 machines.
- **Zero Software Required**: **NO Node.js**, **NO PowerShell scripts**, **NO npm packages** required on the Cashier PC.
- **Zero Configuration**: Double-click and it works immediately.
- **Direct Win32 Raw Spooling**: Native ESC/POS binary streaming directly to any thermal printer queue.

---

## 🚀 Quick Setup on Cashier PC (1-Minute Setup)

1. **Copy this entire `print-agent` folder** to the Cashier PC (e.g., `C:\IsraPOS-PrintAgent`).
2. **Double-click `Install_Startup.bat` once**:
   - This registers `IsraPrintAgent.exe` in Windows Startup.
   - The agent starts running silently in the background immediately.
3. Open your POS Kiosk as usual using `Launch_POS_Kiosk.bat`.

---

## 📋 File Reference

| File | Description |
| :--- | :--- |
| **`IsraPrintAgent.exe`** | The compiled standalone print agent binary. |
| **`Install_Startup.bat`** | **(Run Once)** Registers the print agent in Windows Startup and starts it in the background. |
| **`Start_Print_Agent.bat`** | Starts the print agent in an open console window to view real-time print logs. |
| **`Start_Print_Agent.vbs`** | Starts the print agent silently in the background (no visible window). |
| **`Stop_Print_Agent.bat`** | Stops any currently running print agent process. |
