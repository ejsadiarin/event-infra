## Monitoring Load Tests with kube-prometheus-stack

When running load tests, you should monitor the following metrics in your kube-prometheus-stack:

### 1. System-Level Metrics

- **Node CPU Usage**: Look for consistently high values (>80%)
  - PromQL: `sum(rate(node_cpu_seconds_total{mode!="idle"}[1m])) by (instance) / sum(rate(node_cpu_seconds_total[1m])) by (instance) * 100`

- **Node Memory Usage**: Watch for memory pressure
  - PromQL: `100 - ((node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100)`

- **Network I/O**: Check if network becomes a bottleneck
  - PromQL: `rate(node_network_receive_bytes_total[1m])`
  - PromQL: `rate(node_network_transmit_bytes_total[1m])`

### 2. Kubernetes Pod Metrics

- **Pod CPU Usage**: Identify CPU-bound containers
  - PromQL: `sum(rate(container_cpu_usage_seconds_total{namespace="default"}[1m])) by (pod)`

- **Pod Memory Usage**: Identify memory-hungry containers
  - PromQL: `sum(container_memory_working_set_bytes{namespace="default"}) by (pod)`

- **Pod Restarts**: Check for crashing pods under load
  - PromQL: `sum(kube_pod_container_status_restarts_total{namespace="default"}) by (pod)`

### 3. Application-Specific Metrics

- **API Request Rate**: Monitor overall throughput
  - PromQL: `sum(rate(http_requests_total{namespace="default"}[1m])) by (service)`

- **API Latency**: Watch for increasing response times
  - PromQL: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{namespace="default"}[1m])) by (service, le))`

- **Error Rate**: Track failing requests
  - PromQL: `sum(rate(http_requests_total{namespace="default", status_code=~"5.."}[1m])) / sum(rate(http_requests_total{namespace="default"}[1m])) * 100`

### 4. Database Metrics (If MySQL exporter is set up)

- **MySQL Connections**: Check for connection exhaustion
  - PromQL: `mysql_global_status_threads_connected`

- **MySQL Queries**: Monitor query load
  - PromQL: `rate(mysql_global_status_questions[1m])`

- **MySQL Slow Queries**: Identify performance problems
  - PromQL: `rate(mysql_global_status_slow_queries[1m])`

### 5. Redis Metrics (If Redis exporter is set up)

- **Redis Memory Usage**: Watch for memory pressure
  - PromQL: `redis_memory_used_bytes`

- **Redis Commands**: Monitor throughput
  - PromQL: `rate(redis_commands_processed_total[1m])`

### 6. Custom K6 Metrics (If exposed to Prometheus)

If you've configured k6 to output to Prometheus:

- **Virtual Users**: Track concurrent users
  - PromQL: `k6_vus`

- **Request Rate**: Monitor test throughput
  - PromQL: `rate(k6_http_reqs[1m])`

- **Request Failures**: Track test failures
  - PromQL: `rate(k6_http_req_failed[1m])`

### Setting up a Dashboard for Load Testing

You can create a dedicated Grafana dashboard for load testing with the metrics above. The kube-prometheus-stack includes Grafana, so you can create a new dashboard and add these metrics as panels.

For an even better experience, I'd recommend adding a few visualizations:

1. **Summary Statistics**:
   - Request count
   - Error percentage
   - Avg/P95/Max response times

2. **Time Series Graphs**:
   - Request rate over time
   - Response time over time
   - Error rate over time
   - CPU/Memory usage over time
   - Network I/O over time

3. **Heat Maps**:
   - Response time distribution
   - Error distribution by endpoint
