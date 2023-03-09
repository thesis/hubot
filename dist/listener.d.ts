export class Listener {
    constructor(robot: any, matcher: any, options: any, callback: any);
    robot: any;
    matcher: any;
    options: any;
    callback: any;
    call(message: any, middleware: any, didMatchCallback: any): boolean;
}
export class TextListener extends Listener {
    regex: any;
}
