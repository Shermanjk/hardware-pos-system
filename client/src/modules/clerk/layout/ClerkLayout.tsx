import { useState } from "react";
import { useLocation } from "wouter";
import ClerkSidebar from "./ClerkSidebar";
import ClerkTopNav from "./ClerkTopNav";
import PageTransition from "@/shared/components/PageTransition";
import { useClerkAuth } from "@/shared/contexts/ClerkAuthContext";

interface ClerkLayoutProps {
  children: React.ReactNode;
}

function ProtectedClerkRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useClerkAuth();
  const [, navigate] = useLocation();

  if (!isAuthenticated) {
    Promise.resolve().then(() => navigate("/login"));
    return null;
  }

  return <>{children}</>;
}

export default function ClerkLayout({ children }: ClerkLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <ProtectedClerkRoute>
      <div className="flex h-screen bg-slate-100 overflow-hidden">
        <ClerkSidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ClerkTopNav onMenuClick={() => setSidebarOpen((v) => !v)} />
          <main className="flex-1 overflow-y-auto p-6 lg:p-8">
            <PageTransition>
              {children}
            </PageTransition>
          </main>
        </div>
      </div>
    </ProtectedClerkRoute>
  );
}
