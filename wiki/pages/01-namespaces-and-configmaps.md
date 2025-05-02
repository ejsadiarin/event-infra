# Namespaces and ConfigMaps

## Create Namespace (Optional)
```bash
kubectl create namespace event-platform
```

## Apply ConfigMaps
The MySQL initialization SQL is stored in a ConfigMap:

```bash
kubectl apply -f kompose/event-api/mysql-cm1-configmap.yaml
```

This ConfigMap contains the database schema initialization script that will be executed when MySQL starts for the first time.
```
