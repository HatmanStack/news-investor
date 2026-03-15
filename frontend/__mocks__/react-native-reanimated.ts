// Minimal mock for react-native-reanimated v4 in Jest
// The official mock (react-native-reanimated/mock) has circular dependency issues
// with react-native-worklets, so we provide our own stubs.
const { View, Text, Image, FlatList, ScrollView } = require('react-native');

const noop = () => {};
const identity = (v: unknown) => v;
const useHook = (v: unknown) => [v, noop];

module.exports = {
  __esModule: true,
  default: {
    createAnimatedComponent: (Component: any) => Component,
    View,
    Text,
    Image,
    FlatList,
    ScrollView,
  },
  createAnimatedComponent: (Component: any) => Component,
  useSharedValue: (initial: unknown) => ({ value: initial }),
  useAnimatedStyle: () => ({}),
  useAnimatedProps: () => [{}, noop, noop],
  useDerivedValue: (fn: Function) => ({ value: fn() }),
  useAnimatedGestureHandler: () => ({}),
  useAnimatedScrollHandler: () => noop,
  useAnimatedReaction: noop,
  withTiming: identity,
  withSpring: identity,
  withDecay: identity,
  withDelay: (_: number, anim: unknown) => anim,
  withSequence: (...anims: unknown[]) => anims[anims.length - 1],
  withRepeat: identity,
  cancelAnimation: noop,
  Easing: {
    linear: identity,
    ease: identity,
    bezier: () => identity,
    in: identity,
    out: identity,
    inOut: identity,
  },
  interpolate: noop,
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  runOnJS: (fn: Function) => fn,
  runOnUI: (fn: Function) => fn,
  FadeIn: { duration: () => ({ delay: () => ({}) }) },
  FadeOut: { duration: () => ({ delay: () => ({}) }) },
  SlideInRight: { duration: () => ({}) },
  SlideOutLeft: { duration: () => ({}) },
  Layout: { duration: () => ({}) },
  LinearTransition: { duration: () => ({}) },
  ZoomIn: { duration: () => ({}) },
  ZoomOut: { duration: () => ({}) },
  FadeInDown: { duration: () => ({ delay: () => ({}) }) },
  FadeInUp: { duration: () => ({ delay: () => ({}) }) },
  EntryAnimationsValues: {},
  ExitAnimationsValues: {},
  SharedTransition: {},
  ReduceMotion: { System: 0, Always: 1, Never: 2 },
  enableLayoutAnimations: noop,
  configureReanimatedLogger: noop,
  ReanimatedLogLevel: { warn: 1, error: 2 },
};
