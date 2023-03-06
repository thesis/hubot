import Emittery from 'emittery';
import coffee from 'coffeescript';
import { createRequire } from 'node:module';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import async from 'async';
import Log from 'log';
import * as HttpClient from 'scoped-http-client';
import { inspect } from 'util';

class DataStore {
  // Represents a persistent, database-backed storage for the robot. Extend this.
  //
  // Returns a new Datastore with no storage.
  constructor(robot) {
    this.robot = robot;
  }

  // Public: Set value for key in the database. Overwrites existing
  // values if present. Returns a promise which resolves when the
  // write has completed.
  //
  // Value can be any JSON-serializable type.
  set(key, value) {
    return this._set(key, value, "global");
  }

  // Public: Assuming `key` represents an object in the database,
  // sets its `objectKey` to `value`. If `key` isn't already
  // present, it's instantiated as an empty object.
  setObject(key, objectKey, value) {
    return this.get(key).then(object => {
      const target = object || {};
      target[objectKey] = value;
      return this.set(key, target);
    });
  }

  // Public: Adds the supplied value(s) to the end of the existing
  // array in the database marked by `key`. If `key` isn't already
  // present, it's instantiated as an empty array.
  setArray(key, value) {
    return this.get(key).then(object => {
      const target = object || [];
      // Extend the array if the value is also an array, otherwise
      // push the single value on the end.
      if (Array.isArray(value)) {
        return this.set(key, target.push.apply(target, value));
      }
      return this.set(key, target.concat(value));
    });
  }

  // Public: Get value by key if in the database or return `undefined`
  // if not found. Returns a promise which resolves to the
  // requested value.
  get(key) {
    return this._get(key, "global");
  }

  // Public: Digs inside the object at `key` for a key named
  // `objectKey`. If `key` isn't already present, or if it doesn't
  // contain an `objectKey`, returns `undefined`.
  getObject(key, objectKey) {
    return this.get(key).then(object => {
      const target = object || {};
      return target[objectKey];
    });
  }

  // Private: Implements the underlying `set` logic for the datastore.
  // This will be called by the public methods. This is one of two
  // methods that must be implemented by subclasses of this class.
  // `table` represents a unique namespace for this key, such as a
  // table in a SQL database.
  //
  // This returns a resolved promise when the `set` operation is
  // successful, and a rejected promise if the operation fails.
  _set(key, value, table) {
    return Promise.reject(new DataStoreUnavailable("Setter called on the abstract class."));
  }

  // Private: Implements the underlying `get` logic for the datastore.
  // This will be called by the public methods. This is one of two
  // methods that must be implemented by subclasses of this class.
  // `table` represents a unique namespace for this key, such as a
  // table in a SQL database.
  //
  // This returns a resolved promise containing the fetched value on
  // success, and a rejected promise if the operation fails.
  _get(key, table) {
    return Promise.reject(new DataStoreUnavailable("Getter called on the abstract class."));
  }
}
class DataStoreUnavailable extends Error {}

class User {
  // Represents a participating user in the chat.
  //
  // id      - A unique ID for the user.
  // options - An optional Hash of key, value pairs for this user.
  constructor(id, options) {
    this.id = id;
    if (options == null) {
      options = {};
    }

    // Define a getter method so we don't actually store the
    // robot itself on the user object, preventing it from
    // being serialized into the brain.
    if (options.robot) {
      const {
        robot
      } = options;
      delete options.robot;
      this._getRobot = function () {
        return robot;
      };
    } else {
      this._getRobot = function () {};
    }
    Object.keys(options).forEach(key => {
      this[key] = options[key];
    });
    if (!this.name) {
      this.name = this.id.toString();
    }
  }
  set(key, value) {
    this._checkDatastoreAvailable();
    return this._getDatastore()._set(this._constructKey(key), value, "users");
  }
  get(key) {
    this._checkDatastoreAvailable();
    return this._getDatastore()._get(this._constructKey(key), "users");
  }
  _constructKey(key) {
    return `${this.id}+${key}`;
  }
  _checkDatastoreAvailable() {
    if (!this._getDatastore()) {
      throw new DataStoreUnavailable("datastore is not initialized");
    }
  }
  _getDatastore() {
    const robot = this._getRobot();
    if (robot) {
      return robot.datastore;
    }
  }
}

// If necessary, reconstructs a User object. Returns either:
//
// 1. If the original object was falsy, null
// 2. If the original object was a User object, the original object
// 3. If the original object was a plain JavaScript object, return
//    a User object with all of the original object's properties.
const reconstructUserIfNecessary = function (user, robot) {
  if (!user) {
    return null;
  }
  if (!user.constructor || user.constructor && user.constructor.name !== "User") {
    const {
      id
    } = user;
    delete user.id;
    // Use the old user as the "options" object,
    // populating the new user with its values.
    // Also add the `robot` field so it gets a reference.
    user.robot = robot;
    const newUser = new User(id, user);
    delete user.robot;
    return newUser;
  }
  return user;
};
class Brain extends Emittery {
  // Represents somewhat persistent storage for the robot. Extend this.
  //
  // Returns a new Brain with no external storage.
  constructor(robot) {
    super();
    this.data = {
      users: {},
      _private: {}
    };
    this.getRobot = function () {
      return robot;
    };
    this.autoSave = true;
    robot.on("running", () => {
      this.resetSaveInterval(5);
    });
  }

  // Public: Store key-value pair under the private namespace and extend
  // existing @data before emitting the 'loaded' event.
  //
  // Returns the instance for chaining.
  set(key, value) {
    let pair;
    if (key === Object(key)) {
      pair = key;
    } else {
      pair = {};
      pair[key] = value;
    }
    Object.keys(pair).forEach(key => {
      this.data._private[key] = pair[key];
    });
    this.emit("loaded", this.data);
    return this;
  }

