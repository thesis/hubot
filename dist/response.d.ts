export default Response;
declare class Response {
    constructor(robot: any, message: any, match: any);
    robot: any;
    message: any;
    match: any;
    envelope: {
        room: any;
        user: any;
        message: any;
    };
    send(...args: any[]): void;
    emote(...args: any[]): void;
    reply(...args: any[]): void;
    topic(...args: any[]): void;
    play(...args: any[]): void;
    locked(...args: any[]): void;
    runWithMiddleware(methodName: any, opts: any, ...args: any[]): any;
    random(items: any): any;
    finish(): void;
    http(url: any, options: any): any;
}
