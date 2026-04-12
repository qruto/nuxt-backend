import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    MyModule,
  ],
  backend: {
    url: 'https://test.convex.cloud',
  },
})
