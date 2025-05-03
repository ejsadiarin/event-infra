import http from 'k6/http';
import { sleep, check, group } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const failedRequests = new Counter('failed_requests');
const successfulLogins = new Counter('successful_logins');
const eventRegistrations = new Counter('event_registrations');
const apiLatency = new Trend('api_latency');

// Define test configuration - values will be overridden by env vars
export let options = {
    stages: [
        // Will be overridden
        { duration: '30s', target: 10 },
        { duration: '1m', target: 10 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% of requests should complete within 500ms
        'http_req_duration{name:loginRequest}': ['p(95)<600'],
        'http_req_duration{name:getEvents}': ['p(95)<400'],
        'http_req_duration{name:registerEvent}': ['p(95)<800'],
        failed_requests: ['count<100'],
    },
};

// Pregenerate test users
const users = new SharedArray('users', function () {
    const data = [];
    for (let i = 0; i < 1000; i++) {
        data.push({
            username: `loadtest${i}`,
            password: 'testpassword',
            email: `loadtest${i}@example.com`
        });
    }
    return data;
});

// API base URL
const baseUrl = 'https://event.ejsadiarin.com/api';

export default function () {
    // Select a random user from our pre-generated array
    const user = users[Math.floor(Math.random() * users.length)];
    const headers = { 'Content-Type': 'application/json' };
    let authToken = null;

    group('health_check', function () {
        // Health check endpoint
        const res = http.get(`${baseUrl}/health/live`);
        check(res, {
            'health endpoint is up': (r) => r.status === 200,
        });
        apiLatency.add(res.timings.duration);
    });

    group('user_authentication', function () {
        // 90% of users will login, 10% will register new accounts
        const shouldRegister = Math.random() <= 0.1;

        if (shouldRegister) {
            // Register a new user
            const randomSuffix = Math.floor(Math.random() * 100000);
            const registerRes = http.post(`${baseUrl}/auth/register`,
                JSON.stringify({
                    username: `loadtest_${randomSuffix}`,
                    password: 'testpassword',
                    email: `loadtest_${randomSuffix}@example.com`
                }),
                { headers: headers, tags: { name: 'registerRequest' } }
            );

            check(registerRes, {
                'registration successful': (r) => r.status === 201,
            }) || failedRequests.add(1);

            // Login with the newly registered account
            const loginRes = http.post(`${baseUrl}/auth/login`,
                JSON.stringify({
                    username: `loadtest_${randomSuffix}`,
                    password: 'testpassword'
                }),
                { headers: headers, tags: { name: 'loginRequest' } }
            );

            check(loginRes, {
                'login after registration successful': (r) => r.status === 200 && JSON.parse(r.body).token,
            }) || failedRequests.add(1);

            if (loginRes.status === 200) {
                successfulLogins.add(1);
                const loginData = JSON.parse(loginRes.body);
                authToken = loginData.token;
            }
        } else {
            // Login with existing user
            const loginRes = http.post(`${baseUrl}/auth/login`,
                JSON.stringify({
                    username: user.username,
                    password: user.password
                }),
                { headers: headers, tags: { name: 'loginRequest' } }
            );

            check(loginRes, {
                'login successful': (r) => r.status === 200 && JSON.parse(r.body).token,
            }) || failedRequests.add(1);

            if (loginRes.status === 200) {
                successfulLogins.add(1);
                const loginData = JSON.parse(loginRes.body);
                authToken = loginData.token;
            }
        }
    });

    // If we have an auth token, perform authenticated actions
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;

        group('browse_events', function () {
            // Get all events
            const eventsRes = http.get(`${baseUrl}/events`,
                { headers: headers, tags: { name: 'getEvents' } }
            );

            check(eventsRes, {
                'get events successful': (r) => r.status === 200,
            }) || failedRequests.add(1);

            apiLatency.add(eventsRes.timings.duration);

            // Parse available events
            let events = [];
            if (eventsRes.status === 200) {
                events = JSON.parse(eventsRes.body);
            }

            // Browse event details - we'll do this for a random event if we have any
            if (events.length > 0) {
                const randomEvent = events[Math.floor(Math.random() * events.length)];

                const eventDetailsRes = http.get(`${baseUrl}/events/${randomEvent.id}/slots`,
                    { headers: headers, tags: { name: 'getEventDetails' } }
                );

                check(eventDetailsRes, {
                    'get event details successful': (r) => r.status === 200,
                }) || failedRequests.add(1);

                apiLatency.add(eventDetailsRes.timings.duration);

                // Check registration status for this event
                const regStatusRes = http.get(`${baseUrl}/events/${randomEvent.id}/check-registration`,
                    { headers: headers, tags: { name: 'checkRegistration' } }
                );

                const isRegistered = regStatusRes.status === 200 &&
                    JSON.parse(regStatusRes.body).isRegistered === true;

                // 30% chance to register for this event if not already registered
                if (!isRegistered && Math.random() <= 0.3) {
                    const registerRes = http.post(`${baseUrl}/events/${randomEvent.id}/register`,
                        JSON.stringify({}),
                        { headers: headers, tags: { name: 'registerEvent' } }
                    );

                    check(registerRes, {
                        'event registration successful': (r) => r.status === 200,
                    }) || failedRequests.add(1);

                    if (registerRes.status === 200) {
                        eventRegistrations.add(1);
                    }

                    apiLatency.add(registerRes.timings.duration);
                }
            }

            // View user registrations
            const userRegsRes = http.get(`${baseUrl}/events/user/registrations`,
                { headers: headers, tags: { name: 'getUserRegistrations' } }
            );

            check(userRegsRes, {
                'get user registrations successful': (r) => r.status === 200,
            }) || failedRequests.add(1);
        });

        // Less frequent action: create a new event (5% of users)
        if (Math.random() <= 0.05) {
            group('create_event', function () {
                // First, get organizations to select one
                const orgsRes = http.get(`${baseUrl}/organizations`,
                    { headers: headers, tags: { name: 'getOrganizations' } }
                );

                let orgId = 1; // Default fallback
                if (orgsRes.status === 200) {
                    const orgs = JSON.parse(orgsRes.body);
                    if (orgs.length > 0) {
                        orgId = orgs[Math.floor(Math.random() * orgs.length)].id;
                    }
                }

                // Create a new event
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + 30); // 30 days in the future

                const createEventRes = http.post(`${baseUrl}/events`,
                    JSON.stringify({
                        title: `Load Test Event ${Date.now()}`,
                        description: 'This is an event created by the load test',
                        org_id: orgId,
                        venue: 'Test Venue',
                        schedule: futureDate.toISOString(),
                        is_free: true,
                        max_capacity: 100
                    }),
                    { headers: headers, tags: { name: 'createEvent' } }
                );

                check(createEventRes, {
                    'create event successful': (r) => r.status === 201,
                }) || failedRequests.add(1);
            });
        }
    }

    // Sleep between 1-5 seconds to simulate realistic user behavior
    sleep(Math.random() * 4 + 1);
}
