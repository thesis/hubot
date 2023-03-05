import Emittery from "emittery"

class Adapter extends Emittery {
  // An adapter is a specific interface to a chat source for robots.
  //
  // robot - A Robot instance.
  constructor(robot) {
    super()
    this.robot = robot
  }

  // Public: Method for fetching a URL to a given message. Extend this.
  //
  // message  - The message to link to.
  //
  // Returns a string that is a valid, full URL to the given message, or
  // undefined if the adapter does not support generating a link to that message.
  urlForMessage(message) {
    return ""
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
    return this.send(envelope, ...strings)
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

export default Adapter
