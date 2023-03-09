export class DataStore {
    constructor(robot: any);
    robot: any;
    set(key: any, value: any): Promise<never>;
    setObject(key: any, objectKey: any, value: any): Promise<never>;
    setArray(key: any, value: any): Promise<never>;
    get(key: any): Promise<never>;
    getObject(key: any, objectKey: any): Promise<never>;
    _set(key: any, value: any, table: any): Promise<never>;
    _get(key: any, table: any): Promise<never>;
}
export class DataStoreUnavailable extends Error {
}
