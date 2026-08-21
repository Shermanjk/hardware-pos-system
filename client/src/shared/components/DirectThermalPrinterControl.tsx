import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { webSerialPrinter, type SerialPrinterState } from "@/shared/services/escpos/webSerialPrinter";
import { Printer, Zap, DollarSign, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

interface DirectThermalPrinterControlProps {
  storeName?: string;
  className?: string;
}

export function DirectThermalPrinterControl({ storeName = "ISRA HARDWARE POS", className = "" }: DirectThermalPrinterControlProps) {
  const [state, setState] = useState<SerialPrinterState>(webSerialPrinter.getState());

  useEffect(() => {
    const unsubscribe = webSerialPrinter.subscribe((newState) => {
      setState(newState);
    });
    return () => unsubscribe();
  }, []);

  if (!state.isSupported) {
    return null; // Don't render on unsupported browsers
  }

  const handleConnect = async () => {
    await webSerialPrinter.requestAndConnect();
  };

  const handleTestPrint = async () => {
    await webSerialPrinter.printTestReceipt(storeName);
  };

  const handleOpenDrawer = async () => {
    await webSerialPrinter.openCashDrawer();
  };

  const handleDisconnect = async () => {
    await webSerialPrinter.disconnect();
  };

  return (
    <div className={`flex items-center ${className}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`h-8 text-xs font-semibold gap-1.5 shadow-xs transition-all ${
              state.isConnected
                ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400"
                : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
            title={
              state.isConnected
                ? "Direct USB Thermal Printer Connected (0% Flash Silent Mode)"
                : "Click to connect USB thermal printer for zero-flash printing"
            }
          >
            <span className="relative flex h-2 w-2">
              {state.isConnected ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-300"></span>
              )}
            </span>
            <Zap className={`h-3.5 w-3.5 ${state.isConnected ? "text-emerald-600" : "text-slate-400"}`} />
            <span className="hidden sm:inline font-mono text-[11px]">
              {state.isConnected ? "Direct USB" : "Connect USB"}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="flex items-center justify-between text-xs pb-1">
            <span>Direct ESC/POS Thermal</span>
            {state.isConnected ? (
              <span className="text-[10px] text-emerald-600 font-bold uppercase flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Active
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 uppercase flex items-center gap-1">
                <XCircle className="h-3 w-3" /> Offline
              </span>
            )}
          </DropdownMenuLabel>
          <div className="px-2 py-1 text-[11px] text-slate-500 bg-slate-50 rounded mx-1 mb-1 border border-slate-100">
            {state.isConnected
              ? "Zero-flash silent printing directly over USB wire."
              : "Pair your thermal printer once to eliminate print preview popups."}
          </div>
          <DropdownMenuSeparator />

          {!state.isConnected ? (
            <DropdownMenuItem onClick={handleConnect} className="text-xs cursor-pointer font-semibold text-blue-600 focus:text-blue-700">
              <Zap className="h-3.5 w-3.5 mr-2 text-blue-600" />
              Pair / Connect USB Printer
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onClick={handleTestPrint} className="text-xs cursor-pointer">
                <Printer className="h-3.5 w-3.5 mr-2 text-slate-600" />
                Test Print (0% Flash)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenDrawer} className="text-xs cursor-pointer">
                <DollarSign className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                Kick Cash Drawer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleConnect} className="text-xs cursor-pointer text-slate-600">
                <RefreshCw className="h-3.5 w-3.5 mr-2 text-slate-500" />
                Change / Reconnect Port
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDisconnect} className="text-xs cursor-pointer text-red-600 focus:text-red-700">
                <XCircle className="h-3.5 w-3.5 mr-2 text-red-500" />
                Disconnect USB Printer
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
