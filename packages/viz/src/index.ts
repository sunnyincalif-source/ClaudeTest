// @leettrace/viz — language-agnostic trace visualization. Reads only the Trace Schema.
export { TraceViewer, handleKey, type TraceViewerProps } from './components/TraceViewer';
export { StackPanel } from './components/StackPanel';
export { HeapPanel } from './components/HeapPanel';
export { ArrowLayer, edgeGeometry } from './components/ArrowLayer';
export { NarrationBar } from './components/NarrationBar';
export { Controls } from './components/Controls';
export { OutputPane } from './components/OutputPane';
export { SourceView } from './components/SourceView';
export { TestResultBadge } from './components/TestResultBadge';
export { computeLayout, orderedContainers, type HeapLayout, type GridPos } from './lib/layout';
export { diffSteps, type StepDiff } from './lib/diff';
export {
  usePlayback,
  playbackReducer,
  SPEEDS,
  type Playback,
  type PlaybackState,
} from './lib/usePlayback';
export { primitiveText, refLabel } from './lib/format';
