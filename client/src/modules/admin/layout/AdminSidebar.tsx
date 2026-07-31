import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import {
  LayoutDashboard, Package, FolderOpen, Boxes, Truck,
  TrendingUp, BarChart3, Users, Settings,
  ChevronLeft, ChevronRight, RotateCcw, Ban, ChevronDown, BellRing, Download, Upload,
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

  // Sales - standalone
  { icon: TrendingUp, label: "Sales", href: "/sales" },

  // Operations group
  {
    label: "Operations",
    icon: Boxes,
    items: [
      { icon: Package, label: "Products", href: "/products" },
      { icon: Boxes, label: "Inventory", href: "/inventory", hasAlertBadge: true },
      { icon: Truck, label: "Suppliers", href: "/suppliers" },
      { icon: TrendingUp, label: "Commodity Purchases", href: "/commodity-prices", hasAlertBadge: true },
      { icon: Truck, label: "External Processing", href: "/external-processing" },
      { icon: BellRing, label: "Requests", href: "/requests", hasAlertBadge: true },
    ],
  } as NavGroup,

  // Management group
  {
    label: "Management",
    icon: Users,
    items: [
      { icon: FolderOpen, label: "Categories", href: "/categories" },
      { icon: Users, label: "Users", href: "/users" },
    ],
  } as NavGroup,

  // Reports - standalone
  { icon: BarChart3, label: "Reports", href: "/reports" },

  // Settings - standalone
  { icon: Settings, label: "Settings", href: "/settings" },
];

// ─── Hook: fetch low stock count every 2 minutes ─────────────────────────────

function useLowStockCount() {
  const [count, setCount] = useState(0);

  const fetch = async () => {
    try {
      const token = loadToken();
      if (!token) return;
      const res = await axios.get<{ out_of_stock: string; critical: string; low_stock: string }>(
        "/api/inventory/summary",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const total = Number(res.data.out_of_stock ?? 0) + Number(res.data.critical ?? 0) + Number(res.data.low_stock ?? 0);
      setCount(total);
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

// ─── Hook: fetch pending counts every 2 minutes ───────────────────────────────

function usePendingCounts() {
  const [pendingRequests, setPendingRequests] = useState(0);
  const [pendingCommodity, setPendingCommodity] = useState(0);

  const fetch = async () => {
    try {
      const token = loadToken();
      if (!token) return;
      
      // Fetch unified requests KPI
      const reqRes = await axios.get<{ pending_requests: number }>(
        "/api/requests/kpi",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPendingRequests(reqRes.data.pending_requests ?? 0);

      // Fetch commodity purchase pending counts (separate from requests module)
      const commodityRes = await axios.get<{ pending_commodity_approvals: number }>(
        "/api/dashboard/pending-counts",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPendingCommodity(commodityRes.data.pending_commodity_approvals ?? 0);
    } catch (err) {
      console.error("Failed to fetch pending counts:", err);
      // silently ignore — sidebar shouldn't crash on a failed poll
    }
  };

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, 2 * 60 * 1000); // re-check every 2 min
    return () => clearInterval(id);
  }, []);

  // Listen for custom event to refresh counts immediately
  useEffect(() => {
    const handleRefresh = () => {
      fetch();
    };
    window.addEventListener('refresh-pending-counts', handleRefresh);
    return () => window.removeEventListener('refresh-pending-counts', handleRefresh);
  }, []);

  return { pendingRequests, pendingCommodity, refreshPendingCounts: fetch };
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
  const alertCount     = useLowStockCount();
  const hasAlerts      = alertCount > 0;
  const { pendingRequests, pendingCommodity } = usePendingCounts();
  
  // Auto-expand group when route belongs to it
  const activeGroup    = getGroupForRoute(location);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(() => {
    // Initially expand the group containing current route only
    if (activeGroup) return [activeGroup];
    return []; // Default: all collapsed
  });

  // Update expanded groups when location changes
  useEffect(() => {
    if (activeGroup && !expandedGroups.includes(activeGroup)) {
      setExpandedGroups((prev) => [...prev, activeGroup]);
    }
  }, [activeGroup, expandedGroups]);

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
          
          // Check if group has any alerts based on specific item types
          let groupHasAlerts = false;
          if (group.items.some((subItem) => subItem.href === "/inventory")) {
            groupHasAlerts = groupHasAlerts || hasAlerts;
          }
          if (group.items.some((subItem) => subItem.href === "/requests")) {
            groupHasAlerts = groupHasAlerts || pendingRequests > 0;
          }
          if (group.items.some((subItem) => subItem.href === "/commodity-prices")) {
            groupHasAlerts = groupHasAlerts || pendingCommodity > 0;
          }
          const showGroupAlert = groupHasAlerts && !isExpanded;

          return (
            <div key={group.label}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.label)}
                title={!isOpen ? group.label : undefined}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150 group relative
                  ${isGroupActive
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-slate-400 hover:bg-white/[0.08] hover:text-white"
                  }`}
              >
                <span className="relative shrink-0">
                  {group.icon && (
                    <group.icon className="h-5 w-5 shrink-0" />
                  )}
                  {/* Alert indicator when group is collapsed */}
                  {showGroupAlert && (
                    <>
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 animate-ping opacity-75" />
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-1 ring-[#0f172a]" />
                    </>
                  )}
                </span>
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
                    
                    // Determine alert count based on item type
                    let itemAlertCount = 0;
                    let showItemAlert = false;
                    let alertColor = "bg-red-500";
                    
                    if (subItem.href === "/inventory") {
                      itemAlertCount = alertCount;
                      showItemAlert = hasAlerts;
                    } else if (subItem.href === "/requests") {
                      itemAlertCount = pendingRequests;
                      showItemAlert = pendingRequests > 0;
                      alertColor = "bg-blue-500";
                    } else if (subItem.href === "/commodity-prices") {
                      itemAlertCount = pendingCommodity;
                      showItemAlert = pendingCommodity > 0;
                      alertColor = "bg-orange-500";
                    }

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
                          {showItemAlert && (
                            <>
                              <span className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ${alertColor} animate-ping opacity-75`} />
                              <span className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ${alertColor} ring-1 ring-[#0f172a]`} />
                            </>
                          )}
                        </span>
                        <span className="text-sm font-medium truncate">{subItem.label}</span>
                        {/* Badge count for sub-items */}
                        {isOpen && showItemAlert && (
                          <span className={`ml-auto inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full ${alertColor} text-white text-xs font-bold leading-none`}>
                            {itemAlertCount > 99 ? "99+" : itemAlertCount}
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
