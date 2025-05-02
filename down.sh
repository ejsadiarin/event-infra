#!/usr/bin/env sh

# Delete all manifests
kubectl delete -f kompose/event-api/mysql-cm1-configmap.yaml
kubectl delete -f kompose/event-api/mysql-secrets.yaml
kubectl delete -f kompose/event-api/event-api-secrets.yaml
kubectl delete -f kompose/event-api/mysql-statefulset.yaml
kubectl delete -f kompose/event-api/mysql-service.yaml
kubectl delete -f kompose/event-api/redis-statefulset.yaml
kubectl delete -f kompose/event-api/redis-service.yaml
kubectl delete -f kompose/event-api/event-api-deployment.yaml
kubectl delete -f kompose/event-api/event-api-service.yaml
kubectl delete -f kompose/event-ui/event-ui-deployment.yaml
kubectl delete -f kompose/event-ui/event-ui-service.yaml
kubectl delete -f kompose/event-netpol.yaml
kubectl delete -f kompose/traefik-middlewares.yaml
kubectl delete -f kompose/event-api/event-api-ingress.yaml
kubectl delete -f kompose/event-ui/event-ui-ingress.yaml
