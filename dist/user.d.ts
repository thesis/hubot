export default User;
declare class User {
    constructor(id: any, options: any);
    id: any;
    _getRobot: () => any;
    name: any;
    set(key: any, value: any): any;
    get(key: any): any;
    _constructKey(key: any): string;
    _checkDatastoreAvailable(): void;
    _getDatastore(): any;
}
