import { browser } from 'k6/browser';
import { sleep, check } from 'k6';

export let options = {
    scenarios: {
        ui: {
            executor: 'shared-iterations',
            options: {
                browser: {
                    type: 'chromium',
                },
            },
            vus: 10, // Browser testing is more resource intensive
            duration: '5m',
        },
    },
};

export default async function () {
    const page = browser.newPage();

    try {
        // Navigate to the app
        await page.goto('https://event.ejsadiarin.com');

        // Login
        await page.click('a[href="/login"]');
        await page.fill('input#username', 'testuser');
        await page.fill('input#password', 'password123');
        await page.click('button[type="submit"]');

        // Wait for login to complete
        await page.waitForNavigation();

        // Browse events
        await page.click('a[href="/events"]');
        await page.waitForSelector('.event-card');

        // View an event
        await page.click('.event-card:first-child a');

        // Check if register button exists and click it
        const registerButton = page.locator('button:text("Register for Event")');
        if (await registerButton.isVisible()) {
            await registerButton.click();
        }

        sleep(2);
    } finally {
        page.close();
    }
}
