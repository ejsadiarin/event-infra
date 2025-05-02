#!/usr/bin/env sh

kubectl apply -f kompose/monitoring/event-api-monitor.yaml
kubectl apply -f kompose/monitoring/event-ui-monitor.yaml
kubectl apply -f kompose/monitoring/mysqld-monitor.yaml
kubectl apply -f kompose/monitoring/event-platform-alerts.yaml
kubectl apply -f kompose/monitoring/event-api-dashboard-grafana.yaml
