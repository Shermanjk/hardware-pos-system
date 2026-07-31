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
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  Clock,
  Upload,
  Download
} from "lucide-react";
import { toast } from "sonner";
import { loadToken } from "@/shared/utils/auth";

interface VersionStatus {
  installedVersion: string;
  downloadedVersion: string;
  installedDatabaseVersion: string;
  downloadedDatabaseVersion: string;
  updateAvailable: boolean;
  databaseUpdateRequired: boolean;
}

export default function SystemUpdate() {
  const [versionStatus, setVersionStatus] = useState<VersionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    loadVersionStatus();
  }, []);

  const loadVersionStatus = async () => {
    try {
      const token = loadToken();
      const response = await axios.get("/api/system-update/version", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setVersionStatus(response.data);
    } catch (error) {
      console.error("Failed to load version status:", error);
    }
  };

  const handleInstallUpdate = async () => {
    if (!versionStatus?.updateAvailable) return;

    setIsInstalling(true);
    try {
      const token = loadToken();
      await axios.post("/api/system-update/install", {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      toast.success("Update installed successfully. Restarting...");
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error("Failed to install update:", error);
      toast.error("Failed to install update");
    } finally {
      setIsInstalling(false);
    }
  };

  const handleCheckUpdates = async () => {
    setIsLoading(true);
    await loadVersionStatus();
    setIsLoading(false);
    toast.success("Version status updated");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">System Update</h1>
        <p className="text-gray-500 mt-1">
          Manage application updates, database migrations, and backups
        </p>
      </div>

      {/* Version Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Version Status</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckUpdates}
              disabled={isLoading}
            >
              <Download className="w-4 h-4 mr-2" />
              Check for Updates
            </Button>
          </CardTitle>
          <CardDescription>
            Current installed version vs. downloaded version
          </CardDescription>
        </CardHeader>
        <CardContent>
          {versionStatus ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Installed Version</p>
                  <p className="text-lg font-semibold">{versionStatus.installedVersion}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Downloaded Version</p>
                  <p className="text-lg font-semibold">{versionStatus.downloadedVersion}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Database Version</p>
                  <p className="text-lg font-semibold">{versionStatus.installedDatabaseVersion}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Required Database Version</p>
                  <p className="text-lg font-semibold">{versionStatus.downloadedDatabaseVersion}</p>
                </div>
              </div>

              {versionStatus.updateAvailable && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-blue-600" />
                  <div className="flex-1">
                    <p className="font-medium text-blue-900">Update Ready to Install</p>
                    <p className="text-sm text-blue-700">
                      Version {versionStatus.downloadedVersion} is available
                    </p>
                  </div>
                  <Button
                    onClick={handleInstallUpdate}
                    disabled={isInstalling}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {isInstalling ? "Installing..." : "Install Update"}
                  </Button>
                </div>
              )}

              {!versionStatus.updateAvailable && (
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-900">Up to Date</p>
                    <p className="text-sm text-green-700">
                      You are running the latest version
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500">Loading version status...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
