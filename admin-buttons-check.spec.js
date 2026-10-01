// admin-buttons-check.spec.js
// 🖥️ Playwright-проверка раскладки формы словаря в админке.
//
// На ширине > 768px панель админки закреплена сверху (position: fixed) и сама
// не прокручивается. Поэтому при увеличенных полях прокручиваться должны только
// поля формы (.form-fields), а блок кнопок «Добавить/Обновить/Отмена» обязан
// оставаться в пределах экрана — иначе до кнопок нельзя добраться.
//
// Запуск:
//   npm run dev -- --port 5174 --strictPort
//   npx playwright test admin-buttons-check.spec.js
// Если браузеры Playwright не установлены: npx playwright install chromium
// (или запуск на установленном Edge: set PW_CHANNEL=msedge)
import { test, expect } from '@playwright/test'

test.use({ channel: process.env.PW_CHANNEL || undefined })

const ADMIN_URL = 'http://127.0.0.1:5174/#/admin'
const SHORT_DESKTOP = { width: 1280, height: 620 } // окно ниже формы — как при увеличенных полях
const MOBILE = { width: 393, height: 873 }

async function openAdmin(page, size) {
  await page.setViewportSize(size)
  await page.goto(ADMIN_URL)
  await page.evaluate(() => {
    localStorage.setItem('adminUser', JSON.stringify({
      email: 'ya.kodan76@ya.ru',
      role: 'admin',
      loginAt: new Date().toISOString(),
    }))
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.word-form', { timeout: 20000 })
}

// Пользователь «увеличивает поля»: тянет за уголок textarea (у полей
// .single-line-textarea стоит resize: vertical) или увеличивает масштаб страницы —
// форма становится выше окна, и раньше кнопки уезжали за нижнюю границу экрана.
const ENLARGED_FIELDS = '.word-form textarea.single-line-textarea { height: 170px !important; }'

async function enlargeFields(page) {
  await page.addStyleTag({ content: ENLARGED_FIELDS })
  await page.waitForTimeout(150)
}

const gridColumns = (locator) => locator.evaluate(n => getComputedStyle(n).gridTemplateColumns)

test('обычное состояние: кнопки видны, форма двухколоночная, поля не прокручиваются', async ({ page }) => {
  await openAdmin(page, SHORT_DESKTOP)

  const panelHeight = await page.locator('.admin-fixed-container').evaluate(n => n.getBoundingClientRect().height)
  const buttons = await page.locator('form.word-form > .form-buttons').boundingBox()
  const fields = await page.locator('form.word-form > .form-fields').evaluate(n => ({
    scrollHeight: n.scrollHeight,
    clientHeight: n.clientHeight,
  }))
  console.log(JSON.stringify({ panelHeight, buttons, fields }, null, 2))

  expect(panelHeight).toBeLessThanOrEqual(SHORT_DESKTOP.height + 1)
  expect(buttons.y + buttons.height).toBeLessThanOrEqual(SHORT_DESKTOP.height + 1)
  // Форма помещается целиком — прокрутка полям не нужна
  expect(fields.scrollHeight).toBeLessThanOrEqual(fields.clientHeight + 1)
  expect((await gridColumns(page.locator('form.word-form > .form-fields'))).split(' ')).toHaveLength(2)
})

test('поля увеличены: прокручиваются поля, а кнопки остаются в пределах экрана', async ({ page }) => {
  await openAdmin(page, SHORT_DESKTOP)
  await enlargeFields(page)

  const panelHeight = await page.locator('.admin-fixed-container').evaluate(n => n.getBoundingClientRect().height)
  const buttons = await page.locator('form.word-form > .form-buttons').boundingBox()
  const fields = await page.locator('form.word-form > .form-fields').evaluate(n => ({
    scrollHeight: n.scrollHeight,
    clientHeight: n.clientHeight,
  }))
  console.log(JSON.stringify({ panelHeight, buttons, fields }, null, 2))

  // Панель не выходит за экран, кнопки «Добавить/Обновить/Отмена» целиком в кадре
  expect(panelHeight).toBeLessThanOrEqual(SHORT_DESKTOP.height + 1)
  expect(buttons.y).toBeGreaterThanOrEqual(0)
  expect(buttons.y + buttons.height).toBeLessThanOrEqual(SHORT_DESKTOP.height + 1)

  // Увеличенные поля получили собственную прокрутку внутри формы
  expect(fields.scrollHeight).toBeGreaterThan(fields.clientHeight)

  await page.screenshot({ path: `${process.env.TEMP}/admin-buttons-desktop.png` })
})

test('прежнее поведение (без ограничения высоты панели): кнопки уходили за экран', async ({ page }) => {
  await openAdmin(page, SHORT_DESKTOP)
  await enlargeFields(page)
  // Снимаем правку: панель снова растёт по содержимому и не даёт форме прокрутиться
  await page.addStyleTag({
    content: '@media (min-width: 769px) { .admin-fixed-container { max-height: none !important; } }',
  })

  const buttons = await page.locator('form.word-form > .form-buttons').boundingBox()
  console.log(JSON.stringify({ buttons }, null, 2))
  expect(buttons.y + buttons.height).toBeGreaterThan(SHORT_DESKTOP.height)
})

test('на телефоне форма в одну колонку и кнопки доступны прокруткой страницы', async ({ page }) => {
  await openAdmin(page, MOBILE)

  expect((await gridColumns(page.locator('form.word-form > .form-fields'))).split(' ')).toHaveLength(1)

  await page.locator('form.word-form > .form-buttons').scrollIntoViewIfNeeded()
  const buttons = await page.locator('form.word-form > .form-buttons').boundingBox()
  expect(buttons.y).toBeGreaterThanOrEqual(-1)
  expect(buttons.y + buttons.height).toBeLessThanOrEqual(MOBILE.height + 1)

  await page.screenshot({ path: `${process.env.TEMP}/admin-buttons-mobile.png` })
})

