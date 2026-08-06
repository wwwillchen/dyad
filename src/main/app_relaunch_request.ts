type RelaunchOptions = {
  args: string[];
};

type AppRelaunchRequestOptions = {
  deepLinkUrl?: string;
};

export function createAppRelaunchRequest() {
  let pendingRequest: AppRelaunchRequestOptions | undefined;

  return {
    request({ deepLinkUrl }: AppRelaunchRequestOptions = {}): boolean {
      const isFirstRequest = pendingRequest === undefined;
      pendingRequest ??= {};
      pendingRequest.deepLinkUrl ??= deepLinkUrl;
      return isFirstRequest;
    },

    finish({
      currentArgs,
      relaunch,
      quit,
    }: {
      currentArgs: string[];
      relaunch: (options?: RelaunchOptions) => void;
      quit: () => void;
    }): void {
      const request = pendingRequest;
      pendingRequest = undefined;

      try {
        if (request?.deepLinkUrl) {
          relaunch({
            args: [
              ...currentArgs.filter((arg) => !arg.startsWith("dyad://")),
              request.deepLinkUrl,
            ],
          });
        } else if (request) {
          relaunch();
        }
      } finally {
        quit();
      }
    },
  };
}

export const appRelaunchRequest = createAppRelaunchRequest();
