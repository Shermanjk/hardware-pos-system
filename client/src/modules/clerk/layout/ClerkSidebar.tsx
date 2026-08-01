import { useLocation, Link } from "wouter";
import { useEffect, useState, useCallback } from "react";
import {
  LayoutDashboard, Boxes, PackagePlus, SlidersHorizontal,
  ClipboardList, Barcode, AlertTriangle,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import httpClient from "@/shared/api/httpClient";

interface ClerkSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

// ─── Hook: low-stock count ─────────────────────────────────────────────────────

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

const mainMenu = [
  { icon: LayoutDashboard,   label: "Dashboard",       href: "/clerk/dashboard"        },
  { icon: Boxes,             label: "Inventory",        href: "/clerk/inventory"        },
  { icon: PackagePlus,       label: "Stock In",         href: "/clerk/stock-in"         },
  { icon: SlidersHorizontal, label: "Stock Adjustment", href: "/clerk/stock-adjustment" },
  { icon: ClipboardList,     label: "Stock Count",      href: "/clerk/stock-count"      },
  { icon: Barcode,           label: "Barcode Printing", href: "/clerk/barcode-printing" },
  { icon: AlertTriangle,     label: "Low Stock",        href: "/clerk/low-stock"        },
];

export default function ClerkSidebar({ isOpen, onToggle }: ClerkSidebarProps) {
  const [location] = useLocation();
  const lowStockCount = useLowStockCount();
  const hasLowStock = lowStockCount > 0;

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
        {isOpen && (
          <p className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-widest">
            Operations
          </p>
        )}
        {mainMenu.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={!isOpen ? item.label : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150 group
                ${isActive
                  ? "bg-blue-600 text-white shadow-md shadow-blue-900/40"
                  : "text-slate-400 hover:bg-white/[0.08] hover:text-white"
                }`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
              {isOpen && (
                <span className="text-sm font-medium truncate">{item.label}</span>
              )}
              {isOpen && item.href === "/clerk/low-stock" && hasLowStock && (
                <span className="ml-auto bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  !
                </span>
              )}
              {isActive && isOpen && !(item.href === "/clerk/low-stock" && hasLowStock) && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/70" />
              )}
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
