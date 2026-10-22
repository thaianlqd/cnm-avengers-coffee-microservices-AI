import {test,expect} from '@playwright/test';
import {mockApi,openAssistant} from './helpers';
test('catalog keeps stable panes, filters, closes with Escape and fits mobile',async({page})=>{
 const api=await mockApi(page);await openAssistant(page);
 const trigger=page.getByRole('button',{name:/Hỏi được gì/});await trigger.click();
 const dialog=page.getByRole('dialog',{name:'Bạn muốn phân tích điều gì?'});await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('textbox')).toBeFocused();
 const before=await dialog.boundingBox(),bodyBefore=await page.locator('main').boundingBox();
 const groups=dialog.getByRole('navigation',{name:'Nhóm dữ liệu'}).getByRole('button');
 for(let i=0;i<Math.min(5,await groups.count());i++) {await groups.nth(i).click();const box=await dialog.boundingBox();expect(box?.height).toBe(before?.height);expect(box?.width).toBe(before?.width);}
 expect(await page.locator('main').boundingBox()).toEqual(bodyBefore);
 await dialog.getByRole('textbox').fill('giao dịch');await expect(dialog.locator('[data-capability-metric]').first()).toBeVisible();
 expect(api.calls['/api/ai/analysis-jobs']||[]).toHaveLength(0);
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();
 await page.setViewportSize({width:390,height:844});await trigger.click();
 const box=await dialog.boundingBox();expect(box!.width).toBeLessThanOrEqual(370);expect(box!.height).toBeLessThanOrEqual(824);
 expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await dialog.getByRole('button',{name:'Đóng danh mục'}).click();await expect(dialog).toBeHidden();
});
