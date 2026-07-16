import { useState, useEffect } from "react";
import { Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClerkAuth } from "@/shared/contexts/ClerkAuthContext";

interface ClerkTopNavProps {
  onMenuClick: () => void;
}

// Mock notifications — will come from API later
const mockNotifications = [
  { id: 1, message: "8 products are below reorder level", type: "warning", time: "5 min ago" },
  { id: 2, message: "Stock In #SI-042 saved successfully",  type: "success", time: "1 hr ago"  },
  { id: 3, message: "Portland Cement is out of stock",      type: "danger",  time: "2 hr ago"  },
];

export default function ClerkTopNav({ onMenuClick }: ClerkTopNavProps) {
  const { user: clerkUser } = useClerkAuth();
  const [currentTime, setCurrentTime] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  const [showNotifs, setShowNotifs] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
      setCurrentDate(
        now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  // Close notification panel when clicking outside
  useEffect(() => {
    if (!showNotifs) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-notif-panel]")) setShowNotifs(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNotifs]);

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      {/* Left — mobile menu toggle */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onMenuClick}
          className="lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Breadcrumb label */}
        <div className="hidden sm:block">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">
            Inventory Clerk Terminal
          </p>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-5">
        {/* Date & time */}
        <div className="hidden md:flex flex-col items-end text-sm">
          <span className="font-semibold text-gray-900">{currentTime}</span>
          <span className="text-gray-500 text-xs">{currentDate}</span>
        </div>

        {/* Notifications */}
        <div className="relative" data-notif-panel>
          <Button
            variant="ghost"
            size="sm"
            className="relative h-9 w-9 p-0"
            onClick={() => setShowNotifs((v) => !v)}
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5 text-gray-600" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full ring-2 ring-white" />
          </Button>

          {showNotifs && (
            <div className="absolute right-0 top-11 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">Notifications</p>
                <p className="text-xs text-gray-500">{mockNotifications.length} unread</p>
              </div>
              <div className="divide-y divide-gray-50">
                {mockNotifications.map((n) => (
                  <div key={n.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex gap-3 items-start">
                      <span
                        className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${
                          n.type === "warning"
                            ? "bg-amber-400"
                            : n.type === "danger"
                            ? "bg-red-500"
                            : "bg-green-500"
                        }`}
                      />
                      <div>
                        <p className="text-sm text-gray-800">{n.message}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{n.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 border-t border-gray-100">
                <button className="text-xs text-blue-600 hover:underline w-full text-center">
                  Mark all as read
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Clerk identity */}
        <div className="flex items-center gap-3 pl-5 border-l border-gray-200">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-semibold text-gray-900">
              {clerkUser?.full_name ?? "Inventory Clerk"}
            </span>
            <span className="text-xs text-blue-600 font-medium">Inventory Clerk</span>
          </div>
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm select-none">
            {clerkUser?.full_name
              ? clerkUser.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
              : "IC"}
          </div>
        </div>
      </div>
    </div>
  );
}
