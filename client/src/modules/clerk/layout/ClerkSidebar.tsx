import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Boxes,
  PackagePlus,
  SlidersHorizontal,
  ClipboardList,
  Barcode,
  AlertTriangle,
  UserCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClerkAuth } from "@/shared/contexts/ClerkAuthContext";

interface ClerkSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const mainMenu = [
  { icon: LayoutDashboard,  label: "Dashboard",        href: "/clerk/dashboard"         },
  { icon: Boxes,            label: "Inventory",         href: "/clerk/inventory"         },
  { icon: PackagePlus,      label: "Stock In",          href: "/clerk/stock-in"          },
  { icon: SlidersHorizontal,label: "Stock Adjustment",  href: "/clerk/stock-adjustment"  },
  { icon: ClipboardList,    label: "Stock Count",       href: "/clerk/stock-count"       },
  { icon: Barcode,          label: "Barcode Printing",  href: "/clerk/barcode-printing"  },
  { icon: AlertTriangle,    label: "Low Stock",         href: "/clerk/low-stock"         },
];

export default function ClerkSidebar({ isOpen, onToggle }: ClerkSidebarProps) {
  const [location, navigate] = useLocation();
  const { logout } = useClerkAuth();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div
      className={`bg-white border-r border-gray-200 transition-all duration-200 flex flex-col flex-shrink-0 ${
        isOpen ? "w-64" : "w-20"
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
        {isOpen && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">IH</span>
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm leading-none">Isra Hardware</p>
              <p className="text-xs text-blue-600 font-medium mt-0.5">Inventory Clerk</p>
            </div>
          </div>
        )}
        {!isOpen && (
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mx-auto">
            <span className="text-white font-bold text-sm">IH</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="h-8 w-8 p-0 flex-shrink-0"
        >
          {isOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {isOpen && (
          <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Inventory Operations
          </p>
        )}
        <div className="space-y-1">
          {mainMenu.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 group ${
                    isActive
                      ? "bg-blue-50 text-blue-600 border-l-4 border-blue-600"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-4 border-transparent"
                  } ${!isOpen ? "justify-center" : ""}`}
                  title={!isOpen ? item.label : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {isOpen && (
                    <span className="text-sm font-medium">{item.label}</span>
                  )}
                  {isOpen && item.href === "/clerk/low-stock" && (
                    <span className="ml-auto bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                      8
                    </span>
                  )}
                </a>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom — Profile + Logout */}
      <div className="p-3 border-t border-gray-200 space-y-1">
        <Link href="/clerk/profile">
          <a
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors border-l-4 border-transparent ${
              location === "/clerk/profile" ? "bg-blue-50 text-blue-600 border-blue-600" : ""
            } ${!isOpen ? "justify-center" : ""}`}
            title={!isOpen ? "Profile" : undefined}
          >
            <UserCircle className="h-5 w-5 flex-shrink-0" />
            {isOpen && <span className="text-sm font-medium">Profile</span>}
          </a>
        </Link>

        <button
          onClick={handleLogout}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors ${
            !isOpen ? "justify-center" : ""
          }`}
          title={!isOpen ? "Logout" : undefined}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {isOpen && <span className="text-sm font-medium">Logout</span>}
        </button>
      </div>
    </div>
  );
}
