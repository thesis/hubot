declare module "log" {
  import { format } from "util"

  type DropFirst<T extends unknown[]> = T extends [unknown, ...infer U]
    ? U
    : never

  type LogFunction = (
    msg: string,
    ...rest: DropFirst<Parameters<typeof format>>
  ) => void

  class Log {
    constructor(level: string, stream?: NodeJS.WriteStream)

    /** debugging information (hidden by default) */
    debug: LogFunction

    /** a purely informational message (hidden by default) */
    info: LogFunction

    /** condition normal, but significant */
    notice: LogFunction

    /** condition warning */
    warning: LogFunction

    /** condition error - to notify of errors accompanied with recovery mechanism (hence reported as log and not as uncaught exception) */
    error: LogFunction

    /** condition error - to notify of errors accompanied with recovery mechanism (hence reported as log and not as uncaught exception) */
    critical: LogFunction

    /** condition error - to notify of errors accompanied with recovery mechanism (hence reported as log and not as uncaught exception) */
    alert: LogFunction

    /** condition error - to notify of errors accompanied with recovery mechanism (hence reported as log and not as uncaught exception) */
    emergency: LogFunction
  }

  export = Log
}
