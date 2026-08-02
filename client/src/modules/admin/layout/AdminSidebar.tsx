import { useEffect, useState, useCallback } from "react";
import { useLocation, Link } from "wouter";
import {
  LayoutDashboard, Package, FolderOpen, Boxes, Truck,
  TrendingUp, BarChart3, Users, Settings,
  ChevronLeft, ChevronRight, ChevronDown, BellRing,
} from "lucide-react";
import httpClient from "@/shared/api/httpClient";
import { useAdminNotificationPoll } from "@/shared/hooks/useAdminNotificationPoll";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

type NavItem = {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  hasAlertBadge?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
  icon?: React.ComponentType<{ className?: string }>;
};

const navStructure: (NavItem | NavGroup)[] = [
  { icon: LayoutDashboard, label: "Dashboard",  href: "/" },
  { icon: TrendingUp,      label: "Sales",       href: "/sales" },
  {
    label: "Operations",
    icon: Boxes,
    items: [
      { icon: Package,    label: "Products",             href: "/products" },
      { icon: Boxes,      label: "Inventory",            href: "/inventory",         hasAlertBadge: true },
      { icon: Truck,      label: "Suppliers",            href: "/suppliers" },
      { icon: TrendingUp, label: "Commodity Purchases",  href: "/commodity-prices",  hasAlertBadge: true },
      { icon: Truck,      label: "External Processing",  href: "/external-processing" },
      { icon: BellRing,   label: "Requests",             href: "/requests",           hasAlertBadge: true },
    ],
  } as NavGroup,
  {
    label: "Management",
    icon: Users,
    items: [
      { icon: FolderOpen, label: "Categories", href: "/categories" },
      { icon: Users,      label: "Users",      href: "/users" },
    ],
  } as NavGroup,
  { icon: BarChart3, label: "Reports",  href: "/reports" },
  { icon: Settings,  label: "Settings", href: "/settings" },
];

// ─── Hook: low-stock count (inventory badge) ──────────────────────────────────

function useLowStockCount() {
  const [count, setCount] = useState(0);

  const fetch = useCallback(async () => {
    try {
      const res = await httpClient.get<{
        out_of_stock: string;
        critical: string;
        low_stock: string;
      }>("/api/inventory/summary");
      setCount(
        Number(res.data.out_of_stock ?? 0) +
        Number(res.data.critical     ?? 0) +
        Number(res.data.low_stock    ?? 0)
      );
    } catch { /* silently ignore */ }
  }, []);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, 2 * 60 * 1000); // refresh every 2 min
    return () => clearInterval(id);
  }, [fetch]);

  return count;
}

// ─── Hook: pending requests + commodity counts ────────────────────────────────

