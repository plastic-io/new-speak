import * as automerge from "automerge";
import { Store } from "./store";
import * as mqtt from "mqtt";
import * as fs from "fs/promises";
import { externalPromise } from "./promise";
import { getRandomFloat, tryGet } from "./util";

export interface MqttSyncOptions { };

export async function createMqttCacheWorker<T>(store: Store<T>, options: MqttSyncOptions) {
    let cachePercentage = 100;
    const CLIENT_OBJECT_SYNC_REGEX = new RegExp(/^client\//.source + store.clientId + /\/object\/[\w-]+\/sync/.source);
    const OBJECT_SYNC_REGEX = /^object\/[\w-]+\/sync/;
    const OBJECT_CHANGES_REGEX = /^object\/[\w-]+\/changes/;
    const OBJECT_CREATED_REGEX = /^object\/[\w-]+\/created/;

    const settled = externalPromise();
    const clientId = store.clientId;
    const ca = (await fs.readFile("./certs/ca.pem", "utf-8"));
    const cert = (await fs.readFile("./certs/cert.crt", "utf-8"));
    const key = (await fs.readFile("./certs/private.key", "utf-8"));

    const client = mqtt.connect("IOT_SERVER_NAME", {
        ca: ca,
        cert: cert,
        key: key,
        clientId: clientId,
        clean: true,
    });

    client.on("error", function (err) {
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

        if (OBJECT_CREATED_REGEX.test(topic)) {
            const savePercentage = getRandomFloat(100);
            if (savePercentage > cachePercentage || cachePercentage === 0) return;

            store.events.emit("objectLoaded", {
                id: data.id,
                stateSave: data.stateSave,
            });
        }

        if (OBJECT_CHANGES_REGEX.test(topic)) {
            const state = tryGet(() => store.getState(data.id));
            if (!state) {
                client.subscribe(`client/${clientId}/object/${data.id}/sync`);
                client.publish(`object/${data.id}/sync`, JSON.stringify({
                    id: data.id,
                    clientId,
                }));
                return;
            }
            store.applyChanges(data.id, data.changes);
            return;
        }

        if (CLIENT_OBJECT_SYNC_REGEX.test(topic)) {
            client.unsubscribe(`client/${clientId}/object/${data.id}/sync`);
            tryGet(() => store.events.emit("objectLoaded", {
                id: data.id,
                stateSave: data.stateSave,
                overwrite: true,
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

    client.subscribe("object/+/created");
    client.subscribe(`object/+/changes`);
    client.subscribe(`object/+/sync`);

    return {
        settled: settled.promise,
    };
}

