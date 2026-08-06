import React from "react";
import { toast } from "sonner";
import { X, Copy, Check, ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface CustomErrorToastProps {
  message: string;
  toastId: string | number;
  copied?: boolean;
  onCopy?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function CustomErrorToast({
  message,
  toastId,
  copied = false,
  onCopy,
  action,
}: CustomErrorToastProps) {
  const handleClose = () => {
    toast.dismiss(toastId);
  };

  const handleCopy = () => {
    if (onCopy) {
      onCopy();
    }
  };

  return (
    <div className="relative w-[min(500px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-red-200 bg-red-50/95 shadow-md backdrop-blur-sm dark:border-red-900 dark:bg-red-950/95">
      {/* Content */}
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-1">
            <div className="flex items-center mb-3">
              <div className="flex-shrink-0">
                <div className="flex size-5 items-center justify-center rounded-full bg-red-500">
                  <X className="w-3 h-3 text-white" />
                </div>
              </div>
              <h3 className="ml-3 text-sm font-medium text-red-900 dark:text-red-100">
                Error
              </h3>

              {/* Action buttons */}
              <div className="flex items-center space-x-1.5 ml-auto">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label={copied ? "Copied" : "Copy error details"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy();
                        }}
                        className="rounded-lg p-1.5 text-red-600 transition-colors duration-150 hover:bg-red-100/70 hover:text-red-800 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none dark:text-red-300 dark:hover:bg-red-900/70 dark:hover:text-red-100"
                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    }
                  />
                  <TooltipContent>
                    {copied ? "Copied" : "Copy error details"}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Close error"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClose();
                        }}
                        className="rounded-lg p-1.5 text-red-600 transition-colors duration-150 hover:bg-red-100/70 hover:text-red-800 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none dark:text-red-300 dark:hover:bg-red-900/70 dark:hover:text-red-100"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    }
                  />
                  <TooltipContent>Close</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div>
              <div
                role="region"
                aria-label="Error details"
                tabIndex={0}
                className="scrollbar-on-hover max-h-[min(50vh,20rem)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-red-200/50 bg-red-100/50 p-3 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none dark:border-red-800/70 dark:bg-red-900/40"
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-red-900 [overflow-wrap:anywhere] dark:text-red-100">
                  {message}
                </p>
              </div>
              {action && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onClick();
                    handleClose();
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 shadow-sm hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none dark:border-red-800 dark:bg-red-950 dark:text-red-100 dark:hover:bg-red-900"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {action.label}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
