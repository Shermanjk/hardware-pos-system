import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-left"
      offset={12}
      gap={6}
      duration={3000}
      toastOptions={{
        className: "pos-notification-toast font-sans",
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-slate-900 group-[.toaster]:border group-[.toaster]:border-slate-200 group-[.toaster]:shadow-md group-[.toaster]:rounded-lg group-[.toaster]:px-2.5 group-[.toaster]:py-1.5 dark:group-[.toaster]:bg-slate-900 dark:group-[.toaster]:text-slate-100 dark:group-[.toaster]:border-slate-800",
          title: "text-[12px] font-semibold text-slate-900 dark:text-slate-100 leading-tight",
          description: "text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-tight mt-0.5",
          actionButton:
            "group-[.toast]:bg-blue-600 group-[.toast]:text-white group-[.toast]:text-[11px] group-[.toast]:font-semibold group-[.toast]:rounded",
          cancelButton:
            "group-[.toast]:bg-slate-100 group-[.toast]:text-slate-700 dark:group-[.toast]:bg-slate-800 dark:group-[.toast]:text-slate-300 group-[.toast]:text-[11px] group-[.toast]:font-semibold group-[.toast]:rounded",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
