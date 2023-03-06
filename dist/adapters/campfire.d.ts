/// <reference types="node" />
export function use(robot: any): Campfire;
declare class Campfire {
    send(envelope: any, ...args: any[]): void;
    emote(envelope: any, ...args: any[]): void;
    reply(envelope: any, ...args: any[]): void;
    topic(envelope: any, ...args: any[]): void;
    play(envelope: any, ...args: any[]): void;
    locked(envelope: any, ...args: any[]): void;
    run(): void;
    bot: CampfireStreaming | undefined;
}
declare class CampfireStreaming {
    constructor(options: any, robot: any);
    robot: any;
    token: any;
    rooms: any;
    account: any;
    host: string;
    authorization: string;
    private: {};
    Rooms(callback: any): import("http").ClientRequest;
    User(id: any, callback: any): import("http").ClientRequest;
    Me(callback: any): import("http").ClientRequest;
    Room(id: any): {
        show(callback: any): import("http").ClientRequest;
        join(callback: any): import("http").ClientRequest;
        leave(callback: any): import("http").ClientRequest;
        lock(callback: any): import("http").ClientRequest;
        unlock(callback: any): import("http").ClientRequest;
        paste(text: any, callback: any): import("http").ClientRequest;
        topic(text: any, callback: any): import("http").ClientRequest;
        sound(text: any, callback: any): import("http").ClientRequest;
        speak(text: any, callback: any): import("http").ClientRequest;
        message(text: any, type: any, callback: any): import("http").ClientRequest;
        listen(): import("http").ClientRequest;
    };
    get(path: any, callback: any): import("http").ClientRequest;
    post(path: any, body: any, callback: any): import("http").ClientRequest;
    put(path: any, body: any, callback: any): import("http").ClientRequest;
    request(method: any, path: any, body: any, callback: any): import("http").ClientRequest;
}
export {};
