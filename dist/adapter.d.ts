export default Adapter;
declare class Adapter extends Emittery<Record<PropertyKey, any>, Record<PropertyKey, any> & import("emittery").OmnipresentEventData, import("emittery").DatalessEventNames<Record<PropertyKey, any>>> {
    constructor(robot: any);
    robot: any;
    urlForMessage(message: any): string;
    registerCommand(name: any, parameters: any, callback: any): void;
    send(envelope: any, ...strings: any[]): void;
    emote(envelope: any, ...strings: any[]): void;
    reply(envelope: any, ...strings: any[]): void;
    topic(envelope: any, ...strings: any[]): void;
    play(envelope: any, ...strings: any[]): void;
    run(): void;
    close(): void;
}
import Emittery from "emittery";
