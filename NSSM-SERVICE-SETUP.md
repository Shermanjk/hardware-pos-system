# NSSM Windows Service Setup Guide

This guide explains how to set up the Isra POS backend server as a Windows Service using NSSM (Non-Sucking Service Manager). This ensures the server starts automatically at system boot and runs reliably in the background.

## Prerequisites

- Windows 10/11
- Node.js installed
- Administrator access
- Isra POS System files

## Installation Steps

### Step 1: Build the Server

Navigate to your POS System directory and build the production server:

```bash
cd "E:\ POS System"
pnpm build
```

This creates the production build in the `server-dist\` directory.

### Step 2: Download and Install NSSM

Run the automated download script:

```bash
download-nssm.bat
```

This will:
- Download NSSM from the official repository
- Extract it to `C:\nssm\`
- Make it available for service installation

### Step 3: Customize Installation Script

Open `install-nssm-service.bat` and update the paths for your environment:

```batch
:: Update these paths to match your installation
set APP_DIR=E:\ POS System
set APP_ARGS=server-dist\index.js
```

### Step 4: Install the Service

Right-click `install-nssm-service.bat` and select **"Run as administrator"**

The script will:
- Install the Node.js server as a Windows service named "IsraPOSServer"
- Configure automatic startup at system boot
- Set up logging to `C:\POS-Logs\`
- Start the service immediately

### Step 5: Verify Installation

Check the service status:

```bash
C:\nssm\nssm.exe status IsraPOSServer
```

Expected output: `SERVICE_RUNNING`

Test the server by opening your browser and navigating to:
```
http://localhost:3001
```

## Path Configuration

### Development Environment (Current)
- **Directory**: `c:\Users\USER\Documents\POS System`
- **Service Name**: IsraPOSServer
- **Logs**: `C:\POS-Logs\`

### Production/Client Environment
- **Directory**: `E:\ POS System`
- **Service Name**: IsraPOSServer
- **Logs**: `C:\POS-Logs\`

To deploy to a different path, edit these variables in `install-nssm-service.bat`:

```batch
set APP_DIR=E:\ POS System
set APP_ARGS=server-dist\index.js
```

## Service Management

### Start the Service
```bash
C:\nssm\nssm.exe start IsraPOSServer
```

### Stop the Service
```bash
C:\nssm\nssm.exe stop IsraPOSServer
```

### Restart the Service
```bash
C:\nssm\nssm.exe restart IsraPOSServer
```

### Check Service Status
```bash
C:\nssm\nssm.exe status IsraPOSServer
```

### View Service Logs
```bash
type C:\POS-Logs\server.log
type C:\POS-Logs\server-error.log
```

### Remove the Service
```bash
C:\nssm\nssm.exe remove IsraPOSServer confirm
```

## Service Configuration

The service is configured with the following settings:

- **Startup Type**: Automatic (starts at system boot)
- **Display Name**: Isra POS Server
- **Description**: Hardware POS System Backend Server
- **Environment**: `NODE_ENV=production`
- **Standard Output Log**: `C:\POS-Logs\server.log`
- **Error Log**: `C:\POS-Logs\server-error.log`

## Troubleshooting

### Service Won't Start

1. Check the error log:
   ```bash
   type C:\POS-Logs\server-error.log
   ```

2. Verify Node.js is installed and accessible at `C:\Program Files\nodejs\node.exe`

3. Ensure the server build exists at the configured path

4. Check Windows Services:
   - Press `Win + R`, type `services.msc`
   - Look for "Isra POS Server"
   - Check for error messages

### Port Already in Use

If port 3001 is already in use, the service may fail to start. Check what's using the port:

```bash
netstat -ano | findstr :3001
```

### Service Not Starting After Reboot

1. Verify the service startup type:
   ```bash
   C:\nssm\nssm.exe get IsraPOSServer Start
   ```
   Should return `SERVICE_AUTO_START`

2. Check Windows Event Viewer for service startup errors

3. Ensure the service account has proper permissions

## Deployment to Client PCs

### For Server PC (E:\ POS System)

1. Copy the entire POS System directory to `E:\ POS System`
2. Run `pnpm build` on the server PC
3. Update paths in `install-nssm-service.bat`:
   ```batch
   set APP_DIR=E:\ POS System
   ```
4. Run `download-nssm.bat`
5. Run `install-nssm-service.bat` as administrator

### For Client PCs (Cashier/Clerk)

Client PCs do not need NSSM. They only need:
- The Electron app (to be created)
- Network connectivity to the server PC
- The server IP address configured in the app

## Benefits of Windows Service

- **Automatic Startup**: Service starts at system boot, before user login
- **Background Operation**: No console window or user interaction required
- **Auto-Restart**: NSSM automatically restarts the service if it crashes
- **Reliability**: More stable than manual startup scripts
- **Centralized Management**: Can be managed through Windows Services console

## Next Steps

After setting up the backend service:

1. **Set up Electron app** for the frontend (replaces browser kiosk mode)
2. **Configure network connectivity** between client PCs and server
3. **Test multi-terminal setup** with cashier and clerk PCs
4. **Set up backup procedures** for the database

## Support

For issues or questions:
- Check service logs in `C:\POS-Logs\`
- Verify all paths are correct in the installation script
- Ensure Node.js and dependencies are properly installed
- Test with manual server startup first: `node server-dist/index.js`
