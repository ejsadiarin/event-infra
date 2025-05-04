import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { parseHTML } from 'k6/html';

// Custom metrics
const uiPageLoads = new Counter('ui_page_loads');
const uiLatency = new Trend('ui_latency');
const failedUIRequests = new Counter('failed_ui_requests');
const cssJsErrors = new Counter('css_js_errors');
const resourceLoadRate = new Rate('resource_load_rate');
const timeoutErrors = new Counter('timeout_errors');

const baseUrl = 'https://event.ejsadiarin.com';

// Configuration for 10k-20k concurrent users
export let options = {
    thresholds: {
        http_req_duration: ['p(95)<10000'],                             // 10s for general UI requests
        'http_req_duration{name:homePage}': ['p(95)<12000'],            // 12s for home page
        'http_req_duration{name:eventsList}': ['p(95)<12000'],          // 12s for events list
        'http_req_duration{name:eventDetails}': ['p(95)<14000'],        // 14s for event details
        failed_ui_requests: ['count<40000'],                            // Allow more failures under extreme load
        ui_page_loads: ['count>100000'],                                // Expect at least 100k successful page loads
        resource_load_rate: ['rate>0.8'],                               // 80% of resources should load
    },
    // Load test configuration
    scenarios: {
        ui_health_checks: {
            executor: 'constant-vus',
            vus: 20,                                                    // 20 VUs continuously checking health
            duration: '20m',
            gracefulStop: '20s',
            tags: { type: 'health' },
            exec: 'healthCheck',
        },
        homepage_browsing: {
            executor: 'ramping-arrival-rate',
            startRate: 30,                                              // Start with 30 req/s
            timeUnit: '1s',
            preAllocatedVUs: 1000,                                      // Pre-allocate 1000 VUs
            maxVUs: 9000,                                               // Up to 9000 VUs for homepage
            stages: [
                { duration: '2m', target: 100 },                        // Gradual warm-up
                { duration: '3m', target: 500 },
                { duration: '3m', target: 1000 },
                { duration: '3m', target: 1500 },
                { duration: '3m', target: 2000 },                       // Peak load
                { duration: '5m', target: 2000 },                       // Sustained peak
                { duration: '3m', target: 0 },                          // Gradual cool-down
            ],
            tags: { type: 'home' },
            exec: 'browseHomepage',
        },
        events_browsing: {
            executor: 'ramping-arrival-rate',
            startRate: 30,                                              // Start with 30 req/s
            timeUnit: '1s',
            preAllocatedVUs: 1000,                                      // Pre-allocate 1000 VUs
            maxVUs: 11000,                                              // Up to 11000 VUs for events browsing
            stages: [
                { duration: '2m', target: 100 },                        // Gradual warm-up
                { duration: '3m', target: 500 },
                { duration: '3m', target: 1000 },
                { duration: '3m', target: 2000 },
                { duration: '3m', target: 3000 },                       // Peak load
                { duration: '5m', target: 3000 },                       // Sustained peak
                { duration: '3m', target: 0 },                          // Gradual cool-down
            ],
            tags: { type: 'events' },
            exec: 'browseEvents',
        },
    },
    batch: 15,                                                          // Increased batch size
    batchPerHost: 10,                                                   // Increased per host limit
    discardResponseBodies: false,                                       // Need bodies for HTML parsing
    insecureSkipTLSVerify: true,                                        // Skip TLS verification for performance
};

// Health check
export function healthCheck() {
    const res = http.get(`${baseUrl}/health`, {
        timeout: '10s',                                                 // Increased timeout
        tags: { name: 'healthCheck' }
    });

    check(res, {
        'UI health endpoint is up': (r) => r.status === 200,
    });

    sleep(Math.random() * 1 + 0.5);                                     // 0.5-1.5s
}

// Browse homepage
export function browseHomepage() {
    try {
        // Load homepage
        const homeRes = http.get(baseUrl, {
            timeout: '12s',                                             // Increased timeout
            tags: { name: 'homePage' }
        });

        const homeSuccess = check(homeRes, {
            'homepage loaded': (r) => r.status === 200,
            'homepage has content': (r) => r.body.includes('<html') && r.body.includes('Event App'),
        });

        if (homeSuccess) {
            uiPageLoads.add(1);
            uiLatency.add(homeRes.timings.duration);

            // Load critical resources if homepage load was successful
            loadCriticalResources(homeRes);
        } else {
            failedUIRequests.add(1);
        }
    } catch (e) {
        console.log('Error in homepage browsing:', e);
        if (e.message.includes('timeout')) {
            timeoutErrors.add(1);
        }
        failedUIRequests.add(1);
    }

    // Sleep between homepage views - increased for extreme load
    sleep(Math.random() * 5 + 3);                                     // 3-8 seconds
}

