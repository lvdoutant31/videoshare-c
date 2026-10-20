import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const media = readFileSync(new URL('./fixtures/seek-quality.mp4', import.meta.url));
const video = {
  id:'901',title:'进度与清晰度验证',description:'测试视频',videoUrl:'/qa-video/default.mp4',durationMs:12000,
  author:{id:'1',nickname:'作者',avatarUrl:null,following:false},cover:null,categories:[],tags:[],
  stats:{playCount:0,likeCount:0,favoriteCount:0,commentCount:0,watchTimeMs:0},
  viewerState:{liked:false,favorited:false},publishedAt:'2026-10-15T00:00:00Z',
};
const api=(data:unknown)=>({code:'OK',data});
test.beforeEach(async ({page})=>{
  await page.route('**/api/v1/app/feed/recommend?*',r=>r.fulfill({json:api({items:[video],nextCursor:null})}));
  await page.route('**/api/v1/app/videos/901/sources',r=>r.fulfill({json:api([
    {id:'optimized',label:'流畅版',url:video.videoUrl,width:320,height:180},
    {id:'original',label:'原画',url:'/qa-video/original.mp4',width:640,height:360},
  ])}));
  await page.route('**/qa-video/*.mp4',route=>{
    const range=route.request().headers().range;
    const match=range?.match(/bytes=(\d+)-(\d*)/);
    const start=match ? Number(match[1]) : 0;
    const end=match?.[2] ? Math.min(Number(match[2]),media.length-1) : media.length-1;
    return route.fulfill({status:range ? 206 : 200,contentType:'video/mp4',body:media.subarray(start,end+1),headers:{
      'Accept-Ranges':'bytes',...(range ? {'Content-Range':`bytes ${start}-${end}/${media.length}`} : {}),
    }});
  });
});

test('drag previews without seeking, commits on release, and retains pause across quality switch',async({page})=>{
  await page.goto('feed?video=901');
  const player=page.locator('video');
  await expect.poll(()=>player.evaluate(v=>v.duration)).toBeGreaterThan(10);
  await player.evaluate(v=>{v.pause();v.currentTime=2;v.playbackRate=1.5;});
  const bar=page.getByRole('slider',{name:'视频播放进度'});
  const box=(await bar.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.mouse.move(box.x+box.width*.25,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.65,box.y+box.height/2,{steps:10});
  await expect(page.locator('.seek-preview')).toBeVisible();
  expect(await player.evaluate(v=>v.currentTime)).toBeCloseTo(2,0);
  await page.mouse.up();
  await expect.poll(()=>player.evaluate(v=>v.currentTime)).toBeGreaterThan(7);
  expect(await player.evaluate(v=>v.paused)).toBe(true);
  const position=await player.evaluate(v=>v.currentTime);
  await page.getByRole('button',{name:'选择视频清晰度'}).click();
  await page.getByRole('button',{name:/原画/}).click();
  await expect(player).toHaveAttribute('src','/qa-video/original.mp4');
  await expect(page.locator('.quality-trigger')).toHaveText('原画');
  expect(await player.evaluate(v=>v.currentTime)).toBeCloseTo(position,0);
  expect(await player.evaluate(v=>v.paused)).toBe(true);
  expect(await player.evaluate(v=>v.playbackRate)).toBe(1.5);
  await page.screenshot({path:'D:/PrivateSoftware/gitClaude/ticktok-api/output/video-controls.png'});
});

test('failed replacement source falls back to the playable source and retains position',async({page})=>{
  await page.route('**/qa-video/original.mp4',r=>r.fulfill({status:500,body:'unavailable'}));
  await page.goto('feed?video=901');const player=page.locator('video');
  await expect.poll(()=>player.evaluate(v=>v.duration)).toBeGreaterThan(10);
  await player.evaluate(v=>{v.pause();v.currentTime=3;});
  await page.getByRole('button',{name:'选择视频清晰度'}).click();
  await page.getByRole('button',{name:/原画/}).click();
  await expect(page.locator('.quality-trigger')).toHaveText('流畅版');
  await expect(player).toHaveAttribute('src','/qa-video/default.mp4');
  expect(await player.evaluate(v=>v.currentTime)).toBeCloseTo(3,0);
  expect(await player.evaluate(v=>v.paused)).toBe(true);
});

test('a playing video resumes after seeking and switching quality', async ({page}) => {
  await page.goto('feed?video=901'); const player=page.locator('video');
  await expect.poll(()=>player.evaluate(v=>v.duration)).toBeGreaterThan(10);
  await player.evaluate(async v=>{v.muted=true;v.currentTime=2;await v.play();});
  const box=(await page.getByRole('slider',{name:'视频播放进度'}).boundingBox())!;
  await page.mouse.move(box.x+box.width*.35,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height/2,{steps:5});
  expect(await player.evaluate(v=>v.paused)).toBe(true);
  await page.mouse.up();
  await expect.poll(()=>player.evaluate(v=>v.paused)).toBe(false);
  await page.getByRole('button',{name:'选择视频清晰度'}).click();
  const before=await player.evaluate(v=>v.currentTime);
  await page.getByRole('button',{name:/原画/}).click();
  await expect(page.locator('.quality-trigger')).toHaveText('原画');
  await expect.poll(()=>player.evaluate(v=>v.paused)).toBe(false);
  expect(await player.evaluate(v=>v.currentTime)).toBeGreaterThanOrEqual(before-.2);
  expect(await player.evaluate(v=>v.muted)).toBe(true);
});

for (const playing of [false, true]) {
  test(`closing comments preserves original playing=${playing}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('yingliu.app.token', 'qa-token'));
    await page.route('**/api/v1/app/me', route => route.fulfill({ json: api({ id: 'viewer', nickname: '测试用户', status: 'NORMAL' }) }));
    await page.route('**/api/v1/app/videos/901/comments?*', route => route.fulfill({ json: api({ items: [], nextCursor: null }) }));
    await page.goto('feed?video=901');
    const player = page.locator('video');
    await expect.poll(() => player.evaluate(video => video.duration)).toBeGreaterThan(10);
    await expect.poll(() => player.evaluate(video => video.paused)).toBe(false);
    if (!playing) await page.getByRole('button', { name: '暂停视频', exact: true }).click();
    await expect.poll(() => player.evaluate(video => video.paused)).toBe(!playing);
    await page.getByRole('button', { name: '评论', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '内容评论' })).toBeVisible();
    await expect.poll(() => player.evaluate(video => video.paused)).toBe(true);
    await page.getByRole('dialog', { name: '内容评论' }).getByRole('button', { name: '关闭评论' }).click();
    await expect(page.getByRole('dialog', { name: '内容评论' })).toBeHidden();
    await expect.poll(() => player.evaluate(video => video.paused)).toBe(!playing);
  });
}
