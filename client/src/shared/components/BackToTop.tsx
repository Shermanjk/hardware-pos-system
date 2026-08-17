import React, { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

interface BackToTopProps {
  /**
   * Target scrollable container element ref.
   * If omitted, defaults to window / document.
   */
  containerRef?: React.RefObject<HTMLElement | null>;
  /**
   * Scroll distance in pixels before the button appears.
   * Defaults to 200px.
   */
  threshold?: number;
  /**
   * Optional custom position class (defaults to 'bottom-8 right-8').
   */
  className?: string;
}

export default function BackToTop({
  containerRef,
  threshold = 200,
  className = "bottom-8 right-8",
}: BackToTopProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      let scrollTop = 0;

      if (containerRef?.current) {
        scrollTop = containerRef.current.scrollTop;
      } else {
        scrollTop = window.scrollY || document.documentElement.scrollTop;
      }

      setIsVisible(scrollTop > threshold);
    };

    if (containerRef?.current) {
      const el = containerRef.current;
      el.addEventListener("scroll", handleScroll, { passive: true });
      return () => el.removeEventListener("scroll", handleScroll);
    } else {
      window.addEventListener("scroll", handleScroll, { passive: true });
      return () => window.removeEventListener("scroll", handleScroll);
    }
  }, [containerRef, threshold]);

  const scrollToTop = () => {
    if (containerRef?.current) {
      containerRef.current.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } else {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  };

  return (
    <div
      className={`fixed ${className} z-50 transition-all duration-300 ease-out pointer-events-none ${
        isVisible
          ? "opacity-100 scale-100 translate-y-0"
          : "opacity-0 scale-75 translate-y-4"
      }`}
    >
      <button
        type="button"
        onClick={scrollToTop}
        aria-label="Back to top"
        title="Back to top"
        className="group pointer-events-auto flex items-center justify-center w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-lg hover:shadow-xl border border-blue-500 transition-all duration-200 hover:-translate-y-1 active:translate-y-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
      >
        <ChevronUp className="h-5 w-5 transition-transform duration-200 group-hover:-translate-y-0.5" />
      </button>
    </div>
  );
}
