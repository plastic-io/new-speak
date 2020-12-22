import * as store from "../src/store";
import { createMqttCacheWorker } from "../src/mqttCache";
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
    const worker = await createMqttCacheWorker(store, {
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
    while (true) {
        await sleep(5000);
        try {
            console.log(store.getState("1"));
        } catch (ex) {
            console.log("NONE");
        }
    }
}

main().then(x => console.info(x)).catch((err) => console.error(err));
