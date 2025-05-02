<!--2025-05-02 14:47-->

## Monitoring Strategy for Your Kubernetes Application

Based on your requirements for monitoring resource usage, enabling alerts, and supporting load testing with k6, here's my recommendation:

### Best Approach: kube-prometheus-stack

The kube-prometheus-stack Helm chart is the most comprehensive solution for your needs. It includes:

- Prometheus (metrics collection)
- Grafana (visualization)
- AlertManager (alerting)
- Node exporters (host metrics)
- Kube state metrics (Kubernetes object metrics)
- Default dashboards for Kubernetes components

**Benefits over installing components separately:**
- Pre-configured integration between components
- Curated dashboards for Kubernetes already included
- Simplified management with a single Helm release
- Built-in monitoring for Kubernetes components

### Implementation Plan

1. **Install kube-prometheus-stack**:
   ```bash
   helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
   helm repo update
   helm install monitoring prometheus-community/kube-prometheus-stack --namespace monitoring --create-namespace
   ```

2. **Add MySQL Monitoring**:
   Create a ServiceMonitor for MySQL and deploy mysqld_exporter:

   ```yaml
   apiVersion: apps/v1
   kind: Deployment
   metadata:
     name: mysqld-exporter
     namespace: default
   spec:
     selector:
       matchLabels:
         app: mysqld-exporter
     template:
       metadata:
         labels:
           app: mysqld-exporter
       spec:
         containers:
         - name: mysqld-exporter
           image: prom/mysqld-exporter:v0.14.0
           ports:
           - containerPort: 9104
             name: metrics
           env:
           - name: DATA_SOURCE_NAME
             value: "root:${MYSQL_ROOT_PASSWORD}@(mysql:3306)/"
           - name: MYSQL_ROOT_PASSWORD
             valueFrom:
               secretKeyRef:
                 name: mysql-secrets
                 key: root-password
   ---
   apiVersion: v1
   kind: Service
   metadata:
     name: mysqld-exporter
     namespace: default
     labels:
       app: mysqld-exporter
   spec:
     ports:
     - port: 9104
       name: metrics
     selector:
       app: mysqld-exporter
   ---
   apiVersion: monitoring.coreos.com/v1
   kind: ServiceMonitor
   metadata:
     name: mysqld-exporter
     namespace: monitoring
   spec:
     selector:
       matchLabels:
         app: mysqld-exporter
     endpoints:
     - port: metrics
       interval: 15s
   ```

3. **Add Monitoring for Your Applications**:
   Create ServiceMonitors for your event-api and event-ui:

   ```yaml
   apiVersion: monitoring.coreos.com/v1
   kind: ServiceMonitor
   metadata:
     name: event-api-monitor
     namespace: monitoring
   spec:
     selector:
       matchLabels:
         app: event-api
     endpoints:
     - port: "3000"
       path: /metrics
       interval: 15s
   ```

   Note: Your application needs to expose Prometheus metrics on `/metrics`. For Node.js apps, you can use libraries like prom-client.

4. **Add Grafana Loki for Log Management**:
   ```bash
   helm repo add grafana https://grafana.github.io/helm-charts
   helm repo update
   helm install loki grafana/loki-stack --namespace monitoring
   ```

5. **Create k6 Performance Testing Dashboard**:
   If you're using k6 for load testing, you can configure it to output metrics to Prometheus:

   ```bash
   k6 run --out prometheus script.js
   ```

   Then import a k6 dashboard in Grafana (like dashboard ID 10660 from Grafana.com).

### Recommended Dashboards

1. **For MySQL**: Import dashboard ID 7362 (MySQL Overview)
2. **For Redis**: Import dashboard ID 763 (Redis Dashboard)
3. **For Node.js**: Import dashboard ID 11159 (NodeJS Application Dashboard)
4. **For k6**: Import dashboard ID 10660 (k6 Load Testing Results)

### Alerting Setup

Create PrometheusRules for critical alerts:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: app-alerts
  namespace: monitoring
spec:
  groups:
  - name: app.rules
    rules:
    - alert: HighMemoryUsage
      expr: container_memory_usage_bytes{namespace="default"} / container_spec_memory_limit_bytes{namespace="default"} > 0.85
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High memory usage on {{ $labels.pod }}"
        description: "Pod {{ $labels.pod }} is using more than 85% of its memory limit for 5 minutes."
    - alert: HighCpuUsage
      expr: rate(container_cpu_usage_seconds_total{namespace="default"}[5m]) / container_spec_cpu_quota{namespace="default"} > 0.85
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High CPU usage on {{ $labels.pod }}"
        description: "Pod {{ $labels.pod }} is using more than 85% of its CPU limit for 5 minutes."
