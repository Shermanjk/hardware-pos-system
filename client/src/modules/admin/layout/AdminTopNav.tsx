import { useState, useEffect } from "react";
import { Menu, Bell, Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TopNavigationProps {
  onMenuClick: () => void;
}

export default function TopNavigation({ onMenuClick }: TopNavigationProps) {
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
      setCurrentDate(now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }));
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8">
      {/* Left Section - Menu & Search */}
      <div className="flex items-center gap-4 flex-1">
        <Button variant="ghost" size="sm" onClick={onMenuClick} className="lg:hidden">
          <Menu className="h-5 w-5" />
        </Button>

        <div className="hidden md:flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 flex-1 max-w-xs">
          <Search className="h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search products, orders..."
            className="border-0 bg-transparent text-sm focus-visible:ring-0 focus-visible:outline-none"
          />
        </div>
      </div>

      {/* Right Section - Date, Time, Notifications, Profile */}
      <div className="flex items-center gap-6">
        {/* Date & Time */}
        <div className="hidden sm:flex flex-col items-end text-sm">
          <span className="text-gray-900 font-medium">{currentTime}</span>
          <span className="text-gray-500 text-xs">{currentDate}</span>
        </div>

        {/* Notification Icon */}
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-5 w-5 text-gray-600" />
          <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full"></span>
        </Button>

        {/* Profile Section */}
        <div className="flex items-center gap-3 pl-6 border-l border-gray-200">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium text-gray-900">Admin User</span>
            <span className="text-xs text-gray-500">Administrator</span>
          </div>
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-semibold">
            AU
          </div>
          <Button variant="ghost" size="sm" className="p-0">
            <ChevronDown className="h-4 w-4 text-gray-600" />
          </Button>
        </div>
      </div>
    </div>
  );
}
