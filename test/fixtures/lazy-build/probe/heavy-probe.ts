import { defineComponent, h, ref } from 'vue'

// The fixture's heavy component. Its marker is how the test finds the chunk
// its code went to; the counter only counts once the component hydrated.
export const HeavyProbe = defineComponent({
  name: 'HeavyProbe',
  props: { label: { type: String, required: true } },
  setup(props) {
    const presses = ref(0)
    return () => h('button', {
      'data-heavy-probe': 'lazy-chunk-marker-7f3a',
      'type': 'button',
      'onClick': () => presses.value++,
    }, `${props.label}: ${presses.value}`)
  },
})
