import { defineComponent, h } from 'vue'

// A component for test/unit/lazy-components.test.ts: it counts the times its
// module is evaluated, so the test can tell when a lazy registration fetched it.
const loads = globalThis as { __probeLoads?: number }
loads.__probeLoads = (loads.__probeLoads ?? 0) + 1

export const Probe = defineComponent({
  name: 'Probe',
  props: { label: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h('p', { 'data-probe': '' }, [h('strong', props.label), slots.default?.()])
  },
})

export default Probe
