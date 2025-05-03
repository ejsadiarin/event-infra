import { browser } from 'k6/browser';
import { sleep, check } from 'k6';

// This will be overridden based on the phase
export let options = {
    scenarios: {
        ui: {
            executor: 'shared-iterations',
            options: {
                browser: {
                    type: 'chromium',
                },
            },
            vus: 5,
            duration: '3m',
        },
    },
};

export default async function () {
    const page = browser.newPage();

    try {
        // Measure page load time
        const navStart = Date.now();

        // Navigate to the app
        await page.goto('https://event.ejsadiarin.com');

        const loadTime = Date.now() - navStart;
        console.log(`Home page loaded in ${loadTime}ms`);

        check(page, {
            'Homepage loaded': () => page.url() === 'https://event.ejsadiarin.com/',
        });

        // Generate a unique username for this test
        const uniqueId = Math.floor(Math.random() * 1000000);
        const username = `ui_test_${uniqueId}`;
        const email = `ui_test_${uniqueId}@example.com`;
        const password = 'testpass123';

        // 30% of users will register, 70% will log in with test account
        if (Math.random() <= 0.3) {
            // Register flow
            await page.click('a[href="/register"]');

            // Fill out registration form
            await page.waitForSelector('input#username');
            await page.fill('input#username', username);
            await page.fill('input#email', email);
            await page.fill('input#password', password);
            await page.fill('input#confirmPassword', password);

            // Submit form
            await page.click('button[type="submit"]');

            // Wait for navigation to complete
            await page.waitForNavigation();

            check(page, {
                'Registration successful': () => page.url().includes('/dashboard'),
            });
        } else {
            // Login flow - using a known test account
            await page.click('a[href="/login"]');

            // Fill out login form
            await page.waitForSelector('input#username');
            await page.fill('input#username', 'testuser');
            await page.fill('input#password', 'password123');

            // Submit form
            await page.click('button[type="submit"]');

            // Wait for navigation to complete
            await page.waitForNavigation();

            check(page, {
                'Login successful': () => page.url().includes('/dashboard'),
            });
        }

        // Browse events
        await page.click('a[href="/events"]');
        await page.waitForSelector('div[class*="grid"]');

        // Check if we can see event cards
        const eventCards = page.locator('div[class*="card"]');
        const eventCount = await eventCards.count();

        check(null, {
            'Events page shows events': () => eventCount > 0,
        });

        // If there are events, click on one
        if (eventCount > 0) {
            // Click the first event
            await eventCards.first().click();

            // Wait for the event details page to load
            await page.waitForSelector('h1');

            // Check if we're on an event details page
            const pageTitle = await page.textContent('h1');
            check(null, {
                'Event details page loaded': () => pageTitle && pageTitle.length > 0,
            });

            // Check if register button exists and click it (50% chance)
            const registerButton = page.locator('button:text("Register for Event")');
            if (await registerButton.isVisible() && Math.random() <= 0.5) {
                await registerButton.click();

                // Wait a moment for registration to complete
                await page.waitForTimeout(2000);

                // Check if registration was successful
                const regConfirmation = page.locator('text=You are registered for this event');
                check(null, {
                    'Event registration successful': async () => await regConfirmation.isVisible(),
                });
            }
        }

        // View user dashboard
        await page.click('a[href="/dashboard"]');
        await page.waitForSelector('h1:text("Welcome")');

        check(page, {
            'Dashboard loaded': () => page.url().includes('/dashboard'),
        });

        // Log out (80% of the time)
        if (Math.random() <= 0.8) {
            // Click on user menu
            await page.click('button[class*="rounded-full"]');

            // Click logout in dropdown
            await page.click('div[role="menuitem"]:text("Logout")');

            // Wait for redirect to homepage
            await page.waitForNavigation();

            check(page, {
                'Logout successful': () => page.url() === 'https://event.ejsadiarin.com/',
            });
        }

        // Add random waiting time to simulate real user behavior
        sleep(Math.random() * 3 + 2);
    } finally {
        page.close();
    }
}
