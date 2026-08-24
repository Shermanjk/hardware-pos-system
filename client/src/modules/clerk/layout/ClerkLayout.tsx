import { useRef, useState } from "react";
import { useLocation } from "wouter";
import ClerkSidebar from "./ClerkSidebar";
import ClerkTopNav from "./ClerkTopNav";
import PageTransition from "@/shared/components/PageTransition";
import BackToTop from "@/shared/components/BackToTop";
import { useClerkAuth } from "@/shared/contexts/ClerkAuthContext";
import { ServerStatusBanner } from "@/shared/components/ServerStatusBanner";

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
  const mainRef = useRef<HTMLElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <ProtectedClerkRoute>
      <div className="flex h-screen bg-slate-100 overflow-hidden">
        <ClerkSidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ServerStatusBanner />
          <ClerkTopNav onMenuClick={() => setSidebarOpen((v) => !v)} />
          <main ref={mainRef} className="flex-1 overflow-y-auto p-6 lg:p-8 scroll-smooth">
            <PageTransition>
              {children}
            </PageTransition>
          </main>
        </div>
        <BackToTop containerRef={mainRef} threshold={200} />
      </div>
    </ProtectedClerkRoute>
  );
}
