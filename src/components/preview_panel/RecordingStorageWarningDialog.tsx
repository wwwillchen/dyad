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

interface RecordingStorageWarningDialogProps {
  open: boolean;
  /** Whether the running preview is served from its own `app-<id>.localhost`. */
  isAppSpecificDomain: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
}

/**
 * Confirmation shown before a recording session starts.
 *
 * Setup clears the preview's app-scoped cookies and local storage. That is the same
 * browser session the user's own preview uses, so it also drops whatever they
 * had built up there — their preview login, anything the app persisted locally
 * — with no undo. Asking first is the difference between a documented step and
 * a surprise.
 *
 * App hostnames let cleanup leave other previews signed in. On shared
 * localhost only other apps' namespaced HttpOnly sessions survive; their
 * script-readable cookies are shared with this preview and cleared.
 */
export function RecordingStorageWarningDialog({
  open,
  isAppSpecificDomain,
  onOpenChange,
  onContinue,
}: RecordingStorageWarningDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="recording-storage-warning-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Start recording from a clean slate?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Dyad clears this preview's cookies and local storage, which usually
            signs you out.{" "}
            {isAppSpecificDomain
              ? "Other apps aren't affected."
              : "Other apps stay signed in."}{" "}
            Your code and database aren't touched.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onContinue}
            data-testid="recording-storage-warning-continue"
          >
            Clear and start recording
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
