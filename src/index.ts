import User from "./user"
import Brain from "./brain"
import Robot from "./robot"
import Adapter from "./adapter"
import Response from "./response"
import { Listener } from "./listener"
import {
  Message,
  TextMessage,
  EnterMessage,
  LeaveMessage,
  TopicMessage,
  CatchAllMessage,
} from "./message"
import { DataStore, DataStoreUnavailable } from "./datastore"

function loadBot(
  adapterPath: string | undefined,
  adapterName: string,
  enableHttpd: boolean,
  botName: string,
  botAlias: string | undefined
) {
  return new Robot(adapterPath, adapterName, enableHttpd, botName, botAlias)
}

export {
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
