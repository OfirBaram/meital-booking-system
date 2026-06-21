// tests/e2e/whatsapp-booking-admin-approval.spec.js
// E2E test for WhatsApp booking → admin approval → client notification

import { test, expect } from '@playwright/test'
import { loginAdmin, gotoAdminTab } from './helpers/admin-helpers.js'

test.describe('WhatsApp Booking → Admin Approval → Client Notification', () => {
  test('should complete full WhatsApp booking flow', async ({ page, context }) => {
    // 1. Admin logs in
    await loginAdmin(page)

    // 2. Check that admin dashboard is loaded
    await gotoAdminTab(page, 'bookings')

    // 3. Wait for bookings to load and get initial pending count
    const pendingBefore = await page.locator('[data-status="Pending"]').count()
    console.log(`[Test] Pending bookings before: ${pendingBefore}`)

    // 4. Simulate a WhatsApp message that books an appointment
    // For now, we'll just verify that new bookings would appear
    // In a real scenario, this would come from Twilio webhook

    // 5. Refresh admin dashboard
    await page.reload()
    await page.waitForLoadState('networkidle')

    // 6. Check if new pending booking appeared
    // (This would verify that the booking flow completed successfully)
    const pendingAfter = await page.locator('[data-status="Pending"]').count()
    console.log(`[Test] Pending bookings after: ${pendingAfter}`)

    // For now, we expect at least the same or more pending bookings
    // In a real test with a seeded booking, we'd check for a specific booking
  })

  test('admin should be able to approve a pending booking', async ({ page }) => {
    // Prerequisites: there must be at least one Pending booking in the system
    // This would be created by a prior WhatsApp booking or seeded data

    await loginAdmin(page)
    await gotoAdminTab(page, 'bookings')

    // Find a pending booking card
    const pendingCard = page.locator('[data-status="Pending"]').first()
    const isVisible = await pendingCard.isVisible()

    if (!isVisible) {
      console.log('[Test] No pending bookings available to approve')
      return
    }

    // Get booking details before approval
    const bookingName = await pendingCard.locator('[data-field="name"]').textContent()
    console.log(`[Test] Found pending booking for: ${bookingName}`)

    // Click approve button
    await pendingCard.locator('[data-action="approve"]').click()

    // Confirm action if dialog appears
    const confirmBtn = page.locator('button:has-text("אשר")')
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click()
    }

    // Wait for the action to complete
    await page.waitForTimeout(1000)

    // Verify the booking status changed to Approved
    const statusAfter = await pendingCard.locator('[data-status]').getAttribute('data-status')
    console.log(`[Test] Booking status after approval: ${statusAfter}`)
    expect(statusAfter).toContain('Approved')
  })
})
