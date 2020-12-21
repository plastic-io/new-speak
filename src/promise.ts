export function externalPromise() {
    let _finished = false;
    let _res = false;
    let resolve;
    let reject;

    const promise = new Promise((_resolve, _reject) => {
        resolve = (val) => {
            _res = val;
            _resolve(val);
        };
        reject = (err) => {
            _res = err;
            _reject(err);
        };
    }).then(() => {
        _finished = true;
    });

    return {
        promise,
        resolve,
        reject,
        get finished() {
            return _finished;
        },
        get value() {
            if (!_finished) throw new Error(`Promise has not yet resolved`);
            return _res;
        },
        set value(val) {
            _res = val;
        }
    };
}

export function externalPromiseResolved(value) {
    return {
        promise: Promise.resolve(value),
        value,
        finished: true,
    };
}




