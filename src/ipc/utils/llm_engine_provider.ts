import { OpenAICompatibleChatLanguageModel } from "@ai-sdk/openai-compatible";
import { OpenAIResponsesLanguageModel } from "@ai-sdk/openai/internal";
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from "@ai-sdk/provider-utils";

import log from "electron-log";
import { getExtraProviderOptions } from "./thinking_utils";
import type { UserSettings } from "../../lib/schemas";
import type { LanguageModel } from "ai";

const logger = log.scope("llm_engine_provider");
const NON_OPENAI_REASONING_WARNING_PREFIX =
  "Non-OpenAI reasoning parts are not supported. Skipping reasoning part:";
const FORKED_REASONING_ID_PREFIX = "dyad_reasoning";

function getReasoningMetadata(part: Record<string, unknown>): {
  hasItemId: boolean;
  encryptedContent?: string;
} {
  const providerOptions =
    part.providerOptions && typeof part.providerOptions === "object"
      ? (part.providerOptions as Record<string, unknown>)
      : undefined;
  const openaiOptions =
    providerOptions?.openai && typeof providerOptions.openai === "object"
      ? (providerOptions.openai as Record<string, unknown>)
      : undefined;

  const itemId = openaiOptions?.itemId;
  const reasoningEncryptedContent = openaiOptions?.reasoningEncryptedContent;
  return {
    hasItemId: typeof itemId === "string" && itemId.length > 0,
    encryptedContent:
      typeof reasoningEncryptedContent === "string"
        ? reasoningEncryptedContent
        : undefined,
  };
}

function getMissingReasoningItems(options: unknown): Array<{
  type: "reasoning";
  id: string;
  encrypted_content?: string;
  summary: Array<{ type: "summary_text"; text: string }>;
}> {
  if (!options || typeof options !== "object") {
    return [];
  }

  const prompt = (options as { prompt?: unknown }).prompt;
  if (!Array.isArray(prompt)) {
    return [];
  }

  const reasoningItems: Array<{
    type: "reasoning";
    id: string;
    encrypted_content?: string;
    summary: Array<{ type: "summary_text"; text: string }>;
  }> = [];

  for (let messageIndex = 0; messageIndex < prompt.length; messageIndex++) {
    const message = prompt[messageIndex];
    if (!message || typeof message !== "object") continue;

    const messageRecord = message as Record<string, unknown>;
    if (messageRecord.role !== "assistant") continue;
    if (!Array.isArray(messageRecord.content)) continue;

    for (
      let partIndex = 0;
      partIndex < messageRecord.content.length;
      partIndex++
    ) {
      const part = messageRecord.content[partIndex];
      if (!part || typeof part !== "object") continue;

      const partRecord = part as Record<string, unknown>;
      if (partRecord.type !== "reasoning") continue;

      const reasoningText =
        typeof partRecord.text === "string" ? partRecord.text : "";
      const reasoningMetadata = getReasoningMetadata(partRecord);
      if (reasoningMetadata.hasItemId) continue;

      reasoningItems.push({
        type: "reasoning",
        id: `${FORKED_REASONING_ID_PREFIX}_${messageIndex}_${partIndex}`,
        ...(reasoningMetadata.encryptedContent
          ? { encrypted_content: reasoningMetadata.encryptedContent }
          : {}),
        summary:
          reasoningText.length > 0
            ? [{ type: "summary_text", text: reasoningText }]
            : [],
      });
    }
  }

  return reasoningItems;
}

function stripNonOpenAIReasoningWarnings(result: unknown): void {
  if (!result || typeof result !== "object") return;
  const resultRecord = result as Record<string, unknown>;
  if (!Array.isArray(resultRecord.warnings)) return;

  resultRecord.warnings = resultRecord.warnings.filter((warning) => {
    if (!warning || typeof warning !== "object") return true;
    const message = (warning as { message?: unknown }).message;
    return !(
      typeof message === "string" &&
      message.startsWith(NON_OPENAI_REASONING_WARNING_PREFIX)
    );
  });
}

