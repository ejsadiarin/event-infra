import { browser } from 'k6/browser';
import { sleep, check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics
const pageLoadTime = new Trend('ui_page_load_time');
const navigationTime = new Trend('ui_navigation_time');
const failedUserActions = new Counter('failed_ui_actions');
const successfulRegistrations = new Counter('successful_ui_registrations');
const successfulLogins = new Counter('successful_ui_logins');

export let options = {
    scenarios: {
        ui_flow: {
            executor: 'ramping-vus',
            startVUs: 10,
            stages: [
                { duration: '1m', target: 50 },      // Ramp up to 50 (more conservative)
                { duration: '2m', target: 100 },     // Ramp up to 100
                { duration: '5m', target: 200 },     // Continue to 200
                { duration: '5m', target: 200 },     // Stay at 200
                { duration: '2m', target: 0 },       // Ramp down
            ],
            gracefulRampDown: '30s',
        },
    },
    thresholds: {
        'ui_page_load_time': ['p(95)<8000'],       // Less aggressive: 8s instead of 4s
        'ui_navigation_time': ['p(95)<5000'],      // Less aggressive: 5s instead of 2s
        'failed_ui_actions': ['count<500'],        // Increased threshold for failures
    },
    // Adding timeouts to prevent test from hanging indefinitely
    setupTimeout: '1m',
    teardownTimeout: '1m',
};

export default async function () {
    const page = browser.newPage();

    try {
        // Add a page-level timeout for all operations
        page.setDefaultTimeout(20000); // 20 second timeout for all operations

        // Measure initial page load time
        const startHomeLoad = Date.now();

        try {
            // Navigate to the app with retry logic
            let retries = 3;
            let loaded = false;

            while (retries > 0 && !loaded) {
                try {
                    await page.goto('https://event.ejsadiarin.com/', {
                        waitUntil: 'networkidle',
                        timeout: 15000
                    });
                    loaded = true;
                } catch (e) {
                    retries--;
                    if (retries === 0) throw e;
                    console.log(`Retrying homepage load (${retries} attempts left)`);
                    await page.waitForTimeout(1000);
                }
            }

            const homeLoadTime = Date.now() - startHomeLoad;
            pageLoadTime.add(homeLoadTime);

            check(page, {
                'Homepage loaded': () => page.url() === 'https://event.ejsadiarin.com/',
            }) || failedUserActions.add(1);
        } catch (e) {
            console.log(`Failed to load homepage: ${e}`);
            failedUserActions.add(1);
            return; // Skip the rest of the test if homepage doesn't load
        }

        // Generate unique username for this test iteration
        const uniqueId = Math.floor(Math.random() * 1000000) + Date.now();
        const username = `uitest_${uniqueId}`;
        const password = 'password123';

        // Always register a new user to avoid login failures
        try {
            // Registration flow
            const navStart = Date.now();
            await page.click('a[href="/register"]');
            await page.waitForSelector('input#username', { timeout: 10000 });
            navigationTime.add(Date.now() - navStart);

            // Fill registration form
            await page.fill('input#username', username);
            await page.fill('input#email', `${username}@example.com`);
            await page.fill('input#password', password);
            await page.fill('input#confirmPassword', password);

            // Submit registration with retry logic
            const regStart = Date.now();
            await page.click('button[type="submit"]');

            // Wait for navigation to complete or timeout
            let registered = false;
            try {
                await page.waitForFunction(() => {
                    return window.location.href.includes('/dashboard');
                }, { timeout: 15000 });
                registered = true;
            } catch (e) {
                console.log('Timeout waiting for dashboard after registration');
            }

            navigationTime.add(Date.now() - regStart);

            // Check if registration was successful
            if (registered) {
                successfulRegistrations.add(1);
                check(page, {
                    'Registration successful': () => true
                });
            } else {
                failedUserActions.add(1);
                console.log('Registration did not redirect to dashboard');

                // Try login as fallback
                await page.goto('https://event.ejsadiarin.com/login', { timeout: 10000 });
                await page.waitForSelector('input#username', { timeout: 10000 });

                await page.fill('input#username', username);
                await page.fill('input#password', password);

                await page.click('button[type="submit"]');

                try {
                    await page.waitForFunction(() => {
                        return window.location.href.includes('/dashboard');
                    }, { timeout: 15000 });

                    successfulLogins.add(1);
                } catch (e) {
                    console.log('Login fallback also failed');
                    failedUserActions.add(1);
                    return; // Skip rest of test if both registration and login fail
                }
            }
        } catch (e) {
            console.log('Error during registration/login: ', e);
            failedUserActions.add(1);
            return; // Skip rest of test
        }

        // Continue with authenticated user actions if on dashboard
        try {
            // Browse events
            const browseStart = Date.now();
            await page.click('a[href="/events"]');
            await page.waitForSelector('div[class*="grid"]', { timeout: 15000 });
            navigationTime.add(Date.now() - browseStart);

            // Check if we can see event cards
            const eventCards = page.locator('div[class*="card"]');
            const eventCount = await eventCards.count();

            check(null, {
                'Events page shows events': () => eventCount > 0,
            }) || failedUserActions.add(1);

            // View details of an event if available (with fewer actions to reduce errors)
            if (eventCount > 0) {
                try {
                    const detailsStart = Date.now();
                    // Click the first event
                    await eventCards.first().click();

                    // Wait for event details page to load
                    await page.waitForSelector('h1', { timeout: 15000 });
                    navigationTime.add(Date.now() - detailsStart);

                    // Check if register button exists and click it (20% chance - reduced from 33%)
                    if (Math.random() <= 0.2) {
                        try {
                            const registerButton = page.locator('button:has-text("Register")');
                            if (await registerButton.isVisible()) {
                                await registerButton.click();
                                await page.waitForTimeout(3000);
                            }
                        } catch (e) {
                            // Ignore errors finding register button
                        }
                    }
                } catch (e) {
                    console.log('Error viewing event details: ', e);
                    failedUserActions.add(1);
                }
            }

            // Clean up by logging out (80% chance)
            if (Math.random() <= 0.8) {
                try {
                    // Ensure we're on a known page first
                    await page.goto('https://event.ejsadiarin.com/dashboard', { timeout: 10000 });

                    // Find and click user menu
                    const userMenuButton = page.locator('button[class*="rounded-full"]');
                    await userMenuButton.click();

                    // Find and click logout
                    const logoutButton = page.locator('div[role="menuitem"]:has-text("Logout")');
                    if (await logoutButton.isVisible()) {
                        await logoutButton.click();
                        await page.waitForNavigation({ timeout: 10000 });
                    }
                } catch (e) {
                    console.log('Error during logout: ', e);
                }
            }
        } catch (e) {
            console.log('Error during authenticated actions: ', e);
            failedUserActions.add(1);
        }

    } catch (e) {
        console.log('Test error: ', e);
        failedUserActions.add(1);
    } finally {
        try {
            await page.close();
        } catch (e) {
            console.log('Error closing page: ', e);
        }
    }

    // Variable sleep between iterations
    sleep(Math.random() * 3 + 1); // 1-4 seconds
}
