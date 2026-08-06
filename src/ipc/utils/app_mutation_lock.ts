import {
  appOperationCoordinator,
  type AppOperationRequest,
} from "../services/app_operation_coordinator";

/** Wrap an IPC handler in the declared app-resource operation. */
export function createAppOperationHandler<Event, Input, Output>(
  operation: string,
  resources: AppOperationRequest["resources"],
  handler: (event: Event, input: Input) => Promise<Output>,
): (event: Event, input: Input) => Promise<Output> {
  return (event, input) =>
    appOperationCoordinator.run(
      {
        appId: (input as { appId: number }).appId,
        operation,
        resources,
      },
      () => handler(event, input),
    );
}
