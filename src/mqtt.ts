import * as automerge from "automerge";
import { Store } from "./store";
import * as mqtt from "mqtt";
import { externalPromise } from "./promise";
import { tryGet } from "./util";
import { STORE_LOAD_OBJECT, STORE_OBJECT_CHANGED, STORE_OBJECT_LOAD_SUCCESSFUL, STORE_CREATE_OBJECT } from "./constants";

export interface MqttSyncOptions {
    mqtt: {
        url: string;
        options?: mqtt.IClientOptions;
    };
};

export async function createMqttSyncWorker<T>(store: Store<T>, options: MqttSyncOptions) {
    const CLIENT_OBJECT_SYNC_REGEX = new RegExp(/^client\//.source + store.clientId + /\/object\/[\w-]+\/sync/.source);
    const OBJECT_SYNC_REGEX = /^object\/[\w-]+\/sync/;
    const OBJECT_CHANGES_REGEX = /^object\/[\w-]+\/changes/;

    const settled = externalPromise();
    const clientId = store.clientId;

    const client = mqtt.connect(options.mqtt.url, {
        ...options.mqtt.options,
        clientId: clientId,
        clean: true,
    });


    client.on("error", function (err) {
        console.log(err);
        settled.reject(err);
    });

    client.on('connect', function () {
        settled.resolve();
        client.publish("init", "");
    });

    client.on('message', function (topic, message) {
        const str = message.toString();
        console.log(topic, str);
        const data = tryGet(() => JSON.parse(str), {});
        if (data.clientId === clientId) return;

        if (OBJECT_CHANGES_REGEX.test(topic)) {
            const state = tryGet(() => store.getState(data.id));
            if (!state) return;
            store.applyChanges(data.id, data.changes);
            return;
        }

        if (CLIENT_OBJECT_SYNC_REGEX.test(topic)) {
            client.unsubscribe(`client/${clientId}/object/${data.id}/sync`);
            client.subscribe(`object/${data.id}/changes`);
            client.subscribe(`object/${data.id}/sync`);
            tryGet(() => store.events.emit(STORE_OBJECT_LOAD_SUCCESSFUL, {
                id: data.id,
                stateSave: data.stateSave,
                overwrite: false,
            }));
            return;
        }

        if (OBJECT_SYNC_REGEX.test(topic)) {
            const state = tryGet(() => store.getState(data.id));
            if (!state) return;
            const stateSaveData = automerge.save(state);
            client.publish(`client/${data.clientId}/object/${data.id}/sync`, JSON.stringify({
                id: data.id,
                stateSave: stateSaveData,
            }));
        }
    });

    async function processStoreChanges({ id, oldState, newState }) {
        if (!settled.finished) return console.log("Changes: MQTT Client not settled");
        const changes = automerge.getChanges(oldState, newState);
        client.publish(`object/${id}/changes`, JSON.stringify({
            id,
            changes,
        }));
    }

    async function registerObjectCreation({ id, state }) {
        if (!settled.finished) return console.log("Register Object: MQTT Client not settled");
        client.subscribe(`object/${id}/changes`);
        client.subscribe(`object/${id}/sync`);
        client.publish(`object/${id}/created`, JSON.stringify({
            id,
            clientId,
            stateSave: automerge.save(state),
        }));
    }

    async function loadObject({ id, }) {
        if (!settled.finished) return console.log("Load Object: MQTT Client not settled");
        client.subscribe(`client/${clientId}/object/${id}/sync`);
        client.publish(`object/${id}/sync`, JSON.stringify({
            id,
            clientId,
        }));
    }

    store.events.on(STORE_OBJECT_CHANGED, processStoreChanges);
    store.events.on(STORE_CREATE_OBJECT, registerObjectCreation);
    store.events.on(STORE_LOAD_OBJECT, loadObject);

    return {
        settled: settled.promise,
    };
}

