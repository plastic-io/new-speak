import * as Automerge from "automerge";
import * as events from "events";
import { v4 as uuid } from "uuid";
import { externalPromise, externalPromiseResolved } from "./promise";
import { sleep } from "./util";
import { STORE_LOAD_OBJECT, STORE_OBJECT_CHANGED, STORE_OBJECT_LOAD_FAILED, STORE_OBJECT_LOAD_SUCCESSFUL, STORE_CREATE_OBJECT } from "./constants";

export interface StoreOptions<T = Record<string, any>> {
    clientId?: string;
    mutations?: Record<string, (state: T, payload?: any) => void>;
}

export interface Store<T> {
    clientId: string;
    events: events.EventEmitter;
    createObject: (id: string, initialState?: T) => void;
    loadObject: (id: string, timeout?: number) => Promise<T>;
    commit: (id: string, event: string, payload?: Record<string, any>) => void;
    applyChanges: (id: string, changes: any) => void;
    getState: (id: string) => Automerge.FreezeObject<T & {
        __v__: Automerge.Counter;
    }>;
};

export function createStore<T>(options: StoreOptions<T>): Store<T> {
    options.clientId = options.clientId ?? uuid();
    const eventBus = new events.EventEmitter();
    const objects = new Map<string, Record<string, any>>();

    eventBus.on(STORE_OBJECT_LOAD_SUCCESSFUL, function ({ id, stateSave, overwrite }) {
        const storeObj = objects.get(id);
        const loadedObject = Automerge.load(stateSave, options.clientId);

        if (!storeObj) {
            objects.set(id, {
                state: externalPromiseResolved(loadedObject),
            });
            return;
        }

        if (!storeObj.state.finished) return storeObj.state.resolve(loadedObject);

        if (!overwrite) throw new Error(`Object ${id} has already been resolved`);

        objects.set(id, {
            state: externalPromiseResolved(loadedObject),
        });
    });

    eventBus.on(STORE_OBJECT_LOAD_FAILED, function ({ id, err }) {
        const storeObj = objects.get(id);
        if (!storeObj) throw new Error(`Object ${id} was not requested to be loaded`);
        if (storeObj.state.finished) throw new Error(`Object ${id} has already been resolved`);

        storeObj.state.reject(err);
    });

    function getState(id: string) {
        const storeObj = objects.get(id);
        if (!storeObj || !storeObj.state.finished) throw new Error(`Object ${id} has not yet resolved`);
        let state = storeObj.state.value;
        return state;
    }

    function createObject(id, initialState?: T) {
        const baseState = { __id__: id, __v__: new Automerge.Counter(), };
        const state = Automerge.from({
            ...(initialState ?? {} as T),
            ...baseState,
        }, options.clientId);
        objects.set(id, {
            state: externalPromiseResolved(state),
        });
        eventBus.emit(STORE_CREATE_OBJECT, {
            id,
            state,
        });

        return state;
    }

    async function loadObject(id, timeout: number = 2000): Promise<any> {
        const loadPromise = externalPromise();
        objects.set(id, {
            state: loadPromise,
        });
        eventBus.emit(STORE_LOAD_OBJECT, {
            id,
        });

        return await Promise.race([
            (async () => {
                await loadPromise.promise;
                return loadPromise.value;
            })(),
            (async () => {
                await sleep(timeout);
                throw new Error(`Unable to load object with id: ${id} within ${timeout} milliseconds.`);
            })(),
        ]);
    }

    function commit(id: string, event: string, payload?: Record<string, any>) {
        const storeObj = objects.get(id);
        if (!storeObj || !storeObj.state.finished) throw new Error(`Object ${id} has not yet resolved`);
        let state = storeObj.state.value;
        const mutation = options?.mutations?.[event];
        if (!mutation) return;

        let oldState = state;
        state = Automerge.change(oldState, event, (doc) => {
            mutation(doc as T, payload);
            (doc as any).__v__.increment();
        });

        storeObj.state.value = state;
        eventBus.emit(STORE_OBJECT_CHANGED, {
            id,
            oldState,
            newState: state,
        });
    }

    function applyChanges(id, changes) {
        const storeObj = objects.get(id);
        if (!storeObj || !storeObj.state.finished) throw new Error(`Object ${id} has not yet resolved`);
        let state = storeObj.state.value;
        let oldState = state;
        storeObj.state.value = Automerge.applyChanges(oldState, changes);
    }

    return {
        clientId: options.clientId,
        events: eventBus,
        createObject,
        loadObject,
        commit,
        applyChanges,
        getState,
    };
}
