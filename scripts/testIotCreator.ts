import * as store from "../src/store";
import { createStoreSyncManager } from "../src/storeSync";
import { createMqttSyncWorker } from "../src/mqttSync";
import * as automerge from "automerge";
import * as fs from "fs/promises";

const sleep = (timeout, returnValue?) => new Promise((resolve) => setTimeout(() => resolve(returnValue), timeout));

export interface State {
    counter: automerge.Counter;
}

export function createStore(existingState?) {
    return store.createStore({
        mutations: {
            increment: (state: State) => {
                state.counter.increment(1);
            },
            decrement: (state: State) => {
                state.counter.decrement(1);
            }
        },
    });
}

async function main() {
    const ca = (await fs.readFile("./certs/ca.pem", "utf-8"));
    const cert = (await fs.readFile("./certs/cert.crt", "utf-8"));
    const key = (await fs.readFile("./certs/private.key", "utf-8"));

    const store = createStore();
    const storeSyncManager = createStoreSyncManager(store);

    const worker = await createMqttSyncWorker(storeSyncManager, {
        allowLoadingOverMqtt: true,
        mqtt: {
            url: "mqtt://a1tgmnye9kxelo-ats.iot.us-west-2.amazonaws.com",
            options: {
                ca,
                cert,
                key,
            },
        }
    });
    await worker.settled;
    await store.createObject("1", { counter: new automerge.Counter(0) });
    store.commit("1", "increment");
    while (true) {
        await sleep(5000);
        console.log(store.getState("1"));
    }
}

main().then(x => console.info(x)).catch((err) => console.error(err));
