import * as _ from "lodash";
import * as Automerge from "automerge";
import { Store } from "./store";
import * as mqtt from "mqtt";
import { externalPromise } from "./promise";
import { tryGet } from "./util";
import * as events from "events";
import * as constants from "./constants";

export interface StoreSyncManager {
    clientId: string;
    eventBus: events.EventEmitter;
};

export function createStoreSyncManager<T>(store: Store<T>): StoreSyncManager {
    const eventBus = new events.EventEmitter();
    const autoConnection = new Automerge.Connection(store.docSet, connection_sendMessage);
    autoConnection.open();
    const triggeredInit = new Map<string, boolean>();

    function connection_sendMessage(msg) {
        if (!msg.changes) {
            eventBus.emit("OBJECT_MESSAGE", {
                id: msg.docId,
                clientId: store.clientId,
                data: {
                    ...msg,
                    changes: msg.changes,
                },
            });
        }

        const msgChunks = _.chunk(msg.changes, 3);

        msgChunks.forEach((chunk) => {
            eventBus.emit("OBJECT_MESSAGE", {
                id: msg.docId,
                clientId: store.clientId,
                data: {
                    ...msg,
                    changes: chunk,
                },
            });
        });
    }

    function syncer_objectMessage(msg) {
        autoConnection.receiveMsg(msg.data);
        const state = store.docSet.getDoc(msg.id);

        if (state && Object.keys(state).length && !triggeredInit.get(msg.id)) {
            triggeredInit.set(msg.id, true);
            store.events.emit(constants.STORE_OBJECT_LOAD_SUCCESSFUL, {
                id: msg.id,
            });
        }
    }

    function syncer_objectLoad(msg) {
        const obj = store.docSet.getDoc(msg.id);

        return connection_sendMessage({
            docId: msg.id,
            clock: (autoConnection as any)._ourClock.toJS(),
            changes: Automerge.getAllChanges(obj),
        });
    }

    function store_loadObject(data) {
        eventBus.emit("OBJECT_LOAD", data);
    }

    eventBus.on("SYNCER_OBJECT_MESSAGE", syncer_objectMessage);
    eventBus.on("SYNCER_OBJECT_LOAD", syncer_objectLoad);

    store.events.on(constants.STORE_LOAD_OBJECT, store_loadObject)

    return {
        clientId: store.clientId,
        eventBus,
    };
}

