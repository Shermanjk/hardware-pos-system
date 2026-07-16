import { useLocation } from "wouter";
import { Link } from "wouter";
import {
  LayoutDashboard,
  Package,
  FolderOpen,
  Boxes,
  Truck,
  FileText,
  ArrowUp,
  TrendingUp,
  RotateCcw,
  BarChart3,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/shared/contexts/AuthContext";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: Package, label: "Products", href: "/products" },
  { icon: FolderOpen, label: "Categories", href: "/categories" },
  { icon: Boxes, label: "Inventory", href: "/inventory" },
  { icon: Truck, label: "Suppliers", href: "/suppliers" },
  { icon: FileText, label: "Purchase Orders", href: "/purchase-orders" },
  { icon: ArrowUp, label: "Stock In", href: "/stock-in" },
  { icon: TrendingUp, label: "Sales", href: "/sales" },
  { icon: RotateCcw, label: "Returns", href: "/returns" },
  { icon: BarChart3, label: "Reports", href: "/reports" },
  { icon: Users, label: "Users", href: "/users" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const [location] = useLocation();
  const { logout } = useAuth();

  return (
    <>
      {/* Sidebar */}
      <div
        className={`bg-white border-r border-gray-200 transition-all duration-200 flex flex-col ${
          isOpen ? "w-64" : "w-20"
        }`}
      >
        {/* Logo Section */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          {isOpen && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">IH</span>
              </div>
              <span className="font-display text-lg font-bold text-gray-900">Isra Hardware</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-8 w-8 p-0"
          >
            {isOpen ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto py-4 px-2">
          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;

              return (
                <Link key={item.href} href={item.href}>
                  <a
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 ${
                      isActive
                        ? "bg-blue-50 text-blue-600 border-l-4 border-blue-600"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {isOpen && <span className="text-sm font-medium">{item.label}</span>}
                  </a>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Logout Button */}
        <div className="p-4 border-t border-gray-200">
          <Button
            variant="outline"
            onClick={logout}
            className={`w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 ${!isOpen && "p-0 h-10 w-10 justify-center"}`}
            title={!isOpen ? "Logout" : undefined}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {isOpen && <span className="text-sm">Logout</span>}
          </Button>
        </div>
      </div>
    </>
  );
}