```

### Best Practices

1. **Resource allocation**: Ensure Prometheus has adequate resources (typically needs more memory than expected)
2. **Data retention**: Configure retention period based on your needs (default is 15 days)
3. **Persistent storage**: Use persistent volumes for Prometheus and Grafana
4. **Federation**: For larger clusters, consider Prometheus federation
5. **Alert routing**: Configure alert routing through AlertManager to notify your team

This setup gives you a comprehensive monitoring solution for your Kubernetes environment, with specific focus on your application components and the resources they consume, perfect for analyzing load tests with k6.

# Access Grafana Dashboard

NAME: monitoring
LAST DEPLOYED: Fri May  2 15:01:20 2025
NAMESPACE: monitoring
STATUS: deployed
REVISION: 1
NOTES:
kube-prometheus-stack has been installed. Check its status by running:
  kubectl --namespace monitoring get pods -l "release=monitoring"

Get Grafana 'admin' user password by running:

  kubectl --namespace monitoring get secrets monitoring-grafana -o jsonpath="{.data.admin-password}" | base64 -d ; echo

Access Grafana local instance:

  export POD_NAME=$(kubectl --namespace monitoring get pod -l "app.kubernetes.io/name=grafana,app.kubernetes.io/instance=monitoring" -oname)
  kubectl --namespace monitoring port-forward $POD_NAME 3000

Visit https://github.com/prometheus-operator/kube-prometheus for instructions on how to create & configure Alertmanager and Prometheus instances using the Operator.

acc: admin, prom-operator

---

# FRONTEND: Adding Metrics (for Prometheus)

This guide walks through setting up Prometheus metrics for a Next.js application running in a K3s environment.

## 1. Install Required Packages

First, let's install the necessary packages:

```bash
npm install prom-client next-metrics
```

## 2. Create the Metrics Setup

Create server-side metrics utility file:

```typescript
// src/lib/server-metrics.ts
import client from 'prom-client';

// Create a Registry to register metrics
const register = new client.Registry();

// Add default metrics (CPU, memory usage, etc.)
client.collectDefaultMetrics({ register });

// HTTP request counter
const httpRequestCounter = new client.Counter({
  name: 'next_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register]
});

// Page render time histogram
const pageRenderTime = new client.Histogram({
  name: 'next_page_render_duration_seconds',
  help: 'Time taken to render pages',
  labelNames: ['page'],
  registers: [register]
});

// API request duration histogram
const apiRequestDuration = new client.Histogram({
  name: 'next_api_request_duration_seconds',
  help: 'Duration of API requests',
  labelNames: ['endpoint', 'method'],
  registers: [register]
});

// Export the registry and metrics
export {
  register,
  httpRequestCounter,
  pageRenderTime,
  apiRequestDuration
};
```

Create client-side safe metrics file:

```typescript
// src/lib/metrics.ts
'use client';

// Client-side safe placeholder for metrics when running in browser
class ClientSafeMetrics {
  inc(labels?: Record<string, any>) { } // Placeholder for counter.inc()
  observe(labels?: Record<string, any>, value?: number) { } // Placeholder for histogram.observe()
}

export const httpRequestCounter = new ClientSafeMetrics();
export const pageRenderTime = new ClientSafeMetrics();
export const apiRequestDuration = new ClientSafeMetrics();

// Export empty registry for client-side
export const register = {
  metrics: async () => '',
  contentType: 'text/plain',
};
```

## 3. Create the Metrics Endpoint

```typescript
// src/app/monitoring/metrics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { register } from '@/lib/server-metrics';

export async function GET(req: NextRequest) {
  try {
    // Return metrics in Prometheus format
    const metrics = await register.metrics();
    return new NextResponse(metrics, {
      headers: {
        'Content-Type': register.contentType
      }
    });
  } catch (error) {
    console.error('Error generating metrics:', error);
    return new NextResponse('Error generating metrics', { status: 500 });
  }
}
```

## 4. Implement Middleware for Tracking Requests

```typescript
// src/app/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { httpRequestCounter } from '@/lib/server-metrics';

export function middleware(request: NextRequest) {
  // Get the URL and method
  const { pathname } = request.nextUrl;
  const method = request.method;
  
  // Skip monitoring requests and static files
  if (pathname.startsWith('/monitoring') || 
      pathname.startsWith('/_next/') || 
      pathname.includes('.')) {
    return NextResponse.next();
  }

  // Track the request
  httpRequestCounter.inc({ 
    method, 
    path: pathname,
    status: 200 // We'll capture initial status as 200
  });
  
  return NextResponse.next();
}

// Apply to all routes except static files and monitoring
export const config = {
  matcher: [
    '/((?!monitoring/metrics|_next/static|favicon.ico|.*\\.).*)'
  ],
};
```

## 5. Instrument API Client

To track API calls from your frontend to your backend:

```typescript
// src/lib/api-client.ts
import axios, { InternalAxiosRequestConfig } from 'axios';
import { apiRequestDuration } from '@/lib/metrics'; // Use client-safe metrics

declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    metadata?: {
      startTime: number;
    };
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add interceptors to measure API call durations
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Add timing data to the request
  config.metadata = { startTime: Date.now() };
  
  // Add auth token (existing code)
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    // Calculate request duration if startTime was set
    if (response.config.metadata?.startTime) {
      const duration = (Date.now() - response.config.metadata.startTime) / 1000;
      const endpoint = response.config.url || 'unknown';
      const method = response.config.method || 'unknown';
      
      // Record the timing in the histogram
      apiRequestDuration.observe({ endpoint, method }, duration);
    }
    return response;
  },
  (error) => {
    // Still track timing for failed requests
    if (error.config?.metadata?.startTime) {
      const duration = (Date.now() - error.config.metadata.startTime) / 1000;
      const endpoint = error.config.url || 'unknown';
      const method = error.config.method || 'unknown';
      
      // Record the timing in the histogram
      apiRequestDuration.observe({ endpoint, method }, duration);
    }
    return Promise.reject(error);
  }
);

// Rest of your API client code remains the same
```

## 6. K3s Deployment Configuration

### Docker Compose with Labels

Update your compose.yml to include Prometheus labels:

```yaml
services:
  event-ui:
    build:
      context: .
      dockerfile: Dockerfile
    image: ghcr.io/ejsadiarin/event-ui:latest
    container_name: event-ui
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=http://event-api:3001/api
    restart: unless-stopped
    labels:
      # Add these labels for Prometheus to scrape your app
      prometheus.io/scrape: "true"
      prometheus.io/port: "3000"
      prometheus.io/path: "/monitoring/metrics"
```

### Kubernetes Deployment with ServiceMonitor

For a K3s cluster running the kube-prometheus-stack, create a ServiceMonitor CRD:

#### Step 1: Create a Kubernetes Service resource

```yaml
# event-ui-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: event-ui
  labels:
    app: event-ui
spec:
  selector:
    app: event-ui
  ports:
  - name: web
    port: 3000
    targetPort: 3000
  type: ClusterIP
```

#### Step 2: Create a ServiceMonitor

```yaml
# event-ui-servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: event-ui-monitor
  namespace: monitoring  # Must be in the same namespace as Prometheus
  labels:
    release: prometheus  # Match the label used by the kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app: event-ui
  endpoints:
  - port: web
    path: /monitoring/metrics
    interval: 15s
    scrapeTimeout: 10s
  namespaceSelector:
    matchNames:
    - default  # Change to the namespace where your app is deployed
```

#### Step 3: Apply the configurations

```bash
kubectl apply -f event-ui-service.yaml
kubectl apply -f event-ui-servicemonitor.yaml
```

### Ingress with Traefik Configuration

If you're using Traefik as an Ingress controller in your K3s cluster:

```yaml
# event-ui-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: event-ui-ingress
  annotations:
    kubernetes.io/ingress.class: traefik
    traefik.ingress.kubernetes.io/router.middlewares: default-strip-prefix@kubernetescrd
spec:
  rules:
  - host: event-ui.example.com  # Replace with your domain
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: event-ui
            port:
              number: 3000
```

## 7. Grafana Configuration

After deploying the metrics, you can configure Grafana dashboards:

### Basic Next.js Dashboard

Create a new dashboard in Grafana with these panels:

1. **HTTP Request Rate**: 
   ```
   sum(rate(next_http_requests_total[5m])) by (path)
   ```

2. **HTTP Status Codes**:
   ```
   sum(rate(next_http_requests_total[5m])) by (status)
   ```

3. **API Request Duration (95th percentile)**:
   ```
   histogram_quantile(0.95, sum(rate(next_api_request_duration_seconds_bucket[5m])) by (endpoint, le))
   ```

4. **Memory Usage**:
   ```
   process_resident_memory_bytes{job="event-ui"}
   ```

## 8. Loki Integration for Logs

Since you're using Loki with Grafana, add log collection:

1. Deploy Promtail as a sidecar or DaemonSet to collect logs
2. Configure Promtail to add application-specific labels

Example Promtail configuration for your Next.js app:

```yaml
scrape_configs:
  - job_name: event-ui-logs
    static_configs:
      - targets:
          - localhost
        labels:
          job: event-ui
          __path__: /var/log/containers/event-ui-*.log
    pipeline_stages:
      - json:
          expressions:
            level: level
            message: message
            timestamp: time
      - labels:
          level:
      - timestamp:
          source: timestamp
          format: RFC3339
```

## Available Metrics

This application includes built-in metrics for Prometheus monitoring:

1. **Default Node.js metrics** - Memory usage, CPU usage, event loop lag, etc.
2. **HTTP request metrics** - Count of HTTP requests by method, path, and status
3. **Page render timing** - Duration of page renders by page path
4. **API request timing** - Duration of API calls to the backend service

## Accessing Metrics

Metrics are available at the `/monitoring/metrics` endpoint in Prometheus format.

## Frontend-Specific Metrics to Consider

For a frontend application like event-ui, consider monitoring:

1. **Client-side metrics** (if you implement browser-side collection):
   - Page load time
   - First contentful paint
   - Largest contentful paint
   - Core Web Vitals

2. **Server-side metrics**:
   - Request counts by route
   - Request duration
   - HTTP status codes
   - Server errors

3. **Resource usage**:
   - Memory usage
   - CPU usage
   - Event loop lag
