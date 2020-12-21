import * as store from "../src/store";
import { createMqttSyncWorker } from "../src/mqtt";
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
    const worker = await createMqttSyncWorker(store, {});
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
