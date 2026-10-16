<script setup lang="ts">
import { ref, watch } from 'vue';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { TableKit } from '@tiptap/extension-table';
import { safeRichText as cleanRichText } from '../utils/richText';

const props = withDefaults(defineProps<{
  modelValue: string;
  uploadImage: (file: File) => Promise<string>;
  compact?: boolean;
  disabled?: boolean;
}>(), { compact: false, disabled: false });
const emit = defineEmits<{
  'update:modelValue': [value: string];
  busy: [value: boolean];
  error: [message: string];
}>();
const uploading = ref(false);
const imagePicker = ref<HTMLInputElement>();
const linkOpen = ref(false);
const linkUrl = ref('');
const editor = useEditor({
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, code: false, codeBlock: false,
      horizontalRule: false, link: { openOnClick: false, autolink: false } }),
    Image.configure({ allowBase64: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyleKit,
    TableKit.configure({ table: { resizable: false } }),
  ],
  content: cleanRichText(props.modelValue),
  editable: !props.disabled,
  editorProps: {
    attributes: { role: 'textbox', 'aria-label': '正文', 'aria-multiline': 'true' },
    transformPastedHTML: html => cleanRichText(html),
    handlePaste: (_view, event) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith('image/'));
      if (!files.length) return false;
      event.preventDefault(); void uploadFiles(files); return true;
    },
    handleDrop: (view, event, _slice, moved) => {
      const files = Array.from(event.dataTransfer?.files ?? []).filter(file => file.type.startsWith('image/'));
      if (moved || !files.length) return false;
      event.preventDefault();
      const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
      if (position != null) editor.value?.commands.setTextSelection(position);
      void uploadFiles(files); return true;
    },
  },
  onUpdate: ({ editor: current }) => emit('update:modelValue', current.getHTML()),
});
watch(() => props.modelValue, value => {
  if (editor.value && value !== editor.value.getHTML()) editor.value.commands.setContent(cleanRichText(value), { emitUpdate: false });
});
watch(() => props.disabled, value => editor.value?.setEditable(!value && !uploading.value));

async function uploadFiles(files: File[]) {
  const current = editor.value;
  if (!current || uploading.value || props.disabled) return;
  uploading.value = true; emit('busy', true); current.setEditable(false);
  const position = current.state.selection.from;
  const images: { type: string; attrs: { src: string; alt: string } }[] = [];
  try {
    for (const file of files) {
      if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type) || file.size > 10 * 1024 * 1024) {
        throw new Error('请选择 10 MB 以内的 JPEG、PNG 或 GIF 图片');
      }
      images.push({ type: 'image', attrs: { src: await props.uploadImage(file), alt: file.name } });
    }
  } catch (error) { emit('error', error instanceof Error ? error.message : '图片上传失败'); }
  finally {
    if (!current.isDestroyed) {
      if (images.length) current.commands.insertContentAt(position, images);
      current.setEditable(!props.disabled);
    }
    uploading.value = false; emit('busy', false);
  }
}
function chooseImages(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []); input.value = ''; void uploadFiles(files);
}
function openLink() {
  linkUrl.value = String(editor.value?.getAttributes('link').href ?? '');
  linkOpen.value = true;
}
function saveLink() {
  if (!/^https?:\/\/[^\s]+$/i.test(linkUrl.value.trim())) return emit('error', '链接需以 http:// 或 https:// 开头');
  editor.value?.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.value.trim() }).run();
  linkOpen.value = false;
}
function selectHeading(event: Event) {
  const level = Number((event.target as HTMLSelectElement).value);
  if (level) editor.value?.chain().focus().setHeading({ level: level as 1 | 2 | 3 }).run();
  else editor.value?.chain().focus().setParagraph().run();
}
function setFont(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  const chain = editor.value?.chain().focus();
  if (value) chain?.setFontFamily(value).run(); else chain?.unsetFontFamily().run();
}
function setSize(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  const chain = editor.value?.chain().focus();
  if (value) chain?.setFontSize(value).run(); else chain?.unsetFontSize().run();
}
defineExpose({ editor, uploadFiles });
</script>

