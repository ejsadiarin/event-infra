# [2025-05-03 18:47]

## 1 node -- 20k VU

- 5k Vu starts to request timeout
- internet problems?
- 17m - 20K VU reached
- interrupt iterations start at 27m - maybe bc of internet?
- on phone access - errors starts to occur idk why
104.21.86.94

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
