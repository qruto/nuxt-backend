import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    MyModule,
  ],
  telemetry: false,
  backend: {
    url: 'https://test.convex.cloud',
  },
})