  // Public: Get value by key from the private namespace in @data
  // or return null if not found.
  //
  // Returns the value.
  get(key) {
    return this.data._private[key] != null ? this.data._private[key] : null;
  }

  // Public: Remove value by key from the private namespace in @data
  // if it exists
  //
  // Returns the instance for chaining.
  remove(key) {
    if (this.data._private[key] != null) {
      delete this.data._private[key];
    }
    return this;
  }

  // Public: Emits the 'save' event so that 'brain' scripts can handle
  // persisting.
  //
  // Returns nothing.
  save() {
    this.emit("save", this.data);
  }

  // Public: Emits the 'close' event so that 'brain' scripts can handle closing.
  //
  // Returns nothing.
  close() {
    clearInterval(this.saveInterval);
    this.save();
    this.emit("close");
  }

  // Public: Enable or disable the automatic saving
  //
  // enabled - A boolean whether to autosave or not
  //
  // Returns nothing
  setAutoSave(enabled) {
    this.autoSave = enabled;
  }

  // Public: Reset the interval between save function calls.
  //
  // seconds - An Integer of seconds between saves.
  //
  // Returns nothing.
  resetSaveInterval(seconds) {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
    this.saveInterval = setInterval(() => {
      if (this.autoSave) {
        this.save();
      }
    }, seconds * 1000);
  }

  // Public: Merge keys loaded from a DB against the in memory representation.
  //
  // Returns nothing.
  //
  // Caveats: Deeply nested structures don't merge well.
  mergeData(data) {
    for (const k in data || {}) {
      this.data[k] = data[k];
    }

    // Ensure users in the brain are still User objects.
    if (data && data.users) {
      for (const k in data.users) {
        const user = this.data.users[k];
        this.data.users[k] = reconstructUserIfNecessary(user, this.getRobot());
      }
    }
    this.emit("loaded", this.data);
  }

  // Public: Get an Array of User objects stored in the brain.
  //
  // Returns an Array of User objects.
  users() {
    return this.data.users;
  }

  // Public: Get a User object given a unique identifier.
  //
  // Returns a User instance of the specified user.
  userForId(id, options) {
    let user = this.data.users[id];
    if (!options) {
      options = {};
    }
    options.robot = this.getRobot();
    if (!user) {
      user = new User(id, options);
      this.data.users[id] = user;
    }
    if (options && options.room && (!user.room || user.room !== options.room)) {
      user = new User(id, options);
      this.data.users[id] = user;
    }
    delete options.robot;
    return user;
  }

  // Public: Get a User object given a name.
  //
  // Returns a User instance for the user with the specified name.
  userForName(name) {
    let result = null;
    const lowerName = name.toLowerCase();
    for (const k in this.data.users || {}) {
      const userName = this.data.users[k].name;
      if (userName != null && userName.toString().toLowerCase() === lowerName) {
        result = this.data.users[k];
      }
    }
    return result;
  }

  // Public: Get all users whose names match fuzzyName. Currently, match
  // means 'starts with', but this could be extended to match initials,
  // nicknames, etc.
  //
  // Returns an Array of User instances matching the fuzzy name.
  usersForRawFuzzyName(fuzzyName) {
    const lowerFuzzyName = fuzzyName.toLowerCase();
    const users = this.data.users || {};
    return Object.keys(users).reduce((result, key) => {
      const user = users[key];
      if (user.name.toLowerCase().lastIndexOf(lowerFuzzyName, 0) === 0) {
        result.push(user);
      }
      return result;
    }, []);
  }

  // Public: If fuzzyName is an exact match for a user, returns an array with
  // just that user. Otherwise, returns an array of all users for which
  // fuzzyName is a raw fuzzy match (see usersForRawFuzzyName).
  //
  // Returns an Array of User instances matching the fuzzy name.
  usersForFuzzyName(fuzzyName) {
    const matchedUsers = this.usersForRawFuzzyName(fuzzyName);
    const lowerFuzzyName = fuzzyName.toLowerCase();
    const fuzzyMatchedUsers = matchedUsers.filter(user => user.name.toLowerCase() === lowerFuzzyName);
    return fuzzyMatchedUsers.length > 0 ? fuzzyMatchedUsers : matchedUsers;
  }
}

var id = 0;
function _classPrivateFieldLooseKey(name) {
  return "__private_" + id++ + "_" + name;
}
function _classPrivateFieldLooseBase(receiver, privateKey) {
  if (!Object.prototype.hasOwnProperty.call(receiver, privateKey)) {
    throw new TypeError("attempted to use private field on non-instance");
  }
  return receiver;
}

class Response {
  // Public: Responses are sent to matching listeners. Messages know about the
  // content and user that made the original message, and how to reply back to
  // them.
  //
  // robot   - A Robot instance.
  // message - A Message instance.
  // match   - A Match object from the successful Regex match.
  constructor(robot, message, match) {
    this.robot = robot;
    this.message = message;
    this.match = match;
    this.envelope = {
      room: this.message.room,
      user: this.message.user,
      message: this.message
    };
  }

  // Public: Posts a message back to the chat source
  //
  // strings - One or more strings to be posted. The order of these strings
  //           should be kept intact.
  //
  // Returns nothing.
  send( /* ...strings */
  ) {
    const strings = [].slice.call(arguments);
    this.runWithMiddleware.apply(this, ["send", {
      plaintext: true
    }].concat(strings));
  }

  // Public: Posts an emote back to the chat source
  //
  // strings - One or more strings to be posted. The order of these strings
  //           should be kept intact.
  //
  // Returns nothing.
  emote( /* ...strings */
  ) {
    const strings = [].slice.call(arguments);
    this.runWithMiddleware.apply(this, ["emote", {
      plaintext: true
    }].concat(strings));
  }

