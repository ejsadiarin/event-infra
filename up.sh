#!/usr/bin/env sh

# Apply all manifests
kubectl apply -f kompose/event-api/mysql-cm1-configmap.yaml
kubectl apply -f kompose/event-api/mysql-secrets.yaml
kubectl apply -f kompose/event-api/event-api-secrets.yaml

kubectl apply -f kompose/event-api/mysql-statefulset.yaml
kubectl apply -f kompose/event-api/mysql-service.yaml

kubectl apply -f kompose/event-api/redis-statefulset.yaml
kubectl apply -f kompose/event-api/redis-service.yaml

kubectl apply -f kompose/event-api/event-api-deployment.yaml
kubectl apply -f kompose/event-api/event-api-service.yaml

kubectl apply -f kompose/event-ui/event-ui-deployment.yaml
kubectl apply -f kompose/event-ui/event-ui-service.yaml

kubectl apply -f kompose/event-netpol.yaml
kubectl apply -f kompose/event-app-hpa.yaml
kubectl apply -f kompose/event-hpa-alerts.yaml
kubectl apply -f kompose/traefik-middlewares.yaml

kubectl apply -f kompose/event-api/event-api-ingress.yaml
kubectl apply -f kompose/event-ui/event-ui-ingress.yaml
