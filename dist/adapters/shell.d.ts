export function use(robot: any): Shell;
declare class Shell {
    send(envelope: any, ...args: any[]): void;
    emote(envelope: any, ...args: any[]): void;
    reply(envelope: any, ...args: any[]): void;
    run(): void;
    shutdown(): never;
    buildCli(): void;
    cli: any;
}
export {};
