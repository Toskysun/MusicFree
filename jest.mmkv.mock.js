const stores = new Map();

function createStore() {
    const data = new Map();
    return {
        set(key, value) {
            data.set(key, value);
        },
        getString(key) {
            const value = data.get(key);
            return typeof value === "string" ? value : undefined;
        },
        getNumber(key) {
            const value = data.get(key);
            return typeof value === "number" ? value : undefined;
        },
        getBoolean(key) {
            const value = data.get(key);
            return typeof value === "boolean" ? value : undefined;
        },
        getBuffer(key) {
            const value = data.get(key);
            return value instanceof ArrayBuffer ? value : undefined;
        },
        contains(key) {
            return data.has(key);
        },
        remove(key) {
            return data.delete(key);
        },
        getAllKeys() {
            return Array.from(data.keys());
        },
        clearAll() {
            data.clear();
        },
    };
}

function createMMKV(configuration = {}) {
    const id = configuration.id || "default";
    if (!stores.has(id)) {
        stores.set(id, createStore());
    }
    return stores.get(id);
}

module.exports = {
    createMMKV,
    useMMKVObject: () => [undefined, () => undefined],
    useMMKV: () => createMMKV(),
    useMMKVString: () => [undefined, () => undefined],
    useMMKVNumber: () => [undefined, () => undefined],
    useMMKVBoolean: () => [undefined, () => undefined],
};
