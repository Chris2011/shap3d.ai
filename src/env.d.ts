/// <reference types="vite/client" />
/** the app's version (package.json), set by Vite */
declare const __APP_VERSION__: string;
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, any>;
  export default component;
}
