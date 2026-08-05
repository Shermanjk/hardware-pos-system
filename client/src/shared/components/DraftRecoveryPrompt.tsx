/**
 * DraftRecoveryPrompt
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal dialog shown when the system detects that a previous session ended
 * unexpectedly (crash, power-loss, browser close, network interruption) while
 * the user had unsaved form data.
 *
 * Usage
 * ──────
 *   const [draft, setDraft] = useState<MyDraftType | null>(null);
 *
 *   useEffect(() => {
 *     const recovered = draftRecovery.getRecoverableDraft();
 *     if (recovered) setDraft(recovered);
 *   }, []);
 *
 *   return (
 *     <>
 *       <DraftRecoveryPrompt
 *         draft={draft}
 *         formLabel="Shopping Cart"
 *         onRestore={() => { applyDraft(draft!); setDraft(null); }}
 *         onDiscard={() => { draftRecovery.discardDraft(); setDraft(null); }}
 *       />
 *       ... rest of form ...
 *     </>
 *   );
 */

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RotateCcw, Trash2 } from "lucide-react";

interface DraftRecoveryPromptProps {
  /** When non-null the dialog is visible. Pass null to hide. */
  draft: unknown;
  /** Human-readable label for the form type, e.g. "Shopping Cart". */
  formLabel: string;
  /** Optional description of what data was saved (shown as a subtitle). */
  savedSummary?: string;
  /** Called when the user clicks "Restore". */
  onRestore: () => void;
  /** Called when the user clicks "Discard". */
  onDiscard: () => void;
}

export default function DraftRecoveryPrompt({
  draft,
  formLabel,
  savedSummary,
  onRestore,
  onDiscard,
}: DraftRecoveryPromptProps) {
  return (
    <AlertDialog open={draft !== null}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="h-5 w-5 text-blue-600 shrink-0" />
            Recover Unsaved Draft?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-gray-600 leading-relaxed">
            Your previous <strong>{formLabel}</strong> session ended unexpectedly
            (crash, refresh, or network interruption). A draft was automatically
            saved.
            {savedSummary && (
              <span className="block mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 font-medium">
                {savedSummary}
              </span>
            )}
            <span className="block mt-2">
              Would you like to <strong>restore</strong> where you left off, or{" "}
              <strong>discard</strong> the saved data and start fresh?
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel
            onClick={onDiscard}
            className="flex items-center gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Discard
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onRestore}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore Draft
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
