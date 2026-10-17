// The authoring verbs, one file per verb family (AIF-13). This file is the public entry point:
// it re-exports everything, so `from './authoring'` and `@fullyrested/core` are unchanged by
// the split. New verbs go in the family file they belong to, not here.
export * from './authoring/edit-scope';
export * from './authoring/create';
export * from './authoring/settings';
export * from './authoring/request-fields';
export * from './authoring/validation';
export * from './authoring/structure';
export * from './authoring/websocket';
export * from './authoring/mcp';
