// Mock react-native-worklets for Jest (no native module in test environment)
// Provides stubs for all functions/values imported by react-native-reanimated.
const noop = () => {};

module.exports = {
  __version: '0.6.1',
  createSerializable: (value: unknown) => ({ value }),
  executeOnUIRuntimeSync: noop,
  callMicrotasks: noop,
  isWorkletFunction: () => false,
  makeShareable: (value: unknown) => value,
  runOnJS: (fn: Function) => fn,
  runOnUI: (fn: Function) => fn,
  RuntimeKind: { UI: 'UI', JS: 'JS' },
  WorkletsModule: {},
};
