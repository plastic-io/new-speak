export const sleep = (timeout, returnValue?) => new Promise((resolve) => setTimeout(() => resolve(returnValue), timeout));
export function getRandomFloat(max) {
    return Math.random() * max;
}
export function tryGet(func, defaultValue?) {
    try {
        return func();
    } catch (ex) {
        return defaultValue;
    }
};
