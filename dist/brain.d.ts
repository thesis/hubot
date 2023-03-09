export default Brain;
declare class Brain extends Emittery<Record<PropertyKey, any>, Record<PropertyKey, any> & import("emittery").OmnipresentEventData, import("emittery").DatalessEventNames<Record<PropertyKey, any>>> {
    constructor(robot: any);
    data: {
        users: {};
        _private: {};
    };
    getRobot: () => any;
    autoSave: boolean;
    set(key: any, value: any): Brain;
    get(key: any): any;
    remove(key: any): Brain;
    save(): void;
    close(): void;
    setAutoSave(enabled: any): void;
    resetSaveInterval(seconds: any): void;
    saveInterval: NodeJS.Timer | undefined;
    mergeData(data: any): void;
    users(): {};
    userForId(id: any, options: any): any;
    userForName(name: any): any;
    usersForRawFuzzyName(fuzzyName: any): never[];
    usersForFuzzyName(fuzzyName: any): any[];
}
import Emittery from "emittery";
