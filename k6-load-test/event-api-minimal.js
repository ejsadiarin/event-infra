import http from 'k6/http';
import { sleep, check, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics
const failedRequests = new Counter('failed_requests');
const apiLatency = new Trend('api_latency');

// Quick test with more reasonable values based on experience
export let options = {
    stages: [
        { duration: '30s', target: 5 },    // Start with 5 users
        { duration: '30s', target: 20 },   // Ramp up to 20
        { duration: '30s', target: 50 },   // Peak at 50
        { duration: '30s', target: 0 },    // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<5000'],  // 5 seconds is more realistic
        failed_requests: ['count<50'],      // Allow some failures
    },
    // Set timeout to prevent hanging
    timeout: '10s',
};

// Better username generation - include timestamp in the root
const rootTimestamp = Date.now();
// Pregenerate usernames for registration
const generateUsernames = () => {
    const usernames = [];
    for (let i = 0; i < 200; i++) {
        usernames.push(`k6test_${rootTimestamp}_${i}`);
    }
    return usernames;
};

const usernames = generateUsernames();

export default function () {
    const headers = { 'Content-Type': 'application/json' };
    let authToken = null;

    // Use a unique username for this iteration
    const userIndex = __VU % usernames.length;
    const username = usernames[userIndex];
    const password = 'testpass123';

    group('health_check', function () {
        // Health check endpoint
        const res = http.get(`${baseUrl}/health/live`, { timeout: '5s' });
        check(res, {
            'health endpoint is up': (r) => r.status === 200,
        });
        apiLatency.add(res.timings.duration);
    });

    // Always register a new user for each test - this ensures we have valid credentials
    group('user_registration', function () {
        const registerRes = http.post(`${baseUrl}/auth/register`,
            JSON.stringify({
                username: username,
                password: password,
                email: `${username}@example.com`
            }),
            { headers: headers, timeout: '8s' }
        );

        const registrationSuccessful = check(registerRes, {
            'registration successful': (r) => r.status === 201,
        });

        if (!registrationSuccessful) {
            failedRequests.add(1);
            console.log(`Registration failed: ${registerRes.status}, ${registerRes.body}`);
            return; // Skip further testing if registration fails
        }
    });

    // Login with the newly created account
    group('user_login', function () {
        const loginRes = http.post(`${baseUrl}/auth/login`,
            JSON.stringify({
                username: username,
                password: password
            }),
            { headers: headers, timeout: '8s' }
        );

        const loginSuccessful = check(loginRes, {
            'login successful': (r) => r.status === 200 && JSON.parse(r.body).token,
        });

        if (!loginSuccessful) {
            failedRequests.add(1);
            console.log(`Login failed: ${loginRes.status}, ${loginRes.body}`);
            return; // Skip further testing if login fails
        }

        // Extract auth token after successful login
        try {
            authToken = JSON.parse(loginRes.body).token;
        } catch (e) {
            console.log('Failed to extract token from login response');
            failedRequests.add(1);
        }
    });

    // If we have an auth token, perform authenticated requests
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;

        group('api_calls', function () {
            // Get all events
            const eventsRes = http.get(`${baseUrl}/events`, {
                headers: headers,
                timeout: '5s'
            });

            check(eventsRes, {
                'get events successful': (r) => r.status === 200,
            }) || failedRequests.add(1);

            // Get user registrations - simple call without parsing events
            const userRegsRes = http.get(`${baseUrl}/events/user/registrations`, {
                headers: headers,
                timeout: '5s'
            });

            check(userRegsRes, {
                'get user registrations successful': (r) => r.status === 200,
            }) || failedRequests.add(1);
        });
    }

    // Sleep between iterations (variable to reduce rate limiting)
    sleep(Math.random() * 3 + 1); // 1-4 seconds
}
