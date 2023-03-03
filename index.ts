import User from "./src/user"
import Brain from "./src/brain"
import Robot from "./src/robot"
import Adapter from "./src/adapter"
import Response from "./src/response"
import { Listener } from "./src/listener"
import {
  Message,
  TextMessage,
  EnterMessage,
  LeaveMessage,
  TopicMessage,
  CatchAllMessage,
} from "./src/message"
import { DataStore, DataStoreUnavailable } from "./src/datastore"

function loadBot(
  adapterPath: string | undefined,
  adapterName: string,
  enableHttpd: boolean,
  botName: string,
  botAlias: string | undefined
) {
  return new Robot(adapterPath, adapterName, enableHttpd, botName, botAlias)
}

export default {
  User,
  Brain,
  Robot,
  Adapter,
  Response,

  Listener,

  Message,
  TextMessage,
  EnterMessage,
  LeaveMessage,
  TopicMessage,
  CatchAllMessage,
  DataStore,
  DataStoreUnavailable,

  loadBot,
}
