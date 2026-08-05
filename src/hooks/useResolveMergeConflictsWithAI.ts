import { useCallback, useRef, useState } from "react";
import { useSetAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { ipc } from "@/ipc/types";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { useChatStreamManager } from "@/chat_stream/ChatStreamProvider";
import { showError } from "@/lib/toast";
import { useChats } from "@/hooks/useChats";
import { useLoadApp } from "@/hooks/useLoadApp";

interface UseResolveMergeConflictsWithAIProps {
  appId: number;
  conflicts: readonly string[];
  onStartResolving?: (chatId: number) => void | Promise<void>;
  onStartFailed?: () => void | Promise<void>;
  onSettled?: () => void;
}

/**
 * Hook to resolve merge conflicts with AI by creating a new chat,
 * navigating to it, and automatically starting the conflict resolution stream.
 */
export function useResolveMergeConflictsWithAI({
  appId,
  conflicts,
  onStartResolving,
  onStartFailed,
  onSettled,
}: UseResolveMergeConflictsWithAIProps) {
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);
  const navigate = useNavigate();
  const [isResolving, setIsResolving] = useState(false);
  const isResolvingRef = useRef(false);
  const { invalidateChats } = useChats(appId);
  const { refreshApp } = useLoadApp(appId);
  const chatStreamManager = useChatStreamManager();

  const resolveFilesWithAI = useCallback(
    async (requestedConflicts: readonly string[]) => {
      if (!appId) {
        showError("App ID is required");
        return;
      }
      if (requestedConflicts.length === 0) {
        showError("No conflicts to resolve");
        return;
      }
      if (isResolvingRef.current) {
        return;
      }

      isResolvingRef.current = true;
      setIsResolving(true);

      try {
        // Create a new chat for conflict resolution
        const newChatId = await ipc.chat.createChat({
          appId,
          initialChatMode: "local-agent",
        });
        try {
          // Clear conflicts state after successful chat creation.
          await onStartResolving?.(newChatId);
        } catch (error) {
          // The claim can expire while durable chat creation is in flight.
          // Remove the chat if main does not accept the corresponding start.
          try {
            await ipc.chat.deleteChat(newChatId);
          } catch (deleteError) {
            console.error(
              "Failed to delete unused conflict-resolution chat:",
              deleteError,
            );
          }
          throw error;
        }
        // Build the prompt for resolving all conflicts
        const fileList = requestedConflicts.map((f) => `- ${f}`).join("\n");
        const prompt = `Please resolve the Git merge conflicts in the following file${requestedConflicts.length > 1 ? "s" : ""}:

${fileList}

For each listed file, resolve every Git conflict by editing the file in place. Preserve the intended behavior from both sides where compatible, and remove all conflict markers (<<<<<<<, =======, >>>>>>>). Do not only describe the resolution or paste the file contents into chat. Before finishing, verify that none of the listed files contain conflict markers.`;

        // Set up the chat state and navigate
        setSelectedChatId(newChatId);
        setSelectedAppId(appId);

        // Navigate to the chat page
        navigate({
          to: "/chat",
          search: { id: newChatId },
        });

        chatStreamManager.ensure(newChatId).send({
          type: "submit",
          request: {
            chatId: newChatId,
            prompt,
            appId,
            onSettled: () => {
              isResolvingRef.current = false;
              setIsResolving(false);
              onSettled?.();
              invalidateChats();
              void refreshApp();
            },
          },
        });
      } catch (error: unknown) {
        try {
          await onStartFailed?.();
        } catch (rollbackError) {
          console.error(
            "Failed to release conflict-resolution claim:",
            rollbackError,
          );
        }
        showError(
          error instanceof Error
            ? error.message
            : "Failed to start conflict resolution",
        );
        isResolvingRef.current = false;
        setIsResolving(false);
      }
    },
    [
      appId,
      onStartResolving,
      onStartFailed,
      onSettled,
      setSelectedChatId,
      setSelectedAppId,
      navigate,
      invalidateChats,
      refreshApp,
      chatStreamManager,
    ],
  );

  const resolveWithAI = useCallback(
    () => resolveFilesWithAI(conflicts),
    [conflicts, resolveFilesWithAI],
  );

  return { resolveWithAI, resolveFilesWithAI, isResolving };
}