  // Public: Posts a message mentioning the current user.
  //
  // strings - One or more strings to be posted. The order of these strings
  //           should be kept intact.
  //
  // Returns nothing.
  reply( /* ...strings */
  ) {
    const strings = [].slice.call(arguments);
    this.runWithMiddleware.apply(this, ["reply", {
      plaintext: true
    }].concat(strings));
  }

  // Public: Posts a topic changing message
  //
  // strings - One or more strings to set as the topic of the
  //           room the bot is in.
  //
  // Returns nothing.
  topic( /* ...strings */
  ) {
    const strings = [].slice.call(arguments);
    this.runWithMiddleware.apply(this, ["topic", {
      plaintext: true
    }].concat(strings));
  }

  // Public: Play a sound in the chat source
  //
  // strings - One or more strings to be posted as sounds to play. The order of
  //           these strings should be kept intact.
  //
  // Returns nothing
  play( /* ...strings */
  ) {
    const strings = [].slice.call(arguments);
    this.runWithMiddleware.apply(this, ["play"].concat(strings));
  }

  // Public: Posts a message in an unlogged room
  //
  // strings - One or more strings to be posted. The order of these strings
  //           should be kept intact.
  //
  // Returns nothing
  locked( /* ...strings */
  ) {
    const strings = [].slice.call(arguments);
    this.runWithMiddleware.apply(this, ["locked", {
      plaintext: true
    }].concat(strings));
  }

  // Private: Call with a method for the given strings using response
  // middleware.
  runWithMiddleware(methodName, opts /* , ...strings */) {
    const self = this;
    const strings = [].slice.call(arguments, 2);
    const copy = strings.slice(0);
    let callback;
    if (typeof copy[copy.length - 1] === "function") {
      callback = copy.pop();
    }
    const context = {
      response: this,
      strings: copy,
      method: methodName
    };
    if (opts.plaintext != null) {
      context.plaintext = true;
    }
    function responseMiddlewareDone() {}
    function runAdapterSend(_, done) {
      const result = context.strings;
      if (callback != null) {
        result.push(callback);
      }
      self.robot.adapter[methodName].apply(self.robot.adapter, [self.envelope].concat(result));
      done();
    }
    return this.robot.middleware.response.execute(context, runAdapterSend, responseMiddlewareDone);
  }

  // Public: Picks a random item from the given items.
  //
  // items - An Array of items.
  //
  // Returns a random item.
  random(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  // Public: Tell the message to stop dispatching to listeners
  //
  // Returns nothing.
  finish() {
    this.message.finish();
  }

  // Public: Creates a scoped http client with chainable methods for
  // modifying the request. This doesn't actually make a request though.
  // Once your request is assembled, you can call `get()`/`post()`/etc to
  // send the request.
  //
  // Returns a ScopedClient instance.
  http(url, options) {
    return this.robot.http(url, options);
  }
}

class Message {
  // Represents an incoming message from the chat.
  //
  // user - A User instance that sent the message.
  constructor(user, done) {
    this.user = user;
    this.done = done || false;
    this.room = this.user.room;
  }

  // Indicates that no other Listener should be called on this object
  //
  // Returns nothing.
  finish() {
    this.done = true;
  }
}
class TextMessage extends Message {
  // Represents an incoming message from the chat.
  //
  // user - A User instance that sent the message.
  // text - A String message.
  // id   - A String of the message ID.
  constructor(user, text, id) {
    super(user);
    this.text = text;
    this.id = id;
  }

  // Determines if the message matches the given regex.
  //
  // regex - A Regex to check.
  //
  // Returns a Match object or null.
  match(regex) {
    return this.text.match(regex);
  }

  // String representation of a TextMessage
  //
  // Returns the message text
  toString() {
    return this.text;
  }
}

// Represents an incoming user entrance notification.
//
// user - A User instance for the user who entered.
// text - Always null.
// id   - A String of the message ID.
class EnterMessage extends Message {}

// Represents an incoming user exit notification.
//
// user - A User instance for the user who left.
// text - Always null.
// id   - A String of the message ID.
class LeaveMessage extends Message {}

// Represents an incoming topic change notification.
//
// user - A User instance for the user who changed the topic.
// text - A String of the new topic
// id   - A String of the message ID.
class TopicMessage extends TextMessage {}
class CatchAllMessage extends Message {
  // Represents a message that no matchers matched.
  //
  // message - The original message.
  constructor(message) {
    super(message.user);
    this.message = message;
  }
}

const {
  reduce
} = async;
class Middleware {
  constructor(robot) {
    this.robot = robot;
    this.stack = [];
  }

  // Public: Execute all middleware in order and call 'next' with the latest
  // 'done' callback if last middleware calls through. If all middleware is
  // compliant, 'done' should be called with no arguments when the entire
  // round trip is complete.
  //
  // context - context object that is passed through the middleware stack.
  //     When handling errors, this is assumed to have a `response` property.
  //
  // next(context, done) - Called when all middleware is complete (assuming
  //     all continued by calling respective 'next' functions)
  //
  // done() - Initial (final) completion callback. May be wrapped by
  //     executed middleware.
  //
  // Returns nothing
  // Returns before executing any middleware
  execute(context, next, done) {
    const self = this;
    if (done == null) {
      done = function () {};
    }

    // Execute a single piece of middleware and update the completion callback
    // (each piece of middleware can wrap the 'done' callback with additional
    // logic).
    function executeSingleMiddleware(doneFunc, middlewareFunc, cb) {
      // Match the async.reduce interface
      function nextFunc(newDoneFunc) {
        cb(null, newDoneFunc || doneFunc);
      }

      // Catch errors in synchronous middleware
      try {
        middlewareFunc(context, nextFunc, doneFunc);
      } catch (err) {
        // Maintaining the existing error interface (Response object)
        self.robot.emit("error", err, context.response);
        // Forcibly fail the middleware and stop executing deeper
        doneFunc();
      }
    }

    // Executed when the middleware stack is finished
    function allDone(_, finalDoneFunc) {
      next(context, finalDoneFunc);
    }

    // Execute each piece of middleware, collecting the latest 'done' callback
    // at each step.
    process.nextTick(reduce.bind(null, this.stack, done, executeSingleMiddleware, allDone));
  }