// Browse events pages
export function browseEvents() {
    try {
        // Load events page
        const eventsRes = http.get(`${baseUrl}/events`, {
            timeout: '12s',                                           // Increased timeout
            tags: { name: 'eventsList' }
        });

        const eventsSuccess = check(eventsRes, {
            'events page loaded': (r) => r.status === 200,
            'events page has content': (r) => r.body.includes('Events List') || r.body.includes('event-list'),
        });

        if (eventsSuccess) {
            uiPageLoads.add(1);
            uiLatency.add(eventsRes.timings.duration);

            // Load critical resources
            loadCriticalResources(eventsRes);

            // Extract event links (if body parsing is enabled)
            let eventLinks = [];
            try {
                const doc = parseHTML(eventsRes.body);
                const links = doc.find('a[href*="/events/"]');
                links.forEach(link => {
                    const href = link.attr('href');
                    if (href && href.includes('/events/') && !href.includes('/events/list')) {
                        eventLinks.push(href);
                    }
                });
            } catch (e) {
                console.log('Error parsing event links:', e);
            }

            // Visit a random event detail page (25% of the time) - reduced probability
            if (eventLinks.length > 0 && Math.random() <= 0.25) {
                const randomLink = eventLinks[Math.floor(Math.random() * eventLinks.length)];
                const fullUrl = randomLink.startsWith('http') ? randomLink : `${baseUrl}${randomLink}`;

                const detailRes = http.get(fullUrl, {
                    timeout: '14s',                                   // Increased timeout
                    tags: { name: 'eventDetails' }
                });

                const detailSuccess = check(detailRes, {
                    'event detail page loaded': (r) => r.status === 200,
                    'event detail has content': (r) => r.body.includes('Event Details') || r.body.includes('event-detail'),
                });

                if (detailSuccess) {
                    uiPageLoads.add(1);
                    uiLatency.add(detailRes.timings.duration);
                    loadCriticalResources(detailRes);
                } else {
                    failedUIRequests.add(1);
                }

                // Longer sleep after viewing details to reduce load
                sleep(Math.random() * 4 + 3);                        // 3-7 seconds
            }
        } else {
            failedUIRequests.add(1);
        }
    } catch (e) {
        console.log('Error in events browsing:', e);
        if (e.message.includes('timeout')) {
            timeoutErrors.add(1);
        }
        failedUIRequests.add(1);
    }

    // Sleep between events page views - increased for extreme load
    sleep(Math.random() * 6 + 4);                                   // 4-10 seconds
}

// Helper function to load critical CSS/JS resources
function loadCriticalResources(response) {
    try {
        const doc = parseHTML(response.body);

        // Get all CSS files
        const cssLinks = doc.find('link[rel="stylesheet"]');
        let cssUrls = [];
        cssLinks.forEach(link => {
            const href = link.attr('href');
            if (href) {
                cssUrls.push(href.startsWith('http') ? href : `${baseUrl}${href}`);
            }
        });

        // Get critical JS files
        const scriptTags = doc.find('script[src]');
        let jsUrls = [];
        scriptTags.forEach(script => {
            const src = script.attr('src');
            if (src) {
                jsUrls.push(src.startsWith('http') ? src : `${baseUrl}${src}`);
            }
        });

        // Only load a subset of resources to reduce test load (max 2 CSS, 2 JS)
        const criticalCss = cssUrls.slice(0, 2);
        const criticalJs = jsUrls.slice(0, 2);

        // Batch request critical resources
        if (criticalCss.length > 0 || criticalJs.length > 0) {
            const requests = {};

            criticalCss.forEach((url, index) => {
                requests[`css_${index}`] = {
                    url: url,
                    tags: { name: 'cssResource' }
                };
            });

            criticalJs.forEach((url, index) => {
                requests[`js_${index}`] = {
                    url: url,
                    tags: { name: 'jsResource' }
                };
            });

            const responses = http.batch(requests);

            // Check resources loaded
            let successful = 0;
            let total = Object.keys(responses).length;

            for (let key in responses) {
                if (responses[key].status >= 200 && responses[key].status < 400) {
                    successful++;
                } else {
                    cssJsErrors.add(1);
                }
            }

            if (total > 0) {
                resourceLoadRate.add(successful === total);
            }
        }
    } catch (e) {
        console.log('Error loading resources:', e);
    }
}

// Default function
export default function () {
    const choice = Math.random();

    if (choice < 0.2) {
        healthCheck();
    } else if (choice < 0.5) {
        browseHomepage();
    } else {
        browseEvents();
    }
}
