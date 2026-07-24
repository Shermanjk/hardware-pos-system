import { useState, useEffect } from "react";
import { Menu, Bell, ChevronDown, LogOut, PackageX, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useReturnNotifications, useVoidRequestNotifications } from "@/shared/hooks/useReturnNotifications";
import { useLocation } from "wouter";

interface TopNavProps {
  onMenuClick: () => void;
}

export default function AdminTopNav({ onMenuClick }: TopNavProps) {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  const { notifications, unreadCount, clearAll } = useReturnNotifications();
  const { notifications: voidNotifications, unreadCount: voidUnreadCount, clearAll: clearAllVoid } = useVoidRequestNotifications();

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
      setDate(now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const initials = user?.full_name
    ? user.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "AU";
  const displayName = user?.full_name ?? "Admin User";

  return (
    <header className="h-16 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
      {/* Left */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onMenuClick} className="lg:hidden text-gray-500">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="hidden sm:flex flex-col">
          <p className="text-sm font-semibold text-gray-900">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
            <span className="text-blue-600">Admin</span>
          </p>
          <p className="text-xs text-gray-400">Welcome back to Isra Hardware</p>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Date & time */}
        <div className="hidden md:flex flex-col items-end mr-2">
          <span className="text-sm font-semibold text-gray-800 tabular-nums">{time}</span>
          <span className="text-xs text-gray-400">{date}</span>
        </div>

        {/* Void request notifications bell */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="relative h-9 w-9 p-0 text-gray-500 hover:text-gray-900"
            >
              <Ban className={`h-5 w-5 ${voidUnreadCount > 0 ? "text-red-500" : ""}`} />
              {voidUnreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white animate-pulse">
                  {voidUnreadCount > 99 ? "99+" : voidUnreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-900">Void Requests</span>
              {voidUnreadCount > 0 && (
                <button onClick={clearAllVoid} className="text-xs text-blue-600 hover:text-blue-800">Clear all</button>
              )}
            </div>
            {voidNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                <Ban className="h-8 w-8" />
                <p className="text-sm">No pending void requests</p>
              </div>
            ) : (
              <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                {voidNotifications.map((n) => (
                  <li
                    key={`${n.void_id}-${n.created_at}`}
                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => { clearAllVoid(); setLocation("/void-requests"); }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-8 w-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                        <Ban className="h-4 w-4 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{n.invoice_number}</p>
                        <p className="text-xs text-gray-600 truncate">From: <span className="font-medium">{n.cashier_name}</span></p>
                        <p className="text-xs text-gray-500 truncate">Customer: {n.customer_name}</p>
                        <p className="text-xs text-gray-500 truncate">Amount: ₱{Number(n.total_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">Reason: {n.reason}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(n.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {voidNotifications.length > 0 && (
              <div className="border-t border-gray-100 px-4 py-2.5">
                <button
                  className="w-full text-xs text-center text-blue-600 hover:text-blue-800 font-medium"
                  onClick={() => { clearAllVoid(); setLocation("/void-requests"); }}
                >
                  View all void requests →
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Return notifications bell */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="relative h-9 w-9 p-0 text-gray-500 hover:text-gray-900"
            >
              <Bell className={`h-5 w-5 ${unreadCount > 0 ? "text-orange-500" : ""}`} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white animate-pulse">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-900">Return Requests</span>
              {unreadCount > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Clear all
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                <PackageX className="h-8 w-8" />
                <p className="text-sm">No pending return requests</p>
              </div>
            ) : (
              <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                {notifications.map((n) => (
                  <li
                    key={`${n.id}-${n.created_at}`}
                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      clearAll();
                      setLocation("/returns");
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                        <PackageX className="h-4 w-4 text-orange-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {n.return_number}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {n.cashier_name} · Invoice {n.invoice_number}
                        </p>
                        {n.customer_name && (
                          <p className="text-xs text-gray-400 truncate">{n.customer_name}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(n.created_at).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {notifications.length > 0 && (
              <div className="border-t border-gray-100 px-4 py-2.5">
                <button
                  className="w-full text-xs text-center text-blue-600 hover:text-blue-800 font-medium"
                  onClick={() => {
                    clearAll();
                    setLocation("/returns");
                  }}
                >
                  View all returns →
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Divider */}
        <div className="w-px h-8 bg-gray-200 mx-1" />

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 pl-1 pr-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {initials}
              </div>
              <div className="hidden sm:flex flex-col items-start leading-tight">
                <span className="text-sm font-semibold text-gray-900">{displayName}</span>
                <span className="text-xs text-gray-400">Administrator</span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-gray-400 ml-0.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52" sideOffset={8}>
            <div className="px-3 py-2.5 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
              <p className="text-xs text-gray-400 mt-0.5">Administrator</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 hover:text-red-700 hover:bg-red-50 cursor-pointer gap-2 py-2"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