function usePendingCounts(triggerRefresh: () => void) {
  const [pendingRequests, setPendingRequests] = useState(0);
  const [pendingCommodity, setPendingCommodity] = useState(0);

  const fetch = useCallback(async () => {
    try {
      const [reqRes, commodityRes] = await Promise.allSettled([
        httpClient.get<{ pending_requests: number }>("/api/requests/kpi"),
        httpClient.get<{ pending_commodity_approvals: number }>("/api/dashboard/pending-counts"),
      ]);
      if (reqRes.status === "fulfilled")
        setPendingRequests(reqRes.value.data.pending_requests ?? 0);
      if (commodityRes.status === "fulfilled")
        setPendingCommodity(commodityRes.value.data.pending_commodity_approvals ?? 0);
    } catch { /* silently ignore */ }
  }, []);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetch]);

  // Respond to the custom event fired by other components
  useEffect(() => {
    const handleRefresh = () => { fetch(); triggerRefresh(); };
    window.addEventListener("refresh-pending-counts", handleRefresh);
    return () => window.removeEventListener("refresh-pending-counts", handleRefresh);
  }, [fetch, triggerRefresh]);

  return { pendingRequests, pendingCommodity };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function getGroupForRoute(route: string): string | null {
  for (const item of navStructure) {
    if ("items" in item && item.items.some((s) => s.href === route))
      return item.label;
  }
  return null;
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export default function AdminSidebar({ isOpen, onToggle }: SidebarProps) {
  const [location] = useLocation();

  // ── Notification data ─────────────────────────────────────────────────────
  // pendingReturns / pendingVoids come from the 60-s HTTP poll with higher-wins
  // merge. triggerRefresh is called on WS reconnect so missed notifications
  // are recovered immediately rather than waiting up to 60 s.
  const { pendingReturns, pendingVoids, triggerRefresh } = useAdminNotificationPoll();
  const alertCount      = useLowStockCount();
  const hasAlerts       = alertCount > 0;
  const { pendingRequests, pendingCommodity } = usePendingCounts(triggerRefresh);

  // Total pending for "Requests" badge (KPI already includes returns + voids)
  const totalPendingRequests = pendingRequests;

  // ── Group expand/collapse ─────────────────────────────────────────────────
  const activeGroup = getGroupForRoute(location);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(() =>
    activeGroup ? [activeGroup] : []
  );
  useEffect(() => {
    if (activeGroup && !expandedGroups.includes(activeGroup))
      setExpandedGroups((prev) => [...prev, activeGroup]);
  }, [activeGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = (label: string) =>
    setExpandedGroups((prev) =>
      prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]
    );

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
        {navStructure.map((item) => {
          // ── Standalone nav item ───────────────────────────────────────────
          if (!("items" in item)) {
            const Icon = item.icon!;
            const isActive = location === item.href;
            const showAlert = (item as NavItem).hasAlertBadge && hasAlerts;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={!isOpen ? item.label : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150 group relative
                  ${isActive ? "bg-blue-600 text-white shadow-md shadow-blue-900/40" : "text-slate-400 hover:bg-white/[0.08] hover:text-white"}`}
              >
                <span className="relative shrink-0">
                  <Icon className={`h-5 w-5 ${isActive ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
                  {showAlert && (
                    <>
                      <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 animate-ping opacity-75" />
                      <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-[#0f172a]" />
                    </>
                  )}
                </span>
                {isOpen && <span className="text-sm font-medium truncate flex-1">{item.label}</span>}
                {isOpen && showAlert && (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold leading-none">
                    {alertCount > 99 ? "99+" : alertCount}
                  </span>
                )}
                {isActive && isOpen && !showAlert && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/70" />
                )}
              </Link>
            );
          }

          // ── Grouped nav items ─────────────────────────────────────────────
          const group    = item as NavGroup;
          const isExp    = expandedGroups.includes(group.label);
          const isGrpAct = group.items.some((s) => location === s.href);

          // Group-level alert dot (shown when collapsed)
          const grpHasInventoryAlert  = group.items.some((s) => s.href === "/inventory") && hasAlerts;
          const grpHasRequestAlert    = group.items.some((s) => s.href === "/requests") && totalPendingRequests > 0;
          const grpHasCommodityAlert  = group.items.some((s) => s.href === "/commodity-prices") && pendingCommodity > 0;
          const showGroupAlert = (grpHasInventoryAlert || grpHasRequestAlert || grpHasCommodityAlert) && !isExp;

          return (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                title={!isOpen ? group.label : undefined}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150 group relative
                  ${isGrpAct ? "bg-blue-600/20 text-blue-400" : "text-slate-400 hover:bg-white/[0.08] hover:text-white"}`}
              >
                <span className="relative shrink-0">
                  {group.icon && <group.icon className="h-5 w-5 shrink-0" />}
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
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isExp ? "rotate-0" : "-rotate-90"}`} />
                  </>
                )}
              </button>

              {isOpen && isExp && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                  {group.items.map((subItem) => {
                    const SubIcon = subItem.icon!;
                    const isActive = location === subItem.href;

                    // Per-item badge count
                    let badgeCount  = 0;
                    let showBadge   = false;
                    let badgeColor  = "bg-red-500";

                    if (subItem.href === "/inventory") {
                      badgeCount = alertCount; showBadge = hasAlerts;
                    } else if (subItem.href === "/requests") {
                      // Combine request + return + void counts on the Requests badge
                      badgeCount = totalPendingRequests; showBadge = totalPendingRequests > 0;
                      badgeColor = "bg-blue-500";
                    } else if (subItem.href === "/commodity-prices") {
                      badgeCount = pendingCommodity; showBadge = pendingCommodity > 0;
                      badgeColor = "bg-orange-500";
                    }

                    return (
                      <Link
                        key={subItem.href}
                        href={subItem.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-150 group relative
                          ${isActive ? "bg-blue-600 text-white shadow-md shadow-blue-900/40" : "text-slate-400 hover:bg-white/[0.08] hover:text-white"}`}
                      >
                        <span className="relative shrink-0">
                          <SubIcon className={`h-4 w-4 ${isActive ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
                          {showBadge && (
                            <>
                              <span className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ${badgeColor} animate-ping opacity-75`} />
                              <span className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ${badgeColor} ring-1 ring-[#0f172a]`} />
                            </>
                          )}
                        </span>
                        <span className="text-sm font-medium truncate">{subItem.label}</span>
                        {showBadge && (
                          <span className={`ml-auto inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full ${badgeColor} text-white text-xs font-bold leading-none`}>
                            {badgeCount > 99 ? "99+" : badgeCount}
                          </span>
                        )}
                        {isActive && !showBadge && (
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

      {/* Toggle */}
      <div className="shrink-0 border-t border-white/10 p-2">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-slate-400 hover:bg-white/[0.08] hover:text-white transition-colors text-xs font-medium"
        >
          {isOpen
            ? <><ChevronLeft className="h-4 w-4" /><span>Collapse</span></>
            : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
