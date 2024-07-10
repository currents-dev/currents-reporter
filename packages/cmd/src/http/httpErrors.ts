import { AxiosError, isAxiosError } from "axios";
import _ from "lodash";
import { P, match } from "ts-pattern";
import * as log from "../logger";

export function handleHTTPError<T, D>(error: unknown) {
  match(error)
    .when(isAxiosError, handleAxiosError)
    .otherwise(() => {
      log.warn(`Unexpected error while sending network request: %s`, error);
    });
}

function handleAxiosError<T, D>(error: AxiosError<T, D>) {
  return (
    match(error)
      // Generic network errors
      .with({ code: "ECONNABORTED" }, () => {
        log.warn(`Network connection aborted`);
      })
      .with({ code: "ECONNREFUSED" }, () => {
        log.warn(`Network connection aborted`);
      })
      .with({ code: "ECONNRESET" }, () => {
        log.warn(`Network connection reset`);
      })
      .with({ code: "ETIMEDOUT" }, () => {
        log.warn(`Network connection timeout`);
      })
      .with({ response: P.not(P.nullish) }, (i) => {
        handle4xx(i, {
          status: i.response.status,
          data: i.response.data,
        });
      })
      .otherwise((i) => {
        log.warn("[currents] Unexpected network error: %s\n%O", error.message, {
          method: error.response?.config.method,
          url: error.response?.config.url,
          status: error.response?.status,
          payload: error.response?.config.data,
        });
      })
  );
}

function handle4xx<T, D>(
  error: AxiosError<T, D>,
  {
    status,
    data,
  }: {
    status: number;
    data: unknown;
  }
) {
  match(status)
    .with(401, () => {
      log.warn(
        `[currents] ${error.response?.config.method} ${error.response?.config.url}} - 401 Unauthorized Request from cloud service`
      );
    })
    .with(400, () => {
      log.warn(
        `[currents] ${error.response?.config.method} ${error.response?.config.url} - 400 Bad Request from cloud service:\n%o`,
        data
      );
    })
    .with(429, () => {
      log.warn(
        `[currents] ${error.response?.config.method} ${error.response?.config.url} - 429 Too Many Requests from cloud service`
      );
    })
    .with(422, () => {
      handle422Error(error, data);
    })
    .otherwise(() => {
      log.warn(
        "[currents] Unexpected network response: %s\n%O",
        error.message,
        {
          method: error.response?.config.method,
          url: error.response?.config.url,
          status: error.response?.status,
        }
      );
    });
}

function handle422Error(error: AxiosError, data: unknown) {
  match(data)
    .with(
      {
        code: ErrorCodes.MISSING_SUITE,
        message: P.string,
        errors: P.array(P.string),
      },
      async (i) => {
        const { message, errors } = i;

        log.spacer(1);
        log.error(...formatGenericCloudError(message, errors));
      }
    )
    .with({ code: ErrorCodes.RUN_EXPIRED, message: P.string }, (i) => {
      log.warn(i.message);
    })
    .with({ message: P.string, errors: P.array(P.string) }, (i) => {
      const { message, errors } = i;
      log.spacer(1);
      log.warn(...formatGenericCloudError(message, errors));
      log.spacer(1);
    })
    .otherwise(() => {
      log.warn(
        "[currents] Unexpected network response: %s\n%O",
        error.message,
        {
          method: error.response?.config.method,
          url: error.response?.config.url,
          status: error.response?.status,
        }
      );
    });
}
const ErrorCodes = {
  RUN_CANCELLED: "RUN_CANCELLED",
  RUN_EXPIRED: "RUN_EXPIRED",
  MISSING_SUITE: "MISSING_SUITE",
} as const;

export function formatGenericCloudError(
  message?: string,
  errors?: string[]
): string[] {
  if (!_.isString(message)) {
    return ["Unexpected network error"];
  }

  if (errors?.length === 0) {
    return [message as string];
  }
  return [
    message as string,
    `
${(errors ?? []).map((e) => `  - ${e}`).join("\n")}
`,
  ];
}
