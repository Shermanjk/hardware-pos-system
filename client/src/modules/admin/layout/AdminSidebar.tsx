import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import {
  LayoutDashboard, Package, FolderOpen, Boxes, Truck,
  TrendingUp, BarChart3, Users, Settings,
  ChevronLeft, ChevronRight, RotateCcw, Ban, ChevronDown, BellRing,
} from "lucide-react";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

// Navigation group type
type NavItem = {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  hasAlertBadge?: boolean;
  isAlertRoute?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
  icon?: React.ComponentType<{ className?: string }>;
};

// Define navigation structure
const navStructure: (NavItem | NavGroup)[] = [
  // Dashboard - standalone
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },

  // Operations group
  {
    label: "Operations",
    icon: Boxes,
    items: [
      { icon: Package, label: "Products", href: "/products" },
      { icon: Boxes, label: "Inventory", href: "/inventory", hasAlertBadge: true },
      { icon: Truck, label: "Suppliers", href: "/suppliers" },
      { icon: BellRing, label: "Reorder Alerts", href: "/reorder-alerts", isAlertRoute: true },
      { icon: TrendingUp, label: "Commodity Purchases", href: "/commodity-prices" },
    ],
  } as NavGroup,

  // Sales group
  {
    label: "Sales",
    icon: TrendingUp,
    items: [
      { icon: TrendingUp, label: "Sales", href: "/sales" },
      { icon: RotateCcw, label: "Returns", href: "/returns" },
      { icon: Ban, label: "Void Requests", href: "/void-requests" },
    ],
  } as NavGroup,

  // Reports - standalone
  { icon: BarChart3, label: "Reports", href: "/reports" },

  // Management group
  {
    label: "Management",
    icon: Users,
    items: [
      { icon: FolderOpen, label: "Categories", href: "/categories" },
      { icon: Users, label: "Users", href: "/users" },
      { icon: Settings, label: "Settings", href: "/settings" },
    ],
  } as NavGroup,
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

// ─── Check if a route belongs to a group ─────────────────────────────────────

function getGroupForRoute(route: string): string | null {
  for (const item of navStructure) {
    if ("items" in item) {
      if (item.items.some((subItem) => subItem.href === route)) {
        return item.label;
      }
    }
  }
  return null;
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export default function AdminSidebar({ isOpen, onToggle }: SidebarProps) {
  const [location]     = useLocation();
  const alertCount     = useReorderAlertCount();
  const hasAlerts      = alertCount > 0;
  
  // Auto-expand group when route belongs to it
  const activeGroup    = getGroupForRoute(location);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(() => {
    // Initially expand the group containing current route, or all groups if dashboard/reports
    if (activeGroup) return [activeGroup];
    return ["Operations", "Sales", "Management"]; // Default expanded
  });

  // Update expanded groups when location changes
  useEffect(() => {
    if (activeGroup && !expandedGroups.includes(activeGroup)) {
      setExpandedGroups((prev) => [...prev, activeGroup]);
    }
  }, [activeGroup]);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) =>
      prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]
    );
  };

  const isGroupExpanded = (label: string) => expandedGroups.includes(label);

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
        {navStructure.map((item, idx) => {
          // Standalone item
          if (!("items" in item)) {
            const Icon = item.icon!;
            const isActive = location === item.href;
            const showAlertsOnItem = (item as NavItem).hasAlertBadge && hasAlerts;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={!isOpen ? item.label : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150 group relative
                  ${isActive
                    ? "bg-blue-600 text-white shadow-md shadow-blue-900/40"
                    : "text-slate-400 hover:bg-white/[0.08] hover:text-white"
                  }`}
              >
                <span className="relative shrink-0">
                  <Icon className={`h-5 w-5 ${isActive ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
                  {/* Reorder alert indicator */}
                  {showAlertsOnItem && (
                    <>
                      <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 animate-ping opacity-75" />
                      <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-[#0f172a]" />
                    </>
                  )}
                </span>

                {isOpen && (
                  <span className="text-sm font-medium truncate flex-1">{item.label}</span>
                )}

                {isOpen && showAlertsOnItem && (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold leading-none">
                    {alertCount > 99 ? "99+" : alertCount}
                  </span>
                )}

                {isActive && isOpen && !showAlertsOnItem && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/70" />
                )}
              </Link>
            );
          }

          // Grouped items
          const group = item as NavGroup;
          const isExpanded = isGroupExpanded(group.label);
          const isGroupActive = group.items.some((subItem) => location === subItem.href);

          return (
            <div key={group.label}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.label)}
                title={!isOpen ? group.label : undefined}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150 group
                  ${isGroupActive
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-slate-400 hover:bg-white/[0.08] hover:text-white"
                  }`}
              >
                {group.icon && (
                  <group.icon className="h-5 w-5 shrink-0" />
                )}
                {isOpen && (
                  <>
                    <span className="text-sm font-medium truncate flex-1 text-left">{group.label}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                        isExpanded ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                  </>
                )}
              </button>

              {/* Group children */}
              {isOpen && isExpanded && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                  {group.items.map((subItem) => {
                    const SubIcon = subItem.icon!;
                    const isActive = location === subItem.href;
                    const showAlertBadge = subItem.hasAlertBadge && hasAlerts;

                    return (
                      <Link
                        key={subItem.href}
                        href={subItem.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-150 group relative
                          ${isActive
                            ? "bg-blue-600 text-white shadow-md shadow-blue-900/40"
                            : "text-slate-400 hover:bg-white/[0.08] hover:text-white"
                          }`}
                      >
                        <span className="relative shrink-0">
                          <SubIcon className={`h-4 w-4 ${isActive ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
                          {/* Alert indicator for sub-items with badge */}
                          {showAlertBadge && (
                            <>
                              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 animate-ping opacity-75" />
                              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-1 ring-[#0f172a]" />
                            </>
                          )}
                        </span>
                        <span className="text-sm font-medium truncate">{subItem.label}</span>
                        {/* Badge count for sub-items */}
                        {isOpen && showAlertBadge && (
                          <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-red-500 text-white text-xs font-bold leading-none">
                            {alertCount > 99 ? "99+" : alertCount}
                          </span>
                        )}
                        {isActive && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/70" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
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
