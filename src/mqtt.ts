import * as automerge from "automerge";
import { Store } from "./store";
import * as mqtt from "mqtt";
import * as fs from "fs/promises";
import { externalPromise } from "./promise";
import { tryGet } from "./util";

export interface MqttSyncOptions { };

export async function createMqttSyncWorker<T>(store: Store<T>, options: MqttSyncOptions) {
    const CLIENT_OBJECT_SYNC_REGEX = new RegExp(/^client\//.source + store.clientId + /\/object\/[\w-]+\/sync/.source);
    const OBJECT_SYNC_REGEX = /^object\/[\w-]+\/sync/;
    const OBJECT_CHANGES_REGEX = /^object\/[\w-]+\/changes/;

    const settled = externalPromise();
    const clientId = store.clientId;
    const ca = (await fs.readFile("./certs/ca.pem", "utf-8"));
    const cert = (await fs.readFile("./certs/cert.crt", "utf-8"));
    const key = (await fs.readFile("./certs/private.key", "utf-8"));

    const client = mqtt.connect("mqtt://a1tgmnye9kxelo-ats.iot.us-west-2.amazonaws.com", {
        ca: ca,
        cert: cert,
        key: key,
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
            tryGet(() => store.events.emit("objectLoaded", {
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

    store.events.on("changes", processStoreChanges);
    store.events.on("createObject", registerObjectCreation);
    store.events.on("loadObject", loadObject);

    return {
        settled: settled.promise,
    };
}

