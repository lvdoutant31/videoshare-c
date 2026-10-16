import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import PublishContentView from './PublishContentView.vue';

const mocks = vi.hoisted(() => ({
  options: vi.fn(), editable: vi.fn(), update: vi.fn(), create: vi.fn(), upload: vi.fn(), toast: vi.fn(),
  route: {} as { name?: string; query?: Record<string, unknown> },
}));
vi.mock('../api/content', () => ({ getContentOptions: mocks.options, getEditableContent: mocks.editable,
  updateMyContent: mocks.update, publishContent: mocks.create, uploadContentImage: mocks.upload }));
vi.mock('../stores/auth', () => ({ useAuthStore: () => ({ user: { nickname: '作者' } }) }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route,
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }) }));
vi.mock('vant', () => ({ showToast: mocks.toast }));

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
