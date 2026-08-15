# Xprinter XP-365B & 80mm POS Thermal Receipt Setup Guide

This guide details how to configure the **Xprinter XP-365B** (and other 80mm Xprinter models) in Windows for **continuous 80mm POS receipt printing** with the Isra Hardware POS System.

---

## 1. Physical Hardware Setup

1. **Open Top Cover**: Press the side release lever to open the clamshell lid.
2. **Adjust Roll Width Guides**:
   - Slide the internal **green plastic roll guides** outwards to fit a standard **80 mm thermal paper roll**.
   - Ensure the roll sits straight and is not pinched too tightly.
3. **Paper Direction**:
   - Place the roll so thermal paper unwinds from the **bottom** towards the front of the printer.
4. **Close Lid**: Pull approximately 2 inches of paper out past the front tear bar and snap the lid closed firmly on both sides until you hear a solid click.

---

## 2. Windows Driver Configuration

### Step A: Open Printing Preferences
1. Press **`Win + R`**, type **`control printers`**, and press **Enter**.
2. Right-click your **Xprinter XP-365B** (or *POS-80 / 365B*) and select **Printer Properties**.
3. Click the **General** tab ➔ click **Preferences...** at the bottom.

### Step B: Set Media Type to Continuous (Receipt Mode)
> [!IMPORTANT]
> The XP-365B is a dual-mode printer. By default, it searches for label gaps. You must switch it to **Continuous** mode when using thermal receipt roll paper, otherwise it will flash a red error light or feed blank paper.

1. In **Printing Preferences**, go to the **Page Setup** or **Stock** tab.
2. Look for **Media Type / Sensor Type**:
   - Change from *Labels with Gaps (Die-Cut)* to **`Continuous`** (or *Receipt*).

### Step C: Create/Select 80mm Paper Stock
1. Under **Paper Size / Stock Name**, click **New...** (or edit current stock):
   - **Name**: `80mm Receipt`
   - **Width**: **`80.0 mm`**
   - **Length / Height**: **`297.0 mm`** (or select `Continuous / Receipt`).
   - **Left Margin**: **`0.0 mm`**
   - **Right Margin**: **`0.0 mm`**
2. Click **OK** and select this stock as active.

### Step D: Configure Post-Print Tear-Off Feed
1. Go to the **Device Options** or **Media Handling** tab.
2. Set **Post-Print Action** to **`Tear Off`**.
3. Set **Stop Offset / Feed after print** to **`2.0 mm`** or **`3.0 mm`** *(ensures the bottom footer text stops cleanly above the metal tear bar)*.
4. Click **Apply** and **OK**.

### Step E: Apply Defaults to Advanced Tab
1. Back in the main **Printer Properties** window, switch to the **Advanced** tab.
2. Click **Printing Defaults...** at the bottom.
3. Apply the exact same settings (**Continuous**, **80.0 mm Width**, **0.0 mm Margins**).
4. Click **Apply** and **OK**.

---

## 3. POS Software & Browser Silent Kiosk Setup

To enable instant, silent receipt printing with zero preview dialogs:

### 1. Set Xprinter as Default
In Windows **Printers & Scanners**, right-click your Xprinter and choose **Set as default printer**.

### 2. Disable Browser Headers and Footers
1. In Google Chrome / Microsoft Edge, open any page and press **`Ctrl + P`**.
2. Under **More Settings**:
   - **Margins**: Set to **`None`** (or `Custom: 0`).
   - **Options**: **Uncheck** `Headers and footers` *(removes browser URL, timestamp, and page numbers)*.
   - **Scale**: Set to **`Default`** (100%).
3. Click Cancel (settings are saved automatically for future prints).

### 3. Run Chrome in Kiosk Mode
Launch your POS terminal using Chrome kiosk mode flags:
```cmd
chrome.exe --kiosk --kiosk-printing --app=http://localhost:5000
```

When a sale is completed, the thermal receipt will print immediately on the 76mm printable area and feed cleanly to the tear bar.

---

## 4. Troubleshooting & FAQ

| Problem | Cause | Solution |
| :--- | :--- | :--- |
| **Printer feeds blank paper or beeps / red light** | Printer is looking for sticker gaps | Change **Media Type** in printer preferences to **`Continuous`**. |
| **Receipt text is chopped on the right** | Paper size is set to narrow (58mm) in driver | Ensure Paper Stock width in Windows driver is set to **`80.0 mm`**. |
| **Text cuts off right at the bottom tear line** | Feed offset is 0mm | Increase **Feed after print / Stop offset** to `3.0 mm` in driver. |
| **Faded or light print** | Darkness/Density set too low | In driver preferences, increase **Darkness / Print Density** to `10` or `12`. |
| **Browser prints page URLs and date at top/bottom** | Chrome Headers & Footers enabled | Press `Ctrl+P` in Chrome, expand *More Settings*, and uncheck **Headers and footers**. |
