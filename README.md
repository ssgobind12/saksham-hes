# SAKSHAM-145 HES Cloud Server & Web Portal for ssgobind.space

This backend server powers the **ssgobind.space** administration portal and REST API for the **Genus SAKSHAM-145 Android BLE/DLMS Smart Meter Client**.

---

## ⚡ Features
1. **Admin Portal**: Create and manage field technicians, supervisors, and viewers.
2. **Role-Based Access Control**:
   - `VIEWER`: Read-only meter readings.
   - `TECHNICIAN`: BLE scanning, live readings, load profiles, and relay execution.
   - `SUPERVISOR`: Relay authorizations and OTP generation.
   - `ADMIN`: User management and HES configuration.
3. **Mobile OTP Dispatch**: 6-digit OTPs generated for relay disconnect/reconnect commands sent to the technician's registered phone number.
4. **Meter Data & Audit Sync**: Centralized storage for live meter parameters, load profiles, events, and relay audit logs.

---

## 🚀 How to Deploy on `ssgobind.space`

### Option A: Standard Node.js / VPS (Ubuntu/Debian)
1. Copy the `server` folder to your server:
   ```bash
   scp -r server user@ssgobind.space:/var/www/saksham145-hes
   ```
2. SSH into your server:
   ```bash
   cd /var/www/saksham145-hes
   npm install --production
   ```
3. Start with PM2 (Process Manager):
   ```bash
   npm install -g pm2
   pm2 start server.js --name "saksham145-hes"
   pm2 save
   pm2 startup
   ```
4. Setup Nginx Reverse Proxy (pointing port 3000 to `ssgobind.space` with SSL certbot).

### Option B: cPanel / Cloud Hosting
1. Upload all files from `server/` into your cPanel Node.js App directory.
2. In cPanel **Setup Node.js App**:
   - Node.js Version: 18+ or 20+
   - Application startup file: `server.js`
   - Run `npm install` from the cPanel interface.
   - Click **Restart Application**.

---

## 🔑 Default Administrator Accounts
- **Admin**: `admin` / `admin123`
- **Technician**: `tech01` / `tech123`
- **Supervisor**: `super01` / `super123`
