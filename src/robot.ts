import coffee from "coffeescript"
import { createRequire } from "node:module"
import { dirname } from "path"
import { fileURLToPath } from "url"

import * as fs from "fs"
import * as path from "path"
import * as http from "http"
import { Application } from "express"

import Emittery from "emittery"

import async from "async"
import Log from "log"
import * as HttpClient from "scoped-http-client"
import Adapter from "./adapter"

import Brain from "./brain"
import Response from "./response"
import { Listener, TextListener } from "./listener"
import * as Message from "./message"
import Middleware from "./middleware"
import { DataStore } from "./datastore"

// Replacement for global __dirname constant in CJS modules.
// eslint-disable-next-line @typescript-eslint/naming-convention, no-underscore-dangle
const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
function compile(filename: string) {
  return coffee.compile(`${fs.readFileSync(filename)}`, {
    filename,
    inlineMap: true,
  })
}

require.extensions[".coffee"] = function loadCoffeeScript(m: any, filename) {
  // Internals, what can ya do.
  // eslint-disable-next-line no-underscore-dangle
  m._compile(compile(filename), filename)
}

const HUBOT_DEFAULT_ADAPTERS = ["shell"]
const HUBOT_DOCUMENTATION_SECTIONS = [
  "description",
  "dependencies",
  "configuration",
  "commands",
  "notes",
  "author",
  "authors",
  "examples",
  "tags",
  "urls",
]

/**
 * Information on a first-class command's parameters. These are commands that
 * may have first-class support in an adapter, such as slash commands in
 * Discord.
 */
type CommandParameterInfo = {
  name: string
  description?: string
}
/**
 * Extracts the names from a (const) list of CommandParameterInfo.
 */
type CommandNames<T extends readonly CommandParameterInfo[]> = {
  [P in keyof T]: P extends keyof [] ? T[P] : T[P]["name"]
}
/**
 * Extracts the value types from a (const) list of CommandParameterInfo. If no
 * per-command type specialization exists, returns a const list of strings of
 * the same length as the passed const list of parameters. Useful for enforcing
 * e.g. that listeners take the right number of parameters.
 */
type CommandValues<T extends readonly CommandParameterInfo[]> = {
  [P in keyof T]: P extends keyof [] ? T[P] : string
}

class Robot<A extends Adapter> {
  public version = "0"

  public events = new Emittery()

  // Public: A wrapper around the EventEmitter API to make usage
  // semantically better.
  //
  // event    - The event name.
  // listener - A Function that is called with the event parameter
  //            when event happens.
  //
  // Returns nothing.
  public on = this.events.on.bind(this.events)

  // Public: A wrapper around the EventEmitter API to make usage
  // semantically better.
  //
  // event   - The event name.
  // args...  - Arguments emitted by the event
  //
  // Returns nothing.
  public emit = this.events.emit.bind(this.events)

  public brain = new Brain(this)

  public adapter: A | undefined

  public datastore: DataStore | undefined

  public Response = Response

  public commands: string[] = []

  public listeners: Listener[] = []

  public server: http.Server | undefined

  public router: Application | undefined

  public middleware = {
    listener: new Middleware(this),
    response: new Middleware(this),
    receive: new Middleware(this),
  }

  public logger = new Log(process.env.HUBOT_LOG_LEVEL ?? "info")

  public pingIntervalId: NodeJS.Timer | undefined

  public globalHttpOptions: Partial<HttpClient.Options> = {}

  public errorHandlers: ((error: Error, res?: Response) => void)[] = []

  #onUncaughtException = (err: Error) => this.emit("error", [err])

