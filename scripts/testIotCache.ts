import * as store from "../src/store";
import { createMqttCacheWorker } from "../src/mqttCache";
import * as automerge from "automerge";
import { sleep } from "../src/util";

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
    const store = createStore();
    const worker = await createMqttCacheWorker(store, {});
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
