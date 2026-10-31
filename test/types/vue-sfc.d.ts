// The `types` project checks the sources with plain tsc, which reads no
// single-file component: a `.vue` import (a page's frame, <BackendNotices>'
// deletion notice) is typed as a component here. vue-tsc, which the
// typecheck script runs, reads the real file.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, unknown>
  export default component
}
