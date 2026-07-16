import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/shared/contexts/AuthContext";

interface PasswordChangeGuardProps {
  children: React.ReactNode;
}

/**
 * Wraps protected routes to enforce the mandatory password-change flow.
 *
 * - If the current user has mustChangePassword === true and they are NOT already
 *   on /change-password, redirect them there immediately.
 * - Otherwise render children normally.
 *
 * This guard is applied to every ProtectedRoute so an employee with a restricted
 * JWT can never sneak past the change-password screen.
 */
export default function PasswordChangeGuard({ children }: PasswordChangeGuardProps) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (user?.mustChangePassword && location !== "/change-password") {
      setLocation("/change-password");
    }
  }, [isLoading, user, location, setLocation]);

  if (isLoading) return null;

  // Block rendering of any protected content until the password is changed
  if (user?.mustChangePassword && location !== "/change-password") {
    return null;
  }

  return <>{children}</>;
}
