import { test, expect } from '@playwright/test'

test('admin mobile cards are reachable by scrolling panel', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 873 })
  await page.goto('http://127.0.0.1:5174/runy-dic/#/admin')
  await page.evaluate(() => {
    localStorage.setItem('adminUser', JSON.stringify({
      email: 'ya.kodan76@ya.ru',
      role: 'admin',
      loginAt: new Date().toISOString(),
    }))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.word-item', { timeout: 15000 })

  await page.locator('.admin-panel').evaluate((node) => { node.scrollTop = node.scrollHeight })
  await page.waitForTimeout(300)
  const after = await page.locator('.word-item').first().boundingBox()
  const panel = await page.locator('.admin-panel').evaluate((node) => ({
    scrollTop: node.scrollTop,
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
  }))

  await page.screenshot({ path: `${process.env.TEMP}/admin-mobile-scrolled.png`, fullPage: false })
  console.log(JSON.stringify({ after, panel }, null, 2))
  expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight)
  expect(after).not.toBeNull()
  expect(after.y).toBeLessThan(873)
  expect(after.y + after.height).toBeGreaterThan(0)
})
