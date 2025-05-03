import http from 'k6/http';
import { sleep, check, group } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics for detailed analysis
const failedRequests = new Counter('failed_requests');
const successfulLogins = new Counter('successful_logins');
const successfulRegistrations = new Counter('successful_registrations');
const eventRegistrations = new Counter('event_registrations');
const apiLatency = new Trend('api_latency');

// Define test configuration to handle high load
export let options = {
    stages: [
        { duration: '2m', target: 1000 },    // Ramp up to 1000 users
        { duration: '5m', target: 5000 },    // Ramp up to 5000 users
        { duration: '5m', target: 10000 },   // Ramp up to 10000 users
        { duration: '5m', target: 20000 },   // Ramp up to 20000 users
        { duration: '10m', target: 20000 },  // Stay at 20000 users
        { duration: '5m', target: 0 },       // Ramp down to 0
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'],        // 95% of requests under 500ms
        'http_req_duration{name:loginRequest}': ['p(95)<600'],
        'http_req_duration{name:getEvents}': ['p(95)<400'],
        'http_req_duration{name:registerEvent}': ['p(95)<800'],
        failed_requests: ['count<1000'],         // Limit total failures
    },
    // Limit parallelism to avoid overwhelming the test machine
    batch: 500,  // Send requests in batches for browser engines
};

// Pre-generate test users for faster execution
const users = new SharedArray('users', function () {
    const data = [];
    for (let i = 0; i < 2000; i++) {
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
        // 95% of users will login with existing accounts, 5% will register new accounts
        const shouldRegister = Math.random() <= 0.05;

        if (shouldRegister) {
            // Register a new user with timestamp for uniqueness
            const randomSuffix = Math.floor(Math.random() * 1000000) + Date.now();
            const username = `loadtest_${randomSuffix}`;
            const password = 'testpassword';

            const registerRes = http.post(`${baseUrl}/auth/register`,
                JSON.stringify({
                    username: username,
                    password: password,
                    email: `${username}@example.com`
                }),
                { headers: headers, tags: { name: 'registerRequest' } }
            );

            const registerSuccess = check(registerRes, {
                'registration successful': (r) => r.status === 201,
            });

            if (registerSuccess) {
                successfulRegistrations.add(1);

                // After successful registration, we're typically already logged in
                // or we can proceed to login with these credentials
                const loginRes = http.post(`${baseUrl}/auth/login`,
                    JSON.stringify({
                        username: username,
                        password: password
                    }),
                    { headers: headers, tags: { name: 'loginRequest' } }
                );

                check(loginRes, {
                    'login with new account successful': (r) => r.status === 200 && JSON.parse(r.body).token,
                }) || failedRequests.add(1);

                if (loginRes.status === 200) {
                    successfulLogins.add(1);
                    const loginData = JSON.parse(loginRes.body);
                    authToken = loginData.token;
                }
            } else {
                failedRequests.add(1);
            }
        } else {
            // Login with existing user from pre-generated pool
            const user = users[Math.floor(Math.random() * users.length)];

            const loginRes = http.post(`${baseUrl}/auth/login`,
                JSON.stringify({
                    username: user.username,
                    password: user.password
                }),
                { headers: headers, tags: { name: 'loginRequest' } }
            );

            check(loginRes, {
                'login with existing account successful': (r) => r.status === 200 && JSON.parse(r.body).token,
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
                try {
                    events = JSON.parse(eventsRes.body);
                } catch (e) {
                    // Handle potential JSON parse errors gracefully
                    console.log('Failed to parse events JSON');
                }
            }

            // Browse event details if we have events
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

                let isRegistered = false;
                try {
                    isRegistered = regStatusRes.status === 200 &&
                        JSON.parse(regStatusRes.body).isRegistered === true;
                } catch (e) {
                    // Handle potential JSON parse errors
                }

                // 20% chance to register for event if not already registered
                if (!isRegistered && Math.random() <= 0.2) {
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

            // View user registrations (70% of users)
            if (Math.random() <= 0.7) {
                const userRegsRes = http.get(`${baseUrl}/events/user/registrations`,
                    { headers: headers, tags: { name: 'getUserRegistrations' } }
                );

                check(userRegsRes, {
                    'get user registrations successful': (r) => r.status === 200,
                }) || failedRequests.add(1);
            }
        });

        // Reduced probability for create events (1% of users)
        if (Math.random() <= 0.01) {
            group('create_event', function () {
                // Create with org_id 1 to simplify
                const orgId = 1;

                // Create a new event
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + 30);

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

    // Variable sleep to simulate realistic user behavior
    sleep(Math.random() * 3 + 0.5); // 0.5-3.5 seconds
}
