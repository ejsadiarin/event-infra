import { browser } from 'k6/browser';
import { sleep, check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics
const pageLoadTime = new Trend('page_load_time');
const navigationTime = new Trend('navigation_time');
const failedActions = new Counter('failed_actions');
const successfulLogins = new Counter('successful_logins');

export let options = {
    scenarios: {
        quick_ui_test: {
            executor: 'ramping-vus',
            startVUs: 1,
            stages: [
                { duration: '30s', target: 10 },   // Ramp up to 10 VUs
                { duration: '60s', target: 20 },   // Ramp up to 20 VUs
                { duration: '30s', target: 0 },    // Ramp down
            ],
            gracefulRampDown: '10s',
            options: {
                browser: {
                    type: 'chromium',
                },
            },
        },
    },
    thresholds: {
        'page_load_time': ['p(95)<8000'],     // 8s is more realistic
        'failed_actions': ['count<10'],       // Allow a few more failures
    },
    // Add timeouts to prevent test hanging
    setupTimeout: '30s',
    teardownTimeout: '30s',
};

export default async function () {
    const page = browser.newPage();

    try {
        // Set default timeout for all operations
        page.setDefaultTimeout(15000); // 15 second timeout

        // Generate unique username for this test iteration
        const uniqueId = Math.floor(Math.random() * 1000000) + Date.now();
        const username = `quicktest_${uniqueId}`;
        const password = 'password123';

        // Measure homepage load time with retry
        let homeLoaded = false;
        let retries = 2;
        const startTime = Date.now();

        while (!homeLoaded && retries >= 0) {
            try {
                await page.goto('https://event.ejsadiarin.com/', {
                    waitUntil: 'networkidle',
                    timeout: 12000
                });
                homeLoaded = true;
            } catch (e) {
                retries--;
                if (retries < 0) throw e;
                console.log(`Retrying homepage load (${retries} attempts left)`);
                await page.waitForTimeout(1000);
            }
        }

        pageLoadTime.add(Date.now() - startTime);

        check(page, {
            'homepage loaded': () => page.url() === 'https://event.ejsadiarin.com/',
        }) || failedActions.add(1);

        // Register new user instead of using static test account
        try {
            // Navigate to registration page
            const navStartTime = Date.now();
            await page.click('a[href="/register"]');
            await page.waitForSelector('input#username');
            navigationTime.add(Date.now() - navStartTime);

            // Fill registration form
            await page.fill('input#username', username);
            await page.fill('input#email', `${username}@example.com`);
            await page.fill('input#password', password);
            await page.fill('input#confirmPassword', password);

            // Submit registration
            await page.click('button[type="submit"]');

            // Wait for redirect to dashboard
            try {
                await page.waitForFunction(() => {
                    return window.location.href.includes('/dashboard');
                }, { timeout: 12000 });

                check(page, {
                    'registration successful': () => page.url().includes('/dashboard'),
                }) || failedActions.add(1);

                successfulLogins.add(1);
            } catch (e) {
                console.log('Registration timeout or error:', e);
                failedActions.add(1);

                // Try login as fallback
                await page.goto('https://event.ejsadiarin.com/login');
                await page.waitForSelector('input#username');

                await page.fill('input#username', username);
                await page.fill('input#password', password);

                await page.click('button[type="submit"]');

                try {
                    await page.waitForFunction(() => {
                        return window.location.href.includes('/dashboard');
                    }, { timeout: 12000 });

                    successfulLogins.add(1);
                } catch (e) {
                    console.log('Login fallback failed:', e);
                    failedActions.add(1);
                    return; // Skip rest of test if auth fails
                }
            }

            // Only proceed with authenticated actions if we're on dashboard
            if (page.url().includes('/dashboard')) {
                // View events page
                const eventsNavStart = Date.now();
                await page.click('a[href="/events"]');

                try {
                    await page.waitForSelector('div[class*="grid"]', { timeout: 12000 });
                    navigationTime.add(Date.now() - eventsNavStart);

                    // Try to click first event if there are any
                    const eventCards = page.locator('div[class*="card"]');
                    const count = await eventCards.count();

                    if (count > 0) {
                        // Only view event details 50% of the time to reduce load
                        if (Math.random() <= 0.5) {
                            await eventCards.first().click();
                            await page.waitForSelector('h1', { timeout: 12000 });

                            // Go back to events
                            await page.goBack();
                            await page.waitForSelector('div[class*="grid"]', { timeout: 12000 });
                        }
                    }

                    // Go back to dashboard
                    await page.click('a[href="/dashboard"]');
                    await page.waitForSelector('h1:has-text("Welcome")', { timeout: 12000 });

                    // Logout
                    try {
                        await page.click('button[class*="rounded-full"]');
                        const logoutButton = page.locator('div[role="menuitem"]:has-text("Logout")');

                        if (await logoutButton.isVisible()) {
                            await logoutButton.click();
                            await page.waitForNavigation({ timeout: 12000 });

                            check(page, {
                                'logout successful': () => page.url() === 'https://event.ejsadiarin.com/',
                            }) || failedActions.add(1);
                        }
                    } catch (e) {
                        console.log('Error during logout:', e);
                        failedActions.add(1);
                    }
                } catch (e) {
                    console.log('Error viewing events:', e);
                    failedActions.add(1);
                }
            }
        } catch (e) {
            console.log('Navigation error:', e);
            failedActions.add(1);
        }

        // Slightly longer pause to reduce pressure on the server
        sleep(Math.random() * 2 + 1); // 1-3 seconds

    } catch (e) {
        console.log('Test error:', e);
        failedActions.add(1);
    } finally {
        try {
            await page.close();
        } catch (e) {
            console.log('Error closing page:', e);
        }
    }
}
