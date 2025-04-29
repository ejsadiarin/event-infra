# Complete CI/CD and GitOps Setup for Kubernetes Applications

This comprehensive guide covers setting up a professional CI/CD and GitOps pipeline for deploying microservices applications (event-api and event-ui) to Kubernetes using GitHub Actions, Helm charts, GitHub Container Registry, and ArgoCD.

## Table of Contents

1. [Repository Structure](#1-repository-structure)
2. [Setting Up Application Repositories](#2-setting-up-application-repositories)
3. [Setting Up Infrastructure Repository](#3-setting-up-infrastructure-repository)
4. [Creating Helm Charts](#4-creating-helm-charts)
5. [Setting Up CI/CD for Applications](#5-setting-up-cicd-for-applications)
6. [Setting Up CI/CD for Infrastructure](#6-setting-up-cicd-for-infrastructure)
7. [Setting Up K3s Cluster](#7-setting-up-k3s-cluster)
8. [Installing and Configuring ArgoCD](#8-installing-and-configuring-argocd)
9. [Deploying Applications via ArgoCD](#9-deploying-applications-via-argocd)
10. [Managing Secrets and Environment Variables](#10-managing-secrets-and-environment-variables)
11. [Monitoring and Observability](#11-monitoring-and-observability)
12. [Maintenance and Operations](#12-maintenance-and-operations)

> [!IMPORTANT]
> See how the whole process works at the high level: [Image Tag Update Process for New Commits](#image-tag-update-process-for-new-commits)

---

## 1. Repository Structure

You'll need three GitHub repositories:

```
github.com/yourusername/
├── event-api/           # Backend application code
├── event-ui/            # Frontend application code
└── event-platform-infra/ # Infrastructure, Helm charts, K8s configs
```

---

## 2. Setting Up Application Repositories

### Backend Repository (event-api)

Initialize the repository structure:

```bash
mkdir -p event-api/{src,test,.github/workflows}
cd event-api
npm init -y
# Add your backend code, Dockerfile, etc.
git init
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:yourusername/event-api.git
git push -u origin main
```

Create a branch protection rule for `main`:
1. Go to GitHub repository → Settings → Branches → Add rule
2. Branch name pattern: `main`
3. Enable: "Require pull request reviews before merging"
4. Enable: "Require status checks to pass before merging"
5. Enable: "Require branches to be up to date before merging"
6. Click "Create"

Create a staging branch:
```bash
git checkout -b staging
git push -u origin staging
```

### Frontend Repository (event-ui)

Follow the same steps as for the backend repository.

---

## 3. Setting Up Infrastructure Repository

Create and initialize the repository:

```bash
mkdir -p event-platform-infra/{charts,argocd,helm-repo}
mkdir -p event-platform-infra/charts/{event-api,event-ui,event-platform}
mkdir -p event-platform-infra/argocd/{applications,app-of-apps}
mkdir -p event-platform-infra/.github/workflows
cd event-platform-infra
git init
git add .
git commit -m "Initial repository structure"
git remote add origin git@github.com:yourusername/event-platform-infra.git
git push -u origin main
```

Create a branch protection rule for `main` as done for the application repositories.

---

## 4. Creating Helm Charts

### Backend API Helm Chart

Create the chart structure:

```bash
cd event-platform-infra/charts/event-api
```

Create `Chart.yaml`:
```yaml
apiVersion: v2
name: event-api
description: A Helm chart for Event Registration API
type: application
version: 0.1.0
appVersion: "0.1.0"
keywords:
  - api
  - events
  - registration
home: https://github.com/yourusername/event-api
sources:
  - https://github.com/yourusername/event-api
maintainers:
  - name: Your Name
    email: your.email@example.com
```

Create `values.yaml`:
```yaml
# Default values for event-api
replicaCount: 2

image:
  repository: ghcr.io/yourusername/event-api
  tag: latest
  pullPolicy: IfNotPresent

imagePullSecrets: []
nameOverride: ""
fullnameOverride: ""

serviceAccount:
  create: true
  annotations: {}
  name: ""

service:
  type: ClusterIP
  port: 80
  targetPort: 3000

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: api.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: event-api-tls
      hosts:
        - api.example.com

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 128Mi

autoscaling:
  enabled: false
  minReplicas: 2
  maxReplicas: 5
  targetCPUUtilizationPercentage: 80

nodeSelector: {}
tolerations: []
affinity: {}

configMap:
  NODE_ENV: "production"
  MYSQL_HOST: "mysql"
  MYSQL_USER: "root"
  MYSQL_DATABASE: "leap_db"
  REDIS_HOST: "redis"
  REDIS_PORT: "6379"
  CORS_ORIGIN: "https://example.com"
  SYNC_INTERVAL: "300000"
  ADMIN_USER_IDS: "1"

secrets:
  create: true
  data:
    MYSQL_PASSWORD: ""
    JWT_SECRET: ""
    REDIS_PASSWORD: ""

database:
  enabled: true
  image: mysql:8.0
  rootPassword: ""
  persistence:
    enabled: true
    size: 10Gi

redis:
  enabled: true
  image: redis:7-alpine
  args: ["--appendonly", "yes", "--appendfsync", "everysec"]
  persistence:
    enabled: true
    size: 5Gi
```

Create `values-staging.yaml`:
```yaml
# Staging-specific values
replicaCount: 1

ingress:
  hosts:
    - host: api-staging.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: event-api-staging-tls
      hosts:
        - api-staging.example.com

configMap:
  NODE_ENV: "staging"
  CORS_ORIGIN: "https://staging.example.com"

resources:
  limits:
    cpu: 300m
    memory: 256Mi
  requests:
    cpu: 50m
    memory: 64Mi

database:
  persistence:
    size: 5Gi

redis:
  persistence:
    size: 2Gi
```

Create the template files:

```bash
mkdir -p templates
cd templates
```

Create `deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "event-api.fullname" . }}
  labels:
    {{- include "event-api.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "event-api.selectorLabels" . | nindent 6 }}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        {{- include "event-api.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "event-api.serviceAccountName" . }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: 3000
              protocol: TCP
          env:
            {{- range $key, $value := .Values.configMap }}
            - name: {{ $key }}
              value: {{ $value | quote }}
            {{- end }}
            {{- range $key, $value := .Values.secrets.data }}
            - name: {{ $key }}
              valueFrom:
                secretKeyRef:
                  name: {{ include "event-api.fullname" $ }}-secret
                  key: {{ $key }}
            {{- end }}
          livenessProbe:
            httpGet:
              path: /api/health/live
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/health/ready
              port: http
            initialDelaySeconds: 10
            periodSeconds: 5
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
```

Create other template files similarly (`service.yaml`, `ingress.yaml`, `configmap.yaml`, `secret.yaml`, etc.).

Remember to create `_helpers.tpl` for template functions:

```yaml
{{/* Expand the name of the chart */}}
{{- define "event-api.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Create a default fully qualified app name */}}
{{- define "event-api.fullname" -}}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s" $name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Create chart name and version as used by the chart label */}}
{{- define "event-api.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Common labels */}}
{{- define "event-api.labels" -}}
helm.sh/chart: {{ include "event-api.chart" . }}
{{ include "event-api.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/* Selector labels */}}
{{- define "event-api.selectorLabels" -}}
app.kubernetes.io/name: {{ include "event-api.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/* Create the name of the service account to use */}}
{{- define "event-api.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "event-api.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
```

### Frontend UI Helm Chart

Follow similar steps to create the event-ui chart, adapting the values and templates for a frontend application.

### Umbrella Helm Chart (Optional)

Create `event-platform/Chart.yaml`:
```yaml
apiVersion: v2
name: event-platform
description: Umbrella chart for the complete Event Platform
type: application
version: 0.1.0
appVersion: "1.0.0"
dependencies:
  - name: event-api
    version: ~0.1.0
    repository: file://../event-api
  - name: event-ui
    version: ~0.1.0
    repository: file://../event-ui
```

Create `event-platform/values.yaml`:
```yaml
# Default values for the umbrella chart
event-api:
  # Override API chart values here
  replicaCount: 2

event-ui:
  # Override UI chart values here
  replicaCount: 2
```

Create `event-platform/values-staging.yaml`:
```yaml
# Staging values for the umbrella chart
event-api:
  # Override API staging values here
  replicaCount: 1

event-ui:
  # Override UI staging values here
  replicaCount: 1
```

---

## 5. Setting Up CI/CD for Applications

### Backend API CI/CD

Create `.github/workflows/test.yml` in the event-api repository:

```yaml
name: Test

on:
  pull_request:
    branches: [main, staging]
  push:
    branches: [main, staging]
    paths-ignore:
      - 'README.md'
      - '.github/workflows/update-chart.yml'

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Lint code
        run: npm run lint
      
      - name: Type check
        run: npm run type-check
      
      - name: Run tests
        run: npm test
      
      - name: Generate coverage report
        run: npm run test:coverage
      
      - name: Upload coverage report
        uses: actions/upload-artifact@v3
        with:
          name: coverage-report
          path: coverage/
      
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
          fail_ci_if_error: true
```

Create `.github/workflows/build-push.yml` in the event-api repository:

```yaml
name: Build and Push Image

on:
  workflow_run:
    workflows: ["Test"]
    branches: [main, staging]
    types:
      - completed

jobs:
  build-push:
    name: Build and Push Docker Image
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    permissions:
      contents: read
      packages: write
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Extract metadata for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=ref,event=branch
            type=sha,format=short
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      
      - name: Trigger chart update
        uses: peter-evans/repository-dispatch@v2
        with:
          token: ${{ secrets.PAT_TOKEN }}
          repository: ${{ github.repository_owner }}/event-platform-infra
          event-type: update-api-chart
          client-payload: '{"branch": "${{ github.ref_name }}", "sha": "${{ github.sha }}", "short_sha": "${{ github.sha }}"}'
```

Create `.github/workflows/update-chart.yml` in the event-api repository:

```yaml
name: Update Chart

on:
  repository_dispatch:
    types: [update-api-chart]

jobs:
  update-chart:
    name: Update Helm Chart
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Infrastructure Repo
        uses: actions/checkout@v4
        with:
          repository: ${{ github.repository_owner }}/event-platform-infra
          token: ${{ secrets.PAT_TOKEN }}
          path: infra
      
      - name: Setup Helm
        uses: azure/setup-helm@v3
      
      - name: Update Chart Version
        env:
          BRANCH: ${{ github.event.client_payload.branch }}
          SHA: ${{ github.event.client_payload.sha }}
          SHORT_SHA: ${{ github.event.client_payload.short_sha }}
        run: |
          cd infra/charts/event-api
          
          # Get the current version
          CURRENT_VERSION=$(grep '^version:' Chart.yaml | awk '{print $2}')
          IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
          
          # Increment patch version
          PATCH=$((VERSION_PARTS[2] + 1))
          NEW_VERSION="${VERSION_PARTS[0]}.${VERSION_PARTS[1]}.$PATCH"
          
          # Update Chart.yaml
          sed -i "s/^version:.*/version: $NEW_VERSION/" Chart.yaml
          sed -i "s/^appVersion:.*/appVersion: \"sha-${SHORT_SHA:0:7}\"/" Chart.yaml
          
          # Update values.yaml with new image tag
          sed -i "s/tag:.*/tag: sha-${SHORT_SHA:0:7}/" values.yaml
          
          # Check which environment is being updated
          if [[ "$BRANCH" == "staging" ]]; then
            ENVIRONMENT="staging"
          else
            ENVIRONMENT="production"
          fi
          
          # Commit changes
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add Chart.yaml values.yaml
          git commit -m "Update event-api chart to version $NEW_VERSION for $ENVIRONMENT (sha-${SHORT_SHA:0:7})"
          git push
```

### Frontend UI CI/CD

Set up similar workflows for the event-ui repository, adjusting as needed for frontend build/test processes.

---

## 6. Setting Up CI/CD for Infrastructure

Create `.github/workflows/release-charts.yml` in the event-platform-infra repository:

```yaml
name: Release Charts

on:
  push:
    branches:
      - main
    paths:
      - 'charts/**'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Configure Git
        run: |
          git config user.name "$GITHUB_ACTOR"
          git config user.email "$GITHUB_ACTOR@users.noreply.github.com"
      
      - name: Install Helm
        uses: azure/setup-helm@v3
      
      - name: Package Charts
        run: |
          mkdir -p helm-repo/charts
          # Package individual charts
          helm package charts/event-api -d helm-repo/charts/
          helm package charts/event-ui -d helm-repo/charts/
          
          # Update dependencies for umbrella chart and package it
          helm dependency update charts/event-platform
          helm package charts/event-platform -d helm-repo/charts/
      
      - name: Update Index
        run: |
          helm repo index helm-repo --url https://${{ github.repository_owner }}.github.io/event-platform-infra
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./helm-repo
```

Create `.github/workflows/validate-charts.yml` in the event-platform-infra repository:

```yaml
name: Validate Charts

on:
  pull_request:
    paths:
      - 'charts/**'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Install Helm
        uses: azure/setup-helm@v3
      
      - name: Setup Python (for helm-unittest)
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      
      - name: Install chart-testing
        uses: helm/chart-testing-action@v2.3.0
      
      - name: Run chart-testing (lint)
        run: ct lint --config .github/ct.yaml
      
      - name: Run Helm lint
        run: |
          helm lint charts/event-api
          helm lint charts/event-ui
          helm dependency update charts/event-platform
          helm lint charts/event-platform
```

Create `.github/ct.yaml` for chart-testing configuration:

```yaml
# chart-testing config
remote: origin
target-branch: main
chart-dirs:
  - charts
```

---

## 7. Setting Up K3s Cluster

### Installing K3s

SSH into your server/VM:

```bash
# Install K3s on the server
curl -sfL https://get.k3s.io | sh -
# Wait for K3s to start
sudo systemctl status k3s

# Check node status
sudo kubectl get nodes
```

To set up a cluster with multiple nodes, install K3s on the primary node first:

```bash
# On the master node
curl -sfL https://get.k3s.io | sh -
# Get the token
sudo cat /var/lib/rancher/k3s/server/node-token
```

Then on worker nodes:

```bash
# On each worker node
export K3S_URL=https://MASTER_NODE_IP:6443
export K3S_TOKEN=MASTER_NODE_TOKEN
curl -sfL https://get.k3s.io | sh -
```

### Setting Up kubectl on Your Development Machine

```bash
# Copy the K3s kubeconfig from the server
scp user@server:/etc/rancher/k3s/k3s.yaml ~/.kube/config-k3s

# Update the server address in the config to your server's IP or hostname
sed -i 's/127.0.0.1/SERVER_IP_OR_HOSTNAME/g' ~/.kube/config-k3s

# Set KUBECONFIG environment variable
export KUBECONFIG=~/.kube/config-k3s

# Test connection
kubectl get nodes
```

### Setting Up Ingress Controller

K3s comes with Traefik by default. If you want to use NGINX Ingress Controller instead:

```bash
# Disable Traefik when installing K3s (add this to K3s installation command)
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable=traefik" sh -

# Install NGINX Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml
```

### Setting Up cert-manager for TLS

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.1/cert-manager.yaml

# Wait for pods to be ready
kubectl wait --for=condition=Ready pods --all -n cert-manager

# Create ClusterIssuer for Let's Encrypt
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

---

## 8. Installing and Configuring ArgoCD

### Installing ArgoCD

```bash
# Create namespace for ArgoCD
kubectl create namespace argocd

# Install ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for pods to be ready
kubectl wait --for=condition=Ready pods --all -n argocd

# Access ArgoCD UI (port-forwarding)
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

### Setting Up ArgoCD CLI

```bash
# Install ArgoCD CLI
# For Linux
curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x argocd
sudo mv argocd /usr/local/bin/

# For macOS
brew install argocd

# Get the admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# Login to ArgoCD
argocd login localhost:8080 --username admin --password <password> --insecure
```

### Configuring ArgoCD with Your GitHub Repository

```bash
# Add the repository to ArgoCD (method 1: using CLI)
argocd repo add https://github.com/yourusername/event-platform-infra.git --name event-platform-infra

# For private repos, create a secret with credentials first
kubectl create secret generic github-repo-creds \
  --namespace argocd \
  --from-literal=username=yourusername \
  --from-literal=password=your_personal_access_token

# Then add the repository with credentials
argocd repo add https://github.com/yourusername/event-platform-infra.git \
  --name event-platform-infra \
  --username yourusername \
  --password your_personal_access_token
```

Or configure the repository via the ArgoCD UI:
1. Navigate to Settings → Repositories → Connect Repo
2. Enter your repository details
3. Add credentials if needed for private repos
4. Click "Connect"

---

## 9. Deploying Applications via ArgoCD

### Creating Namespaces

```bash
# Create namespaces for environments
kubectl create namespace staging
kubectl create namespace production
```

### Creating ArgoCD Application Manifests

Create `event-platform-infra/argocd/applications/event-api-staging.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: event-api-staging
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/yourusername/event-platform-infra.git
    targetRevision: HEAD
    path: charts/event-api
    helm:
      valueFiles:
        - values.yaml
        - values-staging.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: staging
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

Create `event-platform-infra/argocd/applications/event-api-production.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: event-api-production
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/yourusername/event-platform-infra.git
    targetRevision: HEAD
    path: charts/event-api
    helm:
      valueFiles:
        - values.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

Create similar files for event-ui.

### App of Apps Pattern (Optional)

Create `event-platform-infra/argocd/app-of-apps/staging.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: staging-apps
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/yourusername/event-platform-infra.git
    targetRevision: HEAD
    path: argocd/applications
    directory:
      include: "*-staging.yaml"
  destination:
    server: https://kubernetes.default.svc
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

Create `event-platform-infra/argocd/app-of-apps/production.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: production-apps
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/yourusername/event-platform-infra.git
    targetRevision: HEAD
    path: argocd/applications
    directory:
      include: "*-production.yaml"
  destination:
    server: https://kubernetes.default.svc
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

### Applying Application Manifests

```bash
# Apply the app-of-apps manifests
kubectl apply -f event-platform-infra/argocd/app-of-apps/staging.yaml
kubectl apply -f event-platform-infra/argocd/app-of-apps/production.yaml

# Or apply individual application manifests
kubectl apply -f event-platform-infra/argocd/applications/event-api-staging.yaml
kubectl apply -f event-platform-infra/argocd/applications/event-ui-staging.yaml
kubectl apply -f event-platform-infra/argocd/applications/event-api-production.yaml
kubectl apply -f event-platform-infra/argocd/applications/event-ui-production.yaml
```

---

## 10. Managing Secrets and Environment Variables

### Using Kubernetes Secrets

Create base secret definitions in your Helm charts (as shown earlier).

For production environments with sensitive data, consider using a secrets management solution like:

- **Sealed Secrets**: For encrypting secrets in Git
```bash
# Install Sealed Secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.1/controller.yaml

# Install kubeseal CLI
# For Linux
wget https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.1/kubeseal-0.24.1-linux-amd64.tar.gz
tar -xvzf kubeseal-0.24.1-linux-amd64.tar.gz
sudo install -m 755 kubeseal /usr/local/bin/kubeseal

# Create a sealed secret
kubectl create secret generic mysecret --dry-run=client --from-literal=password=secretvalue -o yaml | kubeseal > sealed-secret.yaml
```

- **HashiCorp Vault**: For advanced secrets management
```bash
# Add Vault Helm repo
helm repo add hashicorp https://helm.releases.hashicorp.com

# Install Vault
helm install vault hashicorp/vault
```

### Managing Environment-Specific Variables

Use Helm's value files for environment-specific configuration:

- `values.yaml`: Default values
- `values-staging.yaml`: Staging-specific overrides
- `values-production.yaml`: Production-specific overrides

In your ArgoCD application manifests, specify which value files to use:

```yaml
spec:
  source:
    helm:
      valueFiles:
        - values.yaml
        - values-staging.yaml
```

---

## 11. Monitoring and Observability

### Installing Prometheus and Grafana

```bash
# Add Prometheus Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts

# Install Prometheus stack with Grafana
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.adminPassword=admin
```

### Setting Up ServiceMonitors for Your Applications

Create a ServiceMonitor for your applications:

```yaml
# event-platform-infra/charts/event-api/templates/servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: {{ include "event-api.fullname" . }}
  labels:
    {{- include "event-api.labels" . | nindent 4 }}
spec:
  selector:
    matchLabels:
      {{- include "event-api.selectorLabels" . | nindent 6 }}
  endpoints:
  - port: http
    path: /api/metrics
    interval: 15s
```

### Setting Up Loki for Log Aggregation

```bash
# Add Grafana Helm repo
helm repo add grafana https://grafana.github.io/helm-charts

# Install Loki stack
helm install loki grafana/loki-stack \
  --namespace monitoring \
  --set grafana.enabled=false
```

---

## 12. Maintenance and Operations

### Backup Strategy

1. **etcd backup** for Kubernetes state:
```bash
# On K3s server
sudo k3s etcd-snapshot save
```

2. **Persistent volume backups** using tools like Velero:
```bash
# Install Velero
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.5.0 \
  --bucket velero-backups \
  --secret-file ./credentials-velero \
  --use-volume-snapshots=false \
  --backup-location-config region=minio,s3ForcePathStyle="true",s3Url=http://minio.velero.svc:9000
```

### Scaling Strategy

1. **Horizontal Pod Autoscaler** for workloads:
```yaml
# In your Helm chart templates
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "event-api.fullname" . }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "event-api.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
```

2. **Cluster Autoscaler** for K3s nodes (if using cloud providers):
```bash
# Example for AWS
helm install cluster-autoscaler autoscaler/cluster-autoscaler \
  --set autoDiscovery.clusterName=your-cluster-name \
  --set awsRegion=region
```

### Upgrade Strategy

1. **Kubernetes cluster upgrades**:
```bash
# For K3s
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=v1.27.1+k3s1 sh -
```

2. **Application upgrades**:
- Use ArgoCD to deploy new versions
- Use Helm's values to control image tags
- Use rolling updates for zero-downtime deployments

### Disaster Recovery

1. Create a disaster recovery plan document
2. Regularly test the restore process
3. Implement multi-region deployments for critical services

---

This comprehensive guide covers setting up a complete CI/CD and GitOps pipeline for deploying applications to Kubernetes. By following these steps, you'll have a professional-grade deployment system that automates the entire process from code commit to production deployment, with proper testing, versioning, and monitoring.

---

# Image Tag Update Process for New Commits

The flow for updating image tags when new commits are made to the application repositories works as follows:

## 1. In the Application Repositories (event-api, event-ui)

When new code is pushed to main or staging branches:

### First: The Test Workflow Runs

```yaml
# event-api/.github/workflows/test.yml
name: Test

on:
  push:
    branches: [main, staging]
    # ... other triggers
```

### Second: The Build and Push Workflow Runs

After tests pass, this workflow builds a new Docker image and pushes it to GHCR with tags based on the commit SHA:

```yaml
# event-api/.github/workflows/build-push.yml
name: Build and Push Image

on:
  workflow_run:
    workflows: ["Test"]
    branches: [main, staging]
    types:
      - completed

jobs:
  build-push:
    # ... other config
    steps:
      # ... checkout, setup steps
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}  # This includes tags like sha-a7b3c9d and main/staging
          # ... other options
      
      # KEY STEP: This triggers the next workflow to update Helm charts
      - name: Trigger chart update
        uses: peter-evans/repository-dispatch@v2
        with:
          token: ${{ secrets.PAT_TOKEN }}
          repository: ${{ github.repository_owner }}/event-platform-infra
          event-type: update-api-chart
          client-payload: '{"branch": "${{ github.ref_name }}", "sha": "${{ github.sha }}", "short_sha": "${{ github.sha }}"}'
```

### Third: The Update Chart Workflow is Triggered

```yaml
# event-api/.github/workflows/update-chart.yml
name: Update Chart

on:
  repository_dispatch:
    types: [update-api-chart]

jobs:
  update-chart:
    # ... config
    steps:
      - name: Checkout Infrastructure Repo
        uses: actions/checkout@v4
        with:
          repository: ${{ github.repository_owner }}/event-platform-infra
          token: ${{ secrets.PAT_TOKEN }}
          path: infra
      
      # ... other steps
      
      # KEY STEP: Update the Helm chart with the new image tag
      - name: Update Chart Version
        env:
          BRANCH: ${{ github.event.client_payload.branch }}
          SHA: ${{ github.event.client_payload.sha }}
          SHORT_SHA: ${{ github.event.client_payload.short_sha }}
        run: |
          cd infra/charts/event-api
          
          # Get the current version and increment it
          CURRENT_VERSION=$(grep '^version:' Chart.yaml | awk '{print $2}')
          IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
          PATCH=$((VERSION_PARTS[2] + 1))
          NEW_VERSION="${VERSION_PARTS[0]}.${VERSION_PARTS[1]}.$PATCH"
          
          # Update Chart.yaml with new version and appVersion
          sed -i "s/^version:.*/version: $NEW_VERSION/" Chart.yaml
          sed -i "s/^appVersion:.*/appVersion: \"sha-${SHORT_SHA:0:7}\"/" Chart.yaml
          
          # THIS IS THE CRITICAL LINE: Update the image tag in values.yaml
          sed -i "s/tag:.*/tag: sha-${SHORT_SHA:0:7}/" values.yaml
          
          # Determine environment based on branch
          if [[ "$BRANCH" == "staging" ]]; then
            ENVIRONMENT="staging"
          else
            ENVIRONMENT="production"
          fi
          
          # Commit the changes to the infrastructure repo
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add Chart.yaml values.yaml
          git commit -m "Update event-api chart to version $NEW_VERSION for $ENVIRONMENT (sha-${SHORT_SHA:0:7})"
          git push
```

## 2. In the Infrastructure Repository (event-platform-infra)

### Finally: The Release Charts Workflow is Triggered

When the infrastructure repo is updated by the previous workflow, this workflow packages and publishes the Helm chart:

```yaml
# event-platform-infra/.github/workflows/release-charts.yml
name: Release Charts

on:
  push:
    branches:
      - main
    paths:
      - 'charts/**'

jobs:
  release:
    # ... config
    steps:
      # ... other steps
      
      - name: Package Charts
        run: |
          mkdir -p helm-repo/charts
          helm package charts/event-api -d helm-repo/charts/
          # ... package other charts
      
      - name: Update Index
        run: |
          helm repo index helm-repo --url https://${{ github.repository_owner }}.github.io/event-platform-infra
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./helm-repo
```

## 3. ArgoCD Detects and Applies the Changes

ArgoCD continuously monitors the Git repository and detects changes to the Helm charts. When it sees the updated image tag in `values.yaml`, it automatically deploys the new version:

```yaml
# From the ArgoCD application definition
spec:
  source:
    repoURL: https://github.com/yourusername/event-platform-infra.git
    targetRevision: HEAD  # This means it always uses the latest commit
    path: charts/event-api
    helm:
      valueFiles:
        - values.yaml  # This file now contains the updated image tag
```

## Complete Flow Summary

1. **Code Change**: Commit pushed to the event-api repository
2. **Test**: Tests run in GitHub Actions
3. **Build**: Docker image built with tag `sha-a7b3c9d` (first 7 chars of commit SHA)
4. **Push**: Image pushed to GHCR
5. **Update Infrastructure**: A workflow updates `tag: sha-a7b3c9d` in the Helm chart's values.yaml
6. **Chart Release**: Updated chart is packaged and published to GitHub Pages
7. **Deployment**: ArgoCD detects the change and updates the deployment with the new image

This full circle process ensures:
1. Every code change gets a unique, traceable image tag
2. The image tag is automatically updated in the Helm chart
3. ArgoCD automatically deploys the new version
4. The entire process is automated without manual intervention

This is a true GitOps flow where everything is driven by Git commits, and the desired state is always reflected in the Git repository.