export function wrapOpenAIResponsesModelWithForkedReasoningSupport(
  model: LanguageModel,
): LanguageModel {
  const target = model as unknown as LanguageModel & {
    doGenerate: (options: unknown) => Promise<unknown>;
    doStream: (options: unknown) => Promise<unknown>;
    getArgs?: (options: unknown) => Promise<unknown>;
  };

  if (typeof target.getArgs !== "function") {
    return model;
  }

  const originalGetArgs = target.getArgs.bind(target);
  target.getArgs = async (options: unknown) => {
    const result = await originalGetArgs(options);
    const missingReasoningItems = getMissingReasoningItems(options);

    if (missingReasoningItems.length === 0) {
      stripNonOpenAIReasoningWarnings(result);
      return result;
    }

    if (result && typeof result === "object") {
      const resultRecord = result as Record<string, unknown>;
      const args =
        resultRecord.args && typeof resultRecord.args === "object"
          ? (resultRecord.args as Record<string, unknown>)
          : undefined;
      const input = args?.input;
      if (Array.isArray(input)) {
        args!.input = [...input, ...missingReasoningItems];
      }
    }

    stripNonOpenAIReasoningWarnings(result);
    return result;
  };

  return model;
}

export type ExampleChatModelId = string & {};
export interface ChatParams {
  providerId: string;
}
export interface ExampleProviderSettings {
  /**
Example API key.
*/
  apiKey?: string;
  /**
Base URL for the API calls.
*/
  baseURL?: string;
  /**
Custom headers to include in the requests.
*/
  headers?: Record<string, string>;
  /**
Optional custom url query parameters to include in request urls.
*/
  queryParams?: Record<string, string>;
  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
*/
  fetch?: FetchFunction;

  dyadOptions: {
    enableLazyEdits?: boolean;
    enableSmartFilesContext?: boolean;
    enableWebSearch?: boolean;
  };
  settings: UserSettings;
}

export interface DyadEngineProvider {
  /**
Creates a model for text generation.
*/
  (modelId: ExampleChatModelId, chatParams: ChatParams): LanguageModel;

  /**
Creates a chat model for text generation.
*/
  chatModel(modelId: ExampleChatModelId, chatParams: ChatParams): LanguageModel;

  responses(modelId: ExampleChatModelId, chatParams: ChatParams): LanguageModel;
}

