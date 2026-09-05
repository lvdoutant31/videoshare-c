<script setup lang="ts">
/**
 * 发现页：搜索与热搜榜（V1.1 功能占位，视觉参照原型 discover-view）。
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';

const router = useRouter();
const query = ref('');
const searched = ref(false);

const trends = [
  ['1', '重庆火锅有多能吃辣', '爆'],
  ['2', '零基础街舞滑步教学', '新'],
  ['3', '大理双廊暖冬旅行日记', '热'],
  ['4', '深夜食堂的治愈瞬间', '热'],
  ['5', '秋天第一杯奶茶怎么做', ''],
] as const;

function search() {
  if (!query.value.trim()) return;
  searched.value = true;
  showToast('关键词搜索将在 V1.1 版本开放');
}
</script>

<template>
  <div class="page light-page">
    <header class="discover-header">
      <div><van-icon name="search" /><input v-model="query" placeholder="搜索感兴趣的内容..." @keyup.enter="search" /></div>
      <button @click="search">搜索</button>
    </header>
    <div class="discover-scroll">
      <div v-if="searched && query" class="search-summary">为你找到“{{ query }}”的热门内容</div>
      <section class="discover-banner">
        <div>
          <small>热辣城市指南</small>
          <strong>跟着烟火气<br />吃遍成都</strong>
          <span>今晚 20:00 更新</span>
        </div>
      </section>
      <section class="trending">
        <header><h2><van-icon name="fire-o" /> 热搜榜</h2><button>完整榜单 &gt;</button></header>
        <ol>
          <li v-for="trend in trends" :key="trend[0]">
            <b>{{ trend[0] }}</b><span>{{ trend[1] }}</span><em v-if="trend[2]">{{ trend[2] }}</em>
          </li>
        </ol>
      </section>
      <div class="empty-state" style="min-height: 160px"><p>更多内容正在路上</p></div>
    </div>
  </div>
</template>

<style scoped>
.light-page { color: var(--text-strong); background: #fff; }
.discover-header { position: absolute; z-index: 20; top: 0; width: 100%; height: 56px; display: grid; grid-template-columns: 1fr 36px; align-items: center; gap: 12px; padding: 0 16px; background: #fff; }
.discover-header > div { height: 36px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-radius: 7px; background: #f1f1f3; color: #8f9095; }
.discover-header input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 13px; }
.discover-header > button { font-size: 14px; color: #202126; }
.discover-scroll { position: absolute; top: 56px; bottom: 69px; width: 100%; overflow-y: auto; }
.search-summary { padding: 10px 16px; color: #777980; background: #fafafb; font-size: 12px; }
.discover-banner { height: 162px; padding: 16px; }
.discover-banner > div { height: 130px; display: flex; flex-direction: column; justify-content: center; padding: 20px; border-radius: 8px; color: #fff; background: linear-gradient(90deg, #37140a 0%, #71240d99 45%, transparent 75%), url('https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=900&q=88') center/cover; overflow: hidden; }
.discover-banner small { color: #ffd0b0; font-size: 11px; }
.discover-banner strong { margin: 5px 0; font-size: 22px; line-height: 1.15; }
.discover-banner span { font-size: 10px; opacity: .8; }
.trending { min-height: 262px; padding: 0 16px; }
.trending header { height: 27px; display: flex; align-items: flex-start; justify-content: space-between; }
.trending h2 { margin: 0; font-size: 16px; }
.trending h2 .van-icon { color: #fe4b37; }
.trending header button { color: #8b8c91; font-size: 12px; }
.trending ol { margin: 0; padding: 4px 0 0; list-style: none; }
.trending li { height: 43px; display: grid; grid-template-columns: 36px 1fr 24px; align-items: center; font-size: 14px; }
.trending li b { color: #8b8c92; font-size: 17px; }
.trending li:nth-child(-n+3) b { color: #fe2c55; }
.trending li em { justify-self: end; padding: 2px 6px; border-radius: 3px; color: #fff; background: #fe5e3a; font-style: normal; font-size: 10px; }
</style>