<template>
  <div class="rich-text-editor" :class="{ compact }">
    <div v-if="editor" class="rich-toolbar" role="toolbar" aria-label="正文格式">
      <select v-if="!compact" aria-label="段落样式" :value="editor.isActive('heading') ? editor.getAttributes('heading').level : 0" :disabled="disabled || uploading" @change="selectHeading">
        <option value="0">正文</option><option value="1">标题一</option><option value="2">标题二</option><option value="3">标题三</option>
      </select>
      <select v-if="!compact" aria-label="字体" :value="editor.getAttributes('textStyle').fontFamily ?? ''" :disabled="disabled || uploading" @change="setFont">
        <option value="">默认字体</option><option value="Microsoft YaHei">微软雅黑</option><option value="SimSun">宋体</option><option value="Arial">Arial</option>
      </select>
      <select v-if="!compact" aria-label="字号" :value="editor.getAttributes('textStyle').fontSize ?? ''" :disabled="disabled || uploading" @change="setSize">
        <option value="">默认字号</option><option v-for="size in [12, 14, 16, 18, 20, 24, 28, 32]" :key="size" :value="size + 'px'">{{ size }}</option>
      </select>
      <button type="button" :aria-pressed="editor.isActive('bold')" :disabled="disabled || uploading" @mousedown.prevent @click="editor.chain().focus().toggleBold().run()">加粗</button>
      <button type="button" :aria-pressed="editor.isActive('italic')" :disabled="disabled || uploading" @mousedown.prevent @click="editor.chain().focus().toggleItalic().run()">斜体</button>
      <button v-if="!compact" type="button" :aria-pressed="editor.isActive('underline')" :disabled="disabled || uploading" @mousedown.prevent @click="editor.chain().focus().toggleUnderline().run()">下划线</button>
      <label v-if="!compact" class="color-control">文字色<input type="color" aria-label="文字颜色" :disabled="disabled || uploading" @input="editor.chain().focus().setColor(($event.target as HTMLInputElement).value).run()" /></label>
      <button type="button" :aria-pressed="editor.isActive('bulletList')" :disabled="disabled || uploading" @mousedown.prevent @click="editor.chain().focus().toggleBulletList().run()">列表</button>
      <button v-if="!compact" type="button" :aria-pressed="editor.isActive('orderedList')" :disabled="disabled || uploading" @mousedown.prevent @click="editor.chain().focus().toggleOrderedList().run()">编号</button>
      <button v-if="!compact" type="button" :aria-pressed="editor.isActive({ textAlign: 'left' })" :disabled="disabled || uploading" @mousedown.prevent @click="editor.chain().focus().setTextAlign('left').run()">左对齐</button>
      <button v-if="!compact" type="button" :aria-pressed="editor.isActive({ textAlign: 'center' })" :disabled="disabled || uploading" @mousedown.prevent @click="editor.chain().focus().setTextAlign('center').run()">居中</button>
      <button v-if="!compact" type="button" :aria-pressed="editor.isActive({ textAlign: 'right' })" :disabled="disabled || uploading" @mousedown.prevent @click="editor.chain().focus().setTextAlign('right').run()">右对齐</button>
      <button type="button" :aria-pressed="editor.isActive('link')" :disabled="disabled || uploading" @mousedown.prevent @click="openLink">链接</button>
      <button v-if="!compact" type="button" :disabled="disabled || uploading" @mousedown.prevent @click="editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()">表格</button>
      <button type="button" :disabled="disabled || uploading" @mousedown.prevent @click="imagePicker?.click()">{{ uploading ? '上传中…' : '插入图片' }}</button>
      <button type="button" :disabled="disabled || uploading || !editor.can().undo()" @mousedown.prevent @click="editor.chain().focus().undo().run()">撤销</button>
      <button type="button" :disabled="disabled || uploading || !editor.can().redo()" @mousedown.prevent @click="editor.chain().focus().redo().run()">重做</button>
    </div>
    <div v-if="editor && !compact && editor.isActive('table')" class="rich-toolbar table-tools" role="toolbar" aria-label="表格操作">
      <button type="button" :disabled="disabled || uploading" @mousedown.prevent @click="editor.chain().focus().addRowAfter().run()">增加行</button>
      <button type="button" :disabled="disabled || uploading" @mousedown.prevent @click="editor.chain().focus().addColumnAfter().run()">增加列</button>
      <button type="button" :disabled="disabled || uploading" @mousedown.prevent @click="editor.chain().focus().mergeOrSplit().run()">合并／拆分</button>
      <button type="button" :disabled="disabled || uploading" @mousedown.prevent @click="editor.chain().focus().deleteRow().run()">删除行</button>
      <button type="button" :disabled="disabled || uploading" @mousedown.prevent @click="editor.chain().focus().deleteColumn().run()">删除列</button>
      <button type="button" :disabled="disabled || uploading" @mousedown.prevent @click="editor.chain().focus().deleteTable().run()">删除表格</button>
    </div>
    <div v-if="linkOpen" class="link-controls">
      <input v-model="linkUrl" type="url" aria-label="链接地址" placeholder="https://example.com" />
      <button type="button" :disabled="disabled || uploading" @click="saveLink">确认链接</button>
      <button type="button" :disabled="disabled || uploading" @click="editor?.chain().focus().extendMarkRange('link').unsetLink().run(); linkOpen = false">移除链接</button>
      <button type="button" @click="linkOpen = false">取消</button>
    </div>
    <EditorContent class="rich-editor" :class="{ empty: editor?.isEmpty }" :editor="editor" />
    <input ref="imagePicker" type="file" accept="image/jpeg,image/png,image/gif" multiple hidden @change="chooseImages" />
  </div>
