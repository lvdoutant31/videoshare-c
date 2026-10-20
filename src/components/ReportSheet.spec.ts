import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReportSheet from './ReportSheet.vue';
import { getReportReasons, reportComment, reportUser, reportVideo } from '../api';

vi.mock('../api', () => ({ getReportReasons: vi.fn(), reportComment: vi.fn(), reportUser: vi.fn(), reportVideo: vi.fn() }));
vi.mock('../analytics', () => ({ EVENT_NAMES: { REPORT_SUBMITTED: 'report_submitted' }, track: vi.fn() }));
vi.mock('vant', () => ({ showToast: vi.fn() }));

describe('ReportSheet', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getReportReasons).mockResolvedValue([{ code: 'VIOLENCE', name: '暴力内容', targetTypes: ['VIDEO', 'COMMENT', 'USER'] }]);
  });

  it.each(['VIDEO', 'COMMENT', 'USER'] as const)('submits the chosen reason, description and original %s ID', async targetType => {
    const wrapper = mount(ReportSheet, {
      props: { open: false, targetType, targetId: '123' },
      global: { stubs: { 'van-action-sheet': { props: ['show'], template: '<section v-if="show"><slot /></section>' } } },
    });
    await wrapper.setProps({ open: true });
    await flushPromises();
    expect(getReportReasons).toHaveBeenCalledWith(targetType);
    expect(wrapper.get('.report-submit').attributes('disabled')).toBeDefined();
    await wrapper.get('.reason-chip').trigger('click');
    await wrapper.get('textarea').setValue('举报说明');
    await wrapper.get('.report-submit').trigger('click');
    await flushPromises();
    const submit = targetType === 'VIDEO' ? reportVideo : targetType === 'COMMENT' ? reportComment : reportUser;
    expect(submit).toHaveBeenCalledExactlyOnceWith('123', 'VIOLENCE', '举报说明');
    expect(wrapper.emitted('update:open')).toEqual([[false]]);
    wrapper.unmount();
  });

  it('keeps the panel open after a failed submission so the user can retry', async () => {
    vi.mocked(reportComment).mockRejectedValue(new Error('network failure'));
    const wrapper = mount(ReportSheet, {
      props: { open: false, targetType: 'COMMENT', targetId: '123' },
      global: { stubs: { 'van-action-sheet': { props: ['show'], template: '<section v-if="show"><slot /></section>' } } },
    });
    await wrapper.setProps({ open: true });
    await flushPromises();
    await wrapper.get('.reason-chip').trigger('click');
    await wrapper.get('.report-submit').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update:open')).toBeUndefined();
    expect(wrapper.get('.report-submit').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
});
