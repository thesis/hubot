export class Message {
    constructor(user: any, done: any);
    user: any;
    done: any;
    room: any;
    finish(): void;
}
export class TextMessage extends Message {
    constructor(user: any, text: any, id: any);
    text: any;
    id: any;
    match(regex: any): any;
    toString(): any;
}
export class EnterMessage extends Message {
}
export class LeaveMessage extends Message {
}
export class TopicMessage extends TextMessage {
}
export class CatchAllMessage extends Message {
    constructor(message: any);
    message: any;
}
