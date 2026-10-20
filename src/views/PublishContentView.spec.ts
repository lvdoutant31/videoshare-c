import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import PublishContentView from './PublishContentView.vue';

const mocks = vi.hoisted(() => ({
  options: vi.fn(), editable: vi.fn(), update: vi.fn(), create: vi.fn(), upload: vi.fn(), toast: vi.fn(),
  route: {} as { name?: string; query?: Record<string, unknown> },
  confirm: vi.fn(), leave: undefined as undefined | (() => Promise<boolean>),
  track: vi.fn(),
}));
vi.mock('../api/content', () => ({ getContentOptions: mocks.options, getEditableContent: mocks.editable,
  updateMyContent: mocks.update, publishContent: mocks.create, uploadContentImage: mocks.upload }));
vi.mock('../stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'author-1', nickname: '作者' } }) }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route,
  useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  onBeforeRouteLeave: (guard: () => Promise<boolean>) => { mocks.leave = guard; }, onBeforeRouteUpdate: vi.fn() }));
vi.mock('vant', () => ({ showToast: mocks.toast, showConfirmDialog: mocks.confirm }));
vi.mock('../analytics', () => ({ EVENT_NAMES: { PUBLISH_STARTED: 'publish_started', PUBLISH_SUBMITTED: 'publish_submitted', PUBLISH_FAILED: 'publish_failed' }, track: mocks.track }));

const id = '2108384690509983745';
const original = { id, title: '原标题', description: '<p>原正文</p>', currentVersion: 3,
  originalMedia: null as { url: string } | null, categories: [{ id: '3', name: '分类' }], tags: [] };