  // Public: Registers new middleware
  //
  // middleware - A generic pipeline component function that can either
  //              continue the pipeline or interrupt it. The function is called
  //              with (robot, context, next, done). If execution should
  //              continue (next middleware, final callback), the middleware
  //              should call the 'next' function with 'done' as an optional
  //              argument.
  //              If not, the middleware should call the 'done' function with
  //              no arguments. Middleware may wrap the 'done' function in
  //              order to execute logic after the final callback has been
  //              executed.
  //
  // Returns nothing.
  register(middleware) {
    if (middleware.length !== 3) {
      throw new Error(`Incorrect number of arguments for middleware callback (expected 3, got ${middleware.length})`);
    }
    this.stack.push(middleware);
  }
}

class Listener {
  // Listeners receive every message from the chat source and decide if they
  // want to act on it.
  // An identifier should be provided in the options parameter to uniquely
  // identify the listener (options.id).
  //
  // robot    - A Robot instance.
  // matcher  - A Function that determines if this listener should trigger the
  //            callback.
  // options  - An Object of additional parameters keyed on extension name
  //            (optional).
  // callback - A Function that is triggered if the incoming message matches.
  constructor(robot, matcher, options, callback) {
    this.robot = robot;
    this.matcher = matcher;
    this.options = options;
    this.callback = callback;
    if (this.matcher == null) {
      throw new Error("Missing a matcher for Listener");
    }
    if (this.callback == null) {
      this.callback = this.options;
      this.options = {};
    }
    if (this.options.id == null) {
      this.options.id = null;
    }
    if (this.callback == null || typeof this.callback !== "function") {
      throw new Error("Missing a callback for Listener");
    }
  }

  // Public: Determines if the listener likes the content of the message. If
  // so, a Response built from the given Message is passed through all
  // registered middleware and potentially the Listener callback. Note that
  // middleware can intercept the message and prevent the callback from ever
  // being executed.
  //
  // message - A Message instance.
  // middleware - Optional Middleware object to execute before the Listener callback
  // callback - Optional Function called with a boolean of whether the matcher matched
  //
  // Returns a boolean of whether the matcher matched.
  // Returns before executing callback
  call(message, middleware, didMatchCallback) {
    // middleware argument is optional
    if (didMatchCallback == null && typeof middleware === "function") {
      didMatchCallback = middleware;
      middleware = undefined;
    }

    // ensure we have a Middleware object
    if (middleware == null) {
      middleware = new Middleware(this.robot);
    }
    const match = this.matcher(message);
    if (match) {
      if (this.regex) {
        this.robot.logger.debug(`Message '${message}' matched regex /${inspect(this.regex)}/; listener.options = ${inspect(this.options)}`);
      }

      // special middleware-like function that always executes the Listener's
      // callback and calls done (never calls 'next')
      const executeListener = (context, done) => {
        this.robot.logger.debug(`Executing listener callback for Message '${message}'`);
        try {
          this.callback(context.response);
        } catch (err) {
          this.robot.emit("error", err, context.response);
        }
        done();
      };

      // When everything is finished (down the middleware stack and back up),
      // pass control back to the robot
      const allDone = function allDone() {
        // Yes, we tried to execute the listener callback (middleware may
        // have intercepted before actually executing though)
        if (didMatchCallback != null) {
          process.nextTick(() => didMatchCallback(true));
        }
      };
      const response = new this.robot.Response(this.robot, message, match);
      middleware.execute({
        listener: this,
        response
      }, executeListener, allDone);
      return true;
    }
    if (didMatchCallback != null) {
      // No, we didn't try to execute the listener callback
      process.nextTick(() => didMatchCallback(false));
    }
    return false;
  }
}
class TextListener extends Listener {
  // TextListeners receive every message from the chat source and decide if they
  // want to act on it.
  //
  // robot    - A Robot instance.
  // regex    - A Regex that determines if this listener should trigger the
  //            callback.
  // options  - An Object of additional parameters keyed on extension name
  //            (optional).
  // callback - A Function that is triggered if the incoming message matches.
  constructor(robot, regex, options, callback) {
    function matcher(message) {
      if (message instanceof TextMessage) {
        return message.match(regex);
      }
    }
    super(robot, matcher, options, callback);
    this.regex = regex;
  }
}

// Replacement for global __dirname constant in CJS modules.
// eslint-disable-next-line @typescript-eslint/naming-convention, no-underscore-dangle
const __dirname = /*#__PURE__*/dirname( /*#__PURE__*/fileURLToPath(import.meta.url));
const require = /*#__PURE__*/createRequire(import.meta.url);
function compile(filename) {
  return coffee.compile(`${fs.readFileSync(filename)}`, {
    filename,
    inlineMap: true
  });
}
require.extensions[".coffee"] = function loadCoffeeScript(m, filename) {
  // Internals, what can ya do.
  // eslint-disable-next-line no-underscore-dangle
  m._compile(compile(filename), filename);
};
const HUBOT_DEFAULT_ADAPTERS = ["shell"];
const HUBOT_DOCUMENTATION_SECTIONS = ["description", "dependencies", "configuration", "commands", "notes", "author", "authors", "examples", "tags", "urls"];
var _onUncaughtException = /*#__PURE__*/_classPrivateFieldLooseKey("onUncaughtException");
var _unregisteredCommands = /*#__PURE__*/_classPrivateFieldLooseKey("unregisteredCommands");
class Robot {
  // Public: A wrapper around the EventEmitter API to make usage
  // semantically better.
  //
  // event    - The event name.
  // listener - A Function that is called with the event parameter
  //            when event happens.
  //
  // Returns nothing.

