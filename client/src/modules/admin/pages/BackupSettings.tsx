import { useState, useEffect } from "react";
import axios from "axios";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { loadToken } from "@/shared/utils/auth";

interface BackupSettings {
  id: number;
  backup_reminder_time: string;
  backup_reminder_enabled: boolean;
  local_backup_directory: string;
  google_drive_folder_url: string;
  google_drive_folder_id: string;
  max_local_backups: number;
  automatic_cleanup_enabled: boolean;
  updated_at: string;
}

interface BackupSettingsProps {
  onUnsavedChange?: (hasUnsaved: boolean) => void;
}

export default function BackupSettings({ onUnsavedChange }: BackupSettingsProps) {
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [originalSettings, setOriginalSettings] = useState<BackupSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  // Detect unsaved changes
  useEffect(() => {
    if (settings && originalSettings) {
      const hasChanges =
        settings.backup_reminder_enabled !== originalSettings.backup_reminder_enabled ||
        settings.backup_reminder_time !== originalSettings.backup_reminder_time ||
        settings.local_backup_directory !== originalSettings.local_backup_directory ||
        settings.max_local_backups !== originalSettings.max_local_backups ||
        settings.automatic_cleanup_enabled !== originalSettings.automatic_cleanup_enabled;
      setHasUnsavedChanges(hasChanges);
      onUnsavedChange?.(hasChanges);
    }
  }, [settings, originalSettings, onUnsavedChange]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const loadSettings = async () => {
    try {
      const token = loadToken();
      const response = await axios.get("/api/backup/settings", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setSettings(response.data);
      setOriginalSettings(response.data);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Failed to load backup settings:", error);
      toast.error("Failed to load backup settings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setIsSaving(true);
    try {
      const token = loadToken();
      await axios.put("/api/backup/settings", settings, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      toast.success("Backup settings saved successfully");
      setOriginalSettings(settings);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Failed to save backup settings:", error);
      toast.error("Failed to save backup settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      toast.loading("Creating backup...");
      const token = loadToken();
      const response = await axios.post("/api/backup/create", {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      toast.dismiss();
      if (response.data.success) {
        toast.success("Backup created successfully");
        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('backup-created'));
      } else {
        toast.error(response.data.error || "Failed to create backup");
      }
    } catch (error) {
      toast.dismiss();
      console.error("Failed to create backup:", error);
      toast.error("Failed to create backup");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center text-gray-500 py-8">
        Failed to load backup settings
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Backup Settings</h1>
        <p className="text-gray-500 mt-1">
          Configure backup reminders and local storage settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backup Reminder</CardTitle>
          <CardDescription>
            Configure daily backup reminders to ensure data safety
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="reminder-enabled">Enable Daily Reminder</Label>
              <p className="text-sm text-gray-500 mt-1">
                Show a reminder at the specified time if no backup exists today
              </p>
            </div>
            <Switch
              id="reminder-enabled"
              checked={settings.backup_reminder_enabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, backup_reminder_enabled: checked })
              }
            />
          </div>

          <div>
            <Label htmlFor="reminder-time">Reminder Time</Label>
            <Input
              id="reminder-time"
              type="time"
              value={settings.backup_reminder_time}
              onChange={(e) =>
                setSettings({ ...settings, backup_reminder_time: e.target.value })
              }
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Local Backup Storage</CardTitle>
          <CardDescription>
            Configure local backup directory and retention policy
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="backup-dir">Backup Directory</Label>
            <Input
              id="backup-dir"
              value={settings.local_backup_directory}
              onChange={(e) =>
                setSettings({ ...settings, local_backup_directory: e.target.value })
              }
              className="mt-1"
              placeholder="E:\Database Backup"
            />
          </div>

          <div>
            <Label htmlFor="max-backups">Maximum Local Backups</Label>
            <Input
              id="max-backups"
              type="number"
              min="1"
              max="365"
              value={settings.max_local_backups}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  max_local_backups: parseInt(e.target.value) || 30,
                })
              }
              className="mt-1"
            />
            <p className="text-sm text-gray-500 mt-1">
              Older backups beyond this limit will be automatically deleted
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto-cleanup">Automatic Cleanup</Label>
              <p className="text-sm text-gray-500 mt-1">
                Automatically delete old backups beyond the maximum limit
              </p>
            </div>
            <Switch
              id="auto-cleanup"
              checked={settings.automatic_cleanup_enabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, automatic_cleanup_enabled: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Backup</CardTitle>
          <CardDescription>
            Create a backup immediately
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleCreateBackup}>
            Create Backup Now
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={loadSettings} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving || !hasUnsavedChanges}>
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
