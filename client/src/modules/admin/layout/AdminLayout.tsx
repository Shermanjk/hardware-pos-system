import { useState, useEffect, useRef } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminTopNav from "./AdminTopNav";
import DailyBackupReminder from "@/components/DailyBackupReminder";
import PageTransition from "@/shared/components/PageTransition";
import BackToTop from "@/shared/components/BackToTop";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const mainRef = useRef<HTMLElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{
    exists: boolean;
    lastBackup?: string;
  } | null>(null);

  useEffect(() => {
    // Check backup status on mount - deferred to not block initial render
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

    // Defer backup check to avoid blocking initial render
    const timeoutId = setTimeout(() => {
      checkBackupStatus();
    }, 100);

    // Listen for backup creation event to refresh status
    const handleBackupCreated = () => {
      checkBackupStatus();
    };

    window.addEventListener('backup-created', handleBackupCreated);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('backup-created', handleBackupCreated);
    };
  }, []);

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <AdminSidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <AdminTopNav onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} />
        <main ref={mainRef} className="flex-1 overflow-y-auto p-6 lg:p-8 scroll-smooth">
          <PageTransition>
            {children}
          </PageTransition>
        </main>
      </div>
      <BackToTop containerRef={mainRef} threshold={200} />
      <DailyBackupReminder
        open={showBackupReminder}
        onClose={() => setShowBackupReminder(false)}
        lastBackup={backupStatus?.lastBackup}
      />
    </div>
  );
}
