import * as store from "../src/store";
import { createMqttSyncWorker } from "../src/mqtt";
import * as automerge from "automerge";

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
    const store = createStore();
    const worker = await createMqttSyncWorker(store, {});
    await worker.settled;
    await store.createObject("1", { counter: new automerge.Counter(0) });
    store.commit("1", "increment");
    while (true) {
        await sleep(5000);
        console.log(store.getState("1"));
    }
}

main().then(x => console.info(x)).catch((err) => console.error(err));