  // Public: A wrapper around the EventEmitter API to make usage
  // semantically better.
  //
  // event   - The event name.
  // args...  - Arguments emitted by the event
  //
  // Returns nothing.

  // Robots receive messages from a chat source (Campfire, irc, etc), and
  // dispatch them to matching listeners.
  //
  // adapterPath -  A String of the path to built-in adapters (defaults to src/adapters)
  // adapter     - A String of the adapter name.
  // httpd       - A Boolean whether to enable the HTTP daemon.
  // name        - A String of the robot name, defaults to Hubot.
  // alias       - A String of the alias of the robot name
  constructor(adapterPath, adapterName, httpd, name = "Hubot", alias = undefined) {
    var _process$env$HUBOT_LO;
    this.adapterPath = void 0;
    this.adapterName = void 0;
    this.httpd = void 0;
    this.name = void 0;
    this.alias = void 0;
    this.version = "0";
    this.events = new Emittery();
    this.on = this.events.on.bind(this.events);
    this.emit = this.events.emit.bind(this.events);
    this.brain = new Brain(this);
    this.adapter = void 0;
    this.datastore = void 0;
    this.Response = Response;
    this.commands = [];
    this.listeners = [];
    this.server = void 0;
    this.router = void 0;
    this.middleware = {
      listener: new Middleware(this),
      response: new Middleware(this),
      receive: new Middleware(this)
    };
    this.logger = new Log((_process$env$HUBOT_LO = process.env.HUBOT_LOG_LEVEL) != null ? _process$env$HUBOT_LO : "info");
    this.pingIntervalId = void 0;
    this.globalHttpOptions = {};
    this.errorHandlers = [];
    Object.defineProperty(this, _onUncaughtException, {
      writable: true,
      value: err => this.emit("error", [err])
    });
    /**
     * Tracks commands that were added before an adapter was loaded. Once the
     * adapter is loaded, the commands are re-registered to properly notify the
     * adapter.
     */
    Object.defineProperty(this, _unregisteredCommands, {
      writable: true,
      value: []
    });
    this.adapterPath = adapterPath;
    this.adapterName = adapterName;
    this.httpd = httpd;
    this.name = name;
    this.alias = alias;
    this.adapterPath = path.join(__dirname, "adapters");
    this.parseVersion();
    if (httpd) {
      this.setupExpress();
    }
    this.loadAdapter(adapterName);
    this.on("error", ([err, res]) => this.invokeErrorHandlers(err, res));
    process.on("uncaughtException", _classPrivateFieldLooseBase(this, _onUncaughtException)[_onUncaughtException]);
  }
  urlForMessage(message) {
    return this.adapter.urlForMessage(message);
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
    this.listeners.push(new Listener(this, matcher, options, callback));
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
    this.listeners.push(new TextListener(this, regex, options, callback));
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
    this.hear(this.respondPattern(regex), options, callback);
  }
  /**
   * Add a command native to the adapter with a given name and the provided
   * command parameter info, which includes a name and description for the
   * parameter.
   *
   * This allows hooking into first-class command support on platforms like
   * Discord, while allowing Hubot to fall back to a standard `respond` when
   * needed.
   */
  command(name, parameters, callback) {
    if (this.adapter && "registerCommand" in this.adapter) {
      this.adapter.registerCommand(name, parameters, callback);
    } else if (this.adapter) {
      this.respond(name, {}, callback);
    } else {
      // Handle once the adapter is available, in loadAdapter.
      _classPrivateFieldLooseBase(this, _unregisteredCommands)[_unregisteredCommands].push({
        name,
        parameters,
        callback: callback
      });
    }
  }
  // Public: Build a regular expression that matches messages addressed
  // directly to the robot
  //
  // regex - A RegExp for the message part that follows the robot's name/alias
  //
  // Returns RegExp.
  respondPattern(regex) {
    const regexWithoutModifiers = regex.toString().split("/");
    regexWithoutModifiers.shift();
    const modifiers = regexWithoutModifiers.pop();
    const regexStartsWithAnchor = regexWithoutModifiers[0] && regexWithoutModifiers[0][0] === "^";
    const pattern = regexWithoutModifiers.join("/");
    const name = this.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    if (regexStartsWithAnchor) {
      this.logger.warning("Anchors don’t work well with respond, perhaps you want to use 'hear'");
      this.logger.warning(`The regex in question was ${regex.toString()}`);
    }
    if (!this.alias) {
      return new RegExp(`^\\s*[@]?${name}[:,]?\\s*(?:${pattern})`, modifiers);
    }
    const alias = this.alias.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    // matches properly when alias is substring of name
    if (name.length > alias.length) {
      return new RegExp(`^\\s*[@]?(?:${name}[:,]?|${alias}[:,]?)\\s*(?:${pattern})`, modifiers);
    }
    // matches properly when name is substring of alias
    return new RegExp(`^\\s*[@]?(?:${alias}[:,]?|${name}[:,]?)\\s*(?:${pattern})`, modifiers);
  }
  // Public: Adds a Listener that triggers when anyone enters the room.
  //
  // options  - An Object of additional parameters keyed on extension name
  //            (optional).
  // callback - A Function that is called with a Response object.
  //
  // Returns nothing.
  enter(options, callback) {
    this.listen(msg => msg instanceof EnterMessage, options, callback);
  }
  // Public: Adds a Listener that triggers when anyone leaves the room.
  //
  // options  - An Object of additional parameters keyed on extension name
  //            (optional).
  // callback - A Function that is called with a Response object.
  //
  // Returns nothing.
  leave(options, callback) {
    this.listen(msg => msg instanceof LeaveMessage, options, callback);
  }
  // Public: Adds a Listener that triggers when anyone changes the topic.
  //
  // options  - An Object of additional parameters keyed on extension name
  //            (optional).
  // callback - A Function that is called with a Response object.
  //
  // Returns nothing.
  topic(options, callback) {
    this.listen(msg => msg instanceof TopicMessage, options, callback);
  }
  // Public: Adds an error handler when an uncaught exception or user emitted
  // error event occurs.
  //
  // callback - A Function that is called with the error object.
  //
  // Returns nothing.
  error(callback) {
    this.errorHandlers.push(callback);
  }
  // Calls and passes any registered error handlers for unhandled exceptions or
  // user emitted error events.
  //
  // err - An Error object.
  // res - An optional Response object that generated the error
  //
  // Returns nothing.
  invokeErrorHandlers(error, res) {
    var _error$stack;
    this.logger.error((_error$stack = error.stack) != null ? _error$stack : "error with no stack");
    this.errorHandlers.forEach(errorHandler => {
      try {
        errorHandler(error, res);
      } catch (errorHandlerError) {
        this.logger.error(`while invoking error handler: ${errorHandlerError}\n${errorHandlerError instanceof Error ? errorHandlerError.stack : ""}`);
      }
    });
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
      callback = options;
      options = {};
    }
    this.listen(isCatchAllMessage, options, msg => {
      msg.message = msg.message.message;
      callback(msg);
    });
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
    this.middleware.listener.register(middleware);
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
    this.middleware.response.register(middleware);
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
    this.middleware.receive.register(middleware);
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
    this.middleware.receive.execute({
      response: new Response(this, message)
    }, this.processListeners.bind(this), cb);
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
    let anyListenersExecuted = false;
    async.detectSeries(this.listeners, (listener, done) => {
      try {
        listener.call(context.response.message, this.middleware.listener, listenerExecuted => {
          anyListenersExecuted = anyListenersExecuted || listenerExecuted;
          // Defer to the event loop at least after every listener so the
          // stack doesn't get too big
          process.nextTick(() =>
          // Stop processing when message.done == true
          done(context.response.message.done));
        });
      } catch (err) {
        this.emit("error", [err, new this.Response(context.response.message, [])]);
        // Continue to next listener when there is an error
        done(null, false);
      }
    },
    // Ignore the result ( == the listener that set message.done = true)
    _ => {
      // If no registered Listener matched the message
      if (!(context.response.message instanceof CatchAllMessage) && !anyListenersExecuted) {
        this.logger.debug("No listeners executed; falling back to catch-all");
        this.receive(new CatchAllMessage(context.response.message), done);
      } else if (done != null) {
        process.nextTick(done);
      }
    });
  }
  // Public: Loads a file in path.
  //
  // filepath - A String path on the filesystem.
  // filename - A String filename in path on the filesystem.
  //
  // Returns nothing.
  async loadFile(filepath, filename) {
    const ext = path.extname(filename);
    const full = path.join(filepath, path.basename(filename, ext));
    // see https://github.com/hubotio/hubot/issues/1355
    if (!require.extensions[ext] &&
    // Explicitly support .ts, since we use esm-loader-typescript loader in
    // bin/hubot to properly support loading transpiled modern ESM
    // TypeScript.
    ![".mjs", ".ts"].includes(ext)) {
      // eslint-disable-line
      return;
    }
    try {
      const script = ext === ".mjs" || ext === ".ts" ? (await import(full + ext)).default :
      // The whole point here is to require dynamically <_<
      // eslint-disable-next-line import/no-dynamic-require
      require(full + ext);
      if (typeof script === "function") {
        script(this);
        this.parseHelp(path.join(filepath, filename));
      } else {
        this.logger.warning(`Expected ${full} to assign a function to module.exports, got ${typeof script}`);
      }
    } catch (error) {
      this.logger.error(`Unable to load ${full}: ${error instanceof Error ? error.stack : ""}`);
      process.exit(1);
    }
  }
  // Public: Loads every script in the given path.
  //
  // path - A String path on the filesystem.
  //
  // Returns nothing.
  load(path) {
    this.logger.debug(`Loading scripts from ${path}`);
    if (fs.existsSync(path)) {
      fs.readdirSync(path).sort().map(file => this.loadFile(path, file));
    }
  }
  // Public: Load scripts specified in the `hubot-scripts.json` file.
  //
  // path    - A String path to the hubot-scripts files.
  // scripts - An Array of scripts to load.
  //
  // Returns nothing.
  loadHubotScripts(path, scripts) {
    this.logger.debug(`Loading hubot-scripts from ${path}`);
    Array.from(scripts).map(script => this.loadFile(path, script));
  }
  // Public: Load scripts from packages specified in the
  // `external-scripts.json` file.
  //
  // packages - An Array of packages containing hubot scripts to load.
  //
  // Returns nothing.
  async loadExternalScripts(packages) {
    this.logger.debug("Loading external-scripts from npm packages");
    try {
      if (Array.isArray(packages)) {
        await Promise.all(
        // We're in dynamic require land!
        // eslint-disable-next-line import/no-dynamic-require
        packages.map(async pkg => require(pkg)(this)));
        return;
      }
      await Promise.all(Object.keys(packages).map(async key =>
      // We're in dynamic require land!
      // eslint-disable-next-line import/no-dynamic-require
      require(key)(this, packages[key])));
    } catch (error) {
      this.logger.error(`Error loading scripts from npm package - ${error instanceof Error ? error.stack : "(unknown)"}`);
      process.exit(1);
    }
  }
  // Setup the Express server's defaults.
  //
  // Returns nothing.
  async setupExpress() {
    var _ref, _process$env$EXPRESS_;
    const user = process.env.EXPRESS_USER;
    const pass = process.env.EXPRESS_PASSWORD;
    const stat = process.env.EXPRESS_STATIC;
    const port = parseInt((_ref = (_process$env$EXPRESS_ = process.env.EXPRESS_PORT) != null ? _process$env$EXPRESS_ : process.env.PORT) != null ? _ref : "8080", 10);
    const address = process.env.EXPRESS_BIND_ADDRESS || process.env.BIND_ADDRESS || "0.0.0.0";
    const limit = process.env.EXPRESS_LIMIT || "100kb";
    const paramLimit = process.env.EXPRESS_PARAMETER_LIMIT === undefined ? 1000 : parseInt(process.env.EXPRESS_PARAMETER_LIMIT, 10);
    const express = (await import('express')).default;
    const multipart = (await import('connect-multiparty')).default;
    const app = express();
    app.use((req, res, next) => {
      res.setHeader("X-Powered-By", `hubot/${this.name}`);
      return next();
    });
    if (user && pass) {
      app.use(express.basicAuth(user, pass));
    }
    app.use(express.query());
    app.use(express.json());
    app.use(express.urlencoded({
      limit,
      parameterLimit: paramLimit,
      extended: true
    }));
    // replacement for deprecated express.multipart/connect.multipart
    // limit to 100mb, as per the old behavior
    app.use(multipart({
      maxFilesSize: 100 * 1024 * 1024
    }));
    if (stat) {
      app.use(express.static(stat));
    }
    try {
      this.server = app.listen(port, address);
      this.router = app;
    } catch (error) {
      const err = error;
      this.logger.error(`Error trying to start HTTP server: ${err}\n${err instanceof Error ? err.stack : ""}`);
      process.exit(1);
    }
    let herokuUrl = process.env.HEROKU_URL;
    if (herokuUrl) {
      if (!/\/$/.test(herokuUrl)) {
        herokuUrl += "/";
      }
      this.pingIntervalId = setInterval(() => {
        HttpClient.create(`${herokuUrl}hubot/ping`).post()((_err, res, body) => {
          this.logger.info("keep alive ping!");
        });
      }, 5 * 60 * 1000);
    }
  }
  // Load the adapter Hubot is going to use.
  //
  // path    - A String of the path to adapter if local.
  // adapter - A String of the adapter name to use.
  //
  // Returns nothing.
  async loadAdapter(adapter) {
    this.logger.debug(`Loading adapter ${adapter}`);
    // Give adapter loading event handlers a chance to attach.
    await Promise.resolve();
    const path = Array.from(HUBOT_DEFAULT_ADAPTERS).indexOf(adapter) !== -1 ? `${this.adapterPath}/${adapter}` : `hubot-${adapter}`;
    try {
      this.adapter = (await import(path)).use(this);
    } catch (err) {
      this.logger.error(`Cannot load adapter ${adapter} as ES module - ${err}${err instanceof Error ? `\n\n${err.stack}` : ""}`);
      process.exit(1);
    }
    if (this.adapter !== null && this.adapter !== undefined) {
      _classPrivateFieldLooseBase(this, _unregisteredCommands)[_unregisteredCommands].forEach(({
        name,
        parameters,
        callback
      }) => this.command(name, parameters, callback));
      this.adapter.on("connected", (...args) => this.emit("connected", ...args));
      this.emit("adapter-initialized", adapter);
    }
  }
  // Public: Help Commands for Running Scripts.
  //
  // Returns an Array of help commands for running scripts.
  helpCommands() {
    return this.commands.sort();
  }
  // Private: load help info from a loaded script.
  //
  // path - A String path to the file on disk.
  //
  // Returns nothing.
  async parseHelp(path) {
    var _import$meta$resolve, _import$meta;
    const scriptDocumentation = {};
    const resolvedPathURLString = await ((_import$meta$resolve = (_import$meta = import.meta).resolve) == null ? void 0 : _import$meta$resolve.call(_import$meta, path));
    if (resolvedPathURLString === undefined) {
      return;
    }
    const body = fs.readFileSync(new URL(resolvedPathURLString), "utf-8");
    const useStrictHeaderRegex = /^["']use strict['"];?\s+/;
    const lines = body.replace(useStrictHeaderRegex, "").split(/(?:\n|\r\n|\r)/).reduce(toHeaderCommentBlock, {
      lines: [],
      isHeader: true
    }).lines.filter(Boolean); // remove empty lines
    let currentSection = null;
    let nextSection;
    this.logger.debug(`Parsing help for ${path}`);
    for (let i = 0, line; i < lines.length; i++) {
      line = lines[i];
      if (line.toLowerCase() === "none") {
        continue;
      }
      nextSection = line.toLowerCase().replace(":", "");
      if (Array.from(HUBOT_DOCUMENTATION_SECTIONS).indexOf(nextSection) !== -1) {
        currentSection = nextSection;
        scriptDocumentation[nextSection] = [];
      } else if (currentSection) {
        scriptDocumentation[currentSection].push(line);
        if (currentSection === "commands") {
          this.commands.push(line);
        }
      }
    }
    if (currentSection === null) {
      this.logger.info(`${path} is using deprecated documentation syntax`);
      scriptDocumentation.commands = [];
      for (let i = 0, line, cleanedLine; i < lines.length; i++) {
        line = lines[i];
        if (line.match("-")) {
          continue;
        }
        cleanedLine = line.slice(2, +line.length + 1 || 9e9).replace(/^hubot/i, this.name).trim();
        scriptDocumentation.commands.push(cleanedLine);
        this.commands.push(cleanedLine);
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
  send(envelope, ...strings) {
    this.adapter.send.apply(this.adapter, [envelope].concat(strings));
  }
  // Public: A helper reply function which delegates to the adapter's reply
  // function.
  //
  // envelope - A Object with message, room and user details.
  // strings  - One or more Strings for each message to send.
  //
  // Returns nothing.
  reply(envelope, ...strings) {
    this.adapter.reply.apply(this.adapter, [envelope].concat(strings));
  }
  // Public: A helper send function to message a room that the robot is in.
  //
  // room    - String designating the room to message.
  // strings - One or more Strings for each message to send.
  //
  // Returns nothing.
  messageRoom(room, ...strings) {
    const envelope = {
      room
    };
    this.adapter.send.apply(this.adapter, [envelope].concat(strings));
  }
  // Public: A wrapper around the EventEmitter API to make usage
  // semantically better.
  //
  // event    - The event name.
  // listener - A Function that is called with the event parameter
  //            when event happens.
  //
  // Returns nothing.
  once(event, callback) {
    this.events.once(event).then(callback);
  }
  // Public: Kick off the event loop for the adapter
  //
  // Returns nothing.
  run() {
    this.emit("running");
    this.adapter.run();
  }
  // Public: Gracefully shutdown the robot process
  //
  // Returns nothing.
  shutdown() {
    if (this.pingIntervalId !== undefined) {
      clearInterval(this.pingIntervalId);
    }
    process.removeListener("uncaughtException", _classPrivateFieldLooseBase(this, _onUncaughtException)[_onUncaughtException]);
    this.adapter.close();
    if (this.server) {
      this.server.close();
    }
    this.brain.close();
  }
  // Public: The version of Hubot from npm
  //
  // Returns a String of the version number.
  async parseVersion() {
    // FIXME convert to fs.readFileSync + JSON.parse, eh?
    // eslint-disable-next-line import/no-dynamic-require
    const pkg = require(path.join(__dirname, "..", "package.json"));
    this.version = pkg.version;
    return this.version;
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
    const httpOptions = extend({}, this.globalHttpOptions, options);
    return HttpClient.create(url, httpOptions).header("User-Agent", `Hubot/${this.version}`);
  }
}
function isCatchAllMessage(message) {
  return message instanceof CatchAllMessage;
}
function toHeaderCommentBlock(block, currentLine) {
  if (!block.isHeader) {
    return block;
  }
  if (isCommentLine(currentLine)) {
    block.lines.push(removeCommentPrefix(currentLine));
  } else {
    block.isHeader = false;
  }
  return block;
}
function isCommentLine(line) {
  return /^(#|\/\/)/.test(line);
}
function removeCommentPrefix(line) {
  return line.replace(/^[#/]+\s*/, "");
}
function extend(obj, ...sources) {
  sources.forEach(source => {
    if (typeof source !== "object") {
      return;
    }
    Object.keys(source).forEach(key => {
      obj[key] = source[key];
    });
  });
  return obj;
}

class Adapter extends Emittery {
  // An adapter is a specific interface to a chat source for robots.
  //
  // robot - A Robot instance.
  constructor(robot) {
    super();
    this.robot = robot;
  }

  // Public: Method for fetching a URL to a given message. Extend this.
  //
  // message  - The message to link to.
  //
  // Returns a string that is a valid, full URL to the given message, or
  // undefined if the adapter does not support generating a link to that message.
  urlForMessage(message) {
    return "";
  }

  // Public: Raw method for building a reply and sending it back to the chat
  // source. Extend this.
  //
  // envelope - A Object with message, room and user details.
  // strings  - One or more Strings for each reply to send.
  //
  // Returns nothing.
  // registerCommand<Parameters extends CommandParameterInfo[]>(name: string, parameters: Parameters, callback: (...args: CommandValues<Parameters>) => void) {
  registerCommand(name, parameters, callback) {}

  // Public: Raw method for sending data back to the chat source. Extend this.
  //
  // envelope - A Object with message, room and user details.
  // strings  - One or more Strings for each message to send.
  //
  // Returns nothing.
  send(envelope, ...strings) {}

  // Public: Raw method for sending emote data back to the chat source.
  // Defaults as an alias for send
  //
  // envelope - A Object with message, room and user details.
  // strings  - One or more Strings for each message to send.
  //
  // Returns nothing.
  emote(envelope, ...strings) {
    return this.send(envelope, ...strings);
  }

  // Public: Raw method for building a reply and sending it back to the chat
  // source. Extend this.
  //
  // envelope - A Object with message, room and user details.
  // strings  - One or more Strings for each reply to send.
  //
  // Returns nothing.
  reply(envelope, ...strings) {}

  // Public: Raw method for setting a topic on the chat source. Extend this.
  //
  // envelope - A Object with message, room and user details.
  // strings  - One more more Strings to set as the topic.
  //
  // Returns nothing.
  topic(envelope, ...strings) {}

  // Public: Raw method for playing a sound in the chat source. Extend this.
  //
  // envelope - A Object with message, room and user details.
  // strings  - One or more strings for each play message to send.
  //
  // Returns nothing
  play(envelope, ...strings) {}

  // Public: Raw method for invoking the bot to run. Extend this.
  //
  // Returns nothing.
  run() {}

  // Public: Raw method for shutting the bot down. Extend this.
  //
  // Returns nothing.
  close() {}
}

function loadBot(adapterPath, adapterName, enableHttpd, botName, botAlias) {
  return new Robot(adapterPath, adapterName, enableHttpd, botName, botAlias);
}

export { Adapter, Brain, CatchAllMessage, DataStore, DataStoreUnavailable, EnterMessage, LeaveMessage, Listener, Message, Response, Robot, TextMessage, TopicMessage, User, loadBot };
//# sourceMappingURL=index.esm.js.map
