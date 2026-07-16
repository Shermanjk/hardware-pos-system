import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/shared/contexts/AuthContext";
import type { AuthUser } from "@/shared/utils/auth";

interface ProtectedRouteProps {
  allowedRoles: AuthUser["role"][];
  children: React.ReactNode;
}

export default function ProtectedRoute({
  allowedRoles,
  children,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setLocation("/login");
      return;
    }
    if (user && !allowedRoles.includes(user.role)) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, user, allowedRoles, setLocation]);

  // While rehydrating token from localStorage, show nothing (avoids flash)
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;
  if (user && !allowedRoles.includes(user.role)) return null;

  return <>{children}</>;
}