</template>

<style scoped>
.rich-text-editor { width:100%; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; background:#fff; color:#1e293b; }
.rich-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:5px; padding:8px; border-bottom:1px solid #e2e8f0; background:#f8fafc; }
button, select { min-height:32px; padding:5px 8px; color:#334155; background:#fff; border:1px solid #cbd5e1; border-radius:5px; font-size:12px; cursor:pointer; }
button[aria-pressed=true] { color:#1d4ed8; background:#dbeafe; border-color:#93c5fd; }
button:disabled, select:disabled { opacity:.45; cursor:default; }
button:focus-visible, select:focus-visible, input:focus-visible { outline:2px solid #3b82f6; outline-offset:2px; }
.color-control { display:flex; align-items:center; gap:4px; font-size:12px; } input[type=color] { width:28px; height:28px; padding:2px; border:1px solid #cbd5e1; background:#fff; }
.link-controls { display:flex; flex-wrap:wrap; gap:6px; padding:8px; background:#f8fafc; } .link-controls input { flex:1; min-width:150px; border:1px solid #cbd5e1; padding:6px; border-radius:4px; }
.rich-editor { position:relative; padding:12px 14px; overflow:auto; max-height:360px; }
.rich-editor.empty::before { content:'输入正文，可插入多张图片'; position:absolute; top:12px; left:14px; color:#94a3b8; pointer-events:none; }
.rich-editor :deep(.tiptap) { min-height:160px; outline:none; line-height:1.8; overflow-wrap:anywhere; }
.rich-editor :deep(p) { margin:0 0 12px; } .rich-editor :deep(h1) { font-size:28px; } .rich-editor :deep(h2) { font-size:24px; } .rich-editor :deep(h3) { font-size:20px; }
.rich-editor :deep(ul) { list-style:disc; padding-left:1.5em; } .rich-editor :deep(ol) { list-style:decimal; padding-left:1.5em; }
.rich-editor :deep(blockquote) { margin:12px 0; padding-left:14px; border-left:3px solid #94a3b8; color:#64748b; }
.rich-editor :deep(img) { display:block; max-width:100%; height:auto; margin:12px 0; }
.rich-editor :deep(table) { width:100%; border-collapse:collapse; table-layout:fixed; margin:12px 0; }
.rich-editor :deep(td), .rich-editor :deep(th) { min-width:30px; padding:6px; border:1px solid #cbd5e1; vertical-align:top; }
.rich-editor :deep(th) { background:#f1f5f9; } .rich-editor :deep(.selectedCell) { background:#dbeafe; } .rich-editor :deep(a) { color:#2563eb; text-decoration:underline; }
.compact .rich-toolbar button { min-height:40px; padding:7px 10px; } .compact .rich-editor { max-height:420px; }
</style>
