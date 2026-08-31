import { test, expect, type Page } from '@playwright/test'

/**
 * Required check 10: one important connected UI journey.
 *
 * Follows a single piece of work through all three interfaces and both
 * hand-offs, because that is what the brief is actually testing — a collection
 * of screens that each work in isolation would pass every other check and
 * still fail this one.
 *
 *   client   enquires
 *   manager  approves, drafts, issues
 *   client   accepts, which activates the campaign
 *   manager  schedules field work
 *   fitter   travels, arrives, completes with proof
 *   manager  sees the completed job and the proof
 *   client   sees a safe summary and the same proof
 *
 * Runs serially against one seeded database; the first test resets it.
 */
test.describe.configure({ mode: 'serial' })

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Switch the prototype session. Stands in for signing in as someone else. */
async function signInAs(page: Page, userId: string) {
  const response = await page.request.post('/api/session', { data: { userId } })
  expect(response.ok(), `could not switch to ${userId}`).toBe(true)
}

let requestId: string
let contractId: string

test.describe('a campaign from enquiry to proof of installation', () => {
  test('resets to the seeded fixtures', async ({ page }) => {
    // Reset is a manager action, so the journey starts by becoming one.
    await signInAs(page, 'user-manager-01')
    const response = await page.request.post('/api/dev/reset')
    expect(response.ok()).toBe(true)
  })

  test('a client enquires about media for their dates', async ({ page }) => {
    await signInAs(page, 'user-client-silverline')

    await page.goto('/products/product-hub-door?startDate=2027-07-01&endDate=2027-10-01')
    await expect(page.getByRole('heading', { name: 'Hub door panels' })).toBeVisible()

    await page.getByLabel('What is the campaign for?').fill('Autumn membership drive')
    await page.getByRole('button', { name: 'Send a non-binding enquiry' }).click()

    // The portal must never imply the enquiry is agreed.
    await expect(page.getByText('Enquiry sent')).toBeVisible()
    await expect(page.getByText(/Nothing is booked or reserved yet/)).toBeVisible()

    await page.goto('/portal')
    await expect(page.getByText('An enquiry is not a booking')).toBeVisible()
  })

  test('the enquiry reaches the manager dashboard', async ({ page }) => {
    await signInAs(page, 'user-manager-01')

    await page.goto('/manage')
    const card = page.locator('li', { hasText: 'Silverline Fitness' }).filter({
      hasText: 'Hub door panels',
    })
    await expect(card).toBeVisible()

    await card.getByRole('link', { name: 'Review' }).click()
    await page.waitForURL(/\/manage\/requests\//)
    requestId = page.url().split('/').pop() as string
  })

  test('approval is refused when nothing is free, and refused safely', async ({ page }) => {
    await signInAs(page, 'user-manager-01')

    // The seeded request-001 asks for three bus panels that are all blocked.
    await page.goto('/manage/requests/request-001')
    await page.getByRole('button', { name: 'Approve request' }).click()

    await expect(page.getByText(/is not available for/)).toBeVisible()
    await expect(page.getByText(/has a confirmed booking for these dates/).first()).toBeVisible()
    await expect(page.getByText(/has a confirmed outage for these dates/)).toBeVisible()

    // Nothing may be half-applied by a refused approval.
    await page.reload()
    await expect(page.getByText('submitted').first()).toBeVisible()
  })

  test('the manager approves, drafts and issues a contract', async ({ page }) => {
    await signInAs(page, 'user-manager-01')
    await page.goto(`/manage/requests/${requestId}`)

    await page.selectOption('select[name="assetId"]', { index: 1 })
    await page.getByRole('button', { name: 'Approve request' }).click()

    await expect(page.getByRole('button', { name: 'Create draft contract' })).toBeVisible()
    await page.selectOption('select[name="assetId"]', { index: 1 })
    await page.getByRole('button', { name: 'Create draft contract' }).click()

    // A draft is internal: the client must not see it yet.
    await expect(page.getByText('Draft contract created')).toBeVisible()
    await expect(page.getByText('Not visible to the client yet')).toBeVisible()

    contractId = (await page
      .getByRole('link', { name: 'Open the contract →' })
      .getAttribute('href'))!.split('/')
      .pop() as string

    await page.getByRole('button', { name: 'Issue contract to client' }).click()
    await expect(page.getByText('Contract issued')).toBeVisible()

    // Revisiting must not offer a second contract for the same request.
    await page.reload()
    await expect(page.getByRole('button', { name: 'Create draft contract' })).toHaveCount(0)
  })

  test('the client sees the issued contract and accepts it', async ({ page }) => {
    await signInAs(page, 'user-client-silverline')

    await page.goto('/portal')
    await expect(page.getByText('Contract ready to review')).toBeVisible()

    await page.getByRole('link', { name: 'Review contract' }).click()
    await page.waitForURL(/\/portal\/contracts\//)

    await page.getByRole('button', { name: 'Accept this contract' }).click()
    await expect(page.getByText('Nothing to decide')).toBeVisible()
    await expect(page.getByText('Your advertising contract has been accepted.')).toBeVisible()
  })

  test('the manager schedules field work against the campaign', async ({ page }) => {
    await signInAs(page, 'user-manager-01')
    await page.goto('/manage/work-orders')

    // selectOption matches a label exactly, so resolve the campaign the
    // previous step created by its option text first.
    const campaignValue = await page
      .locator('select[name="campaignId"] option', { hasText: 'Silverline Fitness' })
      .first()
      .getAttribute('value')
    await page.selectOption('select[name="campaignId"]', campaignValue as string)
    await page.fill('input[name="locationLabel"]', 'Central hub, door B')
    await page.fill('textarea[name="instructions"]', 'Fit the printed panels and photograph them.')
    await page.fill('textarea[name="internalNotes"]', 'Key held by the hub duty manager.')
    await page.getByRole('button', { name: 'Create and assign' }).click()

    await expect(page.getByText('Job created and assigned')).toBeVisible()
  })

  test('the job appears on the fitter phone and is completed with proof', async ({ page }) => {
    await signInAs(page, 'user-fitter-01')
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto('/field')
    const job = page.locator('li', { hasText: 'Central hub, door B' })
    await expect(job).toBeVisible()
    await job.getByRole('link').click()

    // Contact-safe instructions are shown, and so are the office notes, which
    // the assigned fitter is allowed to read.
    await expect(page.getByText('Fit the printed panels and photograph them.')).toBeVisible()
    await expect(page.getByText('Key held by the hub duty manager.')).toBeVisible()

    await page.getByRole('button', { name: 'Start travelling' }).click()
    await page.getByRole('button', { name: "I've arrived on site" }).click()
    await page.getByRole('button', { name: 'Finish this job' }).click()

    // Completion is refused until proof exists.
    await expect(page.getByRole('button', { name: 'Mark job complete' })).toBeDisabled()

    await page.setInputFiles('input[type="file"]', {
      name: 'hub-door-b.png',
      mimeType: 'image/png',
      buffer: PNG,
    })
    await expect(page.getByRole('button', { name: 'Mark job complete' })).toBeEnabled()

    await page.getByLabel('What did you do?').fill('Panels fitted and photographed.')
    await page.getByRole('button', { name: 'Mark job complete' }).click()
    await expect(page.getByText('Job completed')).toBeVisible()
  })

  test('management sees the completed job and its proof', async ({ page }) => {
    await signInAs(page, 'user-manager-01')
    await page.goto('/manage/work-orders')

    const job = page.locator('li', { hasText: 'Central hub, door B' })
    await expect(job.getByText('completed')).toBeVisible()
    await expect(job.getByText('Panels fitted and photographed.')).toBeVisible()
    await expect(job.getByRole('link', { name: 'hub-door-b.png' })).toBeVisible()
  })

  test('the client sees a safe summary and the same proof', async ({ page }) => {
    await signInAs(page, 'user-client-silverline')
    await page.goto(`/portal/contracts/${contractId}`)

    await expect(
      page.getByText('Your advertising has been installed and photographed.'),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: /hub-door-b.png/ })).toBeVisible()

    // The internal note and the fitter's own wording never reach the client.
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('Key held by the hub duty manager')
    expect(body).not.toContain('Panels fitted and photographed')
  })

  test('another organisation cannot reach that contract or its proof', async ({ page }) => {
    await signInAs(page, 'user-client-silverline')
    await page.goto(`/portal/contracts/${contractId}`)
    const proofHref = (await page
      .locator('a[href^="/api/proof/"]')
      .first()
      .getAttribute('href')) as string

    await signInAs(page, 'user-client-lighthouse')

    const contract = await page.request.get(`/api/client/contracts/${contractId}`)
    expect(contract.status(), 'cross-tenant contract read').toBe(404)

    const proof = await page.request.get(proofHref)
    expect(proof.status(), 'cross-tenant proof read').toBe(404)
  })
})
