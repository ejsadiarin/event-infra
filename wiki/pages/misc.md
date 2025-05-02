### 2. Ensure Your Applications Expose Metrics:

For the ServiceMonitors to work, both event-api and event-ui need to expose Prometheus metrics. The guide in `kompose/monitoring/guide.md` has good implementation details for the frontend.

### 3. Fix Ingress Configuration:

Uncomment the middleware annotations in your ingress definitions to enable compression, HTTPS redirect, and rate limiting.

### 4. Create a deployment order script:

```bash
#!/bin/bash
# deploy.sh

# Create namespace
kubectl create namespace event-platform

# ConfigMaps and Secrets
kubectl apply -f kompose/event-api/mysql-cm1-configmap.yaml
kubectl apply -f kompose/event-api/mysql-secrets.yaml
kubectl apply -f kompose/event-api/event-api-secrets.yaml

# Stateful components
kubectl apply -f kompose/event-api/mysql-statefulset.yaml
kubectl apply -f kompose/event-api/mysql-service.yaml
kubectl apply -f kompose/event-api/redis-statefulset.yaml
kubectl apply -f kompose/event-api/redis-service.yaml

# Wait for stateful components to be ready
echo "Waiting for MySQL and Redis to be ready..."
kubectl wait --for=condition=ready pod/mysql-0 --timeout=300s
kubectl wait --for=condition=ready pod/redis-0 --timeout=300s

# Applications
kubectl apply -f kompose/event-api/event-api-deployment.yaml
kubectl apply -f kompose/event-api/event-api-service.yaml
kubectl apply -f kompose/event-ui/event-ui-deployment.yaml
kubectl apply -f kompose/event-ui/event-ui-service.yaml

# Network policies
kubectl apply -f kompose/event-netpol.yaml

# Traefik middlewares
kubectl apply -f kompose/traefik-middlewares.yaml

# Ingress
kubectl apply -f kompose/event-api/event-api-ingress.yaml
kubectl apply -f kompose/event-ui/event-ui-ingress.yaml

echo "Deployment completed. Check status with: kubectl get pods"
