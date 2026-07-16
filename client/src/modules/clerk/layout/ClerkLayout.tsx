import { useState } from "react";
import { useLocation } from "wouter";
import ClerkSidebar from "./ClerkSidebar";
import ClerkTopNav from "./ClerkTopNav";
import { useClerkAuth } from "@/shared/contexts/ClerkAuthContext";

interface ClerkLayoutProps {
  children: React.ReactNode;
}

/**
 * ProtectedClerkRoute — redirects to /login if the clerk is not authenticated.
 * Uses an effect-free redirect (replaces location synchronously during render)
 * so there is no flash of protected content.
 */
function ProtectedClerkRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useClerkAuth();
  const [, navigate] = useLocation();

  if (!isAuthenticated) {
    // Schedule the redirect for after the current render
    Promise.resolve().then(() => navigate("/login"));
    return null;
  }

  return <>{children}</>;
}

export default function ClerkLayout({ children }: ClerkLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <ProtectedClerkRoute>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <ClerkSidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ClerkTopNav onMenuClick={() => setSidebarOpen((v) => !v)} />
          <main className="flex-1 overflow-y-auto p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </ProtectedClerkRoute>
  );
}
