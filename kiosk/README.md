# 🖥️ Isra POS — Kiosk Launchers, Shortcuts & Autostart

This folder contains all the tools needed to launch the POS in full-screen Kiosk mode, generate Desktop shortcuts, and configure Windows autostart on boot.

---

## 📁 Files in this Folder

| File | Description |
| :--- | :--- |
| **`Kiosk_Manager.bat`** | **⭐ All-in-One Menu Tool**: Lets you launch the POS, create desktop shortcuts, enable/disable autostart, and change the server IP from a single interactive menu. |
| **`Launch_POS_Kiosk.bat`** | Launches Chrome in Full-Screen Kiosk Mode with direct silent printing (`--kiosk --kiosk-printing`). |
| **`Launch_POS_Kiosk_Silent.vbs`** | Silent launcher script that starts the Kiosk with **zero black CMD prompt popups**. |
| **`create-desktop-shortcut.bat`** | **1-Click Desktop Shortcut**: Places an "Isra POS" icon shortcut directly onto your Windows Desktop. |
| **`enable-kiosk-autostart.bat`** | **1-Click Autostart Setup**: Automatically starts the POS when Windows boots up / logs in. |
| **`disable-kiosk-autostart.bat`** | **1-Click Disable**: Removes the kiosk startup shortcut from Windows. |

---

## 🚀 Quick Instructions

### Option 1: Use the All-in-One Kiosk Manager
Double-click **`Kiosk_Manager.bat`** and select from the menu:
- Press `1` to Launch POS Kiosk immediately
- Press `2` to create the Desktop Shortcut
- Press `3` to enable Autostart on boot
- Press `4` to disable Autostart
- Press `5` to update the Server IP URL

### Option 2: 1-Click Standalone Scripts
- To create a Desktop Shortcut: Double-click **`create-desktop-shortcut.bat`**
- To run automatically on boot: Double-click **`enable-kiosk-autostart.bat`**
- To launch immediately: Double-click **`Launch_POS_Kiosk.bat`**
