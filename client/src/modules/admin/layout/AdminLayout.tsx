import { useState, useEffect } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminTopNav from "./AdminTopNav";
import DailyBackupReminder from "@/components/DailyBackupReminder";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{
    exists: boolean;
    lastBackup?: string;
  } | null>(null);

  useEffect(() => {
    // Check backup status on mount
    const checkBackupStatus = async () => {
      try {
        const token = loadToken();
        const response = await axios.get("/api/backup/settings", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const settings = response.data;

        // Check if reminder is enabled
        if (settings.backup_reminder_enabled) {
          // Check if today's backup exists
          const statusRes = await axios.get("/api/backup/today-status", {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          const status = statusRes.data;

          setBackupStatus(status);

          // Check if already skipped today
          const today = new Date().toDateString();
          const skippedToday = localStorage.getItem("backupReminderSkipped") === today;

          // Show reminder if no backup today and not skipped
          if (!status.exists && !skippedToday) {
            // Check if reminder time has passed
            const now = new Date();
            const reminderTime = new Date(settings.backup_reminder_time);
            reminderTime.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());

            if (now >= reminderTime) {
              setShowBackupReminder(true);
            }
          } else {
            // Hide reminder if backup exists
            setShowBackupReminder(false);
          }
        }
      } catch (error) {
        console.error("Failed to check backup status:", error);
      }
    };

    checkBackupStatus();

    // Listen for backup creation event to refresh status
    const handleBackupCreated = () => {
      checkBackupStatus();
    };

    window.addEventListener('backup-created', handleBackupCreated);
    return () => window.removeEventListener('backup-created', handleBackupCreated);
  }, []);

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <AdminSidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <AdminTopNav onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 transition-opacity duration-300">
          {children}
        </main>
      </div>
      <DailyBackupReminder
        open={showBackupReminder}
        onClose={() => setShowBackupReminder(false)}
        lastBackup={backupStatus?.lastBackup}
      />
    </div>
  );
}