export function createDyadEngine(
  options: ExampleProviderSettings,
): DyadEngineProvider {
  const baseURL = withoutTrailingSlash(options.baseURL);
  logger.info("creating dyad engine with baseURL", baseURL);

  // Track request ID attempts
  const requestIdAttempts = new Map<string, number>();

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: "DYAD_PRO_API_KEY",
      description: "Example API key",
    })}`,
    ...options.headers,
  });

  interface CommonModelConfig {
    provider: string;
    url: ({ path }: { path: string }) => string;
    headers: () => Record<string, string>;
    fetch?: FetchFunction;
  }

  const getCommonModelConfig = (): CommonModelConfig => ({
    provider: `dyad-engine`,
    url: ({ path }) => {
      const url = new URL(`${baseURL}${path}`);
      if (options.queryParams) {
        url.search = new URLSearchParams(options.queryParams).toString();
      }
      return url.toString();
    },
    headers: getHeaders,
    fetch: options.fetch,
  });

  // Custom fetch implementation that adds dyad-specific options to the request
  const createDyadFetch = ({
    providerId,
  }: {
    providerId: string;
  }): FetchFunction => {
    return (input: RequestInfo | URL, init?: RequestInit) => {
      // Use default fetch if no init or body
      if (!init || !init.body || typeof init.body !== "string") {
        return (options.fetch || fetch)(input, init);
      }

      try {
        // Parse the request body to manipulate it
        const parsedBody = {
          ...JSON.parse(init.body),
          ...getExtraProviderOptions(providerId, options.settings),
        };
        const dyadVersionedFiles = parsedBody.dyadVersionedFiles;
        if ("dyadVersionedFiles" in parsedBody) {
          delete parsedBody.dyadVersionedFiles;
        }
        const dyadFiles = parsedBody.dyadFiles;
        if ("dyadFiles" in parsedBody) {
          delete parsedBody.dyadFiles;
        }
        const requestId = parsedBody.dyadRequestId;
        if ("dyadRequestId" in parsedBody) {
          delete parsedBody.dyadRequestId;
        }
        const dyadAppId = parsedBody.dyadAppId;
        if ("dyadAppId" in parsedBody) {
          delete parsedBody.dyadAppId;
        }
        const dyadDisableFiles = parsedBody.dyadDisableFiles;
        if ("dyadDisableFiles" in parsedBody) {
          delete parsedBody.dyadDisableFiles;
        }
        const dyadMentionedApps = parsedBody.dyadMentionedApps;
        if ("dyadMentionedApps" in parsedBody) {
          delete parsedBody.dyadMentionedApps;
        }
        const dyadSmartContextMode = parsedBody.dyadSmartContextMode;
        if ("dyadSmartContextMode" in parsedBody) {
          delete parsedBody.dyadSmartContextMode;
        }

        // Track and modify requestId with attempt number
        let modifiedRequestId = requestId;
        if (requestId) {
          const currentAttempt = (requestIdAttempts.get(requestId) || 0) + 1;
          requestIdAttempts.set(requestId, currentAttempt);
          modifiedRequestId = `${requestId}:attempt-${currentAttempt}`;
        }

        // Add files to the request if they exist
        if (!dyadDisableFiles) {
          parsedBody.dyad_options = {
            files: dyadFiles,
            versioned_files: dyadVersionedFiles,
            enable_lazy_edits: options.dyadOptions.enableLazyEdits,
            enable_smart_files_context:
              options.dyadOptions.enableSmartFilesContext,
            smart_context_mode: dyadSmartContextMode,
            enable_web_search: options.dyadOptions.enableWebSearch,
            app_id: dyadAppId,
          };
          if (dyadMentionedApps?.length) {
            parsedBody.dyad_options.mentioned_apps = dyadMentionedApps;
          }
        }

        // Return modified request with files included and requestId in headers
        const modifiedInit = {
          ...init,
          headers: {
            ...init.headers,
            ...(modifiedRequestId && {
              "X-Dyad-Request-Id": modifiedRequestId,
            }),
          },
          body: JSON.stringify(parsedBody),
        };

        // Use the provided fetch or default fetch
        return (options.fetch || fetch)(input, modifiedInit);
      } catch (e) {
        logger.error("Error parsing request body", e);
        // If parsing fails, use original request
        return (options.fetch || fetch)(input, init);
      }
    };
  };

  const createChatModel = (
    modelId: ExampleChatModelId,
    chatParams: ChatParams,
  ) => {
    const config = {
      ...getCommonModelConfig(),
      fetch: createDyadFetch({ providerId: chatParams.providerId }),
    };

    return new OpenAICompatibleChatLanguageModel(modelId, config);
  };

  const createResponsesModel = (
    modelId: ExampleChatModelId,
    chatParams: ChatParams,
  ) => {
    const config = {
      ...getCommonModelConfig(),
      fetch: createDyadFetch({ providerId: chatParams.providerId }),
    };

    const model = new OpenAIResponsesLanguageModel(modelId, config);
    if (chatParams.providerId === "openai") {
      return wrapOpenAIResponsesModelWithForkedReasoningSupport(model);
    }
    return model;
  };

  const provider = (modelId: ExampleChatModelId, chatParams: ChatParams) =>
    createChatModel(modelId, chatParams);

  provider.chatModel = createChatModel;
  provider.responses = createResponsesModel;

  return provider;
}
