import * as Automerge from "automerge";
import {createStore} from "./store";

const store = createStore({
    initialState: {
        count: 0,
    },
    mutations: {
        increment: (state) => {
            state.count++;
        },
    },
});

store.commit("increment");

console.log(store.state);

console.log(Automerge.getHistory(store.state));
