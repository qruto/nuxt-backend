import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { backendError } from '../../src/convex/errors'
import { createBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import UploadField from '../../src/runtime/vue/components/shell/UploadField.vue'
import { useShareLink } from '../../src/runtime/vue/composables/use-share-link'

// <UploadField> and useShareLink over the backend mock, the way an app tests
// a page with an upload or a share button: the upload goes to the URL
// `generateUploadUrl` mints (the browser's request faked here), then to the
// app's claim, and v-model is set only once the claim went through.

let backend: BackendMock

/** A browser upload request that answers with a storage id, never answers until aborted, or drops the next `failNext` sends. */
class FakeUpload {
  static hang = false
  static failNext = 0
  /** Every body sent, in order. */
  static sent: unknown[] = []
  status = 0
  responseText = ''
  upload: { onprogress?: (event: { lengthComputable: boolean, loaded: number, total: number }) => void } = {}
  onload?: () => void
  onerror?: () => void
  onabort?: () => void
  open() {}
  setRequestHeader() {}
  abort() {
    this.onabort?.()
  }

  send(body: unknown) {
    FakeUpload.sent.push(body)
    if (FakeUpload.hang) return
    if (FakeUpload.failNext > 0) {
      FakeUpload.failNext--
      queueMicrotask(() => this.onerror?.())
      return
    }
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 })
      this.status = 200
      this.responseText = JSON.stringify({ storageId: 'kg2upload' })
      this.onload?.()
    })
  }
}

const photo = () => new File([new Uint8Array([0xFF, 0xD8, 0xFF])], 'panel.jpg', { type: 'image/jpeg' })