  // Robots receive messages from a chat source (Campfire, irc, etc), and
  // dispatch them to matching listeners.
  //
  // adapterPath -  A String of the path to built-in adapters (defaults to src/adapters)
  // adapter     - A String of the adapter name.
  // httpd       - A Boolean whether to enable the HTTP daemon.
  // name        - A String of the robot name, defaults to Hubot.
  // alias       - A String of the alias of the robot name
  constructor(
    public adapterPath: string | undefined,
    public adapterName: string,
    public httpd: boolean,
    public name: string = "Hubot",
    public alias: string | undefined = undefined
  ) {
    this.adapterPath = path.join(__dirname, "adapters")

    this.parseVersion()
    if (httpd) {
      this.setupExpress()
    }

    this.loadAdapter(adapterName)

    this.on("error", ([err, res]) => this.invokeErrorHandlers(err, res))
    process.on("uncaughtException", this.#onUncaughtException)
  }

  urlForMessage(message: Message.Message): string | undefined {
    return this.adapter!.urlForMessage(message)
  }

  // Public: Adds a custom Listener with the provided matcher, options, and
  // callback
  //
  // matcher  - A Function that determines whether to call the callback.
  //            Expected to return a truthy value if the callback should be
  //            executed.
  // options  - An Object of additional parameters keyed on extension name
  //            (optional).
  // callback - A Function that is called with a Response object if the
  //            matcher function returns true.
  //
  // Returns nothing.
  listen(matcher, options, callback) {
    this.listeners.push(new Listener(this, matcher, options, callback))
  }

  // Public: Adds a Listener that attempts to match incoming messages based on
  // a Regex.
  //
  // regex    - A Regex that determines if the callback should be called.
  // options  - An Object of additional parameters keyed on extension name
  //            (optional).
  // callback - A Function that is called with a Response object.
  //
  // Returns nothing.
  hear(regex, options, callback) {
    this.listeners.push(new TextListener(this, regex, options, callback))
  }

  // Public: Adds a Listener that attempts to match incoming messages directed
  // at the robot based on a Regex. All regexes treat patterns like they begin
  // with a '^'
  //
  // regex    - A Regex that determines if the callback should be called.
  // options  - An Object of additional parameters keyed on extension name
  //            (optional).
  // callback - A Function that is called with a Response object.
  //
  // Returns nothing.
  respond(regex, options, callback) {
    this.hear(this.respondPattern(regex), options, callback)
  }

  /**
   * Tracks commands that were added before an adapter was loaded. Once the
   * adapter is loaded, the commands are re-registered to properly notify the
   * adapter.
   */
  #unregisteredCommands: {
    name: string
    parameters: CommandParameterInfo[]
    // The callbacks here have a type dependent on `parameters`, reflected in
    // the `command` call, but that cannot be expressed here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (...args: any[]) => void
  }[] = []

