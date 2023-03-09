export = InMemoryDataStore;
declare class InMemoryDataStore extends DataStore {
    data: {
        global: {};
        users: {};
    };
    _get(key: any, table: any): Promise<any>;
    _set(key: any, value: any, table: any): Promise<any>;
}
import { DataStore } from "../datastore";
