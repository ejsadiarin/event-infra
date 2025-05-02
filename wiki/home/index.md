# Event Platform Kubernetes Deployment Guide

This guide explains how to deploy the Event Platform application (event-api and event-ui) to a Kubernetes cluster using the provided manifests.

## Prerequisites

- A Kubernetes cluster (K3s, K8s, etc.)
- kubectl configured to access your cluster
- [Longhorn](https://longhorn.io/) installed for storage (or update StorageClass references)
- [Traefik](https://traefik.io/) ingress controller (comes with K3s by default)

## Deployment Order

For a successful deployment, please apply the resources in the following order:

1. [Create Namespaces & ConfigMaps](wiki/01-namespaces-and-configmaps)
2. [Deploy Secrets](wiki/02-secrets)
3. [Deploy Stateful Components (MySQL & Redis)](wiki/03-stateful-components)
4. [Deploy API & UI Applications](wiki/04-applications)
5. [Configure Network Policies](wiki/05-network-policies)
6. [Setup Monitoring](wiki/06-monitoring)
7. [Configure Ingress](wiki/07-ingress)

## Quick Start

For a quick deployment of all components:

```bash
# Clone the repository
git clone https://github.com/yourusername/event-platform-infra.git
cd event-platform-infra

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
kubectl apply -f kompose/traefik-middlewares.yaml
kubectl apply -f kompose/event-api/event-api-ingress.yaml
kubectl apply -f kompose/event-ui/event-ui-ingress.yaml
```

## Monitoring Setup

```bash
# Create monitoring namespace
kubectl create namespace monitoring

# Install kube-prometheus-stack
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install monitoring prometheus-community/kube-prometheus-stack --namespace monitoring

# Apply custom service monitors and dashboards
kubectl apply -f kompose/monitoring/event-api-monitor.yaml
kubectl apply -f kompose/monitoring/event-ui-monitor.yaml
kubectl apply -f kompose/monitoring/mysqld-monitor.yaml
kubectl apply -f kompose/monitoring/event-platform-alerts.yaml
kubectl apply -f kompose/monitoring/event-api-dashboard-grafana.yaml
```

## Directory Structure

- `kompose/` - Main directory containing all Kubernetes resources
  - `event-api/` - Backend API resources
  - `event-ui/` - Frontend UI resources
  - `monitoring/` - Monitoring configuration
  - `traefik-middlewares.yaml` - Traefik middleware configurations
  - `event-netpol.yaml` - Network policies

## Troubleshooting

See the [Troubleshooting](wiki/troubleshooting) page for common issues and solutions.
