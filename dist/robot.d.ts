/// <reference types="node" />
/// <reference types="node" />
import * as http from "http";
import { Application } from "express";
import Emittery from "emittery";
import Log from "log";
import * as HttpClient from "scoped-http-client";
import Adapter from "./adapter";
import Brain from "./brain";
import Response from "./response";
import { Listener } from "./listener";
import * as Message from "./message";
import Middleware from "./middleware";
import { DataStore } from "./datastore";
/**
 * Information on a first-class command's parameters. These are commands that
 * may have first-class support in an adapter, such as slash commands in
 * Discord.
 */
type CommandParameterInfo = {
    name: string;
    description?: string;
};
/**
 * Extracts the value types from a (const) list of CommandParameterInfo. If no
 * per-command type specialization exists, returns a const list of strings of
 * the same length as the passed const list of parameters. Useful for enforcing
 * e.g. that listeners take the right number of parameters.
 */
type CommandValues<T extends readonly CommandParameterInfo[]> = {
    [P in keyof T]: P extends keyof [] ? T[P] : string;
};
declare class Robot<A extends Adapter> {
    #private;
    adapterPath: string | undefined;
    adapterName: string;
    httpd: boolean;
    name: string;
    alias: string | undefined;
    version: string;
    events: Emittery<Record<PropertyKey, any>, Record<PropertyKey, any> & import("emittery").OmnipresentEventData, import("emittery").DatalessEventNames<Record<PropertyKey, any>>>;
    on: <Name extends string | number | symbol>(eventName: Name | readonly Name[], listener: (eventData: (Record<PropertyKey, any> & import("emittery").OmnipresentEventData)[Name]) => void | Promise<void>) => import("emittery").UnsubscribeFunction;
    emit: {
        <Name extends import("emittery").DatalessEventNames<Record<PropertyKey, any>>>(eventName: Name): Promise<void>;
        <Name_1 extends PropertyKey>(eventName: Name_1, eventData: Record<PropertyKey, any>[Name_1]): Promise<void>;
    };
    brain: Brain;
    adapter: A | undefined;
    datastore: DataStore | undefined;
    Response: typeof Response;
    commands: string[];
    listeners: Listener[];
    server: http.Server | undefined;
    router: Application | undefined;
    middleware: {
        listener: Middleware;
        response: Middleware;
        receive: Middleware;
    };
    logger: Log;
    pingIntervalId: NodeJS.Timer | undefined;
    globalHttpOptions: Partial<HttpClient.Options>;
    errorHandlers: ((error: Error, res?: Response) => void)[];
    constructor(adapterPath: string | undefined, adapterName: string, httpd: boolean, name?: string, alias?: string | undefined);
    urlForMessage(message: Message.Message): string | undefined;
    listen(matcher: any, options: any, callback: any): void;
    hear(regex: any, options: any, callback: any): void;
    respond(regex: any, options: any, callback: any): void;
    /**
     * Add a command native to the adapter with a given name and the provided
     * command parameter info, which includes a name and description for the
     * parameter.
     *
     * This allows hooking into first-class command support on platforms like
     * Discord, while allowing Hubot to fall back to a standard `respond` when
     * needed.
     */
    command<Parameters extends CommandParameterInfo[]>(name: string, parameters: Parameters, callback: (...args: CommandValues<Parameters>) => void): void;
    respondPattern(regex: any): RegExp;
    enter(options: any, callback: any): void;
    leave(options: any, callback: any): void;
    topic(options: any, callback: any): void;
    error(callback: any): void;
    invokeErrorHandlers(error: Error, res?: Response): void;
    catchAll(options: any, callback: any): void;
    listenerMiddleware(middleware: any): void;
    responseMiddleware(middleware: any): void;
    receiveMiddleware(middleware: any): void;
    receive(message: any, cb: any): void;
    processListeners(context: any, done: any): void;
    loadFile(filepath: any, filename: any): Promise<void>;
    load(path: any): void;
    loadHubotScripts(path: any, scripts: any): void;
    loadExternalScripts(packages: string[] | {
        [pkg: string]: object;
    }): Promise<void>;
    setupExpress(): Promise<void>;
    loadAdapter(adapter: string): Promise<void>;
    helpCommands(): string[];
    parseHelp(path: string): Promise<void>;
    send(envelope: any, ...strings: string[]): void;
    reply(envelope: any, ...strings: string[]): void;
    messageRoom(room: string, ...strings: string[]): void;
    once(event: string, callback: () => void): void;
    run(): void;
    shutdown(): void;
    parseVersion(): Promise<string>;
    http(url: any, options: any): any;
}
export default Robot;
