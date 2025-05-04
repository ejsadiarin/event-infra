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

const baseUrl = 'https://event.ejsadiarin.com/api';

// Configuration for 10k-20k concurrent users
export let options = {
    thresholds: {
        http_req_duration: ['p(95)<8000'],                              // Increased to 8s due to higher load
        'http_req_duration{name:loginRequest}': ['p(95)<10000'],        // 10s for login under heavy load
        'http_req_duration{name:getEvents}': ['p(95)<5000'],            // 5s for events listing
        'http_req_duration{name:registerEvent}': ['p(95)<12000'],       // 12s for event registration
        failed_requests: ['count<50000'],                               // Increased for the high load test
    },
    // Performance tuning
    batch: 15,                                                          // Increased batch size
    batchPerHost: 8,                                                    // Increased per host
    insecureSkipTLSVerify: true,                                        // Skip TLS verification
    discardResponseBodies: true,                                        // Discard responses to save memory
    // Distributed execution settings
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
    // Separate scenarios with high VU counts
    scenarios: {
        health_checks: {
            executor: 'constant-vus',
            vus: 20,                                                    // Increased to 20
            duration: '20m',                                            // Longer duration
            gracefulStop: '20s',
            tags: { type: 'health' },
            exec: 'healthCheck',
        },
        user_auth: {
            executor: 'ramping-arrival-rate',
            startRate: 30,                                              // Higher starting rate
            timeUnit: '1s',
            preAllocatedVUs: 1000,                                      // 1k pre-allocated
            maxVUs: 12000,                                              // Up to 12k VUs
            stages: [
                { duration: '2m', target: 100 },                        // Gradual warm-up
                { duration: '3m', target: 500 },
                { duration: '3m', target: 1000 },
                { duration: '3m', target: 2000 },
                { duration: '3m', target: 3000 },                       // Peak load
                { duration: '5m', target: 3000 },                       // Sustained peak
                { duration: '3m', target: 0 },                          // Gradual cool-down
            ],
            tags: { type: 'auth' },
            exec: 'userAuth',
        },
        browsing: {
            executor: 'ramping-arrival-rate',
            startRate: 30,                                              // Higher starting rate
            timeUnit: '1s',
            preAllocatedVUs: 1000,                                      // 1k pre-allocated
            maxVUs: 8000,                                               // Up to 8k VUs
            stages: [
                { duration: '2m', target: 100 },                        // Gradual warm-up
                { duration: '3m', target: 500 },
                { duration: '3m', target: 1000 },
                { duration: '3m', target: 2000 },
                { duration: '3m', target: 2500 },                       // Peak load
                { duration: '5m', target: 2500 },                       // Sustained peak
                { duration: '3m', target: 0 },                          // Gradual cool-down
            ],
            tags: { type: 'browse' },
            exec: 'browseEvents',
        },
    },
    httpDebug: 'full',
};

// Generate unique usernames to avoid conflicts
const generateUsername = () => {
    return `k6user_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
};

// Store tokens from successful logins to be reused
let authTokens = [];

// Health check function (separated to reduce load on auth)
export function healthCheck() {
    const res = http.get(`${baseUrl}/health/live`, {
        timeout: '10s',                                              // Increased timeout
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

    // Short sleep for health checks
    sleep(Math.random() * 0.8 + 0.7);                               // 0.7-1.5s
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
                timeout: '15s'                                      // Increased timeout
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
                    timeout: '15s'                                  // Increased timeout
                }
            );

            const loginSuccess = check(loginRes, {
                'login successful': (r) => r.status === 200,
            });

            if (loginSuccess) {
                successfulLogins.add(1);
                try {
                    const token = JSON.parse(loginRes.body).token;
                    // Store token for reuse (up to a larger number)
                    if (authTokens.length < 200) {                 // Increased token cache
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

    // Sleep between auth operations - adjusted for high load
    sleep(Math.random() * 2.5 + 1.5);                             // 1.5-4s
}

// Browsing events function
export function browseEvents() {
    // Use a stored token if available, otherwise skip
    if (authTokens.length === 0) {
        sleep(1);
        return;
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authTokens[Math.floor(Math.random() * authTokens.length)]}`
    };

    try {
        // Get all events - read operation
        const eventsRes = http.get(`${baseUrl}/events`,
            {
                headers: headers,
                tags: { name: 'getEvents' },
                timeout: '12s'                                     // Increased timeout
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

        // View event details (40% of the time - reduced from 50%)
        if (events.length > 0 && Math.random() <= 0.4) {
            const randomEvent = events[Math.floor(Math.random() * events.length)];

            const eventDetailsRes = http.get(`${baseUrl}/events/${randomEvent.id}/slots`,
                {
                    headers: headers,
                    tags: { name: 'getEventDetails' },
                    timeout: '12s'                                // Increased timeout
                }
            );

            check(eventDetailsRes, {
                'get event details successful': (r) => r.status === 200,
            }) || failedRequests.add(1);

            apiLatency.add(eventDetailsRes.timings.duration);

            // Check registration and register (5% of time - reduced from 10%)
            if (Math.random() <= 0.05) {
                const regStatusRes = http.get(`${baseUrl}/events/${randomEvent.id}/check-registration`,
                    {
                        headers: headers,
                        tags: { name: 'checkRegistration' },
                        timeout: '12s'                           // Increased timeout
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
                            timeout: '15s'                       // Increased timeout
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

        // Get user registrations (30% of time - reduced from 40%)
        if (Math.random() <= 0.3) {
            const userRegsRes = http.get(`${baseUrl}/events/user/registrations`,
                {
                    headers: headers,
                    tags: { name: 'getUserRegistrations' },
                    timeout: '12s'                              // Increased timeout
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

    // Longer sleep to reduce load intensity
    sleep(Math.random() * 4 + 3);                              // 3-7 seconds
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