/** Pick a file the way a person does: the hidden input changes. */
async function choose(wrapper: Awaited<ReturnType<typeof mountSuspended>>, file: File) {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

beforeEach(() => {
  FakeUpload.hang = false
  FakeUpload.failNext = 0
  FakeUpload.sent = []
  vi.stubGlobal('XMLHttpRequest', FakeUpload)
  backend = createBackendMock({ user: {} })
  backend.stub('storage:generateUploadUrl', () => 'https://happy-otter-123.convex.cloud/api/storage/upload?token=t')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<UploadField>, on the backend mock', () => {
  it('uploads the file, claims it, and sets v-model once the claim went through', async () => {
    const claim = vi.fn(async () => null)
    const value = ref<string | null>(null)
    const field = await mountSuspended(UploadField, {
      props: { 'claim': claim, 'accept': 'image/jpeg', 'modelValue': value.value, 'onUpdate:modelValue': (id: string | null) => (value.value = id) },
    })
    expect(field.find('[data-upload="field"]').attributes('data-state')).toBe('ready')
    expect(field.find('input[type="file"]').attributes('accept')).toBe('image/jpeg')
    // The keyboard path: a button named by the field's label and its own words.
    expect(field.find('button[data-upload="choose"]').text()).toBe('Choose a file')
    await choose(field, photo())
    expect(claim).toHaveBeenCalledWith('kg2upload')
    expect(value.value).toBe('kg2upload')
    expect(field.find('[data-upload="field"]').attributes('data-state')).toBe('done')
    expect(field.find('[role="status"]').text()).toBe('panel.jpg added.')
  })

  it('ties a refusal from the claim to the field, in an alert, and leaves v-model as it was', async () => {
    const claim = vi.fn(async () => {
      throw backendError('invalid_input', { field: 'file', reason: 'unsupported_type' })
    })
    const update = vi.fn()
    const errors = vi.fn()
    const field = await mountSuspended(UploadField, { props: { 'claim': claim, 'onUpdate:modelValue': update, 'onError': errors } })
    await choose(field, photo())
    expect(field.find('[data-upload="field"]').attributes('data-state')).toBe('refused')
    expect(field.find('[role="alert"]').text()).toBe('That type of file isn\'t accepted. Pick another one.')
    expect(field.find('button[data-upload="choose"]').attributes('aria-describedby')).toContain(field.find('[role="alert"]').attributes('id'))
    expect(update).not.toHaveBeenCalled()
    expect(errors.mock.calls[0]![0]).toMatchObject({ code: 'invalid_input', data: { reason: 'unsupported_type' } })
  })

  it('offers no Try again for a refusal: the same file would be turned away again', async () => {
    const claim = vi.fn(async () => {
      throw backendError('quota_exceeded', { quota: 'storage', limit: 100, used: 100, amount: 1, plans: ['pro'] })
    })
    const field = await mountSuspended(UploadField, { props: { claim } })
    await choose(field, photo())
    expect(field.find('[data-upload="field"]').attributes('data-state')).toBe('refused')
    expect(field.find('button[data-upload="retry"]').exists()).toBe(false)
    expect(field.find('button[data-upload="choose"]').text()).toBe('Choose another file')
  })

  it('says a claim that failed on the way failed, and Try again claims the stored file again without a second upload', async () => {
    let failures = 1
    const claim = vi.fn(async () => {
      if (failures-- > 0) throw new Error('fetch failed')
      return null
    })
    const value = ref<string | null>(null)
    const field = await mountSuspended(UploadField, { props: { 'claim': claim, 'onUpdate:modelValue': (id: string | null) => (value.value = id) } })
    await choose(field, photo())
    expect(field.find('[data-upload="field"]').attributes('data-state')).toBe('error')
    expect(field.find('[role="alert"]').exists()).toBe(true)
    const retry = field.find('button[data-upload="retry"]')
    expect(retry.text()).toBe('Try again')
    expect(retry.attributes('aria-describedby')).toBe(field.find('[role="alert"]').attributes('id'))
    expect(value.value).toBeNull()
    await retry.trigger('click')
    await flushPromises()
    expect(field.find('[data-upload="field"]').attributes('data-state')).toBe('done')
    expect(claim).toHaveBeenCalledTimes(2)
    expect(FakeUpload.sent).toHaveLength(1)
    expect(value.value).toBe('kg2upload')
    expect(field.find('[role="alert"]').exists()).toBe(false)
  })

  it('sends the file again when the transfer itself failed', async () => {
    FakeUpload.failNext = 1
    const claim = vi.fn(async () => null)
    const field = await mountSuspended(UploadField, { props: { claim } })
    await choose(field, photo())
    expect(field.find('[data-upload="field"]').attributes('data-state')).toBe('error')
    expect(claim).not.toHaveBeenCalled()
    await field.find('button[data-upload="retry"]').trigger('click')
    await flushPromises()
    expect(FakeUpload.sent).toHaveLength(2)
    expect(claim).toHaveBeenCalledWith('kg2upload')
    expect(field.find('[data-upload="field"]').attributes('data-state')).toBe('done')
  })

  it('sends what prepare made of the file, once, and ties a refusal it throws to the field', async () => {
    const shrunk = new Blob([new Uint8Array([1])], { type: 'image/webp' })
    const prepare = vi.fn(async () => shrunk)
    const claim = vi.fn(async () => null)
    const field = await mountSuspended(UploadField, { props: { claim, prepare } })
    await choose(field, photo())
    expect(prepare).toHaveBeenCalledTimes(1)
    expect((prepare.mock.calls[0] as unknown[])[0]).toBeInstanceOf(File)
    expect(FakeUpload.sent).toEqual([shrunk])
    expect(field.find('[data-upload="field"]').attributes('data-state')).toBe('done')

    const refusing = await mountSuspended(UploadField, {
      props: { claim, prepare: async () => {
        throw backendError('invalid_input', { field: 'file', reason: 'unsupported_type' })
      } },
    })
    await choose(refusing, photo())
    expect(refusing.find('[data-upload="field"]').attributes('data-state')).toBe('refused')
    expect(refusing.find('[role="alert"]').text()).toBe('That type of file isn\'t accepted. Pick another one.')
    expect(backend.callsTo('storage:generateUploadUrl')).toHaveLength(1)
  })

  it('cancels an upload in flight and says so', async () => {
    FakeUpload.hang = true
    const claim = vi.fn(async () => null)
    const field = await mountSuspended(UploadField, { props: { claim } })
    await choose(field, photo())
    expect(field.find('[data-upload="field"]').attributes('aria-busy')).toBe('true')
    expect(field.find('[role="status"]').text()).toBe('Uploading panel.jpg…')
    await field.find('button[data-upload="cancel"]').trigger('click')
    await flushPromises()
    expect(field.find('[data-upload="field"]').attributes('data-state')).toBe('ready')
    expect(field.find('[role="status"]').text()).toBe('Upload canceled.')
    expect(claim).not.toHaveBeenCalled()
  })

  it('takes a dropped file as a second path, and its words from the labels prop', async () => {
    const claim = vi.fn(async () => null)
    const field = await mountSuspended(UploadField, { props: { claim, labels: { choose: 'Add a photo' } } })
    expect(field.find('button[data-upload="choose"]').text()).toBe('Add a photo')
    await field.find('[data-upload="field"]').trigger('drop', { dataTransfer: { files: [photo()] } })
    await flushPromises()
    expect(claim).toHaveBeenCalledWith('kg2upload')
  })
})

/** A share button, as the share-links page writes one. */
const ShareStrip = defineComponent({
  props: { stripId: { type: String, required: true } },
  setup(props) {
    const share = useShareLink('strips', () => props.stripId)
    return () => h('section', [
      h('p', { 'data-test': 'state' }, share.shared.value ? `shared since ${share.sharedAt.value}` : 'not shared'),
      share.url.value ? h('code', share.url.value) : null,
      h('button', { 'type': 'button', 'data-test': 'enable', 'onClick': () => share.enable().catch(() => {}) }, 'Turn on a link'),
      h('button', { 'type': 'button', 'data-test': 'revoke', 'onClick': () => share.revoke().catch(() => {}) }, 'Turn the link off'),
      share.error.value ? h('p', { role: 'alert' }, share.error.value.message) : null,
    ])
  },
})

describe('useShareLink, on the backend mock', () => {
  it('reads whether the row is shared, live, and shows the minted link once', async () => {
    backend.state.queries['storage:getShareLink'] = null
    backend.stub('storage:enableShareLink', () => {
      backend.state.queries['storage:getShareLink'] = { sharedAt: 1_700_000_000_000 }
      return { token: 'tok', url: 'https://panels.example.com/s/tok' }
    })
    backend.stub('storage:revokeShareLink', () => {
      backend.state.queries['storage:getShareLink'] = null
      return null
    })
    const page = await mountSuspended(ShareStrip, { props: { stripId: 'strip-1' } })
    await flushPromises()
    expect(page.find('[data-test="state"]').text()).toBe('not shared')
    await page.find('[data-test="enable"]').trigger('click')
    await flushPromises()
    expect(backend.callsTo('storage:enableShareLink')).toEqual([{ table: 'strips', id: 'strip-1' }])
    expect(page.find('[data-test="state"]').text()).toBe('shared since 1700000000000')
    expect(page.find('code').text()).toBe('https://panels.example.com/s/tok')
    await page.find('[data-test="revoke"]').trigger('click')
    await flushPromises()
    expect(page.find('[data-test="state"]').text()).toBe('not shared')
    expect(page.find('code').exists()).toBe(false)
  })

  it('keeps a refusal in error', async () => {
    backend.state.queries['storage:getShareLink'] = null
    backend.fail('storage:enableShareLink', backendError('forbidden', { reason: 'cannot_share' }))
    const page = await mountSuspended(ShareStrip, { props: { stripId: 'strip-1' } })
    await page.find('[data-test="enable"]').trigger('click')
    await flushPromises()
    expect(page.find('[role="alert"]').text()).toBe('You can\'t share this.')
  })
})
