import pino from "pino"

export const logger = pino(
  process.env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
        level: process.env.LOG_LEVEL || "info",
      }
    : { level: process.env.LOG_LEVEL || "info" }
)
