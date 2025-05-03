import { browser } from 'k6/browser';
import { sleep, check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics
const pageLoadTime = new Trend('ui_page_load_time');
const navigationTime = new Trend('ui_navigation_time');
const failedUserActions = new Counter('failed_ui_actions');

export let options = {
    scenarios: {
        ui_flow: {
            executor: 'ramping-vus',
            startVUs: 50,
            stages: [
                { duration: '1m', target: 200 },     // Ramp up to 200
                { duration: '3m', target: 500 },     // Ramp up to 500
                { duration: '5m', target: 1000 },    // Continue to 1000
                { duration: '5m', target: 1000 },    // Stay at 1000
                { duration: '3m', target: 0 },       // Ramp down
            ],
            gracefulRampDown: '30s',
        },
    },
    thresholds: {
        'ui_page_load_time': ['p(95)<4000'],       // 95% of page loads under 4s
        'ui_navigation_time': ['p(95)<2000'],      // 95% of navigations under 2s
        'failed_ui_actions': ['count<100'],        // Fewer than 100 failed actions
    },
};

export default async function () {
    const page = browser.newPage();

    try {
        // Measure initial page load time
        const startHomeLoad = Date.now();

        // Navigate to the app
        await page.goto('https://event.ejsadiarin.com/', { waitUntil: 'networkidle' });

        const homeLoadTime = Date.now() - startHomeLoad;
        pageLoadTime.add(homeLoadTime);

        check(page, {
            'Homepage loaded': () => page.url() === 'https://event.ejsadiarin.com/',
        }) || failedUserActions.add(1);

        // Login flow (with fixed test account for browser testing)
        const navStart = Date.now();
        await page.click('a[href="/login"]');
        await page.waitForSelector('input#username', { timeout: 5000 });
        navigationTime.add(Date.now() - navStart);

        // Fill login form
        await page.fill('input#username', 'testuser');
        await page.fill('input#password', 'password123');

        // Submit form and measure
        const loginStart = Date.now();
        await page.click('button[type="submit"]');

        try {
            // Wait for navigation to complete
            await page.waitForNavigation({ timeout: 10000 });
            navigationTime.add(Date.now() - loginStart);

            check(page, {
                'Login successful': () => page.url().includes('/dashboard'),
            }) || failedUserActions.add(1);

            // Browse events
            const browseStart = Date.now();
            await page.click('a[href="/events"]');
            await page.waitForSelector('div[class*="grid"]', { timeout: 7000 });
            navigationTime.add(Date.now() - browseStart);

            // Check if we can see event cards
            const eventCards = page.locator('div[class*="card"]');
            const eventCount = await eventCards.count();

            check(null, {
                'Events page shows events': () => eventCount > 0,
            }) || failedUserActions.add(1);

            // View details of an event if available
            if (eventCount > 0) {
                const detailsStart = Date.now();
                // Click the first event
                await eventCards.first().click();

                // Wait for event details page to load
                await page.waitForSelector('h1', { timeout: 7000 });
                navigationTime.add(Date.now() - detailsStart);

                // Check if we're on an event details page
                const pageTitle = await page.textContent('h1');

                check(null, {
                    'Event details page loaded': () => pageTitle && pageTitle.length > 0,
                }) || failedUserActions.add(1);

                // Check if register button exists and click it (33% chance)
                if (Math.random() <= 0.33) {
                    try {
                        const registerButton = page.locator('button:has-text("Register")');
                        if (await registerButton.isVisible()) {
                            await registerButton.click();

                            // Wait for registration to process
                            await page.waitForTimeout(2000);
                        }
                    } catch (e) {
                        // Ignore errors finding register button
                    }
                }

                // Go back to events list (50% chance)
                if (Math.random() <= 0.5) {
                    await page.goBack();
                    await page.waitForSelector('div[class*="grid"]', { timeout: 5000 });
                }
            }

            // View user dashboard
            const dashStart = Date.now();
            await page.click('a[href="/dashboard"]');
            await page.waitForSelector('h1:has-text("Welcome")', { timeout: 7000 });
            navigationTime.add(Date.now() - dashStart);

            check(page, {
                'Dashboard loaded': () => page.url().includes('/dashboard'),
            }) || failedUserActions.add(1);

            // Logout (80% chance)
            if (Math.random() <= 0.8) {
                try {
                    // Find and click user menu
                    const userMenuButton = page.locator('button[class*="rounded-full"]');
                    await userMenuButton.click();

                    // Find and click logout
                    const logoutButton = page.locator('div[role="menuitem"]:has-text("Logout")');
                    if (await logoutButton.isVisible()) {
                        await logoutButton.click();
                        await page.waitForNavigation({ timeout: 5000 });

                        check(page, {
                            'Logout successful': () => page.url() === 'https://event.ejsadiarin.com/',
                        }) || failedUserActions.add(1);
                    }
                } catch (e) {
                    console.log('Error during logout: ', e);
                    failedUserActions.add(1);
                }
            }
        } catch (e) {
            console.log('Navigation error: ', e);
            failedUserActions.add(1);
        }

        // Simulate user thinking
        sleep(Math.random() * 2 + 1);

    } catch (e) {
        console.log('Test error: ', e);
        failedUserActions.add(1);
    } finally {
        page.close();
    }
}
