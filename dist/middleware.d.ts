export default Middleware;
declare class Middleware {
    constructor(robot: any);
    robot: any;
    stack: any[];
    execute(context: any, next: any, done: any): void;
    register(middleware: any): void;
}
