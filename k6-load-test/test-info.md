# [2025-05-03 18:47]

## 1 node -- 20k VU

- 5k Vu starts to request timeout
- internet problems?
- 17m - 20K VU reached
- interrupt iterations start at 27m - maybe bc of internet?
- on phone access - errors starts to occur idk why
104.21.86.94


  █ THRESHOLDS

    failed_requests
    ✗ 'count<1000' count=518669

    http_req_duration
    ✗ 'p(95)<500' p(95)=30.51s

      {name:getEvents}
      ✓ 'p(95)<400' p(95)=0s

      {name:loginRequest}
      ✗ 'p(95)<600' p(95)=30.51s

      {name:registerEvent}
      ✓ 'p(95)<800' p(95)=0s


  █ TOTAL RESULTS

    checks_total.......................: 1019409 522.782708/s
    checks_succeeded...................: 0.00%   0 out of 1019409
    checks_failed......................: 100.00% 1019409 out of 1019409

    ✗ health endpoint is up
      ↳  0% — ✓ 0 / ✗ 500740
    ✗ login successful
      ↳  0% — ✓ 0 / ✗ 469333
    ✗ registration successful
      ↳  0% — ✓ 0 / ✗ 24847
    ✗ login after registration successful
      ↳  0% — ✓ 0 / ✗ 24489

    CUSTOM
    api_latency.....................................................: avg=8087.542107 min=0        med=179.751739 max=60005.698918 p(90)=30380.381923 p(95)=30518.004273
    failed_requests.................................................: 518669  265.988611/s

    HTTP
    http_req_duration...............................................: avg=8.09s       min=0s       med=203.71ms   max=1m0s         p(90)=30.39s       p(95)=30.51s
      { name:getEvents }............................................: avg=0s          min=0s       med=0s         max=0s           p(90)=0s           p(95)=0s
      { name:loginRequest }.........................................: avg=8.08s       min=0s       med=235.71ms   max=1m0s         p(90)=30.41s       p(95)=30.51s
      { name:registerEvent }........................................: avg=0s          min=0s       med=0s         max=0s           p(90)=0s           p(95)=0s
    http_req_failed.................................................: 100.00% 1019410 out of 1019410
    http_reqs.......................................................: 1019410 522.783221/s

    EXECUTION
    iteration_duration..............................................: avg=46s         min=623.56ms med=1m1s       max=3m3s         p(90)=1m3s         p(95)=1m30s
    iterations......................................................: 493371  253.015058/s
    vus.............................................................: 7       min=4                  max=20000
    vus_max.........................................................: 20000   min=20000              max=20000

    NETWORK
    data_received...................................................: 505 MB  259 kB/s
    data_sent.......................................................: 56 MB   29 kB/s




running (32m30.0s), 00000/20000 VUs, 493371 complete and 7381 interrupted iterations
default ✓ [======================================] 00000/20000 VUs  32m0s
ERRO[1953] thresholds on metrics 'failed_requests, http_req_duration, http_req_duration{name:loginRequest}' have been crossed
