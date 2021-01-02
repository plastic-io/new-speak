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

export type StoreState<T> = Automerge.FreezeObject<T & {
    __id__: string;
    __v__: Automerge.Counter;
}>;

export interface Store<T> {
    clientId: string;
    events: events.EventEmitter;
    docSet: Automerge.DocSet<T>;
    createObject: (id: string, initialState?: T) => void;
    loadObject: (id: string, timeout?: number) => Promise<StoreState<T>>;
    commit: (id: string, event: string, payload?: Record<string, any>) => void;
    applyChanges: (id: string, changes: any) => void;
    getState: (id: string) => StoreState<T>;
};

export function createStore<T>(options: StoreOptions<T>): Store<T> {
    options.clientId = options.clientId ?? uuid();
    const eventBus = new events.EventEmitter();
    const docSet = new Automerge.DocSet<T>();
    const pendingPromises = new Map<string, ReturnType<typeof externalPromise>>();


    eventBus.on(STORE_OBJECT_LOAD_SUCCESSFUL, function ({ id }) {
        const state = docSet.getDoc(id);

        if (!state) throw new Error(`Object Loading: Docset not updated for object id: ${id}`);

        const pendingPromise = pendingPromises.get(`${STORE_LOAD_OBJECT}_${id}`);
        pendingPromise?.resolve(state);
    });

    // eventBus.on(STORE_OBJECT_LOAD_FAILED, function ({ id, err }) {
    //     cons
    // });

    function getState(id: string) {
        const state = docSet.getDoc(id);
        if (!state) throw new Error(`Object ${id} has not yet resolved`);
        return state as StoreState<T>;
    }

    function createObject(id, initialState?: T) {
        const baseState = { __id__: id, __v__: new Automerge.Counter(), };
        const state = Automerge.from({
            ...(initialState ?? {} as T),
            ...baseState,
        }, options.clientId);
        docSet.setDoc(id, state);
        eventBus.emit(STORE_CREATE_OBJECT, {
            id,
            state,
        });

        return state;
    }

    async function loadObject(id, timeout: number = 2000): Promise<any> {
        const loadPromise = externalPromise();
        eventBus.emit(STORE_LOAD_OBJECT, {
            id,
        });
        pendingPromises.set(`${STORE_LOAD_OBJECT}_${id}`, loadPromise);

        return await Promise.race([
            (async () => {
                await loadPromise.promise;
                return getState(id);
            })(),
            (async () => {
                await sleep(timeout);
                throw new Error(`Unable to load object with id: ${id} within ${timeout} milliseconds.`);
            })(),
        ]);
    }

    function commit(id: string, event: string, payload?: Record<string, any>) {
        const oldState = getState(id);
        const mutation = options?.mutations?.[event];
        if (!mutation) return;

        const newState = Automerge.change(oldState, event, (doc) => {
            mutation(doc as T, payload);
            (doc as any).__v__.increment();
        });

        docSet.setDoc(id, newState as StoreState<T>);
        eventBus.emit(STORE_OBJECT_CHANGED, {
            id,
            oldState,
            newState,
        });
    }

    function applyChanges(id, changes) {
        const oldState = getState(id);
        const newState = Automerge.applyChanges(oldState, changes);
        docSet.setDoc(id, newState);
    }

    return {
        clientId: options.clientId,
        events: eventBus,
        docSet,
        createObject,
        loadObject,
        commit,
        applyChanges,
        getState,
    };
}
