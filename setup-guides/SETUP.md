# Local Network Setup Guide

This guide provides step-by-step instructions for setting up the Isra Hardware POS System on a local network for multi-computer access.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Database Setup](#database-setup)
3. [Environment Configuration](#environment-configuration)
4. [Network Configuration](#network-configuration)
5. [Application Setup](#application-setup)
6. [Running the System](#running-the-system)
7. [Accessing from Network](#accessing-from-network)
8. [Cashier Terminal Kiosk Setup](KIOSK_SETUP.md)
9. [Troubleshooting](#troubleshooting)
10. [Security Considerations](#security-considerations)

## Prerequisites

### Server Machine Requirements
- **Operating System**: Windows 10/11 (64-bit)
- **Node.js**: Version 20.x or 22.x LTS ([Download](https://nodejs.org/))
- **pnpm**: Fast package manager (install via `npm install -g pnpm`)
- **MySQL**: Version 8.0, 8.4 LTS, or higher ([Download](https://dev.mysql.com/downloads/mysql/))
- **Git**: For version control and updates ([Download](https://git-scm.com/))
- **NSSM**: Non-Sucking Service Manager for auto-starting the server as a Windows Service

### Installation Steps

1. **Install Node.js & pnpm**
   ```bash
   # Download and install Node.js from https://nodejs.org/
   # Install pnpm package manager:
   npm install -g pnpm
   
   # Verify installations:
   node -v
   pnpm -v
   ```

2. **Configure Git Permissions (Required for Windows Service)**
   Open Command Prompt / PowerShell as **Administrator** and run:
   ```cmd
   git config --system --add safe.directory *
   ```
   *(This ensures the Windows Background Service running under SYSTEM can read and update the repository without ownership errors).*

3. **Install MySQL Server**
   - Download MySQL Community Server from https://dev.mysql.com/downloads/mysql/
   - Complete the setup wizard, set a strong root password, and configure MySQL to start on boot.

## Database Setup

### 1. Create Database and User

Open MySQL Command Line Client or MySQL Workbench and run:

```sql
-- Create the database
CREATE DATABASE hardware_pos;

-- Create a dedicated user for the POS system
CREATE USER 'pos_user'@'%' IDENTIFIED BY 'your_secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON hardware_pos.* TO 'pos_user'@'%';

-- Apply changes
FLUSH PRIVILEGES;
```

### 2. Import Database Schema

```bash
# Navigate to the POS System directory
cd "c:\Users\USER\Documents\POS System"

# Import the schema using MySQL command line
mysql -u root -p hardware_pos < Database-schema/Schema.sql
```

Or using MySQL Workbench:
1. Open MySQL Workbench
2. Connect to your MySQL server
3. Select the `hardware_pos` database
4. Go to Server → Data Import
5. Select `Database-schema/Schema.sql` file
6. Click Start Import

### 3. Verify Database Setup

```sql
USE hardware_pos;

-- Check if tables were created
SHOW TABLES;

-- Verify users table exists
DESCRIBE users;
```

## Environment Configuration

### 1. Create .env File

Create a `.env` file in the root directory of the POS System:

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=pos_user
DB_PASSWORD=your_secure_password
DB_NAME=hardware_pos

# Server Configuration
PORT=3001
NODE_ENV=production

# Optional: Google Drive Backup (if using)
# GOOGLE_DRIVE_CREDENTIALS=path/to/credentials.json
```

### 2. Environment Variables Explanation

- **DB_HOST**: Database server address (use `localhost` if MySQL is on same machine)
- **DB_PORT**: MySQL port (default: 3306)
- **DB_USER**: MySQL username created earlier
- **DB_PASSWORD**: Password for the MySQL user
- **DB_NAME**: Database name (`hardware_pos`)
- **PORT**: Application server port (default: 3001)
- **NODE_ENV**: Set to `production` for production use

## Network Configuration

### 1. Get Server IP Address

```bash
# Open Command Prompt and run:
ipconfig
```

Look for the IPv4 Address under your network adapter (e.g., `192.168.1.100`)

### 2. Configure Windows Firewall

Allow incoming connections on ports 3001 (application) and 3306 (database):

**Using Windows Firewall with Advanced Security:**

1. Press `Win + R`, type `wf.msc`, press Enter
2. Click **Inbound Rules** → **New Rule**
3. Select **Port** → Next
4. Select **TCP** → Specific local ports: `3001,3306` → Next
5. Select **Allow the connection** → Next
6. Check **Domain**, **Private**, **Public** → Next
7. Name: `POS System Ports` → Finish

**Using Command Prompt (Admin):**

```bash
netsh advfirewall firewall add rule name="POS System HTTP" dir=in action=allow protocol=TCP localport=3001
netsh advfirewall firewall add rule name="POS System MySQL" dir=in action=allow protocol=TCP localport=3306
```

### 3. Configure MySQL for Remote Access

Edit MySQL configuration file (`my.ini` on Windows):

```ini
# Find the bind-address line and change it:
bind-address = 0.0.0.0
```

Restart MySQL service:
```bash
# Open Services (Win + R, type services.msc)
# Find MySQL80, right-click → Restart
```

### 4. Test Network Connectivity

From a client machine, test if you can reach the server:

```bash
# Replace 192.168.1.100 with your server IP
ping 192.168.1.100

# Test MySQL connection (if MySQL client installed)
mysql -h 192.168.1.100 -u pos_user -p hardware_pos
```

## Application Setup

### 1. Install Dependencies

```bash
# Navigate to POS System directory
cd "c:\Users\USER\Documents\POS System"

# Install dependencies
pnpm install
```

### 2. Build the Application

```bash
# Build for production
pnpm build
```

This creates:
- `dist/public/` - Frontend static files
- `server-dist/` - Compiled backend server

### 3. Verify Build

Check that the following directories exist:
- `dist/public/index.html`
- `server-dist/index.js`

## Running the System

### Option 1: As a Windows Service with NSSM (Recommended for 24/7 Production)

The POS server should run as a background Windows Service so it starts automatically on Windows boot, restarts on crashes, and supports seamless 1-click in-app updates.

1. **Download NSSM**:
   Double-click `download-nssm.bat` (or download from https://nssm.cc/ and extract `nssm.exe` to `C:\nssm\nssm.exe`).

2. **Install the Windows Service**:
   Right-click `install-nssm-service.bat` and select **Run as administrator**.

3. **Manage the Service**:
   ```cmd
   nssm start IsraPOSServer    # Start service
   nssm stop IsraPOSServer     # Stop service
   nssm restart IsraPOSServer  # Restart service
   nssm status IsraPOSServer   # Check service status
   ```

Logs are stored in `C:\POS-Logs\server.log` and `C:\POS-Logs\server-error.log`.

### Option 2: Manual Production Mode (Command Line)

```bash
# Start the production server manually
pnpm start
```
Access at: `http://localhost:3001`

### Option 3: Development Mode (for Local Laptop Development)

```bash
# Start Vite client and tsx backend concurrently
pnpm dev      # Frontend dev server on port 3000
pnpm server   # Backend tsx watcher on port 3001
```

## Accessing from Network

### 1. From Other Computers

Once the server is running, access the POS system from any computer on the same network:

```
http://SERVER_IP:3001
```

Replace `SERVER_IP` with your server's IP address (e.g., `http://192.168.1.100:3001`)

### 2. Create Desktop Shortcut

On client machines, create a shortcut with the server URL:

1. Right-click desktop → New → Shortcut
2. Type: `http://192.168.1.100:3001`
3. Name: "Isra Hardware POS"
4. Finish

### 3. Browser Compatibility

- **Recommended**: Google Chrome, Microsoft Edge
- **Supported**: Firefox, Safari
- **Not supported**: Internet Explorer

## Initial System Configuration

### 1. Create Admin Account

The first user must be an admin. Use the provided script:

```bash
node scripts/reset-admin-password.js
```

Or manually insert via MySQL:

```sql
USE hardware_pos;

INSERT INTO users (username, full_name, password_hash, role, status, employee_id, created_at)
VALUES ('admin', 'Administrator', '$2a$10$placeholder_hash', 'Admin', 'Active', 'ADM001', NOW());
```

Then set a proper password using the Users page in the Admin panel.

### 2. Configure Store Settings

1. Login as admin
2. Go to Settings
3. Configure:
   - Store name
   - Store address
   - Phone number
   - Tax rate
   - Business license
   - TIN (Tax Identification Number)

### 3. Create Additional Users

1. Go to Users page
2. Create users with appropriate roles:
   - **Admin**: Full system access
   - **Cashier**: Sales and basic operations
   - **Inventory Clerk**: Inventory management

## Troubleshooting

### Database Connection Issues

**Error**: "Missing required database environment variables"

- **Solution**: Ensure `.env` file exists with all required variables

**Error**: "Access denied for user"

- **Solution**: Verify DB_USER and DB_PASSWORD in `.env` match MySQL user credentials

**Error**: "Can't connect to MySQL server"

- **Solution**: 
  - Check MySQL service is running
  - Verify DB_HOST and DB_PORT
  - Check firewall allows MySQL port 3306

### Network Access Issues

**Error**: "Connection refused" from client machines

- **Solution**:
  - Verify server IP address is correct
  - Check Windows Firewall allows port 3001
  - Ensure server is running (`pnpm start`)
  - Test with `ping SERVER_IP`

**Error**: "ERR_CONNECTION_TIMED_OUT"

- **Solution**:
  - Check both machines are on same network
  - Disable VPN on client machine
  - Verify router doesn't block local network traffic

### Application Issues

**Error**: "Module not found"

- **Solution**: Run `pnpm install` to install dependencies

**Error**: "Port 3001 already in use"

- **Solution**:
  - Change PORT in `.env` file
  - Or kill process using port 3001:
    ```bash
    netstat -ano | findstr :3001
    taskkill /PID <PID> /F
    ```

### Performance Issues

**Slow response times**

- **Solution**:
  - Check MySQL performance
  - Verify network bandwidth
  - Consider using wired connection instead of Wi-Fi

## Security Considerations

### 1. Database Security

- Use strong passwords for MySQL users
- Restrict MySQL user privileges to only necessary databases
- Regularly update MySQL to latest version
- Enable MySQL SSL if transmitting sensitive data over network

### 2. Application Security

- Keep `.env` file secure (don't commit to version control)
- Use strong admin passwords
- Regularly update Node.js dependencies: `pnpm update`
- Enable HTTPS in production (requires SSL certificate)

### 3. Network Security

- Use a dedicated network segment for POS if possible
- Restrict access to trusted IP addresses only
- Enable router firewall to block external access to POS ports
- Regularly monitor network traffic for anomalies

### 4. User Management

- Create unique accounts for each user
- Regularly review and remove inactive user accounts
- Enforce password changes periodically
- Limit user permissions to only what they need

### 5. Backup Strategy

- Regular database backups using the built-in backup feature
- Store backups in multiple locations
- Test backup restoration procedure
- Document backup schedule and retention policy

## Maintenance

### Regular Tasks

1. **Daily**: Monitor system logs for errors
2. **Weekly**: Review database performance
3. **Monthly**: Update dependencies and security patches
4. **Quarterly**: Review user access and permissions

### Log Files

- Application logs: `app.log` (in application directory)
- Database logs: MySQL error log (configured in MySQL)

### Database Migrations (Automatic)

You **never need to manually execute SQL files**.
Whenever the server starts up (via `nssm restart IsraPOSServer` or `pnpm start`), it scans the `migrations/` folder and **automatically applies all unexecuted migrations in sequential order**, updates the `system_version` table, and logs the execution in `migration_history`.

### System Updates

The POS system uses an **Automated Cloud CI/CD & 1-Click Release Pipeline**:

#### 1. How to Release an Update (From Your Dev Laptop)
1. Increment the version in `config/version.json`:
   ```json
   {
     "applicationVersion": "2.15.0",
     "databaseVersion": "044"
   }
   ```
2. (Optional) Add your new SQL migration file in `migrations/` (e.g. `044_new_feature.sql`).
3. Commit and push:
   ```bash
   git add .
   git commit -m "Release v2.15.0"
   git push origin main
   ```
   *GitHub Actions will automatically compile the application and publish a release package (`isra-pos-update.zip`) on GitHub Releases.*

#### 2. How to Install the Update on the Client Server PC

**Method A: In-App 1-Click Update (Recommended)**
1. Open the POS Admin panel in your web browser.
2. Go to **Settings** → **System Update**.
3. Click **Check for Updates** → then click **Install Update Now**.
4. The system automatically:
   - Takes a MySQL pre-update snapshot backup.
   - Downloads and stages the pre-built release package.
   - Executes any pending database migrations.
   - Restarts the Windows Service in ~5 seconds.

**Method B: Command-Line Manual Update (Fallback)**
```cmd
cd /d "E:\POS System"
git pull
pnpm build
nssm restart IsraPOSServer
```

## Support

For issues not covered in this guide:

1. Check application logs in `C:\POS-Logs\server.log` and `C:\POS-Logs\server-error.log`
2. Review MySQL error logs
3. Verify all configuration settings in `.env`

## Appendix

### Default Ports

- **Application Server**: 3001
- **Development Server**: 3000
- **MySQL**: 3306

### File Structure

```
POS System/
├── client/              # Frontend React application (Vite + Tailwind)
├── server/              # Backend Node.js server (Express + WebSocket + MySQL)
├── config/              # Version & backup configuration files
├── migrations/          # SQL database migration scripts (001...043+)
├── scripts/             # Build & administration utility scripts
├── dist/                # Pre-compiled frontend static bundle
├── server-dist/         # Pre-compiled backend server bundle
├── .github/workflows/   # Automated CI/CD release workflow
└── .env                 # Database & port environment variables
```

### Useful Commands

```bash
# Production build & verification
pnpm build        # Bundles frontend to dist/ and server to server-dist/
pnpm check        # Runs TypeScript typechecker

# Windows Service management (Admin CMD)
nssm status IsraPOSServer
nssm restart IsraPOSServer

# Password reset utility
node scripts/reset-admin-password.js
```

---

**Version**: 2.14.0  
**Database Version**: 043  
**Last Updated**: August 2026  
**System Requirements**: Windows 10/11 (64-bit), Node.js 20+, MySQL 8.0+
