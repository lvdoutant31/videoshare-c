import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import RichTextEditor from './RichTextEditor.vue';

describe('rich text editor', () => {
  it('retains formatting and table spans when reloaded, removing unsafe markup', async () => {
    const wrapper = mount(RichTextEditor, { props: { modelValue: '<h2>Heading</h2><p style="text-align:center"><span style="font-family:Arial;font-size:24px;color:#ff0000">Styled</span></p><table><tbody><tr><td colspan="2"><p>Cell</p></td></tr></tbody></table><script>alert(1)</script>', uploadImage: vi.fn() } });
    await flushPromises();
    const editor = (wrapper.vm as any).editor;
    expect(editor.getHTML()).toContain('font-size: 24px');
    expect(editor.getHTML()).toContain('color: rgb(255, 0, 0)');
    expect(editor.getHTML()).toContain('colspan="2"');
    expect(editor.getHTML()).not.toContain('script');
    wrapper.unmount();
  });
  it('inserts uploaded images in selection order and supports undo and redo', async () => {
    const upload = vi.fn(async (file: File) => '/media/' + file.name);
    const wrapper = mount(RichTextEditor, { props: { modelValue: '<p>Before</p><p>After</p>', uploadImage: upload } });
    await flushPromises();
    const vm = wrapper.vm as any;
    vm.editor.commands.setTextSelection(9);
    await vm.uploadFiles([new File(['a'], 'first.png', { type:'image/png' }), new File(['b'], 'second.png', { type:'image/png' })]);
    const html = vm.editor.getHTML();
    expect(html.indexOf('first.png')).toBeLessThan(html.indexOf('second.png'));
    expect(html.indexOf('second.png')).toBeLessThan(html.indexOf('After'));
    expect(wrapper.emitted('busy')).toEqual([[true], [false]]);
    vm.editor.commands.undo(); expect(vm.editor.getHTML()).not.toContain('first.png');
    vm.editor.commands.redo(); expect(vm.editor.getHTML()).toContain('second.png');
    wrapper.unmount();
  });
});
