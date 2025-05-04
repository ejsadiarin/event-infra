# load test 2 scripts (100 users and 20000 users):

- [x] load test with 1 replica unoptimized resources
- [ ] load test with 1 replica optimized resources
- [ ] load test with 2-3 replicas unoptimized
- [ ] load test with 2-3 replicas optimized
- [ ] load test with 2-3 replicas optimized with HPA


## 1 node - 20k VU (first run, old script)

[2025-05-03 18:47]
- 5k Vu starts to request timeout
- internet problems?
- 17m - 20K VU reached
- interrupt iterations start at 27m - maybe bc of internet?
- on phone access - errors starts to occur idk why
104.21.86.94

# 1 node - 10K VU

[2025-05-05 02:51]
- 8m - 3.6k VU -- OK
- 15m - 5k VU cap -- laggy (consumes lots of network bandwidth so maybe my internet issue?)
- 16m - 2.3k VU -- starts to request timeout


  █ THRESHOLDS

    failed_requests
    ✗ 'count<50000' count=751294

    http_req_duration
    ✗ 'p(95)<8000' p(95)=15s

      {name:getEvents}
      ✓ 'p(95)<5000' p(95)=0s

      {name:loginRequest}
      ✗ 'p(95)<10000' p(95)=15s

      {name:registerEvent}
      ✓ 'p(95)<12000' p(95)=0s


  █ TOTAL RESULTS

    checks_total.......................: 760546 568.63852/s
    checks_succeeded...................: 1.21%  9252 out of 760546
    checks_failed......................: 98.78% 751294 out of 760546

    ✗ health endpoint is up
      ↳  91% — ✓ 8582 / ✗ 848
    ✗ registration successful
      ↳  0% — ✓ 447 / ✗ 750222
    ✗ login successful
      ↳  49% — ✓ 223 / ✗ 224

    CUSTOM
    api_latency.............................................................: avg=778.271261 min=85.39876 med=485.669316 max=9800.233651 p(90)=1432.558303 p(95)=2104.802007 p(99)=5213.388001
    failed_requests.........................................................: 751294  561.721064/s
    successful_logins.......................................................: 223     0.166731/s
    successful_registrations................................................: 447     0.334209/s

    HTTP
    http_req_duration.......................................................: avg=6.5s       min=0s       med=396.52ms   max=15.03s      p(90)=15s         p(95)=15s         p(99)=15s
      { expected_response:true }............................................: avg=1.35s      min=85.39ms  med=526.84ms   max=14.99s      p(90)=2.76s       p(95)=7.5s        p(99)=13.2s
      { name:getEvents }....................................................: avg=0s         min=0s       med=0s         max=0s          p(90)=0s          p(95)=0s          p(99)=0s
      { name:loginRequest }.................................................: avg=11.2s      min=620.59ms med=14.99s     max=15s         p(90)=15s         p(95)=15s         p(99)=15s
      { name:registerEvent }................................................: avg=0s         min=0s       med=0s         max=0s          p(90)=0s          p(95)=0s          p(99)=0s
    http_req_failed.........................................................: 98.78%  751294 out of 760546
    http_reqs...............................................................: 760546  568.63852/s

    EXECUTION
    dropped_iterations......................................................: 1338202 1000.535411/s
    iteration_duration......................................................: avg=5.54s      min=814.77ms med=1s         max=33.44s      p(90)=18.02s      p(95)=18.51s      p(99)=18.9s
    iterations..............................................................: 2604826 1947.553996/s
    vus.....................................................................: 3       min=3                max=14525
    vus_max.................................................................: 14560   min=2020             max=14560

    NETWORK
    data_received...........................................................: 36 MB   27 kB/s
    data_sent...............................................................: 85 MB   63 kB/s




running (22m17.5s), 00000/14560 VUs, 2604826 complete and 0 interrupted iterations
browsing      ✓ [======================================] 0000/2540 VUs    22m0s  0002.64 iters/s
health_checks ✓ [======================================] 20 VUs           20m0s
user_auth     ✓ [======================================] 00000/12000 VUs  22m0s  0002.89 iters/s
ERRO[1340] thresholds on metrics 'failed_requests, http_req_duration, http_req_duration{name:loginRequest}' have been crossed



## Example Commands for Different Test Scenarios

```bash
# Quick smoke test
k6 run event-api-minimal.js

# Full load test with Prometheus output
k6 run --out prometheus=http://prometheus:9090/api/v1/write event-api-load-test.js 

# UI test with fewer VUs
k6 run --browser --vus=5 --duration=60s event-ui-minimal.js

# Debug mode for investigating issues
k6 run --http-debug=full event-api-minimal.js
```
