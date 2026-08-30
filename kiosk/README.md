# 🖥️ Isra POS — Kiosk Launchers & Autostart

This folder contains the scripts for running the POS in full-screen Kiosk mode and configuring Windows autostart on boot.

---

## 📁 Files in this Folder

| File | Description |
| :--- | :--- |
| **`Launch_POS_Kiosk.bat`** | Launches Chrome in Full-Screen Kiosk Mode with direct silent printing (`--kiosk --kiosk-printing`). Also ensures the local print agent is running. |
| **`Launch_POS_Kiosk_Silent.vbs`** | Silent launcher script that starts `Launch_POS_Kiosk.bat` in the background with **zero black CMD prompt popups**. |
| **`enable-kiosk-autostart.bat`** | **1-Click Autostart Setup**: Links the silent kiosk launcher to your Windows Startup folder (`shell:startup`) so it automatically starts whenever the PC boots/logs in. |
| **`disable-kiosk-autostart.bat`** | **1-Click Disable**: Removes the kiosk startup shortcut from Windows Startup folder. |

---

## 🚀 How to Use

### 1. Manual Launch
Double-click **`Launch_POS_Kiosk.bat`** anytime to open the POS terminal in fullscreen kiosk mode.

### 2. Enable Auto-Launch on PC Boot
Double-click **`enable-kiosk-autostart.bat`**. That's it! The POS will now start automatically whenever the computer powers on.

### 3. Change Server Address (For Cashier PC)
If the Cashier PC connects to a remote server IP (e.g. `192.168.1.100`), right-click `Launch_POS_Kiosk.bat`, select **Edit**, and replace `http://isra-pos-server:3001` with your server URL.
