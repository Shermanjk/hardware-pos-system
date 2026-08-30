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

Choose from the following options to set up the cashier kiosk shortcut:

### Option 1: Clean & Short Shortcut (Recommended)
```text
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing --user-data-dir="C:\ChromePOSProfile" --unsafely-treat-insecure-origin-as-secure="http://isra-pos-server:3001,http://noob:3001" --incognito --app=http://isra-pos-server:3001
```

---

### Option 2: Use the `.bat` Launcher (No Character Limit)
A batch file has no character limits and opens with a single double-click:

1. Right-click on your Desktop $\rightarrow$ **New** $\rightarrow$ **Text Document**.
2. Paste the following:
   ```bat
   @echo off
   start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing --user-data-dir="C:\ChromePOSProfile" --unsafely-treat-insecure-origin-as-secure="http://isra-pos-server:3001,http://noob:3001" --no-first-run --no-default-browser-check --disable-features=AutofillServerCommunication,PasswordManager --password-store=basic --app=http://isra-pos-server:3001
   exit
   ```
3. Click **File** $\rightarrow$ **Save As...**
4. Set *Save as type* to **All Files (*.*)** and name it **`Launch_POS_Kiosk.bat`**.

---

### Option 3: Edit Shortcut Properties (Bypasses Wizard Limit)
Windows only limits characters during the initial wizard creation. The Shortcut Properties window allows up to 1,024 characters:

1. In the New Shortcut wizard, paste just the Chrome path:
   ```text
   "C:\Program Files\Google\Chrome\Application\chrome.exe"
   ```
2. Click **Next** $\rightarrow$ **Finish**.
3. Right-click the newly created shortcut on your desktop $\rightarrow$ select **Properties**.
4. In the **Target** field, replace the text with the full command:
   ```text
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing --user-data-dir="C:\ChromePOSProfile" --unsafely-treat-insecure-origin-as-secure="http://isra-pos-server:3001,http://noob:3001" --no-first-run --no-default-browser-check --disable-features=AutofillServerCommunication,PasswordManager --password-store=basic --app=http://isra-pos-server:3001
   ```
5. Click **Apply** $\rightarrow$ **OK**.

---

### Option 4: Microsoft Edge (Alternative)

1. Right-click Desktop $\rightarrow$ **New** $\rightarrow$ **Shortcut**.
2. Paste the following target:
   ```text
   "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk --kiosk-printing --edge-kiosk-type=fullscreen --no-first-run --disable-features=msAutofillServerCommunication,msPasswordManager --app=http://isra-pos-server:3001
   ```
3. Name it `POS Cashier Kiosk` and click **Finish**.

---

## Step 3: Autostart POS on Windows Startup

To make the POS Kiosk open automatically whenever the cashier PC boots / turns on:

### Option A: 1-Click Setup (Recommended)
1. Open the **`kiosk`** folder.
2. Double-click **`enable-kiosk-autostart.bat`**.
3. It will automatically link the silent background launcher (`Launch_POS_Kiosk_Silent.vbs`) to the Windows Startup folder.
4. Done! The kiosk will launch automatically on boot without any black terminal window flashing.
*(To disable later, simply run `disable-kiosk-autostart.bat` inside the `kiosk` folder)*

---

### Option B: Manual Setup via Windows Startup Folder
1. Press **Windows Key + R** to open the Run dialog.
2. Type `shell:startup` and press **Enter**.
3. Copy **`kiosk\Launch_POS_Kiosk.bat`** (or create a shortcut to it) into the Startup folder that opens.

---

### Option C: Windows Auto-Login (Skip Windows Login Screen on Boot)
To allow Windows to boot straight into the POS without waiting for someone to type a password:
1. Press **Windows Key + R**, type **`netplwiz`** and press **Enter**.
2. Uncheck **"Users must enter a user name and password to use this computer"**.
3. Select your cashier / user account, click **Apply**, enter the password once to confirm, and click **OK**.
4. The PC will now restart directly into the Kiosk on every boot.

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
| **Collect Customer Utang / Credit Payment** | `F11` or `Alt + U` or click **Collect Utang** in header |
| **Reprint Last Receipt** (e.g. Paper ran out / jammed) | `F10` or `Alt + R` or click **Reprint Last** in header |
| **Quick Reprint on Change Dialog** | Press `R` when Payment Complete modal is open |
| **Accidental Close Guard (Close / Exit)** | `Ctrl + W` or `Ctrl + Shift + W` *(Intercepted with confirmation dialog if work/transaction is active)* |
| **Close Kiosk Window (OS Level)** | `Alt + F4` *(Triggers browser beforeunload prompt when active transaction exists)* |
| **Focus Barcode / Product Search** | `F1` |
| **Focus Cart Items** | `F2` |
| **1-Click Walk-In Customer** | `F3` |
| **Open Discount Selector** | `F4` |
| **Hold / Suspend Transaction** | `F5` |
| **Held Transactions Panel** | `F6` |
| **Process Returns** | `F7` |
| **Focus Cash Tendered** | `F8` |
| **Void Requests / Void Sale** | `F9` |
| **Refresh Kiosk App** | `Ctrl + R` *(Intercepted with warning if cart is not empty)* |

---

## Accidental Close & Active Transaction Protection

The POS terminal includes an active safety interception engine:
1. **Keystroke Interception (`Ctrl + W` / `Ctrl + Shift + W` / `Ctrl + F4`)**:
   - If a cashier accidentally presses `Ctrl + W` or similar browser close commands, the POS immediately blocks the browser from closing.
   - If a **sale is in progress** (cart has items, cash is entered, or payment is processing), a high-visibility **"Active Transaction in Progress"** warning modal pops up displaying the item count, total payable, and customer name.
   - The cashier can immediately resume the sale by pressing **`Enter`** or **`Esc`**, choose to **Hold Transaction (F5)** to safely suspend the cart to the server before exiting, or cancel the exit.
2. **Browser-Level Window Protection (`Alt + F4` / Close Button)**:
   - Modern browser `beforeunload` event listeners automatically guard the window whenever a transaction or drawer session is active, preventing inadvertent closing of the kiosk tab or window.


---

## What to Do If Thermal Paper Runs Out Mid-Print

If the printer runs out of receipt paper during a transaction:
1. Open the thermal printer lid, insert a new 80mm paper roll, and close the lid.
2. If the **Payment Complete** screen is still open, simply press **`R`** or click **[Reprint Receipt]**.
3. If the dialog was already closed, press **`F10`** (or click **Reprint Last** in the top header).
4. The exact original receipt will print out cleanly without altering inventory, cash totals, or sales records.

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
