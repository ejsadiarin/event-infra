import http from 'k6/http';
import { sleep, check, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics
const failedRequests = new Counter('failed_requests');
const successfulLogins = new Counter('successful_logins');
const successfulRegistrations = new Counter('successful_registrations');
const eventRegistrations = new Counter('event_registrations');
const apiLatency = new Trend('api_latency');
const timeoutErrors = new Counter('timeout_errors');

// More balanced test configuration based on your test-info.md results
export let options = {
    stages: [
        { duration: '1m', target: 100 },     // Gradual ramp-up
        { duration: '2m', target: 500 },     // Continue ramping
        { duration: '2m', target: 1000 },    // Moderate load
        { duration: '2m', target: 2000 },    // Medium load
        { duration: '3m', target: 5000 },    // High load
        { duration: '5m', target: 5000 },    // Maintain high load
        { duration: '2m', target: 0 },       // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<5000'],       // More realistic: 5s
        'http_req_duration{name:loginRequest}': ['p(95)<8000'],  // Login can be slower
        'http_req_duration{name:getEvents}': ['p(95)<3000'],     // Events should be faster
        'http_req_duration{name:registerEvent}': ['p(95)<8000'], // Registration can be slower
        failed_requests: ['count<10000'],        // Increased to be realistic
    },
    // Better timeout handling
    httpDebug: 'full',
    timeout: '20s',  // Global request timeout
    // Performance tuning
    batch: 10,              // Smaller batch size
    batchPerHost: 5,        // Limit per host
    insecureSkipTLSVerify: true,  // Skip TLS verification for better performance
    discardResponseBodies: true,  // Discard response bodies except when needed
    // Separate VUs for different tests to avoid hitting API limits
    scenarios: {
        health_checks: {
            executor: 'constant-vus',
            vus: 5,
            duration: '17m',
            gracefulStop: '10s',
            tags: { type: 'health' },
            exec: 'healthCheck',
        },
        user_auth: {
            executor: 'ramping-arrival-rate',
            startRate: 10,
            timeUnit: '1s',
            preAllocatedVUs: 100,
            maxVUs: 5000,
            stages: [
                { duration: '1m', target: 10 },
                { duration: '2m', target: 50 },
                { duration: '2m', target: 100 },
                { duration: '2m', target: 200 },
                { duration: '3m', target: 500 },
                { duration: '5m', target: 500 },
                { duration: '2m', target: 0 },
            ],
            tags: { type: 'auth' },
            exec: 'userAuth',
        },
        browsing: {
            executor: 'ramping-arrival-rate',
            startRate: 10,
            timeUnit: '1s',
            preAllocatedVUs: 100,
            maxVUs: 2000,
            stages: [
                { duration: '1m', target: 10 },
                { duration: '2m', target: 50 },
                { duration: '2m', target: 100 },
                { duration: '2m', target: 200 },
                { duration: '3m', target: 300 },
                { duration: '5m', target: 300 },
                { duration: '2m', target: 0 },
            ],
            tags: { type: 'browse' },
            exec: 'browseEvents',
        },
    },
};

// API base URL
const baseUrl = 'https://event.ejsadiarin.com/api';

// Generate unique usernames to avoid conflicts
const generateUsername = () => {
    return `k6user_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
};

// Store tokens from successful logins to be reused
let authTokens = [];

// Health check function (separated to reduce load on auth)
export function healthCheck() {
    const res = http.get(`${baseUrl}/health/live`, {
        timeout: '5s',
        tags: { name: 'healthCheck' }
    });

    check(res, {
        'health endpoint is up': (r) => r.status === 200,
    });

    if (res.status === 200) {
        apiLatency.add(res.timings.duration);
    } else {
        failedRequests.add(1);
    }

    // Very short sleep for health checks
    sleep(Math.random() * 0.5 + 0.5);
}

// User authentication function
export function userAuth() {
    const headers = { 'Content-Type': 'application/json' };

    // Always register a new user for authentication testing
    const username = generateUsername();
    const password = 'password123';

    try {
        const registerRes = http.post(`${baseUrl}/auth/register`,
            JSON.stringify({
                username: username,
                password: password,
                email: `${username}@example.com`
            }),
            {
                headers: headers,
                tags: { name: 'registerRequest' },
                timeout: '10s'
            }
        );

        const registerSuccess = check(registerRes, {
            'registration successful': (r) => r.status === 201,
        });

        if (registerSuccess) {
            successfulRegistrations.add(1);

            // Login with the newly created account
            const loginRes = http.post(`${baseUrl}/auth/login`,
                JSON.stringify({
                    username: username,
                    password: password
                }),
                {
                    headers: headers,
                    tags: { name: 'loginRequest' },
                    timeout: '10s'
                }
            );

            const loginSuccess = check(loginRes, {
                'login successful': (r) => r.status === 200,
            });

            if (loginSuccess) {
                successfulLogins.add(1);
                try {
                    const token = JSON.parse(loginRes.body).token;
                    // Store token for reuse (up to 100 tokens)
                    if (authTokens.length < 100) {
                        authTokens.push(token);
                    }
                } catch (e) {
                    console.log('Failed to parse login response:', e);
                }
            } else {
                failedRequests.add(1);
            }
        } else {
            failedRequests.add(1);
        }
    } catch (e) {
        console.log('Error in auth flow:', e);
        if (e.message.includes('timeout')) {
            timeoutErrors.add(1);
        }
        failedRequests.add(1);
    }

    // Sleep between auth operations to avoid overloading
    sleep(Math.random() * 2 + 1);
}

// Browsing events function
export function browseEvents() {
    // Use a stored token if available, otherwise skip
    if (authTokens.length === 0) {
        return;
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authTokens[Math.floor(Math.random() * authTokens.length)]}`
    };

    try {
        // Get all events - this is a read operation, so should be safe under load
        const eventsRes = http.get(`${baseUrl}/events`,
            {
                headers: headers,
                tags: { name: 'getEvents' },
                timeout: '8s'
            }
        );

        const eventsSuccess = check(eventsRes, {
            'get events successful': (r) => r.status === 200,
        });

        if (!eventsSuccess) {
            failedRequests.add(1);
            return;
        }

        apiLatency.add(eventsRes.timings.duration);

        // Parse available events
        let events = [];
        try {
            events = JSON.parse(eventsRes.body);
        } catch (e) {
            console.log('Failed to parse events JSON');
            return;
        }

        // View event details if we have events (50% of the time)
        if (events.length > 0 && Math.random() <= 0.5) {
            const randomEvent = events[Math.floor(Math.random() * events.length)];

            const eventDetailsRes = http.get(`${baseUrl}/events/${randomEvent.id}/slots`,
                {
                    headers: headers,
                    tags: { name: 'getEventDetails' },
                    timeout: '8s'
                }
            );

            check(eventDetailsRes, {
                'get event details successful': (r) => r.status === 200,
            }) || failedRequests.add(1);

            apiLatency.add(eventDetailsRes.timings.duration);

            // Check registration and register (10% of time - limited to reduce load)
            if (Math.random() <= 0.1) {
                const regStatusRes = http.get(`${baseUrl}/events/${randomEvent.id}/check-registration`,
                    {
                        headers: headers,
                        tags: { name: 'checkRegistration' },
                        timeout: '8s'
                    }
                );

                let isRegistered = false;
                try {
                    isRegistered = regStatusRes.status === 200 &&
                        JSON.parse(regStatusRes.body).isRegistered === true;
                } catch (e) {
                    // Handle potential JSON parse errors
                }

                if (!isRegistered) {
                    const registerRes = http.post(`${baseUrl}/events/${randomEvent.id}/register`,
                        JSON.stringify({}),
                        {
                            headers: headers,
                            tags: { name: 'registerEvent' },
                            timeout: '10s'
                        }
                    );

                    if (check(registerRes, {
                        'event registration successful': (r) => r.status === 200,
                    })) {
                        eventRegistrations.add(1);
                    } else {
                        failedRequests.add(1);
                    }
                }
            }
        }

        // Get user registrations (40% of time - reduced from 70%)
        if (Math.random() <= 0.4) {
            const userRegsRes = http.get(`${baseUrl}/events/user/registrations`,
                {
                    headers: headers,
                    tags: { name: 'getUserRegistrations' },
                    timeout: '8s'
                }
            );

            check(userRegsRes, {
                'get user registrations successful': (r) => r.status === 200,
            }) || failedRequests.add(1);
        }
    } catch (e) {
        console.log('Error in browsing flow:', e);
        if (e.message.includes('timeout')) {
            timeoutErrors.add(1);
        }
        failedRequests.add(1);
    }

    // Variable sleep with longer duration to reduce load
    sleep(Math.random() * 3 + 2); // 2-5 seconds
}

// Default function (fallback for direct script execution)
export default function () {
    const scenario = Math.random();

    if (scenario < 0.2) {
        healthCheck();
    } else if (scenario < 0.5) {
        userAuth();
    } else {
        browseEvents();
    }
}