const create = (contentId?: string) => mount(PublishContentView, { props: { contentId }, global: { stubs: {
  'van-icon': true, 'van-loading': true,
  RichTextEditor: { props: ['modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
} } });

describe('editing an existing content record', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.route = reactive({ name: 'my-content-edit', query: {} });
    mocks.options.mockResolvedValue({ categories: original.categories, tags: [] });
    mocks.editable.mockResolvedValue({ ...original });
    mocks.update.mockResolvedValue({ ...original });
  });

  it.each(['article', 'video'])('updates the original %s ID without sending a create request', async type => {
    mocks.editable.mockResolvedValue({ ...original, originalMedia: type === 'video' ? { url: '/media/original.mp4' } : null });
    const wrapper = create(id); await flushPromises();
    await wrapper.get('input[maxlength="120"]').setValue('修改后的标题');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith(id, expect.objectContaining({ title: '修改后的标题', currentVersion: 3 }));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('修改已提交审核');
    wrapper.unmount();
  });

  it('does not expose a submit form before the original record has loaded', async () => {
    let resolve!: (value: typeof original) => void;
    mocks.editable.mockReturnValue(new Promise<typeof original>(done => { resolve = done; }));
    const wrapper = create(id); await flushPromises();
    expect(wrapper.find('form').exists()).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
    resolve(original); await flushPromises();
    expect(wrapper.find('form').exists()).toBe(true);
    wrapper.unmount();
  });

  it('a failed or malformed edit never falls back to creation', async () => {
    mocks.editable.mockRejectedValue(new Error('内容不可用'));
    const wrapper = create(id); await flushPromises();
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.text()).toContain('内容加载失败');
    expect(mocks.create).not.toHaveBeenCalled();
    wrapper.unmount();
    mocks.route = reactive({ name: 'publish', query: { edit: ['1', '2'] } });
    const invalid = create(); await flushPromises();
    expect(invalid.find('.type-choice').exists()).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
    invalid.unmount();
  });

  it('clears the edited record when navigating to a new-content form', async () => {
    mocks.route = reactive({ name: 'publish', query: { edit: id } });
    const wrapper = create(); await flushPromises();
    expect((wrapper.get('input[maxlength="120"]').element as HTMLInputElement).value).toBe('原标题');
    mocks.route.query = {}; await flushPromises();
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.find('.type-choice').exists()).toBe(true);
    await wrapper.findAll('.type-card')[1].trigger('click');
    expect((wrapper.get('input[maxlength="120"]').element as HTMLInputElement).value).toBe('');
    await wrapper.get('form').trigger('submit');
    expect(mocks.create).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('publishing drafts and progress', () => {
  const draftKey = 'yingliu.publish.draft:author-1';
  beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear();
    mocks.route = reactive({ name: 'publish', query: {} });
    mocks.options.mockResolvedValue({ categories: original.categories, tags: [] });
  });
  afterEach(() => vi.useRealTimers());

  async function fillArticle() {
    const wrapper = create(); await flushPromises();
    await wrapper.findAll('.type-card')[1].trigger('click');
    await wrapper.get('input[maxlength="120"]').setValue('草稿标题');
    await wrapper.get('textarea').setValue('<p>草稿正文</p>');
    await wrapper.get('input[type="checkbox"]').setValue(true);
    return wrapper;
  }

  it('saves automatically, restores after reopening and clears only after successful submission', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const wrapper = await fillArticle();
    await vi.advanceTimersByTimeAsync(550);
    expect(JSON.parse(localStorage.getItem(draftKey)!)).toMatchObject({ title: '草稿标题', categoryIds: ['3'] });
    wrapper.unmount();
    const restored = create(); await flushPromises();
    expect((restored.get('input[maxlength="120"]').element as HTMLInputElement).value).toBe('草稿标题');
    mocks.create.mockRejectedValueOnce(new Error('网络断开'));
    await restored.get('form').trigger('submit'); await flushPromises();
    expect(restored.get('[role="alert"]').text()).toContain('网络断开');
    expect(localStorage.getItem(draftKey)).not.toBeNull();
    mocks.create.mockResolvedValueOnce({ id: '100' });
    await restored.get('form').trigger('submit'); await flushPromises();
    expect(restored.text()).toContain('已提交审核');
    expect(localStorage.getItem(draftKey)).toBeNull();
    restored.unmount();
    expect(localStorage.getItem(draftKey)).toBeNull();
    expect(mocks.track).toHaveBeenCalledWith('publish_failed', expect.objectContaining({ properties: expect.objectContaining({ errorCode: 'REQUEST_FAILED' }) }));
    expect(mocks.track).toHaveBeenCalledWith('publish_submitted', expect.objectContaining({ objectId: '100' }));
    expect(JSON.stringify(mocks.track.mock.calls)).not.toContain('草稿标题');
    expect(JSON.stringify(mocks.track.mock.calls)).not.toContain('草稿正文');
  });

  it('protects unsaved edits and browser reloads, and respects cancel', async () => {
    const wrapper = await fillArticle();
    mocks.confirm.mockRejectedValueOnce('cancel');
    expect(await mocks.leave!()).toBe(false);
    expect(localStorage.getItem(draftKey)).not.toBeNull();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    mocks.confirm.mockResolvedValueOnce(undefined);
    expect(await mocks.leave!()).toBe(true);
    wrapper.unmount();
  });

  it('ignores other accounts and malformed drafts', async () => {
    localStorage.setItem('yingliu.publish.draft:someone-else', JSON.stringify({ title: '他人的私密正文' }));
    localStorage.setItem(draftKey, '{broken');
    const wrapper = create(); await flushPromises();
    expect(wrapper.find('.type-choice').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('他人的私密正文');
    wrapper.unmount();
  });

  it('restores video metadata without pretending to restore the local file and reports upload progress', async () => {
    localStorage.setItem(draftKey, JSON.stringify({ title: '视频草稿', description: '', categoryIds: ['3'], tagIds: [], contentType: 'video', videoName: 'old.mp4' }));
    const wrapper = create(); await flushPromises();
    expect(wrapper.text()).toContain('请重新选择视频文件');
    await wrapper.get('form').trigger('submit');
    expect(mocks.create).not.toHaveBeenCalled();
    const file = new File(['video'], 'new.mp4', { type: 'video/mp4' });
    Object.defineProperty(wrapper.get('input[type="file"]').element, 'files', { value: [file], configurable: true });
    await wrapper.get('input[type="file"]').trigger('change');
    let finish!: (value: { id: string }) => void;
    mocks.create.mockImplementationOnce((_input, progress) => { progress(45); return new Promise(resolve => { finish = resolve; }); });
    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('progress').attributes('value')).toBe('45');
    expect(await mocks.leave!()).toBe(false);
    finish({ id: '100' }); await flushPromises();
    expect(await mocks.leave!()).toBe(true);
    wrapper.unmount();
  });
});
