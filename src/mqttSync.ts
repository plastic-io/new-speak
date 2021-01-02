import * as automerge from "automerge";
import { Store } from "./store";
import * as mqtt from "mqtt";
import { externalPromise } from "./promise";
import { tryGet } from "./util";
import { STORE_LOAD_OBJECT, STORE_OBJECT_CHANGED, STORE_OBJECT_LOAD_SUCCESSFUL, STORE_CREATE_OBJECT } from "./constants";
import * as events from "events";
import { v4 as uuid } from "uuid";
import { StoreSyncManager } from "./storeSync";

export interface MqttSyncOptions {
    allowLoadingOverMqtt?: boolean;
    mqtt: {
        url: string;
        options?: mqtt.IClientOptions;
    };
};

export async function createMqttSyncWorker<T>(storeSync: StoreSyncManager, options: MqttSyncOptions) {
    const clientId = storeSync.clientId;
    // const CLIENT_OBJECT_SYNC_REGEX = new RegExp(/^client\//.source + store.clientId + /\/object\/[\w-]+\/sync/.source);
    const OBJECT_MSG_REGEX = /^object\/[\w-]+\/message/;
    const OBJECT_LOAD_REGEX = /^object\/[\w-]+\/load/;

    const settled = externalPromise();

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
    });

    client.on('message', function (topic, message) {
        const str = message.toString();
        // console.log(topic, str);
        const data = tryGet(() => JSON.parse(str), {});
        if (data.clientId === clientId) return;

        if (OBJECT_MSG_REGEX.test(topic)) {
            storeSync.eventBus.emit("SYNCER_OBJECT_MESSAGE", data);
            return;
        }

        if (OBJECT_LOAD_REGEX.test(topic) && options.allowLoadingOverMqtt) {
            storeSync.eventBus.emit("SYNCER_OBJECT_LOAD", data);
            return;
        }
    });


    storeSync.eventBus.on("OBJECT_MESSAGE", function (event) {
        client.subscribe(`object/${event.id}/message`);
        options.allowLoadingOverMqtt && client.subscribe(`object/${event.id}/load`);
        client.publish(`object/${event.id}/message`, JSON.stringify({
            clientId: event.clientId,
            id: event.id,
            data: event.data,
        }));
    });

    storeSync.eventBus.on("OBJECT_LOAD", function (event) {
        client.subscribe(`object/${event.id}/message`);
        options.allowLoadingOverMqtt && client.subscribe(`object/${event.id}/load`);
        client.publish(`object/${event.id}/load`, JSON.stringify({
            clientId: event.clientId,
            id: event.id,
        }));
    });

    return {
        settled: settled.promise,
    };
}

