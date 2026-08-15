# Xprinter XP-365B 30×20mm Barcode Sticker Label Setup Guide

This guide explains how to set up the **Xprinter XP-365B** thermal label printer for **30×20 mm barcode sticker labels** with the Isra Hardware POS System.

---

## 1. Physical Hardware & Label Loading

1. **Turn OFF Printer Power** before loading labels.
2. **Open Top Cover**: Squeeze the green release levers on both sides and lift the lid.
3. **Insert 30×20mm Label Roll**:
   - Place the label roll onto the roll spindle.
   - Slide the **green plastic guides** inward so they hold the roll centered without pinching it.
4. **Feed Labels Under Media Guides**:
   - Thread the labels under the two green side clips in front of the platen roller.
   - The labels must face **upwards** (thermal coated side facing the print head).
5. **Close Lid**: Pull one label out past the front tear bar and snap the cover closed firmly until both sides latch.

---

## 2. Hardware Gap Sensor Calibration (Mandatory)

The XP-365B needs to learn the gap spacing between 30×20mm stickers so it stops cleanly at each label border without skipping:

### Automatic Gap Calibration Steps:
1. Turn the printer **OFF** using the power switch on the side.
2. Press and **HOLD the FEED button** while turning the power switch **ON**.
3. Keep holding the FEED button:
   - The printer will beep once.
   - The printer will start feeding 2 to 3 labels while sensing the gaps.
   - Release the **FEED button** when the printer stops feeding.
4. The LED should now turn solid **GREEN / BLUE** (Ready).
5. Press the **FEED button once**: exactly **one label** should advance and stop directly at the gap line.

---

## 3. Windows Driver Setup (30×20 mm Stock)

### Step A: Open Printing Preferences
1. Press **`Win + R`**, type **`control printers`**, and press **Enter**.
2. Right-click your **Xprinter XP-365B** (or *Label Printer 365B*) and select **Printer Properties**.
3. Click the **General** tab ➔ click **Preferences...** at the bottom.

### Step B: Set Media Type to Labels with Gaps
1. In **Printing Preferences**, go to the **Page Setup** (or **Stock**) tab.
2. Set **Media Type**: **`Die-Cut Labels with Gaps`** (or *Labels with Gap*).
3. Set **Gap Height**: **`2.0 mm`** (or `3.0 mm` depending on your roll).

### Step C: Define 30×20 mm Paper Stock
1. Under **Stock Name / Paper Size**, click **New...**:
   - **Stock Name**: `30x20mm Barcode`
   - **Width**: **`30.0 mm`**
   - **Height / Length**: **`20.0 mm`**
   - **Left Margin**: **`0.0 mm`**
   - **Right Margin**: **`0.0 mm`**
   - **Top Margin**: **`0.0 mm`**
   - **Bottom Margin**: **`0.0 mm`**
2. Click **OK** and select `30x20mm Barcode` as the active stock.

### Step D: Set Print Speed & Darkness
1. Go to the **Options** (or **Print Options**) tab:
   - **Print Speed**: `101.6 mm/s` (4 ips) or `76.2 mm/s` (3 ips).
   - **Darkness / Density**: `10` or `12` *(higher density ensures crisp barcode edges for optical scanners)*.
2. Click **Apply** and **OK**.

### Step E: Apply Defaults to Advanced Tab
1. Switch to the **Advanced** tab in the main Printer Properties window.
2. Click **Printing Defaults...** at the bottom.
3. Select the `30x20mm Barcode` stock, set **Die-Cut Labels with Gaps**, and click **OK**.

---

## 4. POS System Software Configuration

In the POS application, the barcode label generator matches the 30×20 mm label size. 

The configuration file is located at:
[`client/src/shared/services/barcodePrinter/config.ts`](file:///c:/Users/USER/Documents/POS%20System/client/src/shared/services/barcodePrinter/config.ts)

### Recommended 30×20mm Profile:
```typescript
export const BARCODE_PRINTER_CONFIG: BarcodePrinterConfig = {
  printerName:      "",               // blank = user selects or OS default
  printerType:      "windows_driver",
  labelWidthMm:     30,               // 30 mm width
  labelHeightMm:    20,               // 20 mm height
  dpi:              203,
  marginTopMm:      1,
  marginBottomMm:   1,
  marginLeftMm:     1,
  marginRightMm:    1,
  barcodeSymbology: "CODE128",
  barcodeHeightMm:  9,                // Fits 20mm label with text
  storeName:        "ISRA HARDWARE",
  showStoreName:    true,
  showBarcodeText:  true,
  fontFamily:       "monospace",
  fontSizePt:       6,
};
```

---

## 5. Browser Print Settings (Google Chrome / Edge)

When printing barcode labels from the Clerk Barcode Printing page:

1. **Destination**: Select your **Xprinter XP-365B**.
2. **Paper Size**: Select **`30x20mm Barcode`** (or `User-defined`).
3. **Margins**: Set to **`None`** (0 mm).
4. **Scale**: Set to **`100%`** (Default).
5. **Headers and footers**: **Unchecked**.

---

## 6. Troubleshooting & FAQ

| Problem | Cause | Solution |
| :--- | :--- | :--- |
| **Printer skips 1-2 blank stickers between prints** | Gap sensor not calibrated | Perform **Hardware Gap Calibration** (Hold FEED button on power up until it beeps and feeds 2-3 labels). |
| **Barcode prints offset or cut off on one side** | Roll not centered inside printer | Adjust the **green internal roll guides** so the 30mm roll sits snugly in the middle. |
| **Barcode scanner fails to scan the printed label** | Barcode density too low or squished | Increase **Darkness** to `10` or `12` in driver settings and keep print speed at 3–4 ips. |
| **Red LED flashes continuously** | Out of paper or sensor error | Re-seat the label roll, close lid tightly on both sides, and press **FEED** once. |
| **Printer prints continuously without stopping at gaps** | Driver is in Continuous / Receipt mode | Change **Media Type** in driver settings to **`Die-Cut Labels with Gaps`**. |
