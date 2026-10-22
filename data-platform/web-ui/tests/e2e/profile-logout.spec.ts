import { expect, test } from '@playwright/test';
import { deferred, mockApi } from './helpers';

test('header logout works on mobile, blocks duplicate clicks and retains session on failure',async({page})=>{
  const api=await mockApi(page), pending=deferred();
  api.on('/auth/session',route=>route.fulfill({json:{authenticated:true,identity:'fixture-profile:policy1',permissions:['analytics.read'],expires_at:4000000000}}));
  api.on('/auth/logout',async route=>{
    if(api.calls['/api/auth/logout'].length===1) {await pending.promise;await route.fulfill({status:503,json:{detail:'fixture unavailable'}});}
    else await route.fulfill({json:{status:'signed_out'}});
  });
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  const header=page.getByRole('banner'), profile=header.getByRole('group',{name:'Hồ sơ và phiên đăng nhập'});
  const logout=profile.getByRole('button',{name:'Đăng xuất tài khoản phân tích'});
  await expect(logout).toBeVisible();
  await expect(page.getByRole('button',{name:'Đăng xuất tài khoản phân tích'})).toHaveCount(1);
  const headerBox=await header.boundingBox(), buttonBox=await logout.boundingBox();
  expect(buttonBox!.y).toBeGreaterThanOrEqual(headerBox!.y);
  expect(buttonBox!.y+buttonBox!.height).toBeLessThanOrEqual(headerBox!.y+headerBox!.height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/dp-header-profile-mobile.png'});
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:'/tmp/dp-header-profile-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await logout.click();await expect(logout).toBeDisabled();await expect(logout).toHaveAttribute('aria-busy','true');
  expect(api.calls['/api/auth/logout']).toHaveLength(1);
  pending.resolve(null);
  await expect(page.getByText('Chưa đăng xuất được; vui lòng thử lại.',{exact:true})).toBeVisible();
  await expect(logout).toBeEnabled();await expect(page.getByRole('form',{name:'Đăng nhập Data Platform'})).toHaveCount(0);
  await logout.click();await expect(page.getByRole('form',{name:'Đăng nhập Data Platform'})).toBeVisible();
  expect(api.calls['/api/auth/logout']).toHaveLength(2);
});
