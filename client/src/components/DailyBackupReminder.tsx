import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, Upload, X } from "lucide-react";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";
import { toast } from "sonner";

interface DailyBackupReminderProps {
  open: boolean;
  onClose: () => void;
  lastBackup?: string;
}

export default function DailyBackupReminder({
  open,
  onClose,
  lastBackup,
}: DailyBackupReminderProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [skipToday, setSkipToday] = useState(false);

  const handleBackupNow = async () => {
    setIsCreating(true);
    try {
      const token = loadToken();
      const response = await axios.post(
        "/api/backup/create",
        {},
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );

      if (response.data.success) {
        toast.success("Backup created successfully");
        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('backup-created'));
        onClose();
      } else {
        toast.error(response.data.error || "Failed to create backup");
      }
    } catch (error) {
      console.error("Failed to create backup:", error);
      toast.error("Failed to create backup");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRemindLater = () => {
    onClose();
    // Remind again in 1 hour
    setTimeout(() => {
      // In a real implementation, you'd use a more sophisticated reminder system
      // For now, just close the dialog
    }, 60 * 60 * 1000);
  };

  const handleSkipToday = () => {
    setSkipToday(true);
    // Store skip preference in localStorage
    const today = new Date().toDateString();
    localStorage.setItem("backupReminderSkipped", today);
    onClose();
  };

  const formatLastBackup = (dateString?: string) => {
    if (!dateString) return "No backup recorded";
    return new Date(dateString).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" />
            Daily Database Backup Reminder
          </DialogTitle>
          <DialogDescription>
            No backup has been created today. Creating a backup before closing the store is
            recommended.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Upload className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">Last Backup</p>
              <p className="text-sm text-amber-700 mt-1">
                {formatLastBackup(lastBackup)}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleRemindLater}
            disabled={isCreating}
            className="flex-1"
          >
            Remind Me Later
          </Button>
          <Button
            variant="outline"
            onClick={handleSkipToday}
            disabled={isCreating}
            className="flex-1"
          >
            Skip Today
          </Button>
          <Button
            onClick={handleBackupNow}
            disabled={isCreating}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            {isCreating ? "Creating..." : "Backup Now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
