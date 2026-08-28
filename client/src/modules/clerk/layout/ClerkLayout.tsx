import { useRef, useState } from "react";
import { useLocation } from "wouter";
import ClerkSidebar from "./ClerkSidebar";
import ClerkTopNav from "./ClerkTopNav";
import PageTransition from "@/shared/components/PageTransition";
import BackToTop from "@/shared/components/BackToTop";
import { useClerkAuth } from "@/shared/contexts/ClerkAuthContext";
import { ServerStatusBanner } from "@/shared/components/ServerStatusBanner";
import PreventCloseModal from "@/shared/components/PreventCloseModal";
import { usePreventAccidentalClose, hasAnyActiveDraft } from "@/shared/hooks/usePreventAccidentalClose";

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
  const { logout } = useClerkAuth();

  const {
    showModal: showPreventClose,
    closeModal: closePreventClose,
    handleForceExit,
  } = usePreventAccidentalClose({
    hasActiveWork: hasAnyActiveDraft(),
    terminalType: "CLERK",
    portalName: "Inventory Clerk Terminal",
    workDetails: {
      title: "Unsaved Stock Operation in Progress",
      description:
        "You have an active session in the Inventory Clerk Terminal. Please make sure all staged stock-in deliveries, inventory counts, and adjustments are submitted before leaving.",
    },
    onDiscardAndExit: () => {
      logout();
    },
  });

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
        <PreventCloseModal
          open={showPreventClose}
          onClose={closePreventClose}
          hasActiveWork={hasAnyActiveDraft()}
          terminalType="CLERK"
          portalName="Inventory Clerk Terminal"
          workDetails={{
            title: "Unsaved Stock Operation in Progress",
            description:
              "You have an active session in the Inventory Clerk Terminal. Please make sure all staged stock-in deliveries, inventory counts, and adjustments are submitted before leaving.",
          }}
          onForceExit={handleForceExit}
        />
      </div>
    </ProtectedClerkRoute>
  );
}
