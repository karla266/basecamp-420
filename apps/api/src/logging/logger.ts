import { formatLog } from '@basecamp/shared'

export type LogFields = Record<string, unknown>

export interface Logger {
  info(event: string, fields?: LogFields): void
  warn(event: string, fields?: LogFields): void
  error(event: string, fields?: LogFields): void
}

export function createLogger(): Logger {
  return {
    info(event, fields) {
      console.log(formatLog('info', event, fields ?? {}))
    },
    warn(event, fields) {
      console.warn(formatLog('warn', event, fields ?? {}))
    },
    error(event, fields) {
      console.error(formatLog('error', event, fields ?? {}))
    },
  }
}

export function createBufferLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = []
  const write = (level: 'info' | 'warn' | 'error', event: string, fields?: LogFields) => {
    lines.push(formatLog(level, event, fields ?? {}))
  }
  return {
    lines,
    logger: {
      info: (event, fields) => write('info', event, fields),
      warn: (event, fields) => write('warn', event, fields),
      error: (event, fields) => write('error', event, fields),
    },
  }
}
