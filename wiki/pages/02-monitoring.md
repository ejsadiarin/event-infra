# Setting Up Monitoring

The monitoring stack uses Prometheus and Grafana to monitor the application components.

## 1. Install kube-prometheus-stack

```bash
# Create monitoring namespace
kubectl create namespace monitoring

# Add Prometheus Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus stack with Grafana
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.adminPassword=admin
```

## 2. Apply Service Monitors

Service Monitors tell Prometheus what to scrape:

```bash
kubectl apply -f kompose/monitoring/event-api-monitor.yaml
kubectl apply -f kompose/monitoring/event-ui-monitor.yaml
kubectl apply -f kompose/monitoring/mysqld-monitor.yaml
```

## 3. Deploy MySQL Exporter

To monitor MySQL:

```bash
kubectl apply -f kompose/monitoring/mysqld-monitor.yaml
```

NOTE: You may need to fix the `DATA_SOURCE_NAME` environment variable:

```yaml
env:
- name: DATA_SOURCE_NAME
  valueFrom:
    secretKeyRef:
      name: mysql-secrets
      key: mysql-connection-string  # You need to add this to your secrets
```

## 4. Configure Alerts

Apply alert rules:

```bash
kubectl apply -f kompose/monitoring/event-platform-alerts.yaml
```

## 5. Import Dashboards

Apply the Grafana dashboard for the event-api:

```bash
kubectl apply -f kompose/monitoring/event-api-dashboard-grafana.yaml
```

## 6. Access Grafana

```bash
# Get Grafana password
kubectl get secret -n monitoring monitoring-grafana -o jsonpath="{.data.admin-password}" | base64 --decode

# Port-forward Grafana
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring
```

Access Grafana at http://localhost:3000 using:
- Username: admin
- Password: [from command above]

## 7. Setup Loki for Logs (Optional)

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install loki grafana/loki-stack --namespace monitoring

# Apply Promtail configuration
kubectl apply -f kompose/monitoring/loki-integration.yaml
```
