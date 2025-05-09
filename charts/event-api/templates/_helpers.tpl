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
