export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function serializeMeta(meta: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => {
      if (value instanceof Error) {
        return [
          key,
          {
            name: value.name,
            message: value.message,
            stack: value.stack,
          },
        ];
      }

      return [key, value];
    }),
  );
}

export function createLogger(
  serviceName: string,
  minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info",
): Logger {
  const write = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (levelWeight[level] < levelWeight[minLevel]) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      service: serviceName,
      message,
      ...serializeMeta(meta),
    };

    const line = JSON.stringify(payload);
    if (level === "error") {
      console.error(line);
      return;
    }

    console.log(line);
  };

  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
  };
}
