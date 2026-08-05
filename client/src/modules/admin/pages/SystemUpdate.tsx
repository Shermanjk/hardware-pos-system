import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { loadToken } from "@/shared/utils/auth";
import axios from "axios";
import {
    CheckCircle,
    Clock,
    Download,
    RefreshCw,
    Upload
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface VersionStatus {
  installedVersion: string;
  downloadedVersion: string;
  installedDatabaseVersion: string;
  downloadedDatabaseVersion: string;
  updateAvailable: boolean;
  databaseUpdateRequired: boolean;
}

interface FetchResult extends VersionStatus {
  message: string;
  hasUpdates: boolean;
}

type UpdateStep =
  | "idle"         // nothing happening
  | "checking"     // git fetch in progress
  | "ready"        // update available, ready to install
  | "installing"   // install in progress
  | "restarting";  // waiting for app restart

export default function SystemUpdate() {
  const [versionStatus, setVersionStatus] = useState<VersionStatus | null>(null);
  const [step, setStep] = useState<UpdateStep>("idle");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    loadVersionStatus();
  }, []);

  const authHeaders = () => {
    const token = loadToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadVersionStatus = async () => {
    try {
      const response = await axios.get<VersionStatus>("/api/system-update/version", {
        headers: authHeaders(),
      });
      setVersionStatus(response.data);
      // If there's already an update pending, jump straight to ready state
      if (response.data.updateAvailable || response.data.databaseUpdateRequired) {
        setStep("ready");
      }
    } catch (error) {
      console.error("Failed to load version status:", error);
    }
  };

  // ─── Step 1: Check for updates (git fetch, no working-tree change) ──────────
  const handleCheckUpdates = async () => {
    setStep("checking");
    try {
      const response = await axios.post<FetchResult>(
        "/api/system-update/fetch",
        {},
        { headers: authHeaders() }
      );
      const data = response.data;
      setVersionStatus(data);
      setLastChecked(new Date());

      if (data.hasUpdates || data.updateAvailable || data.databaseUpdateRequired) {
        // Pull the changes so version.json is up-to-date and migrations are available
        await axios.post("/api/system-update/pull", {}, { headers: authHeaders() });
        // Reload version status after pull
        const statusRes = await axios.get<VersionStatus>("/api/system-update/version", {
          headers: authHeaders(),
        });
        setVersionStatus(statusRes.data);
        setStep("ready");
        toast.success("Update downloaded and ready to install");
      } else {
        setStep("idle");
        toast.success("You are already up to date");
      }
    } catch (error: any) {
      console.error("Failed to check for updates:", error);
      const message = error.response?.data?.message || "Failed to check for updates";
      toast.error(message);
      setStep("idle");
    }
  };

  // ─── Step 2: Install update (migrations → version bump → restart) ──────────
  const handleInstallUpdate = async () => {
    if (!versionStatus?.updateAvailable && !versionStatus?.databaseUpdateRequired) return;

    setStep("installing");
    try {
      await axios.post("/api/system-update/install", {}, { headers: authHeaders() });
      setStep("restarting");
      toast.success("Update installed. The system will restart now…");

      // Persist the session token across the restart so the user doesn't have
      // to re-login. AuthContext will restore it from localStorage on relaunch.
      const token = sessionStorage.getItem("pos_token");
      if (token) {
        localStorage.setItem("pos_token_persist_restart", token);
      }

      // Give Electron a moment to detect the restart flag, then reload as fallback
      setTimeout(() => {
        window.location.reload();
      }, 4000);
    } catch (error: any) {
      console.error("Failed to install update:", error);
      const status = error.response?.status;
      const message = error.response?.data?.message || "Failed to install update";

      if (status === 409) {
        // Maintenance mode stuck from a previous interrupted install — auto-reset
        toast.error("System was stuck in maintenance mode. Resetting — please try again.");
        try {
          await axios.post("/api/system-update/reset-maintenance", {}, { headers: authHeaders() });
        } catch { /* ignore reset errors */ }
      } else {
        toast.error(message);
      }
      setStep("ready");
    }
  };

  const updateRequired = Boolean(
    versionStatus?.updateAvailable || versionStatus?.databaseUpdateRequired
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">System Update</h1>
        <p className="text-gray-500 mt-1">
          Manage application updates and database migrations
        </p>
      </div>

      {/* Version Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Version Status</span>
            <div className="flex items-center gap-2">
              {lastChecked && (
                <span className="text-xs text-gray-400 font-normal flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Checked {lastChecked.toLocaleTimeString()}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckUpdates}
                disabled={step !== "idle" && step !== "ready"}
              >
                {step === "checking" ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Checking…
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Check for Updates
                  </>
                )}
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            Compare your installed version with the latest available
          </CardDescription>
        </CardHeader>
        <CardContent>
          {versionStatus ? (
            <div className="space-y-4">
              {/* Version grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-gray-500">Installed Version</p>
                  <p className="text-lg font-semibold">{versionStatus.installedVersion}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-gray-500">Latest Version</p>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-semibold">{versionStatus.downloadedVersion}</p>
                    {versionStatus.updateAvailable && (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                        New
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-gray-500">Database Version</p>
                  <p className="text-lg font-semibold">{versionStatus.installedDatabaseVersion}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-gray-500">Required Database Version</p>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-semibold">{versionStatus.downloadedDatabaseVersion}</p>
                    {versionStatus.databaseUpdateRequired && (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                        Pending
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Status banner */}
              {step === "restarting" && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <RefreshCw className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                  <div>
                    <p className="font-medium text-blue-900">Restarting…</p>
                    <p className="text-sm text-blue-700">
                      The system is restarting to apply the update. Please wait.
                    </p>
                  </div>
                </div>
              )}

              {step === "installing" && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <RefreshCw className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-blue-900">Installing update…</p>
                    <p className="text-sm text-blue-700">
                      Running database migrations and preparing restart. Please do not close the app.
                    </p>
                  </div>
                </div>
              )}

              {step !== "installing" && step !== "restarting" && updateRequired && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <Download className="w-5 h-5 text-blue-600 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-blue-900">Update Ready to Install</p>
                    <p className="text-sm text-blue-700">
                      {versionStatus.updateAvailable && versionStatus.databaseUpdateRequired
                        ? `Version ${versionStatus.downloadedVersion} with database migration ${versionStatus.downloadedDatabaseVersion} is ready`
                        : versionStatus.updateAvailable
                        ? `Version ${versionStatus.downloadedVersion} is ready`
                        : `Database migration to version ${versionStatus.downloadedDatabaseVersion} is ready`}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      A backup will be created automatically before any changes are applied.
                    </p>
                  </div>
                  <Button
                    onClick={handleInstallUpdate}
                    disabled={step !== "ready" && step !== "idle"}
                    className="bg-blue-600 hover:bg-blue-700 shrink-0"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Install Update
                  </Button>
                </div>
              )}

              {step !== "installing" && step !== "restarting" && !updateRequired && (
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                  <div>
                    <p className="font-medium text-green-900">Up to Date</p>
                    <p className="text-sm text-green-700">
                      You are running the latest version of the system.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-500">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <p className="text-sm">Loading version status…</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="border-gray-100 bg-gray-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-600">How Updates Work</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
            <li><span className="font-medium">Check for Updates</span> — fetches the latest changes from the repository</li>
            <li><span className="font-medium">Install Update</span> — creates a database backup, applies pending migrations, and schedules a rebuild</li>
            <li><span className="font-medium">Restart</span> — the system restarts automatically, builds the new version, and comes back online</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
