#!/usr/bin/env sh

kubectl delete -f kompose/monitoring/event-api-monitor.yaml
kubectl delete -f kompose/monitoring/event-ui-monitor.yaml
kubectl delete -f kompose/monitoring/mysqld-monitor.yaml
kubectl delete -f kompose/monitoring/event-platform-alerts.yaml
kubectl delete -f kompose/monitoring/event-api-dashboard-grafana.yaml