  /**
   * Add a command native to the adapter with a given name and the provided
   * command parameter info, which includes a name and description for the
   * parameter.
   *
   * This allows hooking into first-class command support on platforms like
   * Discord, while allowing Hubot to fall back to a standard `respond` when
   * needed.
   */
  command<Parameters extends CommandParameterInfo[]>(
    name: string,
    parameters: Parameters,
    callback: (...args: CommandValues<Parameters>) => void
  ) {
    if (this.adapter && "registerCommand" in this.adapter) {
      this.adapter.registerCommand(name, parameters, callback)
    } else if (this.adapter) {
      this.respond(name, {}, callback)
    } else {
      // Handle once the adapter is available, in loadAdapter.
      this.#unregisteredCommands.push({
        name,
        parameters,
        callback: callback as (...args: any[]) => void,
      })
    }
  }

  // Public: Build a regular expression that matches messages addressed
  // directly to the robot
  //
  // regex - A RegExp for the message part that follows the robot's name/alias
  //
  // Returns RegExp.
  respondPattern(regex) {
    const regexWithoutModifiers = regex.toString().split("/")
    regexWithoutModifiers.shift()
    const modifiers = regexWithoutModifiers.pop()
    const regexStartsWithAnchor =
      regexWithoutModifiers[0] && regexWithoutModifiers[0][0] === "^"
    const pattern = regexWithoutModifiers.join("/")
    const name = this.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")

    if (regexStartsWithAnchor) {
      this.logger.warning(
        "Anchors don’t work well with respond, perhaps you want to use 'hear'"
      )
      this.logger.warning(`The regex in question was ${regex.toString()}`)
    }

    if (!this.alias) {
      return new RegExp(`^\\s*[@]?${name}[:,]?\\s*(?:${pattern})`, modifiers)
    }

    const alias = this.alias.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")

    // matches properly when alias is substring of name
    if (name.length > alias.length) {
      return new RegExp(
        `^\\s*[@]?(?:${name}[:,]?|${alias}[:,]?)\\s*(?:${pattern})`,
        modifiers
      )
    }

    // matches properly when name is substring of alias
    return new RegExp(
      `^\\s*[@]?(?:${alias}[:,]?|${name}[:,]?)\\s*(?:${pattern})`,
      modifiers
    )
  }

  // Public: Adds a Listener that triggers when anyone enters the room.
  //
  // options  - An Object of additional parameters keyed on extension name
  //            (optional).
  // callback - A Function that is called with a Response object.
  //
  // Returns nothing.
  enter(options, callback) {
    this.listen((msg) => msg instanceof Message.EnterMessage, options, callback)
  }

  // Public: Adds a Listener that triggers when anyone leaves the room.
  //
  // options  - An Object of additional parameters keyed on extension name
  //            (optional).
  // callback - A Function that is called with a Response object.
  //
  // Returns nothing.
  leave(options, callback) {
    this.listen((msg) => msg instanceof Message.LeaveMessage, options, callback)
  }

  // Public: Adds a Listener that triggers when anyone changes the topic.
  //
  // options  - An Object of additional parameters keyed on extension name
  //            (optional).
  // callback - A Function that is called with a Response object.
  //
  // Returns nothing.
  topic(options, callback) {
    this.listen((msg) => msg instanceof Message.TopicMessage, options, callback)
  }

  // Public: Adds an error handler when an uncaught exception or user emitted
  // error event occurs.
  //
  // callback - A Function that is called with the error object.
  //
  // Returns nothing.
  error(callback) {
    this.errorHandlers.push(callback)
  }

  // Calls and passes any registered error handlers for unhandled exceptions or
  // user emitted error events.
  //
  // err - An Error object.
  // res - An optional Response object that generated the error
  //
  // Returns nothing.
  invokeErrorHandlers(error: Error, res?: Response) {
    this.logger.error(error.stack ?? "error with no stack")

    this.errorHandlers.forEach((errorHandler) => {
      try {
        errorHandler(error, res)
      } catch (errorHandlerError) {
        this.logger.error(
          `while invoking error handler: ${errorHandlerError}\n${
            errorHandlerError instanceof Error ? errorHandlerError.stack : ""
          }`
        )
      }
    })
  }

  // Public: Adds a Listener that triggers when no other text matchers match.
  //
  // options  - An Object of additional parameters keyed on extension name
  //            (optional).
  // callback - A Function that is called with a Response object.
  //
  // Returns nothing.
  catchAll(options, callback) {
    // `options` is optional; need to isolate the real callback before
    // wrapping it with logic below
    if (callback == null) {
      callback = options
      options = {}
    }

    this.listen(isCatchAllMessage, options, (msg) => {
      msg.message = msg.message.message
      callback(msg)
    })
  }

  // Public: Registers new middleware for execution after matching but before
  // Listener callbacks
  //
  // middleware - A function that determines whether or not a given matching
  //              Listener should be executed. The function is called with
  //              (context, next, done). If execution should
  //              continue (next middleware, Listener callback), the middleware
  //              should call the 'next' function with 'done' as an argument.
  //              If not, the middleware should call the 'done' function with
  //              no arguments.
  //
  // Returns nothing.
  listenerMiddleware(middleware) {
    this.middleware.listener.register(middleware)
  }

  // Public: Registers new middleware for execution as a response to any
  // message is being sent.
  //
  // middleware - A function that examines an outgoing message and can modify
  //              it or prevent its sending. The function is called with
  //              (context, next, done). If execution should continue,
  //              the middleware should call next(done). If execution should
  //              stop, the middleware should call done(). To modify the
  //              outgoing message, set context.string to a new message.
  //
  // Returns nothing.
  responseMiddleware(middleware) {
    this.middleware.response.register(middleware)
  }

  // Public: Registers new middleware for execution before matching
  //
  // middleware - A function that determines whether or not listeners should be
  //              checked. The function is called with (context, next, done). If
  //              ext, next, done). If execution should continue to the next
  //              middleware or matching phase, it should call the 'next'
  //              function with 'done' as an argument. If not, the middleware
  //              should call the 'done' function with no arguments.
  //
  // Returns nothing.
  receiveMiddleware(middleware) {
    this.middleware.receive.register(middleware)
  }

  // Public: Passes the given message to any interested Listeners after running
  //         receive middleware.
  //
  // message - A Message instance. Listeners can flag this message as 'done' to
  //           prevent further execution.
  //
  // cb - Optional callback that is called when message processing is complete
  //
  // Returns nothing.
  // Returns before executing callback
  receive(message, cb) {
    // When everything is finished (down the middleware stack and back up),
    // pass control back to the robot
    this.middleware.receive.execute(
      { response: new Response(this, message) },
      this.processListeners.bind(this),
      cb
    )
  }

  // Private: Passes the given message to any interested Listeners.
  //
  // message - A Message instance. Listeners can flag this message as 'done' to
  //           prevent further execution.
  //
  // done - Optional callback that is called when message processing is complete
  //
  // Returns nothing.
  // Returns before executing callback
  processListeners(context, done) {
    // Try executing all registered Listeners in order of registration
    // and return after message is done being processed
    let anyListenersExecuted = false

    async.detectSeries(
      this.listeners,
      (listener, done) => {
        try {
          listener.call(
            context.response.message,
            this.middleware.listener,
            (listenerExecuted) => {
              anyListenersExecuted = anyListenersExecuted || listenerExecuted
              // Defer to the event loop at least after every listener so the
              // stack doesn't get too big
              process.nextTick(() =>
                // Stop processing when message.done == true
                done(context.response.message.done)
              )
            }
          )
        } catch (err) {
          this.emit("error", [
            err,
            new this.Response(context.response.message, []),
          ])
          // Continue to next listener when there is an error
          done(null, false)
        }
      },
      // Ignore the result ( == the listener that set message.done = true)
      (_) => {
        // If no registered Listener matched the message

        if (
          !(context.response.message instanceof Message.CatchAllMessage) &&
          !anyListenersExecuted
        ) {
          this.logger.debug("No listeners executed; falling back to catch-all")
          this.receive(
            new Message.CatchAllMessage(context.response.message),
            done
          )
        } else if (done != null) {
          process.nextTick(done)
        }
      }
    )
  }

  // Public: Loads a file in path.
  //
  // filepath - A String path on the filesystem.
  // filename - A String filename in path on the filesystem.
  //
  // Returns nothing.
  async loadFile(filepath, filename) {
    const ext = path.extname(filename)
    const full = path.join(filepath, path.basename(filename, ext))

    // see https://github.com/hubotio/hubot/issues/1355
    if (
      !require.extensions[ext] &&
      // Explicitly support .ts, since we use esm-loader-typescript loader in
      // bin/hubot to properly support loading transpiled modern ESM
      // TypeScript.
      ![".mjs", ".ts"].includes(ext)
    ) {
      // eslint-disable-line
      return
    }

    try {
      const script =
        ext === ".mjs" || ext === ".ts"
          ? (await import(full + ext)).default
          : // The whole point here is to require dynamically <_<
            // eslint-disable-next-line import/no-dynamic-require
            require(full + ext)

      if (typeof script === "function") {
        script(this)
        this.parseHelp(path.join(filepath, filename))
      } else {
        this.logger.warning(
          `Expected ${full} to assign a function to module.exports, got ${typeof script}`
        )
      }
    } catch (error) {
      this.logger.error(
        `Unable to load ${full}: ${error instanceof Error ? error.stack : ""}`
      )
      process.exit(1)
    }
  }

  // Public: Loads every script in the given path.
  //
  // path - A String path on the filesystem.
  //
  // Returns nothing.
  load(path) {
    this.logger.debug(`Loading scripts from ${path}`)

    if (fs.existsSync(path)) {
      fs.readdirSync(path)
        .sort()
        .map((file) => this.loadFile(path, file))
    }
  }

  // Public: Load scripts specified in the `hubot-scripts.json` file.
  //
  // path    - A String path to the hubot-scripts files.
  // scripts - An Array of scripts to load.
  //
  // Returns nothing.
  loadHubotScripts(path, scripts) {
    this.logger.debug(`Loading hubot-scripts from ${path}`)
    Array.from(scripts).map((script) => this.loadFile(path, script))
  }

  // Public: Load scripts from packages specified in the
  // `external-scripts.json` file.
  //
  // packages - An Array of packages containing hubot scripts to load.
  //
  // Returns nothing.
  async loadExternalScripts(packages: string[] | { [pkg: string]: object }) {
    this.logger.debug("Loading external-scripts from npm packages")

    try {
      if (Array.isArray(packages)) {
        await Promise.all(
          // We're in dynamic require land!
          // eslint-disable-next-line import/no-dynamic-require
          packages.map(async (pkg) => require(pkg)(this))
        )
        return
      }

      await Promise.all(
        Object.keys(packages).map(async (key) =>
          // We're in dynamic require land!
          // eslint-disable-next-line import/no-dynamic-require
          require(key)(this, packages[key])
        )
      )
    } catch (error) {
      this.logger.error(
        `Error loading scripts from npm package - ${
          error instanceof Error ? error.stack : "(unknown)"
        }`
      )

      process.exit(1)
    }
  }

  // Setup the Express server's defaults.
  //
  // Returns nothing.
  async setupExpress() {
    const user = process.env.EXPRESS_USER
    const pass = process.env.EXPRESS_PASSWORD
    const stat = process.env.EXPRESS_STATIC
    const port = parseInt(
      process.env.EXPRESS_PORT ?? process.env.PORT ?? "8080",
      10
    )
    const address =
      process.env.EXPRESS_BIND_ADDRESS || process.env.BIND_ADDRESS || "0.0.0.0"
    const limit = process.env.EXPRESS_LIMIT || "100kb"
    const paramLimit =
      process.env.EXPRESS_PARAMETER_LIMIT === undefined
        ? 1000
        : parseInt(process.env.EXPRESS_PARAMETER_LIMIT, 10)

    const express = (await import("express")).default
    const multipart = (await import("connect-multiparty")).default

    const app = express()

    app.use((req, res, next) => {
      res.setHeader("X-Powered-By", `hubot/${this.name}`)
      return next()
    })

    if (user && pass) {
      app.use((express as any).basicAuth(user, pass))
    }
    app.use((express as any).query())

    app.use(express.json())
    app.use(
      express.urlencoded({ limit, parameterLimit: paramLimit, extended: true })
    )
    // replacement for deprecated express.multipart/connect.multipart
    // limit to 100mb, as per the old behavior
    app.use(multipart({ maxFilesSize: 100 * 1024 * 1024 }))

    if (stat) {
      app.use(express.static(stat))
    }

    try {
      this.server = app.listen(port, address)
      this.router = app
    } catch (error) {
      const err = error
      this.logger.error(
        `Error trying to start HTTP server: ${err}\n${
          err instanceof Error ? err.stack : ""
        }`
      )
      process.exit(1)
    }

    let herokuUrl = process.env.HEROKU_URL

    if (herokuUrl) {
      if (!/\/$/.test(herokuUrl)) {
        herokuUrl += "/"
      }
      this.pingIntervalId = setInterval(() => {
        HttpClient.create(`${herokuUrl}hubot/ping`).post()(
          (_err, res, body) => {
            this.logger.info("keep alive ping!")
          }
        )
      }, 5 * 60 * 1000)
    }
  }

  // Load the adapter Hubot is going to use.
  //
  // path    - A String of the path to adapter if local.
  // adapter - A String of the adapter name to use.
  //
  // Returns nothing.
  async loadAdapter(adapter: string) {
    this.logger.debug(`Loading adapter ${adapter}`)

    // Give adapter loading event handlers a chance to attach.
    await Promise.resolve()

    const path =
      Array.from(HUBOT_DEFAULT_ADAPTERS).indexOf(adapter) !== -1
        ? `${this.adapterPath}/${adapter}`
        : `hubot-${adapter}`

    try {
      this.adapter = (await import(path)).use(this)
    } catch (err) {
      this.logger.error(
        `Cannot load adapter ${adapter} as ES module - ${err}${
          err instanceof Error ? `\n\n${err.stack}` : ""
        }`
      )
      process.exit(1)
    }

    if (this.adapter !== null && this.adapter !== undefined) {
      this.#unregisteredCommands.forEach(({ name, parameters, callback }) =>
        this.command(name, parameters, callback)
      )
      this.adapter.on("connected", (...args) => this.emit("connected", ...args))
      this.emit("adapter-initialized", adapter)
    }
  }

  // Public: Help Commands for Running Scripts.
  //
  // Returns an Array of help commands for running scripts.
  helpCommands() {
    return this.commands.sort()
  }

  // Private: load help info from a loaded script.
  //
  // path - A String path to the file on disk.
  //
  // Returns nothing.
  async parseHelp(path: string) {
    const scriptDocumentation: { [section: string]: string[] } = {}
    const resolvedPathURLString = await import.meta.resolve?.(path)
    if (resolvedPathURLString === undefined) {
      return
    }
    const body = fs.readFileSync(new URL(resolvedPathURLString), "utf-8")

    const useStrictHeaderRegex = /^["']use strict['"];?\s+/
    const lines = body
      .replace(useStrictHeaderRegex, "")
      .split(/(?:\n|\r\n|\r)/)
      .reduce(toHeaderCommentBlock, { lines: [], isHeader: true })
      .lines.filter(Boolean) // remove empty lines
    let currentSection = null
    let nextSection

    this.logger.debug(`Parsing help for ${path}`)

    for (let i = 0, line; i < lines.length; i++) {
      line = lines[i]

      if (line.toLowerCase() === "none") {
        continue
      }

      nextSection = line.toLowerCase().replace(":", "")
      if (
        Array.from(HUBOT_DOCUMENTATION_SECTIONS).indexOf(nextSection) !== -1
      ) {
        currentSection = nextSection
        scriptDocumentation[nextSection] = []
      } else if (currentSection) {
        scriptDocumentation[currentSection].push(line)
        if (currentSection === "commands") {
          this.commands.push(line)
        }
      }
    }

    if (currentSection === null) {
      this.logger.info(`${path} is using deprecated documentation syntax`)
      scriptDocumentation.commands = []
      for (let i = 0, line, cleanedLine; i < lines.length; i++) {
        line = lines[i]
        if (line.match("-")) {
          continue
        }

        cleanedLine = line
          .slice(2, +line.length + 1 || 9e9)
          .replace(/^hubot/i, this.name)
          .trim()
        scriptDocumentation.commands.push(cleanedLine)
        this.commands.push(cleanedLine)
      }
    }
  }

  // Public: A helper send function which delegates to the adapter's send
  // function.
  //
  // envelope - A Object with message, room and user details.
  // strings  - One or more Strings for each message to send.
  //
  // Returns nothing.
  send(envelope: any, ...strings: string[]) {
    this.adapter!.send.apply(this.adapter, [envelope].concat(strings))
  }

  // Public: A helper reply function which delegates to the adapter's reply
  // function.
  //
  // envelope - A Object with message, room and user details.
  // strings  - One or more Strings for each message to send.
  //
  // Returns nothing.
  reply(envelope: any, ...strings: string[]) {
    this.adapter!.reply.apply(this.adapter, [envelope].concat(strings))
  }

  // Public: A helper send function to message a room that the robot is in.
  //
  // room    - String designating the room to message.
  // strings - One or more Strings for each message to send.
  //
  // Returns nothing.
  messageRoom(room: string, ...strings: string[]) {
    const envelope = { room }

    this.adapter!.send.apply(this.adapter, [envelope as any].concat(strings))
  }

  // Public: A wrapper around the EventEmitter API to make usage
  // semantically better.
  //
  // event    - The event name.
  // listener - A Function that is called with the event parameter
  //            when event happens.
  //
  // Returns nothing.
  once(event: string, callback: () => void): void {
    this.events.once(event).then(callback)
  }

  // Public: Kick off the event loop for the adapter
  //
  // Returns nothing.
  run() {
    this.emit("running")

    this.adapter!.run()
  }

  // Public: Gracefully shutdown the robot process
  //
  // Returns nothing.
  shutdown() {
    if (this.pingIntervalId !== undefined) {
      clearInterval(this.pingIntervalId)
    }
    process.removeListener("uncaughtException", this.#onUncaughtException)
    this.adapter!.close()
    if (this.server) {
      this.server.close()
    }

    this.brain.close()
  }

  // Public: The version of Hubot from npm
  //
  // Returns a String of the version number.
  async parseVersion() {
    // FIXME convert to fs.readFileSync + JSON.parse, eh?
    // eslint-disable-next-line import/no-dynamic-require
    const pkg = require(path.join(__dirname, "..", "package.json"))
    this.version = pkg.version

    return this.version
  }

  // Public: Creates a scoped http client with chainable methods for
  // modifying the request. This doesn't actually make a request though.
  // Once your request is assembled, you can call `get()`/`post()`/etc to
  // send the request.
  //
  // url - String URL to access.
  // options - Optional options to pass on to the client
  //
  // Examples:
  //
  //     robot.http("http://example.com")
  //       # set a single header
  //       .header('Authorization', 'bearer abcdef')
  //
  //       # set multiple headers
  //       .headers(Authorization: 'bearer abcdef', Accept: 'application/json')
  //
  //       # add URI query parameters
  //       .query(a: 1, b: 'foo & bar')
  //
  //       # make the actual request
  //       .get() (err, res, body) ->
  //         console.log body
  //
  //       # or, you can POST data
  //       .post(data) (err, res, body) ->
  //         console.log body
  //
  //    # Can also set options
  //    robot.http("https://example.com", {rejectUnauthorized: false})
  //
  // Returns a ScopedClient instance.
  http(url, options) {
    const httpOptions = extend({}, this.globalHttpOptions, options)

    return HttpClient.create(url, httpOptions).header(
      "User-Agent",
      `Hubot/${this.version}`
    )
  }
}

export default Robot

function isCatchAllMessage(message) {
  return message instanceof Message.CatchAllMessage
}

function toHeaderCommentBlock(block, currentLine) {
  if (!block.isHeader) {
    return block
  }

  if (isCommentLine(currentLine)) {
    block.lines.push(removeCommentPrefix(currentLine))
  } else {
    block.isHeader = false
  }

  return block
}

function isCommentLine(line) {
  return /^(#|\/\/)/.test(line)
}

function removeCommentPrefix(line) {
  return line.replace(/^[#/]+\s*/, "")
}

function extend(obj: any, ...sources: any[]) {
  sources.forEach((source) => {
    if (typeof source !== "object") {
      return
    }

    Object.keys(source).forEach((key) => {
      obj[key] = source[key]
    })
  })

  return obj
}
