import http from 'k6/http';
import { sleep, check } from 'k6';
import { SharedArray } from 'k6/data';

// Configuration for the test
export let options = {
    stages: [
        { duration: '2m', target: 100 }, // Ramp up to 100 users over 2 minutes
        { duration: '5m', target: 1000 }, // Ramp up to 1000 users over 5 minutes
        { duration: '10m', target: 5000 }, // Ramp up to 5000 users over 10 minutes
        { duration: '15m', target: 10000 }, // Ramp up to 10000 users over 15 minutes
        { duration: '20m', target: 20000 }, // Ramp up to 20000 users over 20 minutes
        { duration: '10m', target: 20000 }, // Stay at 20000 users for 10 minutes
        { duration: '5m', target: 0 }, // Ramp down to 0 users over 5 minutes
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% of requests should complete within 500ms
        http_req_failed: ['rate<0.01'], // Less than 1% of requests should fail
    },
};

// Create a set of pre-generated users for testing
const users = new SharedArray('users', function () {
    const data = [];
    for (let i = 0; i < 1000; i++) {
        data.push({
            username: `testuser${i}`,
            password: 'password123',
            email: `testuser${i}@example.com`
        });
    }
    return data;
});

// Main function that defines user behavior
export default function () {
    const baseUrl = 'https://event.ejsadiarin.com/api';

    // Select a random user
    const user = users[Math.floor(Math.random() * users.length)];

    // Common headers
    const headers = {
        'Content-Type': 'application/json',
    };

    // Step 1: Check health endpoint first
    let res = http.get(`${baseUrl}/health/live`);
    check(res, {
        'health check status is 200': (r) => r.status === 200,
    });

    // Step 2: Register or login
    // Randomly decide to register (10% of the time) or login (90% of the time)
    const authAction = Math.random() <= 0.1 ? 'register' : 'login';

    if (authAction === 'register') {
        res = http.post(`${baseUrl}/auth/register`, JSON.stringify(user), { headers });
    } else {
        res = http.post(`${baseUrl}/auth/login`, JSON.stringify({
            username: user.username,
            password: user.password
        }), { headers });
    }

    // Get token from login response
    if (res.status === 200 || res.status === 201) {
        const authData = JSON.parse(res.body);
        const token = authData.token;

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;

            // Step 3: Browse events (all users do this)
            res = http.get(`${baseUrl}/events`, { headers });
            check(res, {
                'get events status is 200': (r) => r.status === 200,
            });

            // Step 4: View event details (80% of users)
            if (Math.random() <= 0.8) {
                // Assume event ID 1 exists (you might want to get actual IDs from the previous response)
                const eventId = 1;
                res = http.get(`${baseUrl}/events/${eventId}/slots`, { headers });
                check(res, {
                    'get event slots status is 200': (r) => r.status === 200,
                });
            }

            // Step 5: Register for an event (30% of users)
            if (Math.random() <= 0.3) {
                const eventId = 1 + Math.floor(Math.random() * 3); // Random event ID 1-3
                res = http.post(`${baseUrl}/events/${eventId}/register`, JSON.stringify({}), { headers });
            }

            // Step 6: Check user registrations (60% of users)
            if (Math.random() <= 0.6) {
                res = http.get(`${baseUrl}/events/user/registrations`, { headers });
                check(res, {
                    'get user registrations status is 200': (r) => r.status === 200,
                });
            }

            // Step 7: Create a new event (5% of users)
            if (Math.random() <= 0.05) {
                const newEvent = {
                    title: `Test Event ${Date.now()}`,
                    description: 'This is a test event created by k6',
                    org_id: 1,
                    venue: 'Virtual',
                    schedule: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
                    is_free: true,
                    max_capacity: 100
                };

                res = http.post(`${baseUrl}/events`, JSON.stringify(newEvent), { headers });
            }
        }
    }

    // Add some think time between actions
    sleep(Math.random() * 3 + 1); // Random sleep between 1-4 seconds
}
