# Windows Kiosk Mode Setup Guide

This guide explains how to configure the Isra Hardware POS as a Progressive Web App (PWA) and set up Windows Kiosk Mode for dedicated cashier and clerk terminals.

## Table of Contents

1. [PWA Installation](#pwa-installation)
2. [Windows 10 Kiosk Mode](#windows-10-kiosk-mode)
3. [Windows 11 Kiosk Mode](#windows-11-kiosk-mode)
4. [Maintenance and Exit](#maintenance-and-exit)
5. [Network Configuration](#network-configuration)
6. [Best Practices](#best-practices)

---

## PWA Installation

### Installing the POS as a Desktop Application

The Isra Hardware POS can be installed as a Progressive Web App (PWA) on Windows computers running Chrome, Edge, or Firefox.

#### Chrome/Edge Installation

1. Open Chrome or Microsoft Edge
2. Navigate to your POS server URL (e.g., `http://ISRA-POS-SERVER:3000`)
3. Log in as an **Admin** user
4. Go to **Settings** > **PWA Install** tab
5. Click the **"Install POS App"** button
6. Follow the browser prompts to complete installation
7. The app will appear on your desktop and Start menu

#### Firefox Installation

1. Open Firefox
2. Navigate to your POS server URL
3. Click the **"Install"** icon in the address bar (if available)
4. Follow the prompts to complete installation

#### Creating Desktop Shortcuts

If automatic installation is not available:

1. Open Chrome or Edge
2. Navigate to your POS server URL
3. Click the **three-dot menu** (⋮) in the top-right corner
4. Select **"Save and share"** > **"Create shortcut..."**
5. Check **"Open as window"**
6. Click **Create**
7. The shortcut will be created on your desktop

#### Setting Up Auto-Login

To have the POS launch automatically on startup:

1. Press `Win + R` and type `shell:startup`
2. Copy the POS desktop shortcut to the Startup folder
3. The POS will now launch automatically when Windows starts

---

## Windows 10 Kiosk Mode

Windows 10 Assigned Access allows you to lock a computer to a single application, perfect for dedicated cashier terminals.

### Prerequisites

- Windows 10 Pro, Enterprise, or Education edition
- Admin account on the kiosk computer
- POS PWA installed on the computer

### Setting Up Assigned Access

#### Step 1: Create a Kiosk User Account

1. Go to **Settings** > **Accounts** > **Family & other users**
2. Click **"Add someone else to this PC"**
3. Enter a username (e.g., `CashierKiosk`)
4. Create a simple password (or leave blank for auto-login)
5. Select **"Add a user without a Microsoft account"**
6. Complete the account creation

#### Step 2: Configure Assigned Access

1. Go to **Settings** > **Accounts** > **Assigned access**
2. Click **"Choose an account to set up as a kiosk"**
3. Select the kiosk user account you created (e.g., `CashierKiosk`)
4. Choose **"Microsoft Edge"** or **"Chrome"** as the kiosk app
5. Enter the POS URL: `http://ISRA-POS-SERVER:3000`
6. Click **"Launch kiosk"** to test the configuration

#### Step 3: Configure Auto-Login (Optional)

To automatically log in as the kiosk user:

1. Press `Win + R` and type `netplwiz`
2. Uncheck **"Users must enter a user name and password to use this computer"**
3. Select the kiosk user account
4. Enter the password (if set)
5. Click **OK**

#### Step 4: Test the Kiosk

1. Restart the computer
2. The kiosk user should automatically log in
3. The POS should launch in full-screen kiosk mode
4. Verify that the user cannot access other applications or the desktop

---

## Windows 11 Kiosk Mode

Windows 11 uses a similar but updated interface for kiosk configuration.

### Prerequisites

- Windows 11 Pro, Enterprise, or Education edition
- Admin account on the kiosk computer
- POS PWA installed on the computer

### Setting Up Kiosk Mode

#### Step 1: Create a Kiosk User Account

1. Go to **Settings** > **Accounts** > **Family & other users**
2. Click **"Add account"**
3. Select **"I don't have this person's sign-in information"**
4. Select **"Add a user without a Microsoft account"**
5. Enter a username (e.g., `CashierKiosk`)
6. Create a password (optional)
7. Complete the account creation

#### Step 2: Configure Kiosk App

1. Go to **Settings** > **Accounts** > **Family & other users**
2. Click **"Set up a kiosk"** (under "Set up a kiosk for shared use")
3. Enter a name for the kiosk (e.g., "Cashier Terminal")
4. Choose the kiosk user account
5. Select **"Microsoft Edge"** or **"Chrome"** as the kiosk browser
6. Choose **"As a public, single-app kiosk"**
7. Enter the POS URL: `http://ISRA-POS-SERVER:3000`
8. Configure additional settings:
   - **Show address bar**: Off
   - **Allow downloads**: Off
   - **Allow extensions**: Off
9. Click **"Next"** and then **"Launch"** to test

#### Step 3: Configure Auto-Login (Optional)

1. Press `Win + R` and type `netplwiz`
2. Uncheck **"Users must enter a user name and password to use this computer"**
3. Select the kiosk user account
4. Enter the password (if set)
5. Click **OK**

#### Step 4: Test the Kiosk

1. Restart the computer
2. The kiosk user should automatically log in
3. The POS should launch in full-screen kiosk mode
4. Verify that the user cannot access other applications

---

## Maintenance and Exit

### Exiting Kiosk Mode

#### Windows 10

1. Press `Ctrl + Alt + Del`
2. Select **"Sign out"** or **"Lock"**
3. Sign in with an admin account to make changes

#### Windows 11

1. Press `Ctrl + Alt + Del`
2. Select **"Sign out"** or **"Lock"**
3. Sign in with an admin account to make changes

### Temporary Kiosk Disable

To temporarily disable kiosk mode for maintenance:

1. Sign in with an admin account
2. Go to **Settings** > **Accounts** > **Assigned access** (Windows 10) or **Family & other users** (Windows 11)
3. Select the kiosk setup
4. Click **"Stop kiosk"** or **"Remove kiosk"**
5. Make necessary changes
6. Re-enable kiosk mode when done

### Accessing Desktop for Troubleshooting

If you need to access the desktop while in kiosk mode:

1. Press `Ctrl + Alt + Del`
2. Select **"Task Manager"**
3. From Task Manager, you can:
   - End the browser process
   - Run new tasks (`File` > **"Run new task"**)
   - Access other system tools

---

## Network Configuration

### Ensuring POS Server Connectivity

The POS requires connectivity to `http://ISRA-POS-SERVER:3001` for API calls and WebSocket connections.

#### Local Network DNS

1. Ensure `ISRA-POS-SERVER` resolves to the correct IP address:
   - Add an entry to your router's DNS settings
   - Or use the hosts file on each kiosk computer:
     - Edit `C:\Windows\System32\drivers\etc\hosts`
     - Add: `192.168.x.x ISRA-POS-SERVER`
     - Replace `192.168.x.x` with your server's actual IP

#### Firewall Configuration

Ensure the Windows Firewall allows connections to the POS server:

1. Go to **Windows Defender Firewall** > **Advanced settings**
2. Click **"Inbound Rules"** > **"New Rule"**
3. Select **"Port"** > **TCP** > **Specific local ports**: `3001`
4. Select **"Allow the connection"**
5. Apply to **Domain**, **Private**, and **Public** (if needed)
6. Name the rule **"POS Server"**

#### Testing Connectivity

1. Open Command Prompt on the kiosk computer
2. Run: `ping ISRA-POS-SERVER`
3. Verify you receive responses
4. Open a browser and navigate to `http://ISRA-POS-SERVER:3001`
5. Verify you can access the server

---

## Best Practices

### Hardware Recommendations

- **Touchscreen**: 15-22" touchscreen monitor for cashier terminals
- **Barcode Scanner**: USB barcode scanner for product scanning
- **Receipt Printer**: Thermal receipt printer (Epson, Star Micronics)
- **Cash Drawer**: USB or serial cash drawer connected to printer
- **Network**: Wired Ethernet connection for reliability

### Security Considerations

1. **Physical Security**: Lock kiosk terminals in secure enclosures
2. **User Accounts**: Use dedicated kiosk accounts with minimal permissions
3. **Regular Updates**: Keep Windows and the POS updated
4. **Backup Schedule**: Ensure regular database backups
5. **Access Control**: Limit admin access to kiosk terminals

### Regular Maintenance

1. **Weekly**: Check for Windows updates
2. **Monthly**: Review kiosk logs for errors
3. **Quarterly**: Test backup and restore procedures
4. **Annually**: Review and update security settings

### Troubleshooting

#### POS Won't Load in Kiosk Mode

1. Check network connectivity to `ISRA-POS-SERVER:3001`
2. Verify the POS server is running
3. Check firewall settings
4. Test the POS in a regular browser window

#### Kiosk Mode Won't Start

1. Verify the kiosk user account exists
2. Check that the browser is installed
3. Ensure the POS URL is correct
4. Review Windows Event Viewer for errors

#### Performance Issues

1. Close unnecessary background applications
2. Clear browser cache
3. Check for Windows updates
4. Verify network bandwidth

---

## Support

For additional support or issues:

1. Check the POS server logs for errors
2. Review Windows Event Viewer
3. Test the POS in a regular browser window
4. Contact your system administrator

---

## Summary

This guide provides a complete setup for deploying the Isra Hardware POS as a PWA in Windows Kiosk Mode. The PWA provides an app-like experience without requiring Electron, while Windows Kiosk Mode ensures a secure, dedicated environment for cashier and clerk terminals.

Key benefits:
- **No browser UI**: Opens without tabs, address bar, or toolbars
- **Desktop shortcut**: Easy access from desktop or Start menu
- **Auto-login**: Launches automatically on startup
- **Secure**: Users cannot access other applications
- **Professional**: Optimized for kiosk terminals with touchscreens
