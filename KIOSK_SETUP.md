# POS Cashier Kiosk & Silent Thermal Printing Setup Guide

This guide provides step-by-step instructions for setting up a Windows cashier terminal in **Full-Screen Kiosk Mode** with **Silent Direct Thermal Receipt Printing** (no print preview dialog).

---

## Environment & Requirements

- **Server URL**: `http://isra-pos-server:3001` *(or `http://localhost:3001` if running on the server PC)*
- **Supported Browsers**: Google Chrome or Microsoft Edge
- **Hardware**: 80mm Thermal Receipt Printer (USB / POS Printer)

---

## Step 1: Configure Windows Thermal Printer

1. **Connect Printer**: Plug in your 80mm thermal receipt printer via USB or local network and install manufacturer drivers.
2. **Set as Default Printer**:
   - Open Windows **Settings** → **Bluetooth & devices** → **Printers & scanners**.
   - Click your thermal receipt printer (e.g. *POS-80*, *Epson TM-T20*, *Xprinter*).
   - Click **Set as default**.
3. **Configure Paper Settings**:
   - Click **Printer properties** → **Preferences** (or **Device Settings**).
   - Ensure Paper Size is set to **80mm x Roll** (or `72.1mm x Receipt`).
   - If your printer has an auto-cutter or cash drawer kick, enable it under **Device Settings** (*Cash Drawer After Printing*).

---

## Step 2: Create the Kiosk Mode Shortcut

Choose **Method A** (Google Chrome) or **Method B** (Microsoft Edge) or **Method C** (Batch Launcher).

### Method A: Google Chrome (Recommended)

1. Go to your Windows **Desktop**, right-click an empty space → **New** → **Shortcut**.
2. Copy and paste the following into the **Type the location of the item** text box:

   ```text
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing --user-data-dir="C:\ChromePOSProfile" --app=http://isra-pos-server:3001
   ```

3. Click **Next**, enter `POS Cashier Kiosk` as the shortcut name, and click **Finish**.

> **Note**: The `--user-data-dir="C:\ChromePOSProfile"` flag ensures Chrome opens in 100% fullscreen and silent printing mode every time, even if standard Chrome is already open in the background.

---

### Method B: Microsoft Edge

1. Right-click Desktop → **New** → **Shortcut**.
2. Paste the following target:

   ```text
   "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk --kiosk-printing --edge-kiosk-type=fullscreen --app=http://isra-pos-server:3001
   ```

3. Name it `POS Cashier Kiosk` and click **Finish**.

---

### Method C: One-Click Batch Script (`Launch_POS_Kiosk.bat`)

You can create a standalone executable script file on the cashier desktop:

1. Right-click Desktop → **New** → **Text Document**.
2. Paste the following script:

   ```bat
   @echo off
   title POS Cashier Kiosk Launcher
   echo Launching POS Kiosk connected to http://isra-pos-server:3001...

   start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing --app=http://isra-pos-server:3001

   exit
   ```

3. Save the file as **`Launch_POS_Kiosk.bat`** (set *Save as type* to **All Files (*.*)**).

---

## Step 3: Autostart POS on Windows Startup (Optional)

To make the POS system open automatically whenever the cashier PC turns on:

1. Press **Windows Key + R** to open the Run dialog.
2. Type `shell:startup` and press **Enter**.
3. Copy your **`POS Cashier Kiosk`** shortcut into the Startup folder that opens.

---

## How it Works During Sales Transactions

1. The cashier enters items, customer info, and cash tendered.
2. The cashier clicks **Process Payment** or presses **Enter**.
3. The sale is verified and committed to the backend database.
4. The system automatically triggers printing — **the receipt prints directly out of the thermal printer instantly with zero popups or preview windows**.

---

## Useful Keyboard Shortcuts & Controls

| Action | Keyboard Shortcut |
| :--- | :--- |
| **Close Kiosk Window** | `Alt + F4` or `Ctrl + W` |
| **Toggle Full Screen** | `F11` |
| **Focus Barcode Scanner** | Click anywhere on screen or press `F2` |
| **Refresh Kiosk App** | `Ctrl + R` or `F5` |

---

## Troubleshooting

### Q1: The print preview popup window still appears.
- Ensure Chrome/Edge was launched using the shortcut created in Step 2.
- Verify that `--kiosk-printing` is included in the shortcut target.
- Make sure all previous standard Chrome windows are closed before launching the kiosk shortcut.

### Q2: The receipt prints to the wrong printer.
- Check Windows **Printers & scanners** settings and confirm your thermal receipt printer is checked as **Default Printer**.

### Q3: Server URL changed or PC cannot connect.
- Edit the shortcut properties or batch file and update `http://isra-pos-server:3001` to the new server IP address (e.g. `http://192.168.1.150:3001`).
