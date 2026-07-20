import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import {
  LayoutDashboard, Package, FolderOpen, Boxes, Truck,
  BellRing, TrendingUp, BarChart3, Users, Settings,
  ChevronLeft, ChevronRight, RotateCcw,
} from "lucide-react";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard",      href: "/"               },
  { icon: Package,         label: "Products",       href: "/products"       },
  { icon: FolderOpen,      label: "Categories",     href: "/categories"     },
  { icon: Boxes,           label: "Inventory",      href: "/inventory"      },
  { icon: Truck,           label: "Suppliers",      href: "/suppliers"      },
  { icon: BellRing,        label: "Reorder Alerts", href: "/reorder-alerts" },
  { icon: TrendingUp,      label: "Sales",          href: "/sales"          },
  { icon: RotateCcw,       label: "Returns",        href: "/returns"        },
  { icon: BarChart3,       label: "Reports",        href: "/reports"        },
  { icon: Users,           label: "Users",          href: "/users"          },
  { icon: Settings,        label: "Settings",       href: "/settings"       },
];

// ─── Hook: fetch reorder alert count every 2 minutes ─────────────────────────

function useReorderAlertCount() {
  const [count, setCount] = useState(0);

  const fetch = async () => {
    try {
      const token = loadToken();
      if (!token) return;
      const res = await axios.get<{ total_alerts: number }>(
        "/api/reorder-alerts/summary",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCount(res.data.total_alerts ?? 0);
    } catch {
      // silently ignore — sidebar shouldn't crash on a failed poll
    }
  };

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, 2 * 60 * 1000); // re-check every 2 min
    return () => clearInterval(id);
  }, []);

  return count;
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export default function AdminSidebar({ isOpen, onToggle }: SidebarProps) {
  const [location]     = useLocation();
  const alertCount     = useReorderAlertCount();
  const hasAlerts      = alertCount > 0;
  const isAlertActive  = location === "/reorder-alerts";

  return (
    <aside
      className={`relative flex flex-col bg-[#0f172a] transition-all duration-200 shrink-0 ${
        isOpen ? "w-48" : "w-[70px]"
      }`}
    >
      {/* Logo */}
      <div className={`h-16 flex items-center border-b border-white/10 shrink-0 ${isOpen ? "px-5 gap-3" : "justify-center"}`}>
        <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg">
          <span className="text-white font-bold text-sm tracking-tight">IH</span>
        </div>
        {isOpen && (
          <div className="min-w-0 leading-none">
            <p className="text-blue-400 font-bold text-sm tracking-widest uppercase">Isra</p>
            <p className="text-white font-black text-lg tracking-tight leading-tight">Hardware</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {menuItems.map((item) => {
          const Icon     = item.icon;
          const isActive = location === item.href;
          const isAlert  = item.href === "/reorder-alerts";

          return (
            <Link key={item.href} href={item.href}>
              <a
                title={!isOpen ? item.label : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150 group relative
                  ${isActive
                    ? "bg-blue-600 text-white shadow-md shadow-blue-900/40"
                    : "text-slate-400 hover:bg-white/[0.08] hover:text-white"
                  }`}
              >
                {/* Icon — with pulsing red dot overlay when alerts exist */}
                <span className="relative shrink-0">
                  <Icon className={`h-5 w-5 ${isActive ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
                  {isAlert && hasAlerts && (
                    <>
                      {/* Outer ping ring */}
                      <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 animate-ping opacity-75" />
                      {/* Solid dot on top */}
                      <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-[#0f172a]" />
                    </>
                  )}
                </span>

                {isOpen && (
                  <span className="text-sm font-medium truncate flex-1">{item.label}</span>
                )}

                {/* Alert count badge (expanded sidebar only) */}
                {isOpen && isAlert && hasAlerts && (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold leading-none">
                    {alertCount > 99 ? "99+" : alertCount}
                  </span>
                )}

                {/* Active dot for non-alert items */}
                {isActive && isOpen && !isAlert && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/70" />
                )}
              </a>
            </Link>
          );
        })}
      </nav>

      {/* Toggle button */}
      <div className="shrink-0 border-t border-white/10 p-2">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-slate-400 hover:bg-white/[0.08] hover:text-white transition-colors text-xs font-medium"
        >
          {isOpen ? (
            <><ChevronLeft className="h-4 w-4" /><span>Collapse</span></>
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
