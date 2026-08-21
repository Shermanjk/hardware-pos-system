import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import {
  Download,
  Database,
  Cpu,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export type UpdatePhase = "downloading" | "backup" | "migrating" | "restarting" | "complete" | "error";

interface UpdateProgressModalProps {
  isOpen: boolean;
  targetVersion?: string;
  targetDbVersion?: string;
  phase: UpdatePhase;
  errorMessage?: string | null;
  onRetry?: () => void;
  onClose?: () => void;
}

interface StepInfo {
  id: UpdatePhase;
  label: string;
  sublabel: string;
  icon: typeof Download;
  progressPercent: number;
}

const STEPS: StepInfo[] = [
  {
    id: "downloading",
    label: "Downloading Package",
    sublabel: "Fetching latest release bundle from GitHub…",
    icon: Download,
    progressPercent: 25,
  },
  {
    id: "backup",
    label: "Safety Backup",
    sublabel: "Taking automated MySQL database snapshot…",
    icon: Database,
    progressPercent: 50,
  },
  {
    id: "migrating",
    label: "Applying Migrations",
    sublabel: "Executing database updates and new features…",
    icon: Cpu,
    progressPercent: 75,
  },
  {
    id: "restarting",
    label: "Restarting Server",
    sublabel: "Applying changes and waiting for service reboot…",
    icon: RefreshCw,
    progressPercent: 90,
  },
];

export function UpdateProgressModal({
  isOpen,
  targetVersion,
  targetDbVersion,
  phase,
  errorMessage,
  onRetry,
  onClose,
}: UpdateProgressModalProps) {
  const [activeStep, setActiveStep] = useState<UpdatePhase>(phase);
  const [progress, setProgress] = useState(25);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isServerReady, setIsServerReady] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Sync internal active step with prop phase
  useEffect(() => {
    setActiveStep(phase);
    if (phase === "downloading") setProgress(25);
    else if (phase === "backup") setProgress(50);
    else if (phase === "migrating") setProgress(75);
    else if (phase === "restarting") setProgress(90);
    else if (phase === "complete") setProgress(100);
  }, [phase]);

  // Handle health-check polling when server is in restarting phase
  useEffect(() => {
    if (activeStep !== "restarting" || isServerReady) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    let attempts = 0;
    const maxAttempts = 35; // ~42 seconds max wait

    pollingRef.current = setInterval(async () => {
      attempts++;
      setReconnectAttempts(attempts);

      try {
        const res = await axios.get("/api/system-update/version", {
          timeout: 2000,
          headers: { "Cache-Control": "no-cache" },
        });

        if (res.status === 200) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setIsServerReady(true);
          setActiveStep("complete");
          setProgress(100);

          // Smooth reload after showing success celebration
          setTimeout(() => {
            window.location.reload();
          }, 1800);
        }
      } catch {
        // Expected while server is rebooting
        if (attempts >= maxAttempts) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          // Fallback force reload
          window.location.reload();
        }
      }
    }, 1200);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [activeStep, isServerReady]);

  if (!isOpen || typeof document === "undefined") return null;

  const currentStepIndex = STEPS.findIndex((s) => s.id === activeStep);

  return createPortal(
    <div className="fixed inset-0 z-[999999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl shadow-2xl max-w-lg w-full p-6 sm:p-8 overflow-hidden relative">
        {/* Subtle Ambient Glow */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            Isra Hardware POS System
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            {activeStep === "complete" ? "Update Installed Successfully!" : "Installing System Update"}
          </h2>
          <p className="text-sm text-slate-400">
            {targetVersion ? (
              <>
                Upgrading to version <span className="font-semibold text-blue-400">{targetVersion}</span>
                {targetDbVersion ? ` (DB Schema ${targetDbVersion})` : ""}
              </>
            ) : (
              "Please do not close this window or turn off the server PC."
            )}
          </p>
        </div>

        {/* Error State View */}
        {activeStep === "error" ? (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-900/50 flex items-start gap-3.5 text-red-300">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-red-200">Update Encountered an Error</p>
                <p className="text-red-300/90 leading-relaxed">
                  {errorMessage || "An unexpected error occurred while applying the update."}
                </p>
                <p className="text-xs text-red-400/80 pt-1">
                  Your previous database snapshot was preserved safely.
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              {onClose && (
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  Close
                </Button>
              )}
              {onRetry && (
                <Button
                  onClick={onRetry}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-medium"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
              )}
            </div>
          </div>
        ) : activeStep === "complete" ? (
          /* Complete State View */
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto text-green-400 animate-in zoom-in-50 duration-300">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold text-green-300">Server is Back Online!</p>
              <p className="text-sm text-slate-400">Refreshing application in a moment…</p>
            </div>
            <Progress value={100} className="h-1.5 bg-slate-800 [&>div]:bg-green-500" />
          </div>
        ) : (
          /* Live Progress State View */
          <div className="space-y-6">
            {/* Step Indicators */}
            <div className="grid grid-cols-4 gap-2">
              {STEPS.map((s, idx) => {
                const isPast = currentStepIndex > idx;
                const isCurrent = currentStepIndex === idx;
                const Icon = s.icon;

                return (
                  <div
                    key={s.id}
                    className={`flex flex-col items-center text-center p-2 rounded-xl border transition-all duration-300 ${
                      isCurrent
                        ? "bg-blue-500/10 border-blue-500/30 text-blue-400 ring-1 ring-blue-500/20 shadow-lg shadow-blue-500/10"
                        : isPast
                        ? "bg-slate-800/40 border-slate-700/50 text-emerald-400"
                        : "bg-slate-900/40 border-slate-800 text-slate-500"
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center mb-1.5 transition-colors ${
                        isCurrent
                          ? "bg-blue-500 text-white animate-pulse"
                          : isPast
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-slate-800 text-slate-500"
                      }`}
                    >
                      {isPast ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : isCurrent && s.id === "restarting" ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Icon className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <span className="text-[11px] font-medium leading-tight line-clamp-1">{s.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Current Active Status Card */}
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-4">
              <div className="relative flex items-center justify-center shrink-0">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                </div>
                <div className="absolute inset-0 rounded-xl bg-blue-400/20 animate-ping opacity-30 pointer-events-none" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-200">
                  {STEPS[currentStepIndex]?.label || "Applying Update…"}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {activeStep === "restarting"
                    ? reconnectAttempts > 0
                      ? `Ping attempt ${reconnectAttempts} — Reconnecting to server…`
                      : "Server service rebooting…"
                    : STEPS[currentStepIndex]?.sublabel || "Working…"}
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-blue-400 shrink-0">{progress}%</span>
            </div>

            {/* Smooth Progress Bar */}
            <div className="space-y-1.5">
              <Progress
                value={progress}
                className="h-2 bg-slate-800 [&>div]:bg-gradient-to-r [&>div]:from-blue-600 [&>div]:to-indigo-500 [&>div]:transition-all [&>div]:duration-500"
              />
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Phase {Math.min(currentStepIndex + 1, 4)} of 4</span>
                <span className="flex items-center gap-1 text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Database Protection Active
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
