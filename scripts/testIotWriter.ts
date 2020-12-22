import * as store from "../src/store";
import { createMqttSyncWorker } from "../src/mqtt";
import * as automerge from "automerge";
import { sleep } from "../src/util";
import * as fs from "fs/promises";

export interface State {
    counter: automerge.Counter;
}

export function createStore() {
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
    const worker = await createMqttSyncWorker(store, {
        mqtt: {
            url: "mqtt://a1tgmnye9kxelo-ats.iot.us-west-2.amazonaws.com",
            options: {
                ca,
                cert,
                key,
            },
        }
    });
    // const s3Worker = await createS3PersistanceWorker(store, {});

    await worker.settled;
    const loadedState = await store.loadObject("1", 5000);
    console.log(loadedState);
    store.commit("1", "increment");
    while (true) {
        await sleep(5000);
        store.commit("1", "increment");
        console.log(store.getState("1"));
    }
}

main().then(x => console.info(x)).catch((err) => console.error(err));
